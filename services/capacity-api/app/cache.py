"""Redis caching for hospital capacity reads."""
import json

from app.db import get_redis

CACHE_TTL = 10  # seconds


def cache_key(hospital_id: str) -> str:
    return f"capacity:{hospital_id}"


def get_cached_capacity(hospital_id: str) -> dict | None:
    r = get_redis()
    data = r.get(cache_key(hospital_id))
    if data:
        return json.loads(data)
    return None


def set_cached_capacity(hospital_id: str, capacity_data: dict):
    r = get_redis()
    r.setex(cache_key(hospital_id), CACHE_TTL, json.dumps(capacity_data))


def invalidate_capacity_cache(hospital_id: str):
    r = get_redis()
    r.delete(cache_key(hospital_id))
