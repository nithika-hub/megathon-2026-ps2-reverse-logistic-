# EcoTrace — 3-Laptop Megathon Starter

This repository is split for 3 members and uses a **React + Vite frontend** and **FastAPI + SQLite backend**.

## Team branches
- `member1-collector`: Collector UI + IndexedDB offline queue + photo SHA-256 + GPS
- `member2-backend`: FastAPI + SQLite + verification + fraud + EPR + audit
- `member3-dashboard`: Aggregator + Recycler + Brand/PRO dashboards

## Important
The API contract is frozen in `docs/API_CONTRACT.md`. Do not rename endpoints or response fields without telling the team.

## Quick start

### Backend
```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
pip install -r requirements.txt
python main.py
```
API: http://127.0.0.1:8000

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend: http://localhost:5173

The frontend expects the backend at `http://127.0.0.1:8000`.

## Three-laptop integration
For local network integration, the backend laptop must run:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```
Then teammates replace `VITE_API_URL` with the backend laptop's LAN URL, e.g. `http://192.168.1.10:8000`.

Do NOT use localhost from another laptop.

## Build order
1. Agree on API contract.
2. Member 2 starts backend first.
3. Member 1 builds collector against the contract.
4. Member 3 builds dashboards against the contract.
5. Integration test: Collector -> Aggregator -> Recycler -> EPR -> Brand.
