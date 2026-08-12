"""Shared configuration and database utilities."""
import os
from datetime import datetime, timezone
from urllib.parse import urlsplit

import redis
from bson import ObjectId
from pymongo import ASCENDING, DESCENDING, MongoClient


def utcnow():
    return datetime.now(timezone.utc)


def get_db_name_from_uri(uri):
    if not uri:
        return os.environ.get("MONGODB_DB_NAME", "surgelink")

    path = urlsplit(uri).path or "/"
    candidate = path.strip("/").split("/")[0].split("?")[0]
    if candidate:
        return candidate

    return os.environ.get("MONGODB_DB_NAME", "surgelink")


def get_mongo_client():
    uri = os.environ.get("MONGODB_URI", "mongodb://localhost:27017/surgelink")
    return MongoClient(uri)


def get_db():
    client = get_mongo_client()
    uri = os.environ.get("MONGODB_URI", "mongodb://localhost:27017/surgelink")
    db_name = get_db_name_from_uri(uri)
    return client[db_name]


def get_redis():
    url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    return redis.from_url(url, decode_responses=True)


def serialize_doc(doc):
    if doc is None:
        return None
    result = {}
    for key, value in doc.items():
        if isinstance(value, ObjectId):
            result[key] = str(value)
        elif isinstance(value, datetime):
            result[key] = value.isoformat()
        elif isinstance(value, list):
            result[key] = [
                serialize_doc(v) if isinstance(v, dict) else
                str(v) if isinstance(v, ObjectId) else
                v.isoformat() if isinstance(v, datetime) else v
                for v in value
            ]
        elif isinstance(value, dict):
            result[key] = serialize_doc(value)
        else:
            result[key] = value
    return result


def ensure_indexes(db):
    db.capacity_snapshots.create_index(
        [("hospital_id", ASCENDING), ("bed_type", ASCENDING), ("timestamp", DESCENDING)]
    )
    db.transfer_requests.create_index([("idempotency_key", ASCENDING)], unique=True, sparse=True)
    db.transfer_requests.create_index([("current_status", ASCENDING)])
    db.transfer_requests.create_index([("to_hospital_id", ASCENDING)])
    db.transfer_requests.create_index([("from_hospital_id", ASCENDING)])
    db.audit_log.create_index([("timestamp", DESCENDING)])
    db.users.create_index([("email", ASCENDING)], unique=True)
    db.notifications.create_index([("user_id", ASCENDING), ("created_at", DESCENDING)])
