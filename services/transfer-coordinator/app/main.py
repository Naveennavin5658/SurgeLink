"""SurgeLink Transfer Coordinator — Service B."""
from datetime import timedelta

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from bson import ObjectId

from app.auth import require_auth, write_audit_log
from app.db import ensure_indexes, get_db, serialize_doc, utcnow
from app.sse import create_sse_response
from app.transfers import (
    atomic_decrement_bed,
    create_transfer_request,
    list_transfers,
    publish_transfer_event,
    update_transfer_status,
)

app = Flask(__name__)
CORS(app, supports_credentials=True)

limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["200 per minute"],
    storage_uri="memory://",
)


@app.before_request
def init_db():
    if not hasattr(app, "_indexes_created"):
        db = get_db()
        ensure_indexes(db)
        app._indexes_created = True


# ── Transfers ─────────────────────────────────────────────────────────────────

@app.route("/transfers", methods=["POST"])
@require_auth(roles={"clinician"})
@limiter.limit("10 per minute")
def create_transfer():
    user = request.current_user
    idempotency_key = request.headers.get("Idempotency-Key")
    if not idempotency_key:
        return jsonify({"error": "Idempotency-Key header required"}), 400

    data = request.get_json(silent=True) or {}
    required = ["patient_case_id", "from_hospital_id", "to_hospital_id", "bed_type_requested"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    db = get_db()

    # Validate hospitals exist
    for hid in [data["from_hospital_id"], data["to_hospital_id"]]:
        if not ObjectId.is_valid(hid) or not db.hospitals.find_one({"_id": ObjectId(hid)}):
            return jsonify({"error": f"Hospital {hid} not found"}), 404

    if data["from_hospital_id"] == data["to_hospital_id"]:
        return jsonify({"error": "Cannot transfer to the same hospital"}), 400

    result = create_transfer_request(db, data, idempotency_key, user["user_id"])

    if result["duplicate"]:
        return jsonify(result["transfer"]), 200

    write_audit_log(
        db, user["user_id"], "create_transfer", "transfer_requests",
        result["transfer"]["_id"], after=result["transfer"],
    )

    publish_transfer_event("transfer_created", result["transfer"])
    return jsonify(result["transfer"]), 201


@app.route("/transfers", methods=["GET"])
@require_auth()
def get_transfers():
    status = request.args.get("status")
    hospital_id = request.args.get("hospital_id")

    user = request.current_user
    # Non-coordinators can only see transfers involving their hospital
    if user["role"] != "regional_coordinator" and not hospital_id:
        if user.get("hospital_id"):
            hospital_id = user["hospital_id"]

    db = get_db()
    transfers = list_transfers(db, status, hospital_id)
    return jsonify(transfers)


@app.route("/transfers/<transfer_id>/accept", methods=["POST"])
@require_auth(roles={"receiving_staff"})
def accept_transfer(transfer_id):
    user = request.current_user
    db = get_db()

    transfer = db.transfer_requests.find_one({"_id": ObjectId(transfer_id)})
    if not transfer:
        return jsonify({"error": "Transfer not found"}), 404

    if str(transfer["to_hospital_id"]) != user["hospital_id"]:
        return jsonify({"error": "You can only accept transfers to your hospital"}), 403

    if transfer["current_status"] not in ("requested", "pending"):
        return jsonify({"error": f"Transfer is already {transfer['current_status']}"}), 409

    if transfer.get("expires_at") and transfer["expires_at"] < utcnow():
        update_transfer_status(db, transfer_id, "expired", user["user_id"])
        return jsonify({"error": "Transfer request has expired"}), 410

    # Atomic bed decrement — the core concurrency guard
    bed_result = atomic_decrement_bed(
        db, str(transfer["to_hospital_id"]), transfer["bed_type_requested"], user["user_id"],
    )

    if not bed_result["success"]:
        return jsonify({"error": bed_result["error"]}), 409

    before_status = transfer["current_status"]
    updated = update_transfer_status(db, transfer_id, "accepted", user["user_id"])
    if not updated:
        return jsonify({"error": "Failed to update transfer status"}), 500

    write_audit_log(
        db, user["user_id"], "accept_transfer", "transfer_requests", transfer_id,
        before={"status": before_status},
        after={"status": "accepted", "bed_snapshot": bed_result["snapshot"]},
    )

    publish_transfer_event("transfer_accepted", updated)
    return jsonify(updated)


@app.route("/transfers/<transfer_id>/reject", methods=["POST"])
@require_auth(roles={"receiving_staff"})
def reject_transfer(transfer_id):
    user = request.current_user
    db = get_db()

    transfer = db.transfer_requests.find_one({"_id": ObjectId(transfer_id)})
    if not transfer:
        return jsonify({"error": "Transfer not found"}), 404

    if str(transfer["to_hospital_id"]) != user["hospital_id"]:
        return jsonify({"error": "You can only reject transfers to your hospital"}), 403

    if transfer["current_status"] not in ("requested", "pending"):
        return jsonify({"error": f"Transfer is already {transfer['current_status']}"}), 409

    before_status = transfer["current_status"]
    updated = update_transfer_status(db, transfer_id, "rejected", user["user_id"])
    if not updated:
        return jsonify({"error": "Failed to update transfer status"}), 500

    write_audit_log(
        db, user["user_id"], "reject_transfer", "transfer_requests", transfer_id,
        before={"status": before_status}, after={"status": "rejected"},
    )

    publish_transfer_event("transfer_rejected", updated)
    return jsonify(updated)


@app.route("/transfers/<transfer_id>/force-reassign", methods=["POST"])
@require_auth(roles={"regional_coordinator"})
def force_reassign(transfer_id):
    user = request.current_user
    data = request.get_json(silent=True) or {}
    new_hospital_id = data.get("to_hospital_id")

    if not new_hospital_id:
        return jsonify({"error": "to_hospital_id required"}), 400

    db = get_db()
    transfer = db.transfer_requests.find_one({"_id": ObjectId(transfer_id)})
    if not transfer:
        return jsonify({"error": "Transfer not found"}), 404

    if not db.hospitals.find_one({"_id": ObjectId(new_hospital_id)}):
        return jsonify({"error": "Target hospital not found"}), 404

    before = serialize_doc(transfer)

    # Atomic decrement at new hospital
    bed_result = atomic_decrement_bed(
        db, new_hospital_id, transfer["bed_type_requested"], user["user_id"],
    )
    if not bed_result["success"]:
        return jsonify({"error": bed_result["error"]}), 409

    now = utcnow()
    updated = db.transfer_requests.find_one_and_update(
        {"_id": ObjectId(transfer_id)},
        {
            "$set": {
                "to_hospital_id": ObjectId(new_hospital_id),
                "current_status": "accepted",
            },
            "$push": {
                "status_history": {
                    "status": "accepted",
                    "timestamp": now,
                    "by_user_id": user["user_id"],
                    "note": "force_reassign",
                }
            },
        },
        return_document=True,
    )

    result = serialize_doc(updated)
    write_audit_log(
        db, user["user_id"], "force_reassign", "transfer_requests", transfer_id,
        before=before, after=result,
    )

    publish_transfer_event("transfer_force_reassigned", result)
    return jsonify(result)


# ── SSE Stream ────────────────────────────────────────────────────────────────

@app.route("/transfers/stream", methods=["GET"])
def transfer_stream():
    return create_sse_response()


# ── Audit Log ─────────────────────────────────────────────────────────────────

@app.route("/audit-log", methods=["GET"])
@require_auth(roles={"regional_coordinator"})
def get_audit_log():
    db = get_db()
    limit = request.args.get("limit", 100, type=int)
    limit = min(max(limit, 1), 500)

    entries = list(db.audit_log.find().sort("timestamp", -1).limit(limit))
    return jsonify([serialize_doc(e) for e in entries])


# ── Health ────────────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "transfer-coordinator"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002, debug=True)
