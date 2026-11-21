"""Administrator-only manual subscription controls and audit history."""
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_session
from ..deps import main_admin_user
from ..models import Shop, SubscriptionAction, User, utcnow
from ..services import aware, html_escape, notify, shop_state, shop_summary

router = APIRouter(prefix="/api/admin", tags=["admin-subscriptions"], dependencies=[Depends(main_admin_user)])

@router.get("/subscription-access")
async def subscription_access():
    return {"allowed": True}

class ManualSubscriptionIn(BaseModel):
    action: str = Field(pattern="^(extend|set_expiry|lifetime|revoke)$")
    days: int | None = Field(default=None, ge=1, le=36500)
    expires_at: datetime | None = None
    reason: str = Field(default="", max_length=500)
    notify_owner: bool = True

    @model_validator(mode="after")
    def validate_action(self):
        if self.action == "extend" and self.days is None:
            raise ValueError("Для продления укажите количество дней")
        if self.action == "set_expiry" and self.expires_at is None:
            raise ValueError("Для установки даты укажите expires_at")
        return self

def history_out(row: SubscriptionAction, admin: User | None = None) -> dict:
    return {"id": row.id, "shop_id": row.shop_id, "admin_user_id": row.admin_user_id,
            "admin": (admin.username or admin.first_name) if admin else None,
            "action": row.action, "days": row.days,
            "expires_at": row.expires_at.isoformat() if row.expires_at else None,
            "reason": row.reason, "created_at": row.created_at.isoformat()}

@router.post("/shops/{shop_id}/subscription")
async def change_subscription(shop_id: int, body: ManualSubscriptionIn,
    admin: User = Depends(main_admin_user), session: AsyncSession = Depends(get_session)):
    shop = await session.get(Shop, shop_id)
    if not shop:
        raise HTTPException(404, "Магазин не найден")
    now = utcnow()
    if body.action == "extend":
        current = [d for d in (aware(shop.trial_ends_at), aware(shop.paid_until)) if d]
        shop.paid_until = max([now, *current]) + timedelta(days=body.days or 0)
        shop.reminder_key = None
    elif body.action == "set_expiry":
        expiry = body.expires_at
        if expiry is None:
            raise HTTPException(400, "Не указана дата окончания")
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        if expiry <= now:
            raise HTTPException(400, "Дата окончания должна быть в будущем")
        shop.paid_until = expiry
        shop.reminder_key = None
    elif body.action == "lifetime":
        shop.paid_until = datetime(9999, 12, 31, 23, 59, 59, tzinfo=timezone.utc)
        shop.reminder_key = None
    else:
        shop.paid_until = None
        shop.trial_ends_at = None
        shop.reminder_key = None
    row = SubscriptionAction(shop_id=shop.id, admin_user_id=admin.id, action=body.action,
        days=body.days if body.action == "extend" else None, expires_at=shop.paid_until,
        reason=body.reason.strip())
    session.add(row)
    await session.commit()
    await session.refresh(shop)
    owner = await session.get(User, shop.owner_id)
    if body.notify_owner and owner:
        state = shop_state(shop)
        if body.action == "revoke":
            message = f"Доступ к магазину «{html_escape(shop.slug)}» был изменён администратором. Свяжитесь с поддержкой."
        elif body.action == "lifetime":
            message = f"✅ Для магазина «{html_escape(shop.slug)}» активирован бессрочный доступ."
        else:
            message = f"✅ Подписка магазина «{html_escape(shop.slug)}» обновлена. Действует до {state['expires_at'][:10]}."
        if body.reason.strip():
            message += f"\nПричина: {html_escape(body.reason.strip())}"
        await notify(owner.telegram_id, message)
    return {"shop": shop_summary(shop), "subscription": history_out(row, admin)}

@router.get("/shops/{shop_id}/subscription/history")
async def subscription_history(shop_id: int, session: AsyncSession = Depends(get_session)):
    if not await session.get(Shop, shop_id):
        raise HTTPException(404, "Магазин не найден")
    rows = (await session.scalars(select(SubscriptionAction).where(
        SubscriptionAction.shop_id == shop_id).order_by(SubscriptionAction.id.desc()).limit(100))).all()
    ids = {r.admin_user_id for r in rows}
    admins = {u.id: u for u in (await session.scalars(select(User).where(User.id.in_(ids or {0})))).all()}
    return {"history": [history_out(r, admins.get(r.admin_user_id)) for r in rows]}
