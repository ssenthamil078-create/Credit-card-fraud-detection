# FraudOps — deploy guide

## 1. Backend on Render
1. Push this repo to GitHub.
2. Render → New → Blueprint → select the repo (reads `render.yaml`). Or New Web Service with root dir `backend`,
   build `pip install -r requirements.txt`, start `uvicorn main:app --host 0.0.0.0 --port $PORT`.
3. Set `ALLOWED_ORIGINS` to your Vercel URL (comma-separated for several). Check `https://<service>.onrender.com/health`.

## 2. Frontend on Vercel
1. Vercel → Add New Project → same repo, **Root Directory: `frontend`** (framework Vite is auto-detected).
2. Environment variable: `VITE_API_URL=https://<service>.onrender.com`
3. Deploy. Without `VITE_API_URL` the app falls back to the bundled static dataset.

## Local
`cd backend && pip install -r requirements.txt && uvicorn main:app --reload`
`cd frontend && pnpm install && cp .env.example .env && pnpm dev`

## Notes
- Render free tier sleeps after inactivity (first request ~30-60s) and its disk is ephemeral: the audit SQLite resets on redeploy. Use a Render disk or Postgres for durable audit logs.
- `preprocess_dataset.py` regenerates `backend/data/fraud_dataset.json` (then copy to `frontend/public/data/`).
