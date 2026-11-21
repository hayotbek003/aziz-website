"""Настройки платформы. Все секреты читаются только из переменных окружения (сервер)."""
import base64
import hashlib
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _load_env_files() -> None:
    # Мини-загрузчик .env для локальной разработки (на Vercel переменные задаются в панели проекта)
    for name in (".env.local", ".env"):
        p = ROOT / name
        if not p.exists():
            continue
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip().strip('"').strip("'")
            os.environ.setdefault(k, v)


_load_env_files()

DEFAULT_SECRET = "dev-insecure-secret-change-me"


def _bool(v: str | None) -> bool:
    return str(v or "").strip().lower() in ("1", "true", "yes", "on")


class Settings:
    def __init__(self) -> None:
        self.database_url = (
            os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL") or "sqlite+aiosqlite:///./aziz_dev.db"
        )
        self.bot_token = os.getenv("BOT_TOKEN", "")
        self.bot_username = os.getenv("BOT_USERNAME", "").lstrip("@")
        self.webapp_url = (os.getenv("WEBAPP_URL") or "http://localhost:3000").rstrip("/")
        self.jwt_secret = os.getenv("JWT_SECRET", DEFAULT_SECRET)
        self.encryption_key = os.getenv("ENCRYPTION_KEY", "")
        self.webhook_secret = os.getenv("WEBHOOK_SECRET", "")
        self.cron_secret = os.getenv("CRON_SECRET", "")
        self.admin_ids = {
            int(x)
            for x in os.getenv("ADMIN_TELEGRAM_IDS", "").replace(" ", "").split(",")
            if x.strip().lstrip("-").isdigit()
        }
        # Separate allow-list for Telegram-bot subscription controls.
        self.subscription_admin_ids = {
            int(x)
            for x in os.getenv("BOT_SUBSCRIPTION_ADMIN_IDS", "").replace(" ", "").split(",")
            if x.strip().lstrip("-").isdigit()
        }
        self.dev_mode = _bool(os.getenv("DEV_MODE"))
        self.trial_days = int(os.getenv("TRIAL_DAYS", "7"))
        self.manual_payment_info = os.getenv(
            "MANUAL_PAYMENT_INFO",
            "Переведите сумму на карту платформы и отправьте чек администратору.",
        )

        if not self.dev_mode and self.jwt_secret == DEFAULT_SECRET:
            raise RuntimeError(
                "JWT_SECRET не задан. Установите JWT_SECRET (или DEV_MODE=true для локальной разработки)."
            )

    @property
    def fernet_key(self) -> bytes:
        if self.encryption_key:
            return self.encryption_key.encode()
        # Производный ключ (если ENCRYPTION_KEY не задан). В продакшене задайте ENCRYPTION_KEY явно.
        return base64.urlsafe_b64encode(hashlib.sha256((self.jwt_secret + ":enc").encode()).digest())

    @property
    def is_https(self) -> bool:
        return self.webapp_url.startswith("https://")

    def shop_url(self, slug: str) -> str:
        return f"{self.webapp_url}/shop/{slug}"


settings = Settings()
