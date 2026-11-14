import hashlib
import hmac
import json
import secrets
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qsl

import jwt
from cryptography.fernet import Fernet, InvalidToken

from .config import settings

_fernet = Fernet(settings.fernet_key)


# ---------- Telegram Web App initData ----------
def verify_init_data(init_data: str, bot_token: str, max_age: int = 7 * 86400) -> dict:
    """Проверка подписи initData (HMAC-SHA256, по документации Telegram). Возвращает пользователя."""
    if not init_data or not bot_token:
        raise ValueError("empty init data")
    pairs = dict(parse_qsl(init_data, keep_blank_values=True, strict_parsing=True))
    received = pairs.pop("hash", None)
    if not received:
        raise ValueError("no hash")
    data_check = "\n".join(f"{k}={v}" for k, v in sorted(pairs.items()))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    calc = hmac.new(secret_key, data_check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calc, received):
        raise ValueError("bad signature")
    auth_date = int(pairs.get("auth_date", "0"))
    if max_age and time.time() - auth_date > max_age:
        raise ValueError("init data expired")
    user = json.loads(pairs.get("user", "{}"))
    if not user.get("id"):
        raise ValueError("no user")
    return user


# ---------- JWT ----------
def create_session_token(user_id: int, days: int = 30) -> str:
    payload = {"sub": str(user_id), "typ": "session", "exp": datetime.now(timezone.utc) + timedelta(days=days)}
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def create_preview_token(shop_id: int, minutes: int = 180) -> str:
    payload = {"shop": shop_id, "typ": "preview", "exp": datetime.now(timezone.utc) + timedelta(minutes=minutes)}
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_token(token: str, typ: str) -> dict:
    data = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    if data.get("typ") != typ:
        raise jwt.InvalidTokenError("wrong type")
    return data


# ---------- Шифрование токенов ботов продавцов (Fernet / AES-128-CBC + HMAC) ----------
def encrypt_secret(value: str) -> str:
    return _fernet.encrypt(value.encode()).decode()


def decrypt_secret(value: str) -> str | None:
    try:
        return _fernet.decrypt(value.encode()).decode()
    except (InvalidToken, ValueError):
        return None


def random_token(nbytes: int = 24) -> str:
    return secrets.token_urlsafe(nbytes)
