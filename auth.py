import hashlib
import hmac
import os
import time
import jwt

JWT_SECRET = os.environ.get("SURAKSHA_JWT_SECRET", "dev-secret-change-in-production")
JWT_ALGO = "HS256"
TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7  # 7 days - workers may have patchy connectivity


def hash_password(password: str, salt: bytes = None) -> str:
    if salt is None:
        salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
    return salt.hex() + "$" + dk.hex()


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, hash_hex = stored.split("$")
    except ValueError:
        return False
    salt = bytes.fromhex(salt_hex)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
    return hmac.compare_digest(dk.hex(), hash_hex)


def issue_token(worker_id: str, phone: str) -> str:
    payload = {
        "sub": worker_id,
        "phone": phone,
        "iat": int(time.time()),
        "exp": int(time.time()) + TOKEN_TTL_SECONDS,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def decode_token(token: str):
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.PyJWTError:
        return None
