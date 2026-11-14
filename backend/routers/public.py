import jwt
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import get_session
from ..models import Category, Event, Media, Product, Shop, User
from ..security import decode_token
from ..services import (
    STATE_LABELS, category_out, html_escape, list_templates, notify, platform_bot_username, product_out, shop_state,
)

router = APIRouter(prefix="/api", tags=["public"])


@router.get("/health")
async def health():
    return {"ok": True}


@router.get("/public/config")
async def public_config():
    return {
        "bot_username": await platform_bot_username(),
        "dev_mode": settings.dev_mode,
        "trial_days": settings.trial_days,
        "webapp_url": settings.webapp_url,
    }


@router.get("/public/templates")
async def public_templates(session: AsyncSession = Depends(get_session)):
    return {"templates": await list_templates(session)}


async def _find_shop(session: AsyncSession, slug: str) -> Shop:
    shop = await session.scalar(select(Shop).where(Shop.slug == slug.lower()))
    if not shop and slug.isdigit():
        shop = await session.get(Shop, int(slug))
    if not shop:
        raise HTTPException(404, "Магазин не найден")
    return shop


@router.get("/public/shops/{slug}")
async def public_shop(slug: str, preview: str | None = None, session: AsyncSession = Depends(get_session)):
    shop = await _find_shop(session, slug)
    is_preview = False
    if preview:
        try:
            is_preview = decode_token(preview, "preview").get("shop") == shop.id
        except jwt.PyJWTError:
            is_preview = False
    st = shop_state(shop)
    if not is_preview and not st["is_live"]:
        cfg = shop.published_config or shop.draft_config or {}
        return {
            "status": "inactive",
            "reason": st["state"],
            "reason_label": STATE_LABELS.get(st["state"], ""),
            "name": cfg.get("name"),
            "slug": shop.slug,
        }
    cfg = shop.draft_config if is_preview else (shop.published_config or shop.draft_config)
    cats = (await session.scalars(select(Category).where(Category.shop_id == shop.id).order_by(Category.sort, Category.id))).all()
    prods = (await session.scalars(select(Product).where(Product.shop_id == shop.id).order_by(Product.sort, Product.id))).all()
    return {
        "status": "active",
        "preview": is_preview,
        "id": shop.id,
        "slug": shop.slug,
        "template": shop.template,
        "config": cfg,
        "categories": [category_out(c) for c in cats],
        "products": [product_out(p) for p in prods],
    }


class EventIn(BaseModel):
    type: str
    product_id: int | None = None


@router.post("/public/shops/{slug}/event")
async def public_event(slug: str, body: EventIn, session: AsyncSession = Depends(get_session)):
    if body.type not in ("view", "product_view", "order_click"):
        raise HTTPException(400, "bad event")
    shop = await _find_shop(session, slug)
    if not shop_state(shop)["is_live"]:
        return {"ok": False}
    product = None
    if body.product_id:
        product = await session.get(Product, body.product_id)
        if not product or product.shop_id != shop.id:
            product = None
    session.add(Event(shop_id=shop.id, type=body.type, product_id=product.id if product else None))
    if body.type == "view":
        shop.views = (shop.views or 0) + 1
    await session.commit()
    if body.type == "order_click" and product:
        owner = await session.get(User, shop.owner_id)
        if owner:
            cfg = shop.published_config or {}
            price = f"{product.price:,}".replace(",", " ")
            await notify(
                owner.telegram_id,
                f"🛒 <b>Покупатель нажал «Заказать»</b>\n"
                f"Магазин: {html_escape(cfg.get('name', shop.slug))}\n"
                f"Товар: <b>{html_escape(product.name)}</b> — {price} {html_escape(cfg.get('currency', 'сум'))}\n"
                f"Ждите сообщение покупателя в Telegram.",
            )
    return {"ok": True}


@router.get("/media/{media_id}")
async def get_media(media_id: str, session: AsyncSession = Depends(get_session)):
    m = await session.get(Media, media_id[:32])
    if not m:
        raise HTTPException(404, "Файл не найден")
    return Response(
        content=m.data,
        media_type=m.content_type,
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )
