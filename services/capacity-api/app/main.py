"""SurgeLink Capacity API — Service A."""
import os

from flask import Flask, jsonify, request
from flask_cors import CORS
from bson import ObjectId

from app.auth import (
    create_token,
    hash_password,
    require_auth,
    verify_password,
    write_audit_log,
    VALID_ROLES,
)
from app.capacity import get_capacity_history, get_current_capacity, write_capacity_snapshot
from app.db import ensure_indexes, get_db, serialize_doc, utcnow
from app.seed import seed_database

app = Flask(__name__)
allowed_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if origin.strip()
]
CORS(app, resources={r"/*": {"origins": allowed_origins}}, supports_credentials=True)


@app.before_request
def init_db():
    if not hasattr(app, "_indexes_created"):
        db = get_db()
        ensure_indexes(db)
        app._indexes_created = True


# ── Auth ──────────────────────────────────────────────────────────────────────

@app.route("/auth/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400

    db = get_db()
    user = db.users.find_one({"email": email})
    if not user or not verify_password(password, user["password_hash"]):
        return jsonify({"error": "Invalid credentials"}), 401

    hospital_id = str(user["hospital_id"]) if user.get("hospital_id") else None
    token = create_token(str(user["_id"]), user["role"], hospital_id)

    return jsonify({
        "token": token,
        "user": {
            "id": str(user["_id"]),
            "email": user["email"],
            "role": user["role"],
            "hospital_id": hospital_id,
        },
    })


@app.route("/auth/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    role = data.get("role", "clinician")
    hospital_id = data.get("hospital_id")

    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400
    if role not in VALID_ROLES:
        return jsonify({"error": f"Invalid role. Must be one of: {', '.join(VALID_ROLES)}"}), 400

    db = get_db()
    if db.users.find_one({"email": email}):
        return jsonify({"error": "Email already registered"}), 409

    doc = {
        "email": email,
        "password_hash": hash_password(password),
        "role": role,
        "hospital_id": ObjectId(hospital_id) if hospital_id else None,
        "created_at": utcnow(),
    }
    result = db.users.insert_one(doc)

    return jsonify({
        "id": str(result.inserted_id),
        "email": email,
        "role": role,
        "hospital_id": hospital_id,
    }), 201


# ── Hospitals ─────────────────────────────────────────────────────────────────

@app.route("/hospitals", methods=["GET"])
@require_auth()
def list_hospitals():
    region = request.args.get("region")
    db = get_db()
    query = {}
    if region:
        query["region"] = region

    hospitals = list(db.hospitals.find(query).sort("name", 1))
    return jsonify([serialize_doc(h) for h in hospitals])


@app.route("/hospitals/<hospital_id>/capacity", methods=["GET"])
@require_auth()
def get_hospital_capacity(hospital_id):
    db = get_db()
    if not ObjectId.is_valid(hospital_id):
        return jsonify({"error": "Invalid hospital ID"}), 400

    capacity = get_current_capacity(db, hospital_id)
    if capacity is None:
        return jsonify({"error": "Hospital not found"}), 404

    return jsonify({"hospital_id": hospital_id, "capacity": capacity})


@app.route("/hospitals/<hospital_id>/capacity", methods=["POST"])
@require_auth(roles={"hospital_admin"})
def update_hospital_capacity(hospital_id):
    user = request.current_user
    if user["hospital_id"] != hospital_id:
        return jsonify({"error": "You can only update your own hospital's capacity"}), 403

    data = request.get_json(silent=True) or {}
    bed_type = data.get("bed_type")
    available = data.get("available")
    total = data.get("total")

    if not bed_type or available is None or total is None:
        return jsonify({"error": "bed_type, available, and total are required"}), 400
    if not isinstance(available, int) or not isinstance(total, int) or available < 0 or total < 0:
        return jsonify({"error": "available and total must be non-negative integers"}), 400
    if available > total:
        return jsonify({"error": "available cannot exceed total"}), 400

    db = get_db()
    hospital = db.hospitals.find_one({"_id": ObjectId(hospital_id)})
    if not hospital:
        return jsonify({"error": "Hospital not found"}), 404
    if bed_type not in hospital.get("bed_types", []):
        return jsonify({"error": f"Invalid bed_type for this hospital"}), 400

    before = get_current_capacity(db, hospital_id)
    snapshot_id = write_capacity_snapshot(db, hospital_id, bed_type, available, total, user["user_id"])

    write_audit_log(
        db, user["user_id"], "update_capacity", "capacity_snapshots", snapshot_id,
        before=before, after={"bed_type": bed_type, "available": available, "total": total},
    )

    return jsonify({
        "hospital_id": hospital_id,
        "bed_type": bed_type,
        "available": available,
        "total": total,
    }), 201


@app.route("/hospitals/<hospital_id>/capacity/history", methods=["GET"])
@require_auth()
def get_hospital_capacity_history(hospital_id):
    hours = request.args.get("hours", 24, type=int)
    hours = min(max(hours, 1), 168)

    db = get_db()
    if not ObjectId.is_valid(hospital_id):
        return jsonify({"error": "Invalid hospital ID"}), 400

    history = get_capacity_history(db, hospital_id, hours)
    if history is None:
        return jsonify({"error": "Hospital not found"}), 404

    return jsonify({"hospital_id": hospital_id, "hours": hours, "history": history})


# ── Health & Seed ─────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "capacity-api"})


@app.route("/seed", methods=["POST"])
def seed():
    seed_database()
    return jsonify({"status": "seeded"})


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5001"))
    debug = os.getenv("FLASK_ENV", "development") != "production"
    app.run(host="0.0.0.0", port=port, debug=debug)
