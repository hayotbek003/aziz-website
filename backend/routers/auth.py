from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import get_session
from ..deps import current_user
from ..models import LoginToken, User, utcnow
from ..security import create_session_token, verify_init_data
from ..services import aware, user_out

router = APIRouter(prefix="/api/auth", tags=["auth"])


async def upsert_tg_user(session: AsyncSession, tg: dict) -> User:
    tid = int(tg["id"])
    user = await session.scalar(select(User).where(User.telegram_id == tid))
    if not user:
        user = User(telegram_id=tid)
        session.add(user)
    user.username = tg.get("username") or user.username
    user.first_name = tg.get("first_name") or user.first_name
    user.last_name = tg.get("last_name") or user.last_name
    user.photo_url = tg.get("photo_url") or user.photo_url
    if tg.get("language_code"):
        user.language = "uz" if tg["language_code"].startswith("uz") else "ru"
    if tid in settings.admin_ids:
        user.is_admin = True
    user.last_seen_at = utcnow()
    await session.commit()
    await session.refresh(user)
    return user


def _session_response(user: User) -> dict:
    if user.is_blocked:
        raise HTTPException(403, "Аккаунт заблокирован администратором")
    return {"token": create_session_token(user.id), "user": user_out(user)}


class InitDataIn(BaseModel):
    initData: str


@router.post("/telegram")
async def auth_telegram(body: InitDataIn, session: AsyncSession = Depends(get_session)):
    try:
        tg = verify_init_data(body.initData, settings.bot_token)
    except ValueError as e:
        raise HTTPException(401, f"Неверные данные Telegram: {e}")
    user = await upsert_tg_user(session, tg)
    return _session_response(user)


class MagicIn(BaseModel):
    token: str


@router.post("/magic")
async def auth_magic(body: MagicIn, session: AsyncSession = Depends(get_session)):
    """Вход с компьютера по одноразовой ссылке из бота (/login)."""
    lt = await session.get(LoginToken, body.token)
    if not lt or lt.used or aware(lt.expires_at) < utcnow():
        raise HTTPException(401, "Ссылка для входа устарела. Отправьте /login боту ещё раз.")
    lt.used = True
    user = await session.get(User, lt.user_id)
    await session.commit()
    if not user:
        raise HTTPException(401, "Пользователь не найден")
    return _session_response(user)


class DevIn(BaseModel):
    telegram_id: int = 100001
    username: str | None = "demo_seller"
    first_name: str | None = "Demo"


@router.post("/dev")
async def auth_dev(body: DevIn, session: AsyncSession = Depends(get_session)):
    """Только для локальной разработки (DEV_MODE=true): вход без Telegram."""
    if not settings.dev_mode:
        raise HTTPException(404, "Not found")
    user = await upsert_tg_user(session, {"id": body.telegram_id, "username": body.username, "first_name": body.first_name})
    if not settings.admin_ids and not user.is_admin:
        # в dev без ADMIN_TELEGRAM_IDS первый dev-пользователь становится админом
        has_admin = await session.scalar(select(User.id).where(User.is_admin.is_(True)).limit(1))
        if not has_admin:
            user.is_admin = True
            await session.commit()
    return _session_response(user)


@router.get("/me")
async def me(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    await session.commit()
    return {"user": user_out(user)}
