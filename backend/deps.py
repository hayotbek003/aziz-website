import jwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .db import get_session
from .models import Category, Product, Shop, User, utcnow
from .security import decode_token


async def current_user(
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Требуется вход")
    try:
        data = decode_token(authorization.split(" ", 1)[1], "session")
    except jwt.PyJWTError:
        raise HTTPException(401, "Сессия истекла, войдите снова")
    user = await session.get(User, int(data["sub"]))
    if not user:
        raise HTTPException(401, "Пользователь не найден")
    if user.is_blocked:
        raise HTTPException(403, "Аккаунт заблокирован администратором")
    user.last_seen_at = utcnow()
    return user


def is_admin(user: User) -> bool:
    return bool(user.is_admin or user.telegram_id in settings.admin_ids)


async def admin_user(user: User = Depends(current_user)) -> User:
    if not is_admin(user):
        raise HTTPException(403, "Доступ только для администратора")
    return user


async def owned_shop(session: AsyncSession, shop_id: int, user: User) -> Shop:
    """Изоляция клиентов: магазин доступен только владельцу."""
    shop = await session.get(Shop, shop_id)
    if not shop or shop.owner_id != user.id:
        raise HTTPException(404, "Магазин не найден")
    return shop


async def owned_product(session: AsyncSession, product_id: int, user: User) -> tuple[Product, Shop]:
    p = await session.get(Product, product_id)
    if not p:
        raise HTTPException(404, "Товар не найден")
    shop = await owned_shop(session, p.shop_id, user)
    return p, shop


async def owned_category(session: AsyncSession, category_id: int, user: User) -> tuple[Category, Shop]:
    c = await session.get(Category, category_id)
    if not c:
        raise HTTPException(404, "Категория не найдена")
    shop = await owned_shop(session, c.shop_id, user)
    return c, shop


async def category_in_shop(session: AsyncSession, category_id: int | None, shop_id: int) -> int | None:
    if not category_id:
        return None
    cid = await session.scalar(select(Category.id).where(Category.id == category_id, Category.shop_id == shop_id))
    if not cid:
        raise HTTPException(400, "Категория не принадлежит магазину")
    return cid


async def main_admin_user(user: User = Depends(current_user)) -> User:
    """Only configured platform owner/super-admins may manage manual subscriptions."""
    if user.telegram_id not in settings.admin_ids:
        raise HTTPException(403, "Доступ только для главного администратора")
    return user
