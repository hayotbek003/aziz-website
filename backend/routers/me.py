"""Личный кабинет клиента. Каждый эндпоинт проверяет, что магазин принадлежит текущему пользователю."""
import copy
import json
import re
import uuid
from collections import Counter
from datetime import timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import get_session
from ..deps import category_in_shop, current_user, owned_category, owned_product, owned_shop
from ..models import Category, Event, Media, Payment, Product, Shop, User, utcnow
from ..security import create_preview_token, decrypt_secret, encrypt_secret, random_token
from ..services import (
    ShopError, category_out, count_products, create_shop, delete_shop, get_plans, iso, make_bot, notify_admins,
    product_out, shop_state, shop_summary, slug_problem, slug_taken, slugify, unique_slug,
)

router = APIRouter(prefix="/api/me", tags=["cabinet"])

MAX_CONFIG_BYTES = 256_000
MAX_UPLOAD = 3 * 1024 * 1024
ALLOWED_IMAGE = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"}


# ---------------- Магазины ----------------
@router.get("/shops")
async def my_shops(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    shops = (await session.scalars(select(Shop).where(Shop.owner_id == user.id).order_by(Shop.id.desc()))).all()
    await session.commit()
    return {"shops": [shop_summary(s) for s in shops], "trial_used": user.trial_used}


class CreateShopIn(BaseModel):
    template: str
    name: str
    slug: str | None = None
    seller: str | None = None


@router.post("/shops")
async def create_my_shop(body: CreateShopIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    try:
        shop = await create_shop(session, user, body.template, body.name, body.slug or None, body.seller or "")
    except ShopError as e:
        raise HTTPException(400, str(e))
    return {"shop": shop_summary(shop)}


@router.get("/slug-check")
async def slug_check(slug: str = "", name: str = "", shop_id: int | None = None,
                     user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    if not slug and name:
        return {"ok": True, "suggestion": await unique_slug(session, name)}
    slug = slug.strip().lower()
    if p := slug_problem(slug):
        return {"ok": False, "reason": p}
    if await slug_taken(session, slug, exclude_id=shop_id):
        return {"ok": False, "reason": "Этот адрес уже занят", "suggestion": await unique_slug(session, slug)}
    return {"ok": True}


@router.get("/shops/{shop_id}")
async def get_my_shop(shop_id: int, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    shop = await owned_shop(session, shop_id, user)
    cats = (await session.scalars(select(Category).where(Category.shop_id == shop.id).order_by(Category.sort, Category.id))).all()
    prods = (await session.scalars(select(Product).where(Product.shop_id == shop.id).order_by(Product.sort, Product.id))).all()
    return {
        "shop": shop_summary(shop),
        "draft": shop.draft_config,
        "published": shop.published_config,
        "categories": [category_out(c) for c in cats],
        "products": [product_out(p) for p in prods],
    }


def _validate_config(cfg: dict) -> dict:
    if not isinstance(cfg, dict) or not isinstance(cfg.get("theme"), dict):
        raise HTTPException(400, "Некорректная конфигурация")
    if len(json.dumps(cfg, ensure_ascii=False)) > MAX_CONFIG_BYTES:
        raise HTTPException(413, "Слишком большая конфигурация")
    cfg["name"] = str(cfg.get("name", ""))[:80] or "Мой магазин"
    tg = str((cfg.get("contacts") or {}).get("telegram", "")).strip()
    tg = re.sub(r"^(https?://)?t\.me/", "", tg).lstrip("@")
    cfg.setdefault("contacts", {})["telegram"] = tg
    if cfg.get("language") not in ("ru", "uz"):
        cfg["language"] = "ru"
    links = cfg.get("links")
    if isinstance(links, dict):  # свои ссылки на визитке: только http(s)/tg, не больше 12
        items = []
        for it in (links.get("items") or [])[:12]:
            if not isinstance(it, dict):
                continue
            url = str(it.get("url", "")).strip()[:500]
            if url and not re.match(r"^(https?://|tg://)", url, re.I):
                url = "https://" + url
            if url:
                items.append({"label": str(it.get("label", "")).strip()[:60] or url, "url": url})
        links["items"] = items
        links["title"] = str(links.get("title", ""))[:80]
        links["bio"] = str(links.get("bio", ""))[:300]
    elif links is not None:
        cfg.pop("links")
    return cfg


class ConfigIn(BaseModel):
    config: dict


class PublishIn(BaseModel):
    config: dict | None = None


@router.put("/shops/{shop_id}/draft")
async def save_draft(shop_id: int, body: ConfigIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    shop = await owned_shop(session, shop_id, user)
    shop.draft_config = _validate_config(copy.deepcopy(body.config))
    shop.has_unpublished = shop.draft_config != shop.published_config
    await session.commit()
    return {"ok": True, "shop": shop_summary(shop)}


@router.post("/shops/{shop_id}/publish")
async def publish(shop_id: int, body: PublishIn, user: User = Depends(current_user),
                  session: AsyncSession = Depends(get_session)):
    shop = await owned_shop(session, shop_id, user)
    if body.config:
        shop.draft_config = _validate_config(copy.deepcopy(body.config))
    shop.published_config = copy.deepcopy(shop.draft_config)
    shop.has_unpublished = False
    shop.published_at = utcnow()
    await session.commit()
    return {"ok": True, "shop": shop_summary(shop)}


@router.post("/shops/{shop_id}/discard")
async def discard(shop_id: int, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    shop = await owned_shop(session, shop_id, user)
    if shop.published_config:
        shop.draft_config = copy.deepcopy(shop.published_config)
    shop.has_unpublished = False
    await session.commit()
    return {"ok": True, "draft": shop.draft_config, "shop": shop_summary(shop)}


@router.post("/shops/{shop_id}/preview-token")
async def preview_token(shop_id: int, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    shop = await owned_shop(session, shop_id, user)
    token = create_preview_token(shop.id)
    return {"token": token, "url": f"{settings.shop_url(shop.slug)}?preview={token}"}


INFO_KEYS = {"name", "tagline", "description", "language", "currency", "contacts", "social", "links"}


class InfoIn(BaseModel):
    info: dict
    slug: str | None = None


@router.patch("/shops/{shop_id}/info")
async def update_info(shop_id: int, body: InfoIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    """Настройки магазина применяются сразу (и в черновик, и в опубликованную версию)."""
    shop = await owned_shop(session, shop_id, user)
    if body.slug is not None and body.slug != shop.slug:
        slug = body.slug.strip().lower()
        if p := slug_problem(slug):
            raise HTTPException(400, p)
        if await slug_taken(session, slug, exclude_id=shop.id):
            raise HTTPException(400, "Этот адрес уже занят")
        shop.slug = slug
    patch = {k: v for k, v in body.info.items() if k in INFO_KEYS}
    for attr in ("draft_config", "published_config"):
        cfg = copy.deepcopy(getattr(shop, attr) or shop.draft_config)
        for k, v in patch.items():
            if isinstance(v, dict) and isinstance(cfg.get(k), dict):
                cfg[k] = {**cfg[k], **v}
            else:
                cfg[k] = v
        setattr(shop, attr, _validate_config(cfg))
    await session.commit()
    return {"ok": True, "shop": shop_summary(shop), "draft": shop.draft_config}


@router.delete("/shops/{shop_id}")
async def remove_shop(shop_id: int, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    shop = await owned_shop(session, shop_id, user)
    await delete_shop(session, shop)
    return {"ok": True}


# ---------------- Telegram-бот продавца ----------------
class BotIn(BaseModel):
    token: str


@router.post("/shops/{shop_id}/bot")
async def connect_bot(shop_id: int, body: BotIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    shop = await owned_shop(session, shop_id, user)
    token = body.token.strip()
    if not re.match(r"^\d{5,}:[A-Za-z0-9_-]{30,}$", token):
        raise HTTPException(400, "Неверный формат токена. Получите токен у @BotFather.")
    from aiogram.types import MenuButtonWebApp, WebAppInfo

    bot = make_bot(token)
    try:
        me = await bot.get_me()
        secret = random_token(24).replace("-", "a").replace("_", "b")[:48]
        if settings.is_https:
            await bot.set_webhook(f"{settings.webapp_url}/api/bot/seller/{shop.id}", secret_token=secret,
                                  allowed_updates=["message"], drop_pending_updates=True)
            await bot.set_chat_menu_button(menu_button=MenuButtonWebApp(
                text="Магазин", web_app=WebAppInfo(url=settings.shop_url(shop.slug))))
    except Exception as e:
        raise HTTPException(400, f"Telegram отклонил токен: {e}")
    finally:
        await bot.session.close()
    shop.bot_token_enc = encrypt_secret(token)  # храним только в зашифрованном виде
    shop.bot_username = me.username
    shop.bot_secret = secret
    await session.commit()
    return {"ok": True, "bot_username": me.username, "webhook": settings.is_https}


@router.delete("/shops/{shop_id}/bot")
async def disconnect_bot(shop_id: int, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    shop = await owned_shop(session, shop_id, user)
    token = decrypt_secret(shop.bot_token_enc) if shop.bot_token_enc else None
    if token:
        bot = make_bot(token)
        try:
            await bot.delete_webhook()
        except Exception:
            pass
        finally:
            await bot.session.close()
    shop.bot_token_enc = shop.bot_username = shop.bot_secret = None
    await session.commit()
    return {"ok": True}


# ---------------- Категории ----------------
class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    icon: str = "Tag"
    image: str | None = None
    description: str = ""


@router.post("/shops/{shop_id}/categories")
async def add_category(shop_id: int, body: CategoryIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    shop = await owned_shop(session, shop_id, user)
    n = await session.scalar(select(func.count(Category.id)).where(Category.shop_id == shop.id)) or 0
    if n >= 100:
        raise HTTPException(400, "Максимум 100 категорий")
    c = Category(shop_id=shop.id, name=body.name.strip(), slug=await _cat_slug(session, shop.id, body.name),
                 icon=body.icon[:40], image=body.image, description=body.description, sort=n)
    session.add(c)
    await session.commit()
    return {"category": category_out(c)}


async def _cat_slug(session: AsyncSession, shop_id: int, name: str, exclude: int | None = None) -> str:
    base = slugify(name) or "cat"
    slug, i = base, 1
    while True:
        q = select(Category.id).where(Category.shop_id == shop_id, Category.slug == slug)
        if exclude:
            q = q.where(Category.id != exclude)
        if not await session.scalar(q):
            return slug
        i += 1
        slug = f"{base}-{i}"


@router.put("/categories/{category_id}")
async def edit_category(category_id: int, body: CategoryIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    c, shop = await owned_category(session, category_id, user)
    if c.name != body.name.strip():
        c.slug = await _cat_slug(session, shop.id, body.name, exclude=c.id)
    c.name, c.icon, c.image, c.description = body.name.strip(), body.icon[:40], body.image, body.description
    await session.commit()
    return {"category": category_out(c)}


@router.delete("/categories/{category_id}")
async def remove_category(category_id: int, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    c, _ = await owned_category(session, category_id, user)
    prods = (await session.scalars(select(Product).where(Product.category_id == c.id))).all()
    for p in prods:
        p.category_id = None
    await session.delete(c)
    await session.commit()
    return {"ok": True}


class ReorderIn(BaseModel):
    ids: list[int]


@router.post("/shops/{shop_id}/categories/reorder")
async def reorder_categories(shop_id: int, body: ReorderIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    shop = await owned_shop(session, shop_id, user)
    cats = {c.id: c for c in (await session.scalars(select(Category).where(Category.shop_id == shop.id))).all()}
    for i, cid in enumerate(body.ids):
        if cid in cats:
            cats[cid].sort = i
    await session.commit()
    return {"ok": True}


# ---------------- Товары ----------------
class SpecIn(BaseModel):
    k: str = Field(max_length=80)
    v: str = Field(max_length=300)


class ProductIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    categoryId: int | None = None
    price: int = Field(ge=0, le=10**13)
    oldPrice: int | None = Field(default=None, ge=0, le=10**13)
    priceFrom: bool = False
    description: str = Field(default="", max_length=5000)
    specs: list[SpecIn] = Field(default_factory=list, max_length=40)
    images: list[str] = Field(default_factory=list, max_length=12)
    icon: str = "Package"
    isPopular: bool = False
    inStock: bool = True
    stockQty: int | None = None


def _apply_product(p: Product, b: ProductIn, cat_id: int | None) -> None:
    p.name = b.name.strip()
    p.category_id = cat_id
    p.price, p.old_price, p.price_from = b.price, b.oldPrice or None, b.priceFrom
    p.description = b.description
    p.specs = [{"k": s.k, "v": s.v} for s in b.specs if s.k.strip() or s.v.strip()]
    p.images = [i[:600] for i in b.images]
    p.icon = b.icon[:40]
    p.is_popular, p.in_stock, p.stock_qty = b.isPopular, b.inStock, b.stockQty


@router.post("/shops/{shop_id}/products")
async def add_product(shop_id: int, body: ProductIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    shop = await owned_shop(session, shop_id, user)
    n = await count_products(session, shop.id)
    if n >= 2000:
        raise HTTPException(400, "Максимум 2000 товаров")
    p = Product(shop_id=shop.id, sort=n)
    _apply_product(p, body, await category_in_shop(session, body.categoryId, shop.id))
    session.add(p)
    await session.commit()
    return {"product": product_out(p)}


@router.put("/products/{product_id}")
async def edit_product(product_id: int, body: ProductIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    p, shop = await owned_product(session, product_id, user)
    _apply_product(p, body, await category_in_shop(session, body.categoryId, shop.id))
    await session.commit()
    return {"product": product_out(p)}


class ProductPatch(BaseModel):
    isPopular: bool | None = None
    inStock: bool | None = None


@router.patch("/products/{product_id}")
async def patch_product(product_id: int, body: ProductPatch, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    p, _ = await owned_product(session, product_id, user)
    if body.isPopular is not None:
        p.is_popular = body.isPopular
    if body.inStock is not None:
        p.in_stock = body.inStock
    await session.commit()
    return {"product": product_out(p)}


@router.delete("/products/{product_id}")
async def remove_product(product_id: int, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    p, _ = await owned_product(session, product_id, user)
    await session.delete(p)
    await session.commit()
    return {"ok": True}


@router.post("/shops/{shop_id}/products/reorder")
async def reorder_products(shop_id: int, body: ReorderIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    shop = await owned_shop(session, shop_id, user)
    prods = {p.id: p for p in (await session.scalars(select(Product).where(Product.shop_id == shop.id))).all()}
    for i, pid in enumerate(body.ids):
        if pid in prods:
            prods[pid].sort = i
    await session.commit()
    return {"ok": True}


# ---------------- Медиа ----------------
@router.post("/media")
async def upload_media(file: UploadFile = File(...), shop_id: int | None = Form(default=None),
                       user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    if shop_id:
        await owned_shop(session, shop_id, user)
    ctype = (file.content_type or "").lower()
    if ctype not in ALLOWED_IMAGE:
        raise HTTPException(400, "Разрешены только изображения (JPG, PNG, WEBP, GIF, SVG)")
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "Файл больше 3 МБ")
    if ctype == "image/svg+xml" and (b"<script" in data.lower() or b"javascript:" in data.lower()):
        raise HTTPException(400, "SVG со скриптами запрещены")
    m = Media(id=uuid.uuid4().hex, owner_id=user.id, shop_id=shop_id, content_type=ctype, data=data, size=len(data))
    session.add(m)
    await session.commit()
    return {"id": m.id, "url": f"/api/media/{m.id}"}


# ---------------- Статистика ----------------
@router.get("/shops/{shop_id}/stats")
async def stats(shop_id: int, days: int = 14, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    shop = await owned_shop(session, shop_id, user)
    days = max(1, min(days, 90))
    now = utcnow()
    since = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = (await session.execute(
        select(Event.type, Event.product_id, Event.created_at).where(Event.shop_id == shop.id, Event.created_at >= since)
    )).all()
    series = {(since + timedelta(days=i)).date().isoformat(): {"view": 0, "product_view": 0, "order_click": 0} for i in range(days)}
    top_views, top_orders = Counter(), Counter()
    for t, pid, created in rows:
        d = created.date().isoformat()
        if d in series and t in series[d]:
            series[d][t] += 1
        if pid and t == "product_view":
            top_views[pid] += 1
        if pid and t == "order_click":
            top_orders[pid] += 1
    names = {p.id: p.name for p in (await session.scalars(select(Product).where(Product.shop_id == shop.id))).all()}
    totals = {k: sum(v[k] for v in series.values()) for k in ("view", "product_view", "order_click")}
    return {
        "days": [{"date": d, **v} for d, v in series.items()],
        "totals": totals,
        "all_time_views": shop.views,
        "products": len(names),
        "top_viewed": [{"id": pid, "name": names.get(pid, "—"), "count": c} for pid, c in top_views.most_common(5)],
        "top_ordered": [{"id": pid, "name": names.get(pid, "—"), "count": c} for pid, c in top_orders.most_common(5)],
    }


# ---------------- Аренда и оплата ----------------
def payment_out(p: Payment) -> dict:
    return {"id": p.id, "shop_id": p.shop_id, "months": p.months, "amount": p.amount, "currency": p.currency,
            "method": p.method, "status": p.status, "note": p.note, "created_at": iso(p.created_at), "paid_at": iso(p.paid_at)}


@router.get("/shops/{shop_id}/billing")
async def billing(shop_id: int, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    shop = await owned_shop(session, shop_id, user)
    pays = (await session.scalars(select(Payment).where(Payment.shop_id == shop.id).order_by(Payment.id.desc()).limit(50))).all()
    return {
        "status": shop_state(shop),
        "trial_ends_at": iso(shop.trial_ends_at),
        "paid_until": iso(shop.paid_until),
        "plans": await get_plans(session),
        "payments": [payment_out(p) for p in pays],
        "manual_info": settings.manual_payment_info,
        "stars_available": bool(settings.bot_token),
    }


class PlanIn(BaseModel):
    months: int
    note: str = ""


async def _plan(session: AsyncSession, months: int) -> dict:
    plan = next((p for p in await get_plans(session) if int(p["months"]) == months), None)
    if not plan:
        raise HTTPException(400, "Тариф не найден")
    return plan


@router.post("/shops/{shop_id}/billing/stars")
async def pay_stars(shop_id: int, body: PlanIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    shop = await owned_shop(session, shop_id, user)
    if shop.is_blocked:
        raise HTTPException(403, "Магазин заблокирован администратором")
    plan = await _plan(session, body.months)
    if not settings.bot_token:
        raise HTTPException(503, "Оплата Stars недоступна: бот не настроен")
    pay = Payment(shop_id=shop.id, user_id=user.id, months=plan["months"], amount=int(plan["stars"]), currency="XTR", method="stars")
    session.add(pay)
    await session.commit()
    from aiogram.types import LabeledPrice

    bot = make_bot()
    try:
        name = (shop.published_config or {}).get("name", shop.slug)
        link = await bot.create_invoice_link(
            title=f"Аренда магазина — {plan['label']}",
            description=f"Продление магазина «{name}» на {plan['label']}",
            payload=f"renew:{pay.id}",
            currency="XTR",
            prices=[LabeledPrice(label=plan["label"], amount=int(plan["stars"]))],
        )
    finally:
        await bot.session.close()
    return {"invoice_link": link, "payment_id": pay.id}


@router.post("/shops/{shop_id}/billing/manual")
async def pay_manual(shop_id: int, body: PlanIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    shop = await owned_shop(session, shop_id, user)
    plan = await _plan(session, body.months)
    pending = await session.scalar(select(func.count(Payment.id)).where(Payment.shop_id == shop.id, Payment.status == "pending", Payment.method == "manual"))
    if pending and pending >= 3:
        raise HTTPException(400, "У вас уже есть заявки на проверке")
    pay = Payment(shop_id=shop.id, user_id=user.id, months=plan["months"], amount=int(plan["price_uzs"]), currency="UZS",
                  method="manual", note=body.note[:500])
    session.add(pay)
    await session.commit()
    await notify_admins(f"💳 Новая заявка на оплату #{pay.id}\nМагазин: {shop.slug}\nТариф: {plan['label']} — {plan['price_uzs']} сум\nКомментарий: {body.note[:200]}")
    return {"payment": payment_out(pay)}
