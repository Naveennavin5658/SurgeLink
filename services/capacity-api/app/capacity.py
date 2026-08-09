"""Capacity snapshot queries and writes."""
from bson import ObjectId

from app.cache import get_cached_capacity, invalidate_capacity_cache, set_cached_capacity
from app.db import serialize_doc, utcnow


def get_current_capacity(db, hospital_id: str) -> list[dict]:
    """Get latest capacity snapshot per bed_type for a hospital."""
    cached = get_cached_capacity(hospital_id)
    if cached is not None:
        return cached

    hospital = db.hospitals.find_one({"_id": ObjectId(hospital_id)})
    if not hospital:
        return None

    bed_types = hospital.get("bed_types", [])
    result = []

    for bed_type in bed_types:
        snapshot = db.capacity_snapshots.find_one(
            {"hospital_id": ObjectId(hospital_id), "bed_type": bed_type},
            sort=[("timestamp", -1)],
        )
        if snapshot:
            result.append({
                "bed_type": bed_type,
                "available": snapshot["available"],
                "total": snapshot["total"],
                "timestamp": snapshot["timestamp"].isoformat(),
            })
        else:
            result.append({
                "bed_type": bed_type,
                "available": 0,
                "total": 0,
                "timestamp": None,
            })

    set_cached_capacity(hospital_id, result)
    return result


def get_capacity_history(db, hospital_id: str, hours: int = 24) -> dict:
    """Time series capacity data for trend charts."""
    from datetime import timedelta

    hospital = db.hospitals.find_one({"_id": ObjectId(hospital_id)})
    if not hospital:
        return None

    since = utcnow() - timedelta(hours=hours)
    bed_types = hospital.get("bed_types", [])
    history = {}

    for bed_type in bed_types:
        snapshots = list(
            db.capacity_snapshots.find(
                {
                    "hospital_id": ObjectId(hospital_id),
                    "bed_type": bed_type,
                    "timestamp": {"$gte": since},
                },
                sort=[("timestamp", 1)],
            )
        )
        history[bed_type] = [
            {
                "available": s["available"],
                "total": s["total"],
                "timestamp": s["timestamp"].isoformat(),
            }
            for s in snapshots
        ]

    return history


def write_capacity_snapshot(db, hospital_id: str, bed_type: str, available: int, total: int, updated_by: str):
    """Write a new capacity snapshot and invalidate cache."""
    doc = {
        "hospital_id": ObjectId(hospital_id),
        "bed_type": bed_type,
        "available": available,
        "total": total,
        "updated_by": updated_by,
        "timestamp": utcnow(),
    }
    result = db.capacity_snapshots.insert_one(doc)
    invalidate_capacity_cache(hospital_id)
    return result.inserted_id
