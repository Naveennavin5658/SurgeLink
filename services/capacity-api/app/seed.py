"""Database seeding: hospitals, users, and capacity history."""
import random
from datetime import timedelta

from bson import ObjectId

from app.auth import hash_password
from app.db import ensure_indexes, get_db, utcnow

HOSPITALS = [
    {
        "name": "Metro General Hospital",
        "region": "north",
        "location": {"lat": 40.758, "lng": -73.985},
        "bed_types": ["icu", "oxygen", "general", "ventilator"],
    },
    {
        "name": "Riverside Medical Center",
        "region": "north",
        "location": {"lat": 40.748, "lng": -73.968},
        "bed_types": ["icu", "oxygen", "general"],
    },
    {
        "name": "Highland Community Hospital",
        "region": "north",
        "location": {"lat": 40.761, "lng": -73.977},
        "bed_types": ["icu", "general", "ventilator"],
    },
    {
        "name": "Lakeside Regional Medical",
        "region": "central",
        "location": {"lat": 39.952, "lng": -75.165},
        "bed_types": ["icu", "oxygen", "general", "ventilator"],
    },
    {
        "name": "Valley View Hospital",
        "region": "central",
        "location": {"lat": 39.961, "lng": -75.150},
        "bed_types": ["icu", "oxygen", "general"],
    },
    {
        "name": "Central University Medical",
        "region": "central",
        "location": {"lat": 39.948, "lng": -75.158},
        "bed_types": ["icu", "general", "ventilator"],
    },
    {
        "name": "Coastal Memorial Hospital",
        "region": "south",
        "location": {"lat": 33.749, "lng": -84.388},
        "bed_types": ["icu", "oxygen", "general", "ventilator"],
    },
    {
        "name": "Sunrise Health System",
        "region": "south",
        "location": {"lat": 33.755, "lng": -84.390},
        "bed_types": ["icu", "oxygen", "general"],
    },
    {
        "name": "Piedmont Care Center",
        "region": "south",
        "location": {"lat": 33.760, "lng": -84.385},
        "bed_types": ["icu", "general"],
    },
    {
        "name": "Crossroads Emergency Hospital",
        "region": "central",
        "location": {"lat": 39.955, "lng": -75.170},
        "bed_types": ["icu", "oxygen", "general", "ventilator"],
    },
]

BED_DEFAULTS = {
    "icu": {"total": 24, "available_range": (2, 18)},
    "oxygen": {"total": 40, "available_range": (5, 35)},
    "general": {"total": 120, "available_range": (10, 100)},
    "ventilator": {"total": 12, "available_range": (1, 10)},
}

USERS = [
    {"email": "admin@metro.general", "password": "admin123", "role": "hospital_admin", "hospital_index": 0},
    {"email": "clinician@metro.general", "password": "clin123", "role": "clinician", "hospital_index": 0},
    {"email": "receiving@metro.general", "password": "recv123", "role": "receiving_staff", "hospital_index": 0},
    {"email": "admin@lakeside.regional", "password": "admin123", "role": "hospital_admin", "hospital_index": 3},
    {"email": "clinician@lakeside.regional", "password": "clin123", "role": "clinician", "hospital_index": 3},
    {"email": "receiving@lakeside.regional", "password": "recv123", "role": "receiving_staff", "hospital_index": 3},
    {"email": "admin@coastal.memorial", "password": "admin123", "role": "hospital_admin", "hospital_index": 6},
    {"email": "clinician@coastal.memorial", "password": "clin123", "role": "clinician", "hospital_index": 6},
    {"email": "receiving@coastal.memorial", "password": "recv123", "role": "receiving_staff", "hospital_index": 6},
    {"email": "coordinator@region", "password": "coord123", "role": "regional_coordinator", "hospital_index": None},
]


def seed_database():
    db = get_db()
    ensure_indexes(db)

    if db.hospitals.count_documents({}) > 0:
        print("Database already seeded, skipping.")
        return

    print("Seeding hospitals...")
    hospital_ids = []
    for h in HOSPITALS:
        doc = {**h, "created_at": utcnow()}
        result = db.hospitals.insert_one(doc)
        hospital_ids.append(result.inserted_id)

    print("Seeding users...")
    for u in USERS:
        hospital_id = hospital_ids[u["hospital_index"]] if u["hospital_index"] is not None else None
        db.users.insert_one({
            "email": u["email"],
            "password_hash": hash_password(u["password"]),
            "role": u["role"],
            "hospital_id": hospital_id,
            "created_at": utcnow(),
        })

    print("Seeding current capacity snapshots...")
    for hid in hospital_ids:
        hospital = db.hospitals.find_one({"_id": hid})
        for bed_type in hospital["bed_types"]:
            defaults = BED_DEFAULTS.get(bed_type, {"total": 20, "available_range": (2, 15)})
            available = random.randint(*defaults["available_range"])
            db.capacity_snapshots.insert_one({
                "hospital_id": hid,
                "bed_type": bed_type,
                "available": available,
                "total": defaults["total"],
                "updated_by": "system_seed",
                "timestamp": utcnow(),
            })

    print("Seeding 72-hour capacity history for 3 hospitals...")
    history_hospitals = hospital_ids[:3]
    now = utcnow()
    for hid in history_hospitals:
        hospital = db.hospitals.find_one({"_id": hid})
        for bed_type in hospital["bed_types"]:
            defaults = BED_DEFAULTS.get(bed_type, {"total": 20, "available_range": (2, 15)})
            total = defaults["total"]
            available = random.randint(*defaults["available_range"])
            for hour_offset in range(72, 0, -1):
                ts = now - timedelta(hours=hour_offset)
                drift = random.randint(-3, 3)
                available = max(0, min(total, available + drift))
                db.capacity_snapshots.insert_one({
                    "hospital_id": hid,
                    "bed_type": bed_type,
                    "available": available,
                    "total": total,
                    "updated_by": "system_seed_history",
                    "timestamp": ts,
                })

    print(f"Seeded {len(hospital_ids)} hospitals, {len(USERS)} users, capacity snapshots with 72h history.")


if __name__ == "__main__":
    seed_database()
