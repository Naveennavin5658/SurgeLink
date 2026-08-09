"""Atomic bed reservation and transfer request management."""
import json
import os
from datetime import timedelta

from bson import ObjectId

from app.db import get_redis, serialize_doc, utcnow

TRANSFER_EVENTS_CHANNEL = "transfer_events"
CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/1")


def _get_latest_snapshot(db, hospital_id, bed_type):
    return db.capacity_snapshots.find_one(
        {"hospital_id": ObjectId(hospital_id), "bed_type": bed_type},
        sort=[("timestamp", -1)],
    )


def atomic_decrement_bed(db, hospital_id: str, bed_type: str, updated_by: str) -> dict:
    """
    Atomically decrement available bed count using find_one_and_update with sort.
    Finds the latest snapshot for (hospital_id, bed_type) where available > 0,
    decrements in a single atomic operation. Concurrent accept requests racing
    for the last bed: exactly one succeeds, the rest get None back.
    """
    from pymongo import ReturnDocument

    result = db.capacity_snapshots.find_one_and_update(
        {
            "hospital_id": ObjectId(hospital_id),
            "bed_type": bed_type,
            "available": {"$gt": 0},
        },
        {
            "$inc": {"available": -1},
            "$set": {"updated_by": updated_by, "timestamp": utcnow()},
        },
        sort=[("timestamp", -1)],
        return_document=ReturnDocument.AFTER,
    )

    if result is None:
        latest = _get_latest_snapshot(db, hospital_id, bed_type)
        if not latest:
            return {"success": False, "error": "No capacity data found for this bed type"}
        return {"success": False, "error": "Bed no longer available (concurrent reservation)"}

    r = get_redis()
    r.delete(f"capacity:{hospital_id}")

    return {"success": True, "snapshot": serialize_doc(result)}


def create_transfer_request(db, data: dict, idempotency_key: str, clinician_id: str) -> dict:
    """Create a new transfer request with idempotency check."""
    existing = db.transfer_requests.find_one({"idempotency_key": idempotency_key})
    if existing:
        return {"duplicate": True, "transfer": serialize_doc(existing)}

    now = utcnow()
    doc = {
        "requesting_clinician_id": clinician_id,
        "patient_case_id": data["patient_case_id"],
        "from_hospital_id": ObjectId(data["from_hospital_id"]),
        "to_hospital_id": ObjectId(data["to_hospital_id"]),
        "bed_type_requested": data["bed_type_requested"],
        "status_history": [
            {"status": "requested", "timestamp": now, "by_user_id": clinician_id}
        ],
        "current_status": "requested",
        "idempotency_key": idempotency_key,
        "created_at": now,
        "expires_at": now + timedelta(hours=4),
    }
    result = db.transfer_requests.insert_one(doc)
    doc["_id"] = result.inserted_id
    return {"duplicate": False, "transfer": serialize_doc(doc)}


def update_transfer_status(db, transfer_id: str, new_status: str, user_id: str) -> dict | None:
    """Update transfer status with history entry."""
    now = utcnow()
    result = db.transfer_requests.find_one_and_update(
        {"_id": ObjectId(transfer_id), "current_status": {"$in": ["requested", "pending"]}},
        {
            "$set": {"current_status": new_status},
            "$push": {
                "status_history": {
                    "status": new_status,
                    "timestamp": now,
                    "by_user_id": user_id,
                }
            },
        },
        return_document=True,
    )
    return serialize_doc(result) if result else None


def publish_transfer_event(event_type: str, transfer: dict):
    """Publish to Redis pub/sub and enqueue Celery task."""
    r = get_redis()
    event = {
        "type": event_type,
        "transfer": transfer,
        "timestamp": utcnow().isoformat(),
    }
    r.publish(TRANSFER_EVENTS_CHANNEL, json.dumps(event))

    try:
        from celery import Celery
        celery_app = Celery("surgelink", broker=CELERY_BROKER_URL)
        celery_app.send_task(
            "worker.tasks.process_transfer_event",
            args=[event_type, transfer],
        )
    except Exception:
        pass


def list_transfers(db, status: str | None = None, hospital_id: str | None = None) -> list:
    query = {}
    if status:
        query["current_status"] = status
    if hospital_id:
        query["$or"] = [
            {"from_hospital_id": ObjectId(hospital_id)},
            {"to_hospital_id": ObjectId(hospital_id)},
        ]

    transfers = list(db.transfer_requests.find(query).sort("created_at", -1).limit(200))
    return [serialize_doc(t) for t in transfers]
