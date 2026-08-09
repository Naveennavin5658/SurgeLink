# SurgeLink

Regional hospital bed/ICU capacity coordination platform. Provides a shared live view of bed capacity across hospitals in a region and coordinates patient transfers with atomic bed reservation to prevent double-allocation under concurrent requests.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         React Frontend (Vite)                           │
│   Dashboard │ Hospital Detail │ Transfers │ Audit Log                   │
│   Polling (10s) + SSE (/transfers/stream)                               │
└────────────┬──────────────────────────────────────┬───────────────────────┘
             │ REST                                  │ SSE
             ▼                                      ▼
┌────────────────────────────┐    ┌─────────────────────────────────────┐
│  Service A: Capacity API   │    │  Service B: Transfer Coordinator     │
│  Flask :5001               │    │  Flask :5002                         │
│  • Auth (JWT)              │    │  • Transfer CRUD + accept/reject     │
│  • Hospitals CRUD          │    │  • Atomic bed decrement              │
│  • Capacity snapshots      │    │  • SSE stream                        │
│  • Redis cache (10s TTL)   │    │  • Rate limiting (10/min transfers)  │
└────────────┬───────────────┘    └──────────────┬──────────────────────┘
             │                                    │
             │         ┌──────────────────────────┤
             │         │                          │
             ▼         ▼                          ▼
      ┌──────────────────────────────────────────────────┐
      │                    MongoDB                        │
      │  hospitals │ capacity_snapshots │ transfer_reqs  │
      │  users │ audit_log │ notifications                │
      └──────────────────────────────────────────────────┘
             ▲                          ▲
             │                          │
      ┌──────┴───────┐          ┌───────┴────────────────┐
      │    Redis     │          │  Service C: Celery Worker│
      │  • Cache     │◄────────►│  Notification tasks      │
      │  • Pub/Sub   │          │  (transfer state changes)│
      │  • Celery    │          └──────────────────────────┘
      └──────────────┘
```

## Quick Start

```bash
# Boot the entire stack
docker-compose up --build

# Seed the database (first run only)
curl -X POST http://localhost:5001/seed

# Open the frontend
open http://localhost:5173
```

### Demo Accounts

| Email | Password | Role |
|-------|----------|------|
| `coordinator@region` | `coord123` | Regional Coordinator |
| `clinician@metro.general` | `clin123` | Clinician |
| `admin@metro.general` | `admin123` | Hospital Admin |
| `receiving@lakeside.regional` | `recv123` | Receiving Staff |

## Services

| Service | Port | Description |
|---------|------|-------------|
| Capacity API | 5001 | Auth, hospitals, capacity CRUD, Redis caching |
| Transfer Coordinator | 5002 | Transfer requests, atomic accept, SSE, audit log |
| Notification Worker | — | Celery worker for transfer state change notifications |
| Frontend | 5173 | React dashboard |
| MongoDB | 27017 | Primary data store |
| Redis | 6379 | Cache, pub/sub, Celery broker |

## Data Model

### `capacity_snapshots` Indexing

Current capacity is derived from the **latest timestamp** per `(hospital_id, bed_type)` pair:

```javascript
db.capacity_snapshots.createIndex(
  { hospital_id: 1, bed_type: 1, timestamp: -1 }
)
```

Query pattern: `find({ hospital_id, bed_type }).sort({ timestamp: -1 }).limit(1)`

This time-series shape preserves full history for trend charts while keeping current-state lookups efficient via the compound index.

### Collections

- **`hospitals`** — name, region, location, bed_types
- **`capacity_snapshots`** — time-series bed counts (one doc per update)
- **`transfer_requests`** — patient transfer lifecycle with status_history
- **`audit_log`** — append-only mutation log (never updated or deleted)
- **`users`** — JWT auth with role-based access
- **`notifications`** — written by Celery worker on transfer events

## Concurrency: Atomic Bed Reservation

### The Problem

When two receiving staff members (or automated systems) simultaneously accept transfer requests targeting the last available ICU bed, a naive read-modify-write causes double-allocation:

```
Thread A: read available=1 → write available=0  ✓
Thread B: read available=1 → write available=0  ✗ (should fail!)
```

### The Solution

Service B uses MongoDB `find_one_and_update` with a guard filter and sort:

```python
db.capacity_snapshots.find_one_and_update(
    {
        "hospital_id": hospital_id,
        "bed_type": bed_type,
        "available": {"$gt": 0},      # ← atomic guard
    },
    {
        "$inc": {"available": -1},
        "$set": {"updated_by": user_id, "timestamp": now},
    },
    sort=[("timestamp", -1)],          # ← targets latest snapshot
    return_document=ReturnDocument.AFTER,
)
```

If `available` is already 0 when the update executes, the filter matches nothing and returns `None` — the caller responds with HTTP 409 "Bed no longer available."

### Proof: Concurrent Accept Test

Run after `docker-compose up` and seeding:

```bash
pip install requests
python scripts/concurrent_accept_test.py
```

Expected output:

```
============================================================
SurgeLink Concurrent Accept Race-Condition Test
============================================================
Set Lakeside ICU to 1/24 available
Created transfer request: 674a...

Firing 10 simultaneous accept requests...
Expected: exactly 1 success, 9 failures

Results:
  Successes: 1
  Failures:  9

  Request  1: FAILED (HTTP 409) Bed no longer available (concurrent reservation)
  Request  2: SUCCESS (HTTP 200)
  Request  3: FAILED (HTTP 409) Bed no longer available (concurrent reservation)
  ...

PASS: Exactly 1 accept succeeded — no double-allocation.

Final Lakeside ICU capacity: 0/24
PASS: Available count is 0 (not negative).
============================================================
```

## API Reference

### Service A — Capacity API (`:5001`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | — | JWT login |
| POST | `/auth/register` | — | Register user |
| GET | `/hospitals?region=` | JWT | List hospitals |
| GET | `/hospitals/:id/capacity` | JWT | Current capacity (Redis cache, 10s TTL) |
| POST | `/hospitals/:id/capacity` | hospital_admin | Write capacity snapshot |
| GET | `/hospitals/:id/capacity/history?hours=24` | JWT | Time series for charts |
| POST | `/seed` | — | Seed demo data |

### Service B — Transfer Coordinator (`:5002`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/transfers` | clinician | Create request (requires `Idempotency-Key` header) |
| GET | `/transfers?status=&hospital_id=` | JWT | List transfers |
| POST | `/transfers/:id/accept` | receiving_staff | Atomic bed reservation |
| POST | `/transfers/:id/reject` | receiving_staff | Reject request |
| POST | `/transfers/:id/force-reassign` | regional_coordinator | Emergency override |
| GET | `/transfers/stream` | — | SSE real-time events |
| GET | `/audit-log` | regional_coordinator | Audit log |

## Design Decisions

1. **Time-series capacity snapshots** over mutable counters — preserves audit trail and enables trend charts without a separate history table.

2. **Redis cache on capacity reads** with 10s TTL — dashboard polls every 10s; cache prevents MongoDB hammering across 10+ hospitals × 4 bed types.

3. **Idempotency keys on transfer creation** — prevents duplicate requests from network retries.

4. **Flask-Limiter on POST /transfers** — 10 requests/minute per IP to prevent abuse.

5. **SSE over WebSockets** — simpler for unidirectional server→client push; Redis pub/sub bridges services.

6. **Separate services** — Capacity API and Transfer Coordinator can scale independently; transfer logic isolation keeps the concurrency-critical path testable.

7. **Clinical UI design** — IBM Plex Sans, dark navy palette, data-dense tables, semantic capacity colors (green >30%, amber 10–30%, red <10%). No marketing-page aesthetics.

## Future Work

- HL7/FHIR integration for real-time ADT (Admission/Discharge/Transfer) feeds
- Multi-region federation with cross-region transfer routing
- Automated transfer expiry with background job
- Prometheus metrics and structured logging

## Development

```bash
# Run concurrency test
python scripts/concurrent_accept_test.py --workers 20

# Health checks
curl http://localhost:5001/health
curl http://localhost:5002/health
```
