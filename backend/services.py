"""Бизнес-логика платформы: шаблоны, создание магазинов, сроки аренды, уведомления."""
import copy
import json
import logging
import math
import re
from datetime import datetime, timedelta, timezone
from functools import lru_cache

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import ROOT, settings
from .models import AppSetting, Category, Event, Media, Payment, Product, Shop, TemplateSetting, User, utcnow

log = logging.getLogger("aziz")


# ---------------- Время ----------------
def aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def iso(dt: datetime | None) -> str | None:
    dt = aware(dt)
    return dt.isoformat() if dt else None


# ---------------- Шаблоны ----------------
@lru_cache
def template_data() -> dict:
    with open(ROOT / "shared" / "templates.json", encoding="utf-8") as f:
        return json.load(f)


def deep_merge(base: dict, override: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in (override or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def get_template(key: str) -> dict | None:
    return next((t for t in template_data()["templates"] if t["key"] == key), None)


async def list_templates(session: AsyncSession, include_inactive: bool = False) -> list[dict]:
    rows = {r.key: r for r in (await session.scalars(select(TemplateSetting))).all()}
    out = []
    for i, t in enumerate(template_data()["templates"]):
        s = rows.get(t["key"])
        item = {
            "key": t["key"],
            "name": (s.name if s and s.name else t["name"]),
            "emoji": t["emoji"],
            "icon": t["icon"],
            "short": t["short"],
            "description": (s.description if s and s.description else t["description"]),
            "is_active": s.is_active if s else True,
            "sort": s.sort if s else i,
            "primary": t["config"]["theme"]["primary"],
            "primary2": t["config"]["theme"]["primary2"],
        }
        if include_inactive or item["is_active"]:
            out.append(item)
    out.sort(key=lambda x: x["sort"])
    return out


def build_config(template_key: str, name: str, seller: str = "") -> dict:
    data = template_data()
    tpl = get_template(template_key)
    cfg = deep_merge(data["base"], tpl["config"] if tpl else {})
    cfg["name"] = name
    cfg["contacts"]["telegram"] = seller.lstrip("@") if seller else ""
    return cfg


# ---------------- Слаги ----------------
_TR = dict(zip("абвгдеёжзийклмнопрстуфхцчшщъыьэюяў", [
    "a", "b", "v", "g", "d", "e", "yo", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p", "r", "s", "t", "u",
    "f", "h", "ts", "ch", "sh", "sch", "", "y", "", "e", "yu", "ya", "o",
]))
_TR.update({"қ": "q", "ғ": "g", "ҳ": "h"})
SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$")
RESERVED = {"admin", "api", "panel", "shop", "demo", "login", "app", "static", "aziz", "new", "www", "help", "support"}


def slugify(text: str) -> str:
    s = "".join(_TR.get(ch, ch) for ch in (text or "").lower())
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:36].strip("-")


def slug_problem(slug: str) -> str | None:
    if not SLUG_RE.match(slug or ""):
        return "Ссылка: 3–40 символов, латиница, цифры и дефис"
    if slug in RESERVED:
        return "Этот адрес зарезервирован"
    return None


async def slug_taken(session: AsyncSession, slug: str, exclude_id: int | None = None) -> bool:
    q = select(Shop.id).where(Shop.slug == slug)
    if exclude_id:
        q = q.where(Shop.id != exclude_id)
    return (await session.scalar(q)) is not None


async def unique_slug(session: AsyncSession, base: str) -> str:
    base = slugify(base) or "shop"
    if len(base) < 3:
        base = f"shop-{base}".strip("-")
    candidate, n = base, 1
    while slug_problem(candidate) or await slug_taken(session, candidate):
        n += 1
        candidate = f"{base[:32]}-{n}"
    return candidate


# ---------------- Статус аренды (контролируется сервером) ----------------
def shop_state(shop: Shop, now: datetime | None = None) -> dict:
    now = now or utcnow()
    trial, paid = aware(shop.trial_ends_at), aware(shop.paid_until)
    candidates = [d for d in (trial, paid) if d]
    expires = max(candidates) if candidates else None
    if shop.is_blocked:
        state = "blocked"
    elif paid and paid > now:
        state = "active"
    elif trial and trial > now:
        state = "trial"
    elif not candidates:
        state = "unpaid"
    else:
        state = "expired"
    days_left = math.ceil((expires - now).total_seconds() / 86400) if expires and expires > now else 0
    return {"state": state, "expires_at": iso(expires), "days_left": days_left, "is_live": state in ("trial", "active")}


STATE_LABELS = {
    "trial": "Пробный период",
    "active": "Оплачен",
    "expired": "Срок истёк",
    "unpaid": "Ожидает оплаты",
    "blocked": "Заблокирован",
}


def extend_shop(shop: Shop, months: int = 0, days: int = 0) -> None:
    now = utcnow()
    current = [d for d in (aware(shop.trial_ends_at), aware(shop.paid_until)) if d]
    base = max([now, *current])
    shop.paid_until = base + timedelta(days=30 * months + days)
    shop.reminder_key = None


# ---------------- Создание магазина ----------------
class ShopError(Exception):
    pass


async def create_shop(
    session: AsyncSession, user: User, template_key: str, name: str, slug: str | None = None, seller: str = ""
) -> Shop:
    tpl = get_template(template_key)
    if not tpl:
        raise ShopError("Шаблон не найден")
    ts = await session.get(TemplateSetting, template_key)
    if ts and not ts.is_active:
        raise ShopError("Шаблон временно недоступен")
    name = (name or "").strip()[:80]
    if len(name) < 2:
        raise ShopError("Введите название магазина")
    if slug:
        slug = slug.strip().lower()
        if p := slug_problem(slug):
            raise ShopError(p)
        if await slug_taken(session, slug):
            raise ShopError("Этот адрес уже занят")
    else:
        slug = await unique_slug(session, name)

    seller = (seller or user.username or "").strip().lstrip("@")
    seller = re.sub(r"^(https?://)?t\.me/", "", seller)
    cfg = build_config(template_key, name, seller)
    now = utcnow()
    shop = Shop(
        owner_id=user.id,
        slug=slug,
        template=template_key,
        draft_config=cfg,
        published_config=copy.deepcopy(cfg),  # магазин публикуется автоматически
        published_at=now,
        has_unpublished=False,
    )
    # Первый магазин — 7 дней бесплатно; дальше — платная аренда
    if not user.trial_used:
        shop.trial_ends_at = now + timedelta(days=settings.trial_days)
        user.trial_used = True
    session.add(shop)
    await session.flush()

    cats: list[Category] = []
    for i, c in enumerate(tpl["categories"]):
        cat = Category(shop_id=shop.id, name=c["name"], slug=slugify(c["name"]) or f"cat-{i}", icon=c["icon"], sort=i)
        session.add(cat)
        cats.append(cat)
    await session.flush()
    for i, p in enumerate(tpl["products"]):
        session.add(Product(
            shop_id=shop.id,
            category_id=cats[p["cat"]].id if p.get("cat") is not None and p["cat"] < len(cats) else None,
            name=p["name"],
            price=p["price"],
            old_price=p.get("oldPrice"),
            price_from=bool(p.get("from")),
            description=p.get("desc", ""),
            specs=[{"k": k, "v": v} for k, v in p.get("specs", [])],
            images=[],
            icon=p.get("icon", "Package"),
            is_popular=bool(p.get("popular")),
            in_stock=True,
            sort=i,
            created_at=now - timedelta(minutes=len(tpl["products"]) - i),
        ))
    await session.commit()
    await session.refresh(shop)
    return shop


async def delete_shop(session: AsyncSession, shop: Shop) -> None:
    sid = shop.id
    await session.execute(delete(Product).where(Product.shop_id == sid))
    await session.execute(delete(Category).where(Category.shop_id == sid))
    await session.execute(delete(Event).where(Event.shop_id == sid))
    await session.execute(delete(Media).where(Media.shop_id == sid))
    await session.delete(shop)
    await session.commit()


# ---------------- Тарифы ----------------
async def get_plans(session: AsyncSession) -> list[dict]:
    row = await session.get(AppSetting, "plans")
    return row.value if row and isinstance(row.value, list) and row.value else template_data()["plans"]


async def set_plans(session: AsyncSession, plans: list[dict]) -> None:
    row = await session.get(AppSetting, "plans")
    if row:
        row.value = plans
    else:
        session.add(AppSetting(key="plans", value=plans))
    await session.commit()


async def mark_payment_paid(session: AsyncSession, payment: Payment, external_id: str | None = None) -> Shop | None:
    if payment.status == "paid":
        return await session.get(Shop, payment.shop_id)
    shop = await session.get(Shop, payment.shop_id)
    if not shop:
        return None
    payment.status = "paid"
    payment.paid_at = utcnow()
    if external_id:
        payment.external_id = external_id
    extend_shop(shop, months=payment.months)
    await session.commit()
    return shop


# ---------------- Сериализация ----------------
def user_out(u: User) -> dict:
    return {
        "id": u.id,
        "telegram_id": u.telegram_id,
        "username": u.username,
        "first_name": u.first_name,
        "last_name": u.last_name,
        "photo_url": u.photo_url,
        "is_admin": bool(u.is_admin or u.telegram_id in settings.admin_ids),
        "is_blocked": u.is_blocked,
        "trial_used": u.trial_used,
        "created_at": iso(u.created_at),
    }


def category_out(c: Category) -> dict:
    return {"id": c.id, "name": c.name, "slug": c.slug, "icon": c.icon, "image": c.image,
            "description": c.description or "", "sort": c.sort}


def product_out(p: Product) -> dict:
    return {
        "id": p.id, "categoryId": p.category_id, "name": p.name, "price": p.price, "oldPrice": p.old_price,
        "priceFrom": p.price_from, "description": p.description or "", "specs": p.specs or [],
        "images": p.images or [], "icon": p.icon or "Package", "isPopular": p.is_popular,
        "inStock": p.in_stock, "stockQty": p.stock_qty, "sort": p.sort, "createdAt": iso(p.created_at),
    }


def shop_summary(shop: Shop, owner: User | None = None) -> dict:
    cfg = shop.published_config or shop.draft_config or {}
    st = shop_state(shop)
    out = {
        "id": shop.id,
        "slug": shop.slug,
        "name": cfg.get("name") or shop.slug,
        "template": shop.template,
        "url": settings.shop_url(shop.slug),
        "logo": cfg.get("logo"),
        "primary": (cfg.get("theme") or {}).get("primary"),
        "status": st,
        "is_blocked": shop.is_blocked,
        "block_reason": shop.block_reason,
        "trial_ends_at": iso(shop.trial_ends_at),
        "paid_until": iso(shop.paid_until),
        "has_unpublished": shop.has_unpublished,
        "published_at": iso(shop.published_at),
        "created_at": iso(shop.created_at),
        "views": shop.views,
        "bot_username": shop.bot_username,
    }
    if owner:
        out["owner"] = {"id": owner.id, "telegram_id": owner.telegram_id, "username": owner.username,
                        "first_name": owner.first_name}
    return out


async def count_products(session: AsyncSession, shop_id: int) -> int:
    return await session.scalar(select(func.count(Product.id)).where(Product.shop_id == shop_id)) or 0


# ---------------- Telegram-уведомления ----------------
def make_bot(token: str | None = None):
    from aiogram import Bot
    from aiogram.client.default import DefaultBotProperties

    return Bot(token or settings.bot_token, default=DefaultBotProperties(parse_mode="HTML"))


async def notify(telegram_id: int, text: str, reply_markup=None) -> bool:
    if not settings.bot_token:
        log.info("notify(%s): %s", telegram_id, text)
        return False
    bot = make_bot()
    try:
        await bot.send_message(telegram_id, text, reply_markup=reply_markup, disable_web_page_preview=True)
        return True
    except Exception as e:  # пользователь мог не запускать бота
        log.warning("notify failed: %s", e)
        return False
    finally:
        await bot.session.close()


async def notify_admins(text: str) -> None:
    for tid in settings.admin_ids:
        await notify(tid, text)


_bot_username_cache: dict[str, str] = {}


async def platform_bot_username() -> str:
    if settings.bot_username:
        return settings.bot_username
    if "u" in _bot_username_cache:
        return _bot_username_cache["u"]
    if not settings.bot_token:
        return ""
    bot = make_bot()
    try:
        me = await bot.get_me()
        _bot_username_cache["u"] = me.username or ""
    except Exception:
        return ""
    finally:
        await bot.session.close()
    return _bot_username_cache["u"]


def html_escape(s: str) -> str:
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
