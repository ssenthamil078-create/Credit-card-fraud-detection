"""FraudOps API (Render). Serves the processed dataset and records analyst actions as an audit trail."""
import json, os, sqlite3, time
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel

DATA = Path(__file__).parent / "data" / "fraud_dataset.json"
DB = os.getenv("DB_PATH", "/tmp/fraudops.db")   # free Render disk is ephemeral; attach a disk or Postgres for persistence
ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()]

app = FastAPI(title="FraudOps API")
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_origin_regex=os.getenv("ORIGIN_REGEX"),
                   allow_methods=["*"], allow_headers=["*"])
dataset = json.loads(DATA.read_text())

def db():
    c = sqlite3.connect(DB)
    c.execute("""CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, ts REAL, case_id TEXT, action TEXT,
                 status TEXT, detail TEXT, actor TEXT, feedback TEXT)""")
    return c

class Action(BaseModel):
    action: str; status: str; detail: str = ""; actor: str = "analyst"; feedback: str | None = None

@app.get("/health")
def health(): return {"ok": True, "rows": len(dataset["transactions"])}

@app.get("/api/dataset")
def get_dataset(): return dataset

@app.post("/api/cases/{case_id}/action")
def case_action(case_id: str, a: Action):
    with db() as c:
        c.execute("INSERT INTO audit(ts,case_id,action,status,detail,actor,feedback) VALUES(?,?,?,?,?,?,?)",
                  (time.time(), case_id, a.action, a.status, a.detail, a.actor, a.feedback))
    return {"recorded": True}

@app.get("/api/audit")
def audit(limit: int = 200):
    rows = db().execute("SELECT ts,case_id,action,status,detail,actor,feedback FROM audit ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [dict(zip(["ts", "case_id", "action", "status", "detail", "actor", "feedback"], r)) for r in rows]
