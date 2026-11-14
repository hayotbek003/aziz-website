import asyncio
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from .config import settings


def _normalize(url: str) -> tuple[str, dict]:
    connect_args: dict = {}
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+asyncpg://" + url[len("postgresql://"):]
    if url.startswith("postgresql+asyncpg://"):
        parts = urlsplit(url)
        keep = []
        for k, v in parse_qsl(parts.query):
            if k == "sslmode":
                if v != "disable":
                    connect_args["ssl"] = "require" if v in ("prefer", "allow") else v
            elif k in ("channel_binding", "options", "pgbouncer", "connect_timeout", "supa"):
                continue
            else:
                keep.append((k, v))
        # Совместимость с PgBouncer / serverless-пулерами (Neon, Supabase)
        connect_args["statement_cache_size"] = 0
        keep.append(("prepared_statement_cache_size", "0"))
        url = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(keep), parts.fragment))
    return url, connect_args


DB_URL, _connect_args = _normalize(settings.database_url)
IS_SQLITE = DB_URL.startswith("sqlite")

if IS_SQLITE:
    engine = create_async_engine(DB_URL)
else:
    # В serverless (Vercel) процессы короткоживущие — пул не держим
    engine = create_async_engine(DB_URL, connect_args=_connect_args, poolclass=NullPool)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


_ready = False
_lock = asyncio.Lock()


async def ensure_db() -> None:
    """Создаёт таблицы при первом обращении (идемпотентно)."""
    global _ready
    if _ready:
        return
    async with _lock:
        if _ready:
            return
        from . import models  # noqa: F401

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        _ready = True


async def get_session():
    await ensure_db()
    async with SessionLocal() as session:
        yield session
