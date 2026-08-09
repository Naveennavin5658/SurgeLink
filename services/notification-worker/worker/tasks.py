"""Notification worker tasks."""
import os
from datetime import datetime, timezone

from pymongo import MongoClient

from worker.celery_app import celery_app


def get_db():
    uri = os.environ.get("MONGODB_URI", "mongodb://localhost:27017/surgelink")
    client = MongoClient(uri)
    db_name = uri.rsplit("/", 1)[-1].split("?")[0]
    return client[db_name]


def utcnow():
    return datetime.now(timezone.utc)


@celery_app.task(name="worker.tasks.process_transfer_event")
def process_transfer_event(event_type: str, transfer: dict):
    """
    On transfer state change, write notification entries for relevant users.
    """
    db = get_db()
    notifications = []

    clinician_id = transfer.get("requesting_clinician_id")
    to_hospital_id = transfer.get("to_hospital_id")

    messages = {
        "transfer_created": f"New transfer request {transfer.get('patient_case_id')} awaiting review",
        "transfer_accepted": f"Transfer {transfer.get('patient_case_id')} has been accepted",
        "transfer_rejected": f"Transfer {transfer.get('patient_case_id')} has been rejected",
        "transfer_force_reassigned": f"Transfer {transfer.get('patient_case_id')} was force-reassigned by regional coordinator",
    }
    message = messages.get(event_type, f"Transfer update: {event_type}")

    if clinician_id:
        notifications.append({
            "user_id": clinician_id,
            "transfer_id": transfer.get("_id") or transfer.get("id"),
            "event_type": event_type,
            "message": message,
            "read": False,
            "created_at": utcnow(),
        })

    # Notify receiving hospital staff
    if to_hospital_id:
        from bson import ObjectId
        staff = db.users.find({
            "hospital_id": ObjectId(to_hospital_id) if isinstance(to_hospital_id, str) else to_hospital_id,
            "role": "receiving_staff",
        })
        for s in staff:
            notifications.append({
                "user_id": str(s["_id"]),
                "transfer_id": transfer.get("_id") or transfer.get("id"),
                "event_type": event_type,
                "message": message,
                "read": False,
                "created_at": utcnow(),
            })

    if notifications:
        db.notifications.insert_many(notifications)

    return {"notifications_created": len(notifications), "event_type": event_type}
