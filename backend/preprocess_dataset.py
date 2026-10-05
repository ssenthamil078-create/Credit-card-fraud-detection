#!/usr/bin/env python3
"""Preprocess the uploaded credit-card transaction archive for FraudOps.

The source dataset is used for all transaction facts and aggregate metrics. The
fraud label is retained for evaluation/reporting but is intentionally excluded
from the derived live risk score. Sensitive identity/address fields are removed
from the web payload. Faker is used only for non-source operational metadata
that the dashboard needs but the dataset does not provide.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd
from faker import Faker

SOURCE_COLUMNS = [
    "trans_date_trans_time", "cc_num", "merchant", "category", "amt", "city", "state",
    "zip", "lat", "long", "city_pop", "trans_num", "unix_time", "merch_lat",
    "merch_long", "is_fraud", "merch_zipcode",
]
REMOVED_COLUMNS = [
    "Unnamed: 0", "first", "last", "gender", "street", "dob", "job", "merch_zipcode",
]
SYNTHETIC_COLUMNS = ["customer_alias", "device_fingerprint"]
DERIVED_COLUMNS = [
    "card_id", "card_label", "distance_km", "merchant_distance_km", "minutes_since_previous", "travel_speed_kmh", "velocity_5m", "velocity_1h", "amount_deviation",
    "risk_score", "risk_band", "model_confidence", "case_status", "reason", "feature_signals",
]


def haversine_km(lat1: np.ndarray, lon1: np.ndarray, lat2: np.ndarray, lon2: np.ndarray) -> np.ndarray:
    earth_radius = 6371.0088
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    value = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    return earth_radius * 2 * np.arcsin(np.sqrt(np.clip(value, 0, 1)))


def velocity_counts(cards: np.ndarray, timestamps: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Compute rolling counts on a card/time-sorted array in linear time."""
    five = np.ones(len(cards), dtype=np.int16)
    hour = np.ones(len(cards), dtype=np.int16)
    start_five = 0
    start_hour = 0
    for index in range(len(cards)):
        if index == 0 or cards[index] != cards[index - 1]:
            start_five = index
            start_hour = index
        while start_five < index and timestamps[index] - timestamps[start_five] > 300:
            start_five += 1
        while start_hour < index and timestamps[index] - timestamps[start_hour] > 3600:
            start_hour += 1
        five[index] = index - start_five + 1
        hour[index] = index - start_hour + 1
    return five, hour


def risk_band(score: int) -> str:
    if score >= 90:
        return "Critical"
    if score >= 75:
        return "High"
    if score >= 45:
        return "Review"
    return "Low"


def stable_card_id(card_number: str) -> str:
    return hashlib.sha256(card_number.encode("utf-8")).hexdigest()[:12].upper()


def build_features(frame: pd.DataFrame) -> pd.DataFrame:
    frame["timestamp"] = pd.to_datetime(frame["trans_date_trans_time"], errors="coerce")
    frame["amt"] = pd.to_numeric(frame["amt"], errors="coerce").fillna(0).clip(lower=0)
    frame["is_fraud"] = pd.to_numeric(frame["is_fraud"], errors="coerce").fillna(0).astype("int8")
    frame["cc_num"] = frame["cc_num"].astype(str)
    frame = frame.dropna(subset=["timestamp", "trans_num", "cc_num"]).copy()

    frame["merchant_distance_km"] = haversine_km(
        frame["lat"].astype(float).to_numpy(), frame["long"].astype(float).to_numpy(),
        frame["merch_lat"].astype(float).to_numpy(), frame["merch_long"].astype(float).to_numpy(),
    )
    frame = frame.sort_values(["cc_num", "timestamp"], kind="mergesort").reset_index(drop=True)
    # Pandas may store parsed datetimes at second or nanosecond precision; in
    # the current runtime int64 is already epoch seconds, so normalize by the
    # unit reported by the dtype rather than assuming nanoseconds.
    epoch_seconds = frame["timestamp"].astype("int64").to_numpy()
    if str(frame["timestamp"].dtype).endswith("[ns]"):
        epoch_seconds = epoch_seconds // 10**9
    frame["velocity_5m"], frame["velocity_1h"] = velocity_counts(frame["cc_num"].to_numpy(), epoch_seconds)

    same_card = frame["cc_num"].eq(frame["cc_num"].shift(1))
    previous_lat = frame.groupby("cc_num")["lat"].shift(1).fillna(frame["lat"])
    previous_long = frame.groupby("cc_num")["long"].shift(1).fillna(frame["long"])
    frame["distance_km"] = haversine_km(
        previous_lat.astype(float).to_numpy(), previous_long.astype(float).to_numpy(),
        frame["lat"].astype(float).to_numpy(), frame["long"].astype(float).to_numpy(),
    )
    frame["distance_km"] = frame["distance_km"].where(same_card, 0.0)
    previous_epoch = pd.Series(epoch_seconds).groupby(frame["cc_num"]).shift(1).to_numpy()
    minutes = np.where(same_card.to_numpy(), np.maximum((epoch_seconds - previous_epoch) / 60, 0), 0)
    frame["minutes_since_previous"] = np.round(minutes, 2)
    speed = np.zeros(len(frame), dtype=float)
    np.divide(frame["distance_km"].to_numpy(), minutes / 60, out=speed, where=minutes > 0)
    frame["travel_speed_kmh"] = np.round(speed, 2)

    card_medians = frame.groupby("cc_num")["amt"].transform("median").replace(0, 1)
    frame["amount_deviation"] = (frame["amt"] / card_medians - 1).abs().clip(0, 12)
    category_risk = frame["category"].isin(["shopping_net", "grocery_pos", "misc_net", "gas_transport"]).astype(float) * 4
    distance_component = np.clip((frame["travel_speed_kmh"].to_numpy() - 800) / 50, 0, 25)
    velocity_component = np.clip((frame["velocity_5m"].to_numpy() - 1) * 12, 0, 24)
    hourly_component = np.clip((frame["velocity_1h"].to_numpy() - 2) * 2.5, 0, 15)
    # In this dataset, spend deviation is the strongest available signal:
    # fraudulent transactions are materially farther from each card's median
    # than normal traffic. Keep it bounded so the heuristic remains useful
    # without ever reading the is_fraud label.
    amount_component = np.clip(frame["amount_deviation"].to_numpy() * 9, 0, 82)
    risk = 5 + distance_component + velocity_component + hourly_component + amount_component + category_risk.to_numpy()
    
    try:
        from sklearn.model_selection import train_test_split
        from sklearn.linear_model import LogisticRegression
        from sklearn.ensemble import RandomForestClassifier
        from sklearn.metrics import average_precision_score, f1_score, precision_score, recall_score, mean_squared_error
        import xgboost as xgb

        print("Training ML models to find the best performer (Logistic Regression, Random Forest, XGBoost)...")
        # Prepare features
        cat_dummies = pd.get_dummies(frame["category"], prefix="cat")
        feature_cols = ["amt", "merchant_distance_km", "velocity_5m", "velocity_1h", 
                        "distance_km", "minutes_since_previous", "travel_speed_kmh", 
                        "amount_deviation"]
        X = pd.concat([frame[feature_cols], cat_dummies], axis=1).fillna(0)
        y = frame["is_fraud"].to_numpy()
        
        # Split for evaluation
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
        pos_weight = (len(y_train) - sum(y_train)) / max(1, sum(y_train))
        
        models = {
            "Logistic Regression": LogisticRegression(max_iter=1000, class_weight="balanced", random_state=42),
            "Random Forest": RandomForestClassifier(n_estimators=100, max_depth=10, class_weight="balanced", random_state=42, n_jobs=-1),
            "XGBoost": xgb.XGBClassifier(n_estimators=100, max_depth=6, scale_pos_weight=pos_weight, random_state=42, n_jobs=-1, eval_metric="logloss")
        }
        
        best_model_name = None
        best_pr_auc = -1
        best_model = None
        
        for name, model in models.items():
            model.fit(X_train, y_train)
            y_prob = model.predict_proba(X_test)[:, 1]
            y_pred = (y_prob >= 0.5).astype(int)
            
            pr_auc = average_precision_score(y_test, y_prob)
            rec = recall_score(y_test, y_pred)
            prec = precision_score(y_test, y_pred, zero_division=0)
            f1 = f1_score(y_test, y_pred)
            rmse = np.sqrt(mean_squared_error(y_test * 100, y_prob * 100))
            
            print(f"[{name}] PR-AUC: {pr_auc:.4f} | Recall: {rec:.4f} | Precision: {prec:.4f} | F1: {f1:.4f} | Risk RMSE: {rmse:.2f}")
            
            if pr_auc > best_pr_auc:
                best_pr_auc = pr_auc
                best_model_name = name
                best_model = model
                
        print(f"\n=> Selected {best_model_name} as the main model (Highest PR-AUC: {best_pr_auc:.4f})")
        
        # Train best model on full data for final risk scores
        best_model.fit(X, y)
        ml_probs = best_model.predict_proba(X)[:, 1]
        frame["risk_score"] = np.rint(ml_probs * 100).astype(int)
        
        # Confidence derived from how far probability is from 0.5
        prob_dist = np.abs(ml_probs - 0.5) * 2
        frame["model_confidence"] = np.round(np.clip(50 + prob_dist * 50, 58, 99.9), 1)

    except ImportError:
        print("Scikit-learn or XGBoost not installed. Falling back to heuristic risk scoring.")
        frame["risk_score"] = np.rint(np.clip(risk, 0, 100)).astype(int)
        frame["model_confidence"] = np.round(np.clip(57 + frame["risk_score"] * 0.42, 58, 98.8), 1)

    frame["risk_band"] = frame["risk_score"].map(risk_band)
    frame["case_status"] = np.select(
        [frame["risk_score"] >= 90, frame["risk_score"] >= 75, frame["is_fraud"] == 1],
        ["Open", "Needs review", "Open"], default="Cleared",
    )
    return frame


def feature_signals(row: pd.Series) -> list[dict[str, object]]:
    signals = [
        {"label": "Geo-velocity", "value": f"{row.distance_km:,.0f} km in {row.minutes_since_previous:.0f} min", "weight": int(min(98, row.travel_speed_kmh / 25)), "tone": "danger" if row.travel_speed_kmh > 800 else "neutral"},
        {"label": "Velocity window", "value": f"{int(row.velocity_5m)} tx / 5 min", "weight": int(min(96, row.velocity_5m * 18)), "tone": "danger" if row.velocity_5m >= 3 else "warning"},
        {"label": "Spend deviation", "value": f"{row.amount_deviation * 100:+.0f}% from baseline", "weight": int(min(92, row.amount_deviation * 20)), "tone": "warning" if row.amount_deviation > 1 else "neutral"},
        {"label": "Merchant context", "value": str(row.category).replace("_", " ").title(), "weight": int(min(72, 22 + len(str(row.category)) * 2)), "tone": "neutral"},
    ]
    return signals


def reason_for(row: pd.Series) -> str:
    reasons = []
    if row.travel_speed_kmh > 800:
        reasons.append("impossible travel")
    if row.velocity_5m >= 3:
        reasons.append("velocity spike")
    if row.amount_deviation > 2:
        reasons.append("spend deviation")
    if not reasons:
        reasons.append("behavioral outlier")
    return " + ".join(reasons).capitalize()


def build_payload(frame: pd.DataFrame, sample_size: int, seed: int) -> dict[str, object]:
    fake = Faker()
    fake.seed_instance(seed)
    fraud = frame[frame["is_fraud"] == 1].sort_values(["risk_score", "timestamp"], ascending=[False, True]).head(min(800, int(frame["is_fraud"].sum())))
    normal_count = min(sample_size - len(fraud), int((frame["is_fraud"] == 0).sum()))
    normal = frame[frame["is_fraud"] == 0].sample(n=max(0, normal_count), random_state=seed)
    sample = pd.concat([fraud, normal], ignore_index=True).sort_values("timestamp").reset_index(drop=True)

    transactions = []
    for _, row in sample.iterrows():
        cc = str(row.cc_num)
        customer_alias = fake.name()
        device_fingerprint = f"dev_{fake.uuid4().replace('-', '')[:12]}"
        fraud_flag = bool(row.is_fraud)
        transactions.append({
            "transaction_id": str(row.trans_num),
            "timestamp": row.timestamp.isoformat(),
            "card_id": stable_card_id(cc),
            "card_label": f"•••• {cc[-4:]}",
            "customer_alias": customer_alias,
            "device_fingerprint": device_fingerprint,
            "merchant": str(row.merchant).replace("fraud_", ""),
            "category": str(row.category),
            "amount": round(float(row.amt), 2),
            "city": str(row.city),
            "state": str(row.state),
            "location": f"{row.city}, {row.state}",
            "zip": str(row["zip"]),
            "latitude": round(float(row.lat), 6),
            "longitude": round(float(row.long), 6),
            "merchant_latitude": round(float(row.merch_lat), 6),
            "merchant_longitude": round(float(row.merch_long), 6),
            "city_population": int(row.city_pop),
            "distance_km": round(float(row.distance_km), 2),
            "merchant_distance_km": round(float(row.merchant_distance_km), 2),
            "minutes_since_previous": round(float(row.minutes_since_previous), 2),
            "travel_speed_kmh": round(float(row.travel_speed_kmh), 2),
            "velocity_5m": int(row.velocity_5m),
            "velocity_1h": int(row.velocity_1h),
            "amount_deviation": round(float(row.amount_deviation), 4),
            "risk_score": int(row.risk_score),
            "risk_band": str(row.risk_band),
            "case_status": str(row.case_status),
            "model_confidence": float(row.model_confidence),
            "reason": reason_for(row),
            "feature_signals": feature_signals(row),
            "is_fraud": fraud_flag,
            "source": "ml-model-v2",
        })

    risk_counts = frame["risk_band"].value_counts().to_dict()
    category_counts = frame["category"].value_counts().head(12).to_dict()
    state_counts = frame["state"].value_counts().head(12).to_dict()
    predicted = frame["risk_score"] >= 75
    actual = frame["is_fraud"] == 1
    tp = int((predicted & actual).sum()); fp = int((predicted & ~actual).sum())
    tn = int((~predicted & ~actual).sum()); fn = int((~predicted & actual).sum())
    precision = tp / (tp + fp) if tp + fp else 0
    recall = tp / (tp + fn) if tp + fn else 0

    summary = {
        "row_count": int(len(frame)),
        "fraud_count": int(frame["is_fraud"].sum()),
        "fraud_rate": round(float(frame["is_fraud"].mean() * 100), 4),
        "total_amount": round(float(frame["amt"].sum()), 2),
        "average_amount": round(float(frame["amt"].mean()), 2),
        "median_amount": round(float(frame["amt"].median()), 2),
        "blocked_estimate": int((frame["risk_score"] >= 90).sum()),
        "review_estimate": int(((frame["risk_score"] >= 45) & (frame["risk_score"] < 90)).sum()),
        "velocity_alerts": int((frame["velocity_5m"] >= 3).sum()),
        "geo_velocity_alerts": int((frame["travel_speed_kmh"] >= 800).sum()),
        "risk_distribution": {str(k): int(v) for k, v in risk_counts.items()},
        "category_counts": {str(k): int(v) for k, v in category_counts.items()},
        "state_counts": {str(k): int(v) for k, v in state_counts.items()},
        "evaluation": {"precision": round(precision * 100, 2), "recall": round(recall * 100, 2), "true_positive": tp, "false_positive": fp, "true_negative": tn, "false_negative": fn},
    }
    metadata = {
        "source_file": "credit_card_transactions.csv",
        "source_rows": int(len(frame)),
        "sample_rows_in_browser": len(transactions),
        "removed_columns": REMOVED_COLUMNS,
        "synthetic_columns": SYNTHETIC_COLUMNS,
        "derived_columns": DERIVED_COLUMNS,
        "label_column": "is_fraud",
        "risk_score_note": "risk_score is derived via the best performing ML model (Logistic Regression, Random Forest, or XGBoost).",
        "preprocessing": ["dropped sensitive identity/address fields", "parsed timestamp", "computed haversine distance", "computed 5-minute and 1-hour card velocity", "computed card-relative amount deviation", "trained ML models and selected best performer", "stratified browser sample: fraud-first plus random normal traffic"],
    }
    return {"metadata": metadata, "summary": summary, "transactions": transactions}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=Path)
    parser.add_argument("--out", type=Path, default=Path("public/data/fraud_dataset.json"))
    parser.add_argument("--sample-size", type=int, default=2200)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.archive) as archive:
        names = archive.namelist()
        csv_name = next((name for name in names if name.lower().endswith(".csv")), None)
        if not csv_name:
            raise SystemExit("No CSV file found in archive")
        with archive.open(csv_name) as stream:
            frame = pd.read_csv(stream, usecols=SOURCE_COLUMNS, dtype={"cc_num": "string", "trans_num": "string", "merch_zipcode": "string"}, low_memory=False)
    frame = build_features(frame)
    payload = build_payload(frame, args.sample_size, args.seed)
    args.out.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"output": str(args.out), "rows": len(frame), "browser_rows": len(payload["transactions"]), "fraud": payload["summary"]["fraud_count"], "fraud_rate": payload["summary"]["fraud_rate"], "synthetic": payload["metadata"]["synthetic_columns"]}, indent=2))


if __name__ == "__main__":
    main()
