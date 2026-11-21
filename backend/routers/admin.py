"""Админ-панель владельца платформы."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import get_session
from ..deps import admin_user
from ..models import Payment, Product, Shop, TemplateSetting, User, utcnow
from ..services import (
    extend_shop, get_plans, html_escape, list_templates, mark_payment_paid, notify, set_plans, shop_state,
    shop_summary, user_out,
)
from .me import payment_out

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(admin_user)])


@router.get("/overview")
async def overview(session: AsyncSession = Depends(get_session)):
    shops = (await session.scalars(select(Shop))).all()
    states: dict[str, int] = {}
    for s in shops:
        st = shop_state(s)["state"]
        states[st] = states.get(st, 0) + 1
    users = await session.scalar(select(func.count(User.id))) or 0
    products = await session.scalar(select(func.count(Product.id))) or 0
    paid = (await session.execute(
        select(Payment.currency, func.sum(Payment.amount)).where(Payment.status == "paid").group_by(Payment.currency)
    )).all()
    pending = await session.scalar(select(func.count(Payment.id)).where(Payment.status == "pending", Payment.method == "manual")) or 0
    by_tpl: dict[str, int] = {}
    for s in shops:
        by_tpl[s.template] = by_tpl.get(s.template, 0) + 1
    return {
        "users": users,
        "shops": len(shops),
        "products": products,
        "states": states,
        "revenue": {cur: int(total or 0) for cur, total in paid},
        "pending_payments": pending,
        "by_template": by_tpl,
    }


@router.get("/users")
async def users(q: str = "", session: AsyncSession = Depends(get_session)):
    query = select(User).order_by(User.id.desc()).limit(300)
    if q:
        like = f"%{q.lstrip('@')}%"
        conds = [User.username.ilike(like), User.first_name.ilike(like)]
        if q.isdigit():
            conds.append(User.telegram_id == int(q))
        query = query.where(or_(*conds))
    rows = (await session.scalars(query)).all()
    counts = dict((await session.execute(select(Shop.owner_id, func.count(Shop.id)).group_by(Shop.owner_id))).all())
    return {"users": [{**user_out(u), "shops": counts.get(u.id, 0), "last_seen_at": u.last_seen_at and u.last_seen_at.isoformat()} for u in rows]}


class BlockIn(BaseModel):
    blocked: bool
    reason: str | None = None


@router.post("/users/{user_id}/block")
async def block_user(user_id: int, body: BlockIn, session: AsyncSession = Depends(get_session)):
    u = await session.get(User, user_id)
    if not u:
        raise HTTPException(404, "Пользователь не найден")
    if u.telegram_id in settings.admin_ids:
        raise HTTPException(400, "Нельзя заблокировать администратора")
    u.is_blocked = body.blocked
    await session.commit()
    return {"user": user_out(u)}


@router.get("/shops")
async def shops(q: str = "", status: str = "", session: AsyncSession = Depends(get_session)):
    # Search in the database BEFORE applying the result limit. Otherwise a user's
    # shop can be counted in /users but remain invisible here when it is older
    # than the newest 500 shops.
    query = select(Shop, User).join(User, User.id == Shop.owner_id)
    search = q.strip().lstrip("@")
    if search:
        like = f"%{search}%"
        config_name = func.coalesce(
            Shop.published_config["name"].as_string(),
            Shop.draft_config["name"].as_string(),
            Shop.slug,
        )
        query = query.where(or_(
            Shop.slug.ilike(like),
            User.username.ilike(like),
            User.first_name.ilike(like),
            config_name.ilike(like),
        ))
    query = query.order_by(Shop.id.desc()).limit(500)
    rows = (await session.execute(query)).all()

    out = []
    for shop, owner in rows:
        item = shop_summary(shop, owner)
        if status and item["status"]["state"] != status:
            continue
        out.append(item)
    return {"shops": out}


@router.post("/shops/{shop_id}/block")
async def block_shop(shop_id: int, body: BlockIn, session: AsyncSession = Depends(get_session)):
    s = await session.get(Shop, shop_id)
    if not s:
        raise HTTPException(404, "Магазин не найден")
    s.is_blocked = body.blocked
    s.block_reason = (body.reason or None) if body.blocked else None
    await session.commit()
    owner = await session.get(User, s.owner_id)
    if owner:
        msg = (f"⛔ Ваш магазин «{html_escape(s.slug)}» заблокирован администратором." + (f"\nПричина: {html_escape(body.reason)}" if body.reason else "")) \
            if body.blocked else f"✅ Ваш магазин «{html_escape(s.slug)}» снова активен."
        await notify(owner.telegram_id, msg)
    return {"shop": shop_summary(s)}


class ExtendIn(BaseModel):
    days: int


@router.post("/shops/{shop_id}/extend")
async def extend(shop_id: int, body: ExtendIn, session: AsyncSession = Depends(get_session)):
    s = await session.get(Shop, shop_id)
    if not s:
        raise HTTPException(404, "Магазин не найден")
    if body.days == 0 or abs(body.days) > 3650:
        raise HTTPException(400, "Некорректное количество дней")
    if body.days > 0:
        extend_shop(s, days=body.days)
    else:
        # Сократить срок (например, для отмены ошибочного продления)
        from datetime import timedelta
        if s.paid_until:
            s.paid_until = s.paid_until + timedelta(days=body.days)
        elif s.trial_ends_at:
            s.trial_ends_at = s.trial_ends_at + timedelta(days=body.days)
    await session.commit()
    return {"shop": shop_summary(s)}


@router.get("/payments")
async def payments(status: str = "", session: AsyncSession = Depends(get_session)):
    q = select(Payment).order_by(Payment.id.desc()).limit(500)
    if status:
        q = q.where(Payment.status == status)
    rows = (await session.scalars(q)).all()
    shops = {s.id: s for s in (await session.scalars(select(Shop).where(Shop.id.in_({p.shop_id for p in rows} or {0})))).all()}
    users = {u.id: u for u in (await session.scalars(select(User).where(User.id.in_({p.user_id for p in rows} or {0})))).all()}
    return {"payments": [{
        **payment_out(p),
        "shop_slug": shops[p.shop_id].slug if p.shop_id in shops else None,
        "user": (users[p.user_id].username or users[p.user_id].first_name) if p.user_id in users else None,
    } for p in rows]}


@router.post("/payments/{payment_id}/confirm")
async def confirm_payment(payment_id: int, session: AsyncSession = Depends(get_session)):
    p = await session.get(Payment, payment_id)
    if not p or p.status != "pending":
        raise HTTPException(400, "Платёж не найден или уже обработан")
    shop = await mark_payment_paid(session, p, external_id="manual")
    user = await session.get(User, p.user_id)
    if user and shop:
        st = shop_state(shop)
        await notify(user.telegram_id, f"✅ Оплата подтверждена! Магазин «{html_escape(shop.slug)}» активен до {st['expires_at'][:10]}.")
    return {"payment": payment_out(p)}


@router.post("/payments/{payment_id}/reject")
async def reject_payment(payment_id: int, session: AsyncSession = Depends(get_session)):
    p = await session.get(Payment, payment_id)
    if not p or p.status != "pending":
        raise HTTPException(400, "Платёж не найден или уже обработан")
    p.status = "rejected"
    await session.commit()
    user = await session.get(User, p.user_id)
    if user:
        await notify(user.telegram_id, f"❌ Заявка на оплату #{p.id} отклонена. Свяжитесь с поддержкой.")
    return {"payment": payment_out(p)}


@router.get("/templates")
async def templates(session: AsyncSession = Depends(get_session)):
    tpls = await list_templates(session, include_inactive=True)
    counts = dict((await session.execute(select(Shop.template, func.count(Shop.id)).group_by(Shop.template))).all())
    return {"templates": [{**t, "shops": counts.get(t["key"], 0)} for t in tpls]}


class TemplateIn(BaseModel):
    is_active: bool
    sort: int
    name: str | None = None
    description: str | None = None


@router.put("/templates/{key}")
async def update_template(key: str, body: TemplateIn, session: AsyncSession = Depends(get_session)):
    ts = await session.get(TemplateSetting, key)
    if not ts:
        ts = TemplateSetting(key=key)
        session.add(ts)
    ts.is_active, ts.sort = body.is_active, body.sort
    ts.name = (body.name or "").strip() or None
    ts.description = (body.description or "").strip() or None
    await session.commit()
    return {"ok": True}


@router.get("/plans")
async def plans(session: AsyncSession = Depends(get_session)):
    return {"plans": await get_plans(session)}


class PlanItem(BaseModel):
    months: int
    price_uzs: int
    stars: int
    label: str


class PlansIn(BaseModel):
    plans: list[PlanItem]


@router.put("/plans")
async def update_plans(body: PlansIn, session: AsyncSession = Depends(get_session)):
    if not body.plans:
        raise HTTPException(400, "Нужен хотя бы один тариф")
    await set_plans(session, [p.model_dump() for p in body.plans])
    return {"plans": await get_plans(session)}


@router.post("/bot/setup")
async def bot_setup():
    """Регистрирует webhook платформенного бота, команды и кнопку меню."""
    from ..bot.setup import setup_bot

    return await setup_bot()


@router.get("/now")
async def now():
    return {"now": utcnow().isoformat()}
