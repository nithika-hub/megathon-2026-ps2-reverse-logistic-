# Three-Laptop Workflow

## Hour 0 — all three
1. One person creates the GitHub repository.
2. All three clone the SAME repository.
3. Read `docs/API_CONTRACT.md`.
4. Do not rename endpoints or JSON keys.

## Member 1
Branch: `member1-collector`
- Own `frontend/src/main.jsx` collector area and offline logic.
- Commit frequently.
- Avoid changing backend files.

## Member 2
Branch: `member2-backend`
- Own `backend/main.py`, database schema, fraud/EPR/audit.
- Start API early.
- Tell team when API is reachable.

## Member 3
Branch: `member3-dashboard`
- Own dashboard UI.
- Build Aggregator/Recycler/Brand screens.
- Avoid rewriting collector code.

## Integration rule
Before merging, pull `main`.
Resolve conflicts together.
Merge one branch at a time.
Then test the full loop.

## If using separate laptops
Backend laptop:
`uvicorn main:app --host 0.0.0.0 --port 8000`

Find backend laptop IPv4 with:
`ipconfig`

Frontend laptops:
create `frontend/.env`
`VITE_API_URL=http://BACKEND_IP:8000`

All laptops must be on the same Wi-Fi/LAN.

## Golden demo data
Collector: C001
Aggregator: A001
Recycler: R001
Brand: BRAND001
PRO: PRO001
Normal case: 10 -> 9.8 -> 9.7 kg
Flagged case: 12 -> 12 -> 8.2 kg
