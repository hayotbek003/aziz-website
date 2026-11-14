"""FSM-хранилище aiogram 3 в PostgreSQL — состояние диалога переживает перезапуски serverless-функций."""
from typing import Any

from aiogram.fsm.state import State
from aiogram.fsm.storage.base import BaseStorage, StorageKey

from ..db import SessionLocal, ensure_db
from ..models import BotState


def _key(key: StorageKey) -> str:
    parts = [key.bot_id, key.chat_id, key.user_id, key.thread_id or "", getattr(key, "business_connection_id", None) or "", key.destiny]
    return ":".join(str(p) for p in parts)[:160]


class DBStorage(BaseStorage):
    async def _row(self, session, key: StorageKey) -> BotState:
        k = _key(key)
        row = await session.get(BotState, k)
        if not row:
            row = BotState(key=k, state=None, data={})
            session.add(row)
        return row

    async def set_state(self, key: StorageKey, state: Any = None) -> None:
        await ensure_db()
        value = state.state if isinstance(state, State) else state
        async with SessionLocal() as s:
            row = await self._row(s, key)
            row.state = value
            await s.commit()

    async def get_state(self, key: StorageKey) -> str | None:
        await ensure_db()
        async with SessionLocal() as s:
            row = await s.get(BotState, _key(key))
            return row.state if row else None

    async def set_data(self, key: StorageKey, data: dict[str, Any]) -> None:
        await ensure_db()
        async with SessionLocal() as s:
            row = await self._row(s, key)
            row.data = dict(data)
            await s.commit()

    async def get_data(self, key: StorageKey) -> dict[str, Any]:
        await ensure_db()
        async with SessionLocal() as s:
            row = await s.get(BotState, _key(key))
            return dict(row.data or {}) if row else {}

    async def close(self) -> None:
        return None
