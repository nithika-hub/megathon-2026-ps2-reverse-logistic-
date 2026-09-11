# EcoTrace API Contract — FREEZE THIS

Base URL: `http://127.0.0.1:8000`

## 1. Health
GET `/api/health`

## 2. Create collection
POST `/api/collections`

Request JSON:
```json
{
  "collector_id": "C001",
  "material": "Laptop",
  "material_category": "IT_EQUIPMENT",
  "declared_weight_kg": 10.0,
  "location_text": "SKCET",
  "lat": 11.02,
  "lng": 76.95,
  "photo_hash": "sha256...",
  "voice_transcript_text": "Old laptop collected"
}
```

Response:
```json
{
  "id": "COL-1001",
  "status": "COLLECTED"
}
```

## 3. Collector history
GET `/api/collections/my?collector_id=C001`

## 4. Aggregator queue
GET `/api/aggregator/pending`

## 5. Confirm pickup
POST `/api/aggregator/confirm`
```json
{
  "collection_id": "COL-1001",
  "aggregator_id": "A001",
  "weight_kg": 9.8,
  "lat": 11.03,
  "lng": 76.96
}
```

## 6. Recycler queue
GET `/api/recycler/pending`

## 7. Confirm recycler receipt
POST `/api/recycler/receive`
```json
{
  "collection_id": "COL-1001",
  "recycler_id": "R001",
  "weight_kg": 9.7
}
```

Response contains:
- status
- verified/EPR-eligible weight
- weight variance
- flag reason if any

## 8. Brand dashboard
GET `/api/epr/summary`

## 9. Audit
GET `/api/audit/{collection_id}`

## 10. Fraud
The backend checks:
- duplicate SHA-256 photo hash
- weight variance > 10%
- optional location anomaly > 50 km
- unusual collection frequency

**Important:** SHA-256 proves identical file evidence, not that physical e-waste is genuine.
