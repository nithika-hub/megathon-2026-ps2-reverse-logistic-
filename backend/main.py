from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import hashlib
import os
import sqlite3
import math

DB = os.path.join(os.path.dirname(__file__), "ecotrace.db")
app = FastAPI(title="EcoTrace API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def now():
    return datetime.utcnow().isoformat()

def db():
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    return con

def init_db():
    con = db()
    con.executescript("""
    CREATE TABLE IF NOT EXISTS customer_requests (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        address TEXT NOT NULL,
        material TEXT NOT NULL,
        estimated_weight_kg REAL,
        location_text TEXT,
        lat REAL,
        lng REAL,
        photo_hash TEXT,
        voice_transcript_text TEXT,
        status TEXT NOT NULL DEFAULT 'PICKUP_REQUESTED',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY,
        request_id TEXT,
        collector_id TEXT NOT NULL,
        material TEXT NOT NULL,
        material_category TEXT NOT NULL,
        declared_weight_kg REAL NOT NULL CHECK(declared_weight_kg > 0),
        location_text TEXT,
        lat REAL,
        lng REAL,
        photo_hash TEXT,
        voice_transcript_text TEXT,
        status TEXT NOT NULL DEFAULT 'COLLECTED',
        aggregator_id TEXT,
        aggregator_weight_kg REAL,
        aggregator_lat REAL,
        aggregator_lng REAL,
        aggregator_confirmed_at TEXT,
        recycler_id TEXT,
        recycler_weight_kg REAL,
        recycler_confirmed_at TEXT,
        weight_variance_pct REAL,
        flag_reason TEXT,
        epr_eligible_weight_kg REAL,
        incentive_points REAL DEFAULT 0,
        incentive_status TEXT DEFAULT 'PENDING',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        collection_id TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        action TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS epr_allocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        collection_id TEXT NOT NULL,
        brand_id TEXT NOT NULL DEFAULT 'BRAND001',
        pro_id TEXT NOT NULL DEFAULT 'PRO001',
        allocated_weight_kg REAL NOT NULL,
        period TEXT NOT NULL,
        allocated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS brand_targets (
        brand_id TEXT PRIMARY KEY,
        period TEXT NOT NULL,
        target_kg REAL NOT NULL
    );

    INSERT OR IGNORE INTO brand_targets VALUES ('BRAND001','2026-Q3',1000);
    """)
    # Backward-compatible migration for databases created by earlier builds.
    cols = {r[1] for r in con.execute("PRAGMA table_info(collections)").fetchall()}
    if "request_id" not in cols:
        con.execute("ALTER TABLE collections ADD COLUMN request_id TEXT")
    req_cols = {r[1] for r in con.execute("PRAGMA table_info(customer_requests)").fetchall()}
    if "collection_id" not in req_cols:
        con.execute("ALTER TABLE customer_requests ADD COLUMN collection_id TEXT")
    if "collector_id" not in req_cols:
        con.execute("ALTER TABLE customer_requests ADD COLUMN collector_id TEXT")
    if "collector_assigned_at" not in req_cols:
        con.execute("ALTER TABLE customer_requests ADD COLUMN collector_assigned_at TEXT")
    if "collected_at" not in req_cols:
        con.execute("ALTER TABLE customer_requests ADD COLUMN collected_at TEXT")
    con.commit()
    con.close()

init_db()

class CustomerRequestIn(BaseModel):
    name: str = Field(min_length=1)
    phone: str = Field(min_length=3)
    address: str = Field(min_length=3)
    material: str
    estimated_weight_kg: Optional[float] = Field(default=None, gt=0)
    location_text: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    photo_hash: Optional[str] = None
    voice_transcript_text: Optional[str] = None

class CollectionIn(BaseModel):
    request_id: Optional[str] = None
    collector_id: str
    material: str
    material_category: str = "OTHER"
    declared_weight_kg: float = Field(gt=0)
    location_text: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    photo_hash: Optional[str] = None
    voice_transcript_text: Optional[str] = None

class VerifyIn(BaseModel):
    collection_id: str
    aggregator_id: str
    weight_kg: float = Field(gt=0)
    lat: Optional[float] = None
    lng: Optional[float] = None

class RecyclerIn(BaseModel):
    collection_id: str
    recycler_id: str
    weight_kg: float = Field(gt=0)

def next_customer_id():
    con=db()
    row=con.execute("SELECT COUNT(*) c FROM customer_requests").fetchone()
    con.close()
    return f"REQ-{1001 + row['c']}"

def next_id():
    con=db()
    row=con.execute("SELECT COUNT(*) c FROM collections").fetchone()
    con.close()
    return f"COL-{1001 + row['c']}"

def add_audit(con, cid, role, actor, action, old, new, metadata=""):
    con.execute("""INSERT INTO audit_log
    (collection_id,actor_role,actor_id,action,from_status,to_status,metadata,created_at)
    VALUES (?,?,?,?,?,?,?,?)""",
    (cid,role,actor,action,old,new,metadata,now()))

def haversine(a,b,c,d):
    if None in (a,b,c,d): return None
    R=6371
    p1,p2=math.radians(a),math.radians(c)
    dp=math.radians(c-a); dl=math.radians(d-b)
    x=math.sin(dp/2)**2+math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*R*math.asin(math.sqrt(x))

@app.get("/api/health")
def health(): return {"ok": True, "service": "EcoTrace API"}

@app.post("/api/customer/requests")
def create_customer_request(x: CustomerRequestIn):
    con=db()
    rid=next_customer_id()
    t=now()
    con.execute("""INSERT INTO customer_requests
    (id,name,phone,address,material,estimated_weight_kg,location_text,lat,lng,photo_hash,voice_transcript_text,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
    (rid,x.name.strip(),x.phone.strip(),x.address.strip(),x.material,x.estimated_weight_kg,x.location_text,x.lat,x.lng,x.photo_hash,x.voice_transcript_text,"PICKUP_REQUESTED",t,t))
    con.commit(); con.close()
    return {"id":rid,"status":"PICKUP_REQUESTED","photo_hash_recorded":bool(x.photo_hash),"gps_recorded":x.lat is not None and x.lng is not None,"voice_recorded":bool(x.voice_transcript_text)}

@app.get("/api/customer/requests")
def customer_requests(phone=""):
    con=db()
    if phone:
        rows=con.execute("SELECT * FROM customer_requests WHERE phone=? ORDER BY created_at DESC",(phone,)).fetchall()
    else:
        rows=con.execute("SELECT * FROM customer_requests ORDER BY created_at DESC").fetchall()
    con.close()
    return [dict(r) for r in rows]

@app.get("/api/customer/trace/{request_id}")
def customer_trace(request_id: str):
    con=db()
    req=con.execute("SELECT * FROM customer_requests WHERE id=?",(request_id,)).fetchone()
    if not req:
        con.close(); raise HTTPException(404,"Pickup request not found")
    collection=None
    if req["collection_id"]:
        collection=con.execute("SELECT * FROM collections WHERE id=?",(req["collection_id"],)).fetchone()
    elif req["id"]:
        collection=con.execute("SELECT * FROM collections WHERE request_id=? ORDER BY created_at DESC LIMIT 1",(req["id"],)).fetchone()
    events=[]
    if collection:
        events=[dict(r) for r in con.execute("SELECT * FROM audit_log WHERE collection_id=? ORDER BY id",(collection["id"],)).fetchall()]
    con.close()
    c=dict(collection) if collection else None
    status=(c["status"] if c else req["status"])
    return {"request":dict(req),"collection":c,"events":events,"status":status,"completed":status=="EPR_ELIGIBLE"}

@app.get("/api/customer/pending")
def customer_pending():
    con=db(); rows=con.execute("SELECT * FROM customer_requests WHERE collection_id IS NULL ORDER BY created_at").fetchall(); con.close()
    return [dict(r) for r in rows]

@app.post("/api/collections")
def create_collection(x: CollectionIn):
    con=db()
    cid=next_id()
    t=now()
    if x.request_id:
        req=con.execute("SELECT * FROM customer_requests WHERE id=?",(x.request_id,)).fetchone()
        if not req:
            con.close(); raise HTTPException(404,"Customer pickup request not found")
        if req["collection_id"]:
            con.close(); raise HTTPException(409,"This pickup request is already assigned")
    con.execute("""INSERT INTO collections
    (id,request_id,collector_id,material,material_category,declared_weight_kg,location_text,lat,lng,photo_hash,voice_transcript_text,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
    (cid,x.request_id,x.collector_id,x.material,x.material_category,x.declared_weight_kg,x.location_text,x.lat,x.lng,x.photo_hash,x.voice_transcript_text,t,t))
    add_audit(con,cid,"collector",x.collector_id,"collection_created",None,"COLLECTED", f"request_id={x.request_id}" if x.request_id else "")
    if x.request_id:
        con.execute("UPDATE customer_requests SET collection_id=?,collector_id=?,collector_assigned_at=?,collected_at=?,status='PICKUP_COLLECTED',updated_at=? WHERE id=?",(cid,x.collector_id,t,t,t,x.request_id))
    con.commit(); con.close()
    return {"id":cid,"status":"COLLECTED","request_id":x.request_id}

@app.get("/api/collections/my")
def my_collections(collector_id="C001"):
    con=db(); rows=con.execute("SELECT * FROM collections WHERE collector_id=? ORDER BY created_at DESC",(collector_id,)).fetchall(); con.close()
    return [dict(r) for r in rows]

@app.get("/api/aggregator/pending")
def agg_pending():
    con=db(); rows=con.execute("SELECT * FROM collections WHERE status='COLLECTED' ORDER BY created_at").fetchall(); con.close()
    return [dict(r) for r in rows]

@app.post("/api/aggregator/confirm")
def confirm_agg(x: VerifyIn):
    con=db(); r=con.execute("SELECT * FROM collections WHERE id=?",(x.collection_id,)).fetchone()
    if not r: con.close(); raise HTTPException(404,"Collection not found")
    if r["status"]!="COLLECTED": con.close(); raise HTTPException(409,"Invalid state transition")
    t=now()
    con.execute("""UPDATE collections SET aggregator_id=?,aggregator_weight_kg=?,aggregator_lat=?,aggregator_lng=?,aggregator_confirmed_at=?,status='AGGREGATOR_CONFIRMED',updated_at=? WHERE id=?""",
                (x.aggregator_id,x.weight_kg,x.lat,x.lng,t,t,x.collection_id))
    if r["request_id"]:
        con.execute("UPDATE customer_requests SET status='AGGREGATOR_CONFIRMED',updated_at=? WHERE id=?",(t,r["request_id"]))
    add_audit(con,x.collection_id,"aggregator",x.aggregator_id,"confirm_pickup","COLLECTED","AGGREGATOR_CONFIRMED")
    con.commit(); con.close()
    return {"id":x.collection_id,"status":"AGGREGATOR_CONFIRMED"}

@app.get("/api/recycler/pending")
def recycler_pending():
    con=db(); rows=con.execute("SELECT * FROM collections WHERE status='AGGREGATOR_CONFIRMED' ORDER BY created_at").fetchall(); con.close()
    return [dict(r) for r in rows]

@app.post("/api/recycler/receive")
def receive(x: RecyclerIn):
    con=db(); r=con.execute("SELECT * FROM collections WHERE id=?",(x.collection_id,)).fetchone()
    if not r: con.close(); raise HTTPException(404,"Collection not found")
    if r["status"]!="AGGREGATOR_CONFIRMED": con.close(); raise HTTPException(409,"Invalid state transition")
    agg=r["aggregator_weight_kg"]
    variance=abs(x.weight_kg-agg)/agg*100 if agg and agg>0 else 999
    flags=[]
    if variance>10: flags.append("weight_mismatch")
    if r["photo_hash"]:
        dup=con.execute("SELECT COUNT(*) c FROM collections WHERE photo_hash=? AND id!=?",(r["photo_hash"],x.collection_id)).fetchone()["c"]
        if dup: flags.append("duplicate_evidence")
    dist=haversine(r["lat"],r["lng"],r["aggregator_lat"],r["aggregator_lng"])
    if dist is not None and dist>50: flags.append("location_anomaly")
    # Frequency rule: more than 20 records by collector in the last 30 minutes.
    # Kept simple for MVP.
    status="FLAGGED" if flags else "EPR_ELIGIBLE"
    reason="+".join(flags) if flags else None
    t=now()
    con.execute("""UPDATE collections SET recycler_id=?,recycler_weight_kg=?,recycler_confirmed_at=?,weight_variance_pct=?,flag_reason=?,status=?,epr_eligible_weight_kg=?,incentive_points=?,incentive_status=?,updated_at=? WHERE id=?""",
        (x.recycler_id,x.weight_kg,t,variance,reason,status,x.weight_kg if not flags else None,
         x.weight_kg if not flags else 0,"EARNED" if not flags else "PENDING",t,x.collection_id))
    if r["request_id"]:
        con.execute("UPDATE customer_requests SET status=?,updated_at=? WHERE id=?",(status,t,r["request_id"]))
    add_audit(con,x.collection_id,"recycler",x.recycler_id,"confirm_receipt","AGGREGATOR_CONFIRMED",status,
              f"variance_pct={variance:.2f};flag_reason={reason}")
    if not flags:
        con.execute("""INSERT INTO epr_allocations(collection_id,brand_id,pro_id,allocated_weight_kg,period,allocated_at)
                       VALUES (?,?,?,?,?,?)""",
                    (x.collection_id,"BRAND001","PRO001",x.weight_kg,"2026-Q3",now()))
        add_audit(con,x.collection_id,"system","SYSTEM","epr_allocated","EPR_ELIGIBLE","ALLOCATED",
                  f"brand=BRAND001;weight={x.weight_kg}")
    con.commit(); con.close()
    return {"id":x.collection_id,"status":status,"epr_eligible_weight_kg":x.weight_kg if not flags else None,
            "variance_pct":round(variance,2),"flag_reason":reason}

@app.get("/api/epr/summary")
def epr_summary():
    con=db()
    target=con.execute("SELECT target_kg FROM brand_targets WHERE brand_id='BRAND001'").fetchone()["target_kg"]
    fulfilled=con.execute("SELECT COALESCE(SUM(allocated_weight_kg),0) s FROM epr_allocations WHERE brand_id='BRAND001'").fetchone()["s"]
    counts={}
    for s in ["COLLECTED","AGGREGATOR_CONFIRMED","EPR_ELIGIBLE","FLAGGED"]:
        counts[s]=con.execute("SELECT COUNT(*) c FROM collections WHERE status=?",(s,)).fetchone()["c"]
    con.close()
    return {"target_kg":target,"fulfilled_kg":fulfilled,"remaining_kg":max(target-fulfilled,0),
            "compliance_pct":round(fulfilled/target*100,2) if target else 0,"counts":counts}

@app.get("/api/audit/{collection_id}")
def audit(collection_id):
    con=db(); rows=con.execute("SELECT * FROM audit_log WHERE collection_id=? ORDER BY id",(collection_id,)).fetchall(); con.close()
    if not rows: raise HTTPException(404,"Audit trail not found")
    return [dict(r) for r in rows]

@app.post("/api/seed")
def seed():
    # Safe demo seed: only inserts when database is empty.
    con=db()
    n=con.execute("SELECT COUNT(*) c FROM collections").fetchone()["c"]
    if n==0:
        con.execute("""INSERT INTO collections
        (id,collector_id,material,material_category,declared_weight_kg,location_text,lat,lng,photo_hash,status,created_at,updated_at)
        VALUES ('COL-1000','C001','Laptop','IT_EQUIPMENT',12,'Demo',11.02,76.95,'DEMO-HASH','FLAGGED',?,?)""",(now(),now()))
        add_audit(con,"COL-1000","system","SYSTEM","seeded_demo",None,"FLAGGED","weight_mismatch")
        con.commit()
    con.close()
    return {"seeded": True}
