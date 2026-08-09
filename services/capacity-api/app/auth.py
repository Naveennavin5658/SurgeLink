"""JWT authentication and role-based access control."""
import os
from functools import wraps

import bcrypt
import jwt
from bson import ObjectId
from flask import jsonify, request

JWT_SECRET = os.environ.get("JWT_SECRET", "surgelink-dev-secret-change-in-prod")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24

VALID_ROLES = {"super_admin", "hospital_admin", "clinician", "receiving_staff", "regional_coordinator"}


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def create_token(user_id: str, role: str, hospital_id: str | None = None) -> str:
    from datetime import timedelta
    from app.db import utcnow

    payload = {
        "sub": user_id,
        "role": role,
        "hospital_id": hospital_id,
        "iat": utcnow(),
        "exp": utcnow() + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None


def get_current_user():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:]
    payload = decode_token(token)
    if not payload:
        return None
    return {
        "user_id": payload["sub"],
        "role": payload["role"],
        "hospital_id": payload.get("hospital_id"),
    }


def require_auth(roles: set[str] | None = None):
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            user = get_current_user()
            if not user:
                return jsonify({"error": "Authentication required"}), 401
            if roles and user["role"] not in roles:
                return jsonify({"error": "Insufficient permissions"}), 403
            request.current_user = user
            return f(*args, **kwargs)
        return wrapper
    return decorator


def write_audit_log(db, actor_id, action, target_collection, target_id, before=None, after=None):
    from app.db import utcnow

    db.audit_log.insert_one({
        "actor_id": actor_id,
        "action": action,
        "target_collection": target_collection,
        "target_id": str(target_id),
        "before": before,
        "after": after,
        "timestamp": utcnow(),
    })
