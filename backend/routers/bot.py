"""Webhook платформенного бота, webhook ботов продавцов и cron-задачи (сроки аренды)."""
import hmac
import os
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import ensure_db, get_session
from ..models import Shop, User
from ..security import decrypt_secret
from ..services import html_escape, make_bot, notify, shop_state

router = APIRouter(prefix="/api", tags=["bot"])
log = logging.getLogger("aziz.bot")


@router.post("/bot/webhook")
async def platform_webhook(request: Request, x_telegram_bot_api_secret_token: str | None = Header(default=None)):
    if settings.webhook_secret and not hmac.compare_digest(x_telegram_bot_api_secret_token or "", settings.webhook_secret):
        raise HTTPException(403, "bad secret")
    if not settings.bot_token:
        raise HTTPException(503, "bot not configured")
    await ensure_db()
    from aiogram.types import Update

    from ..bot.setup import get_dispatcher

    data = await request.json()
    bot = make_bot()
    try:
        update = Update.model_validate(data, context={"bot": bot})
        await get_dispatcher().feed_update(bot, update)
    except Exception:
        log.exception("update failed")
    finally:
        await bot.session.close()
    return {"ok": True}




@router.get("/bot/internal/activate-preview")
async def activate_preview_bot(secret: str):
    """Temporary one-time trigger to route the Telegram bot to an isolated preview backend."""
    expected = os.getenv("BOT_MIGRATION_SECRET", "")
    target = os.getenv("BOT_MIGRATION_WEBHOOK_URL", "")
    bypass = os.getenv("BOT_PREVIEW_BYPASS", "")
    if not expected or not hmac.compare_digest(secret, expected):
        raise HTTPException(404, "not found")
    if not settings.bot_token or not settings.webhook_secret or not target or not bypass:
        raise HTTPException(503, "preview migration is not configured")
    webhook_url = f"{target}?x-vercel-protection-bypass={bypass}"
    bot = make_bot()
    try:
        await bot.set_webhook(
            url=webhook_url,
            secret_token=settings.webhook_secret,
            allowed_updates=["message", "callback_query", "pre_checkout_query"],
            drop_pending_updates=False,
        )
        info = await bot.get_webhook_info()
        error_message = (info.last_error_message or "").replace(bypass, "[redacted]")
        return {
            "ok": True,
            "pending_update_count": info.pending_update_count,
            "has_last_error": bool(info.last_error_message),
            "last_error_message": error_message or None,
            "last_error_date": info.last_error_date,
            "webhook_url": webhook_url.split("?", 1)[0],
            "telegram_webhook_url_has_bypass": "x-vercel-protection-bypass=" in (info.url or ""),
            "telegram_webhook_url_matches_target": (info.url or "").split("?", 1)[0] == target.split("?", 1)[0],
            "ip_address": info.ip_address,
            "max_connections": info.max_connections,
        }
    finally:
        await bot.session.close()


@router.post("/bot/seller/{shop_id}")
async def seller_webhook(shop_id: int, request: Request, session: AsyncSession = Depends(get_session),
                         x_telegram_bot_api_secret_token: str | None = Header(default=None)):
    """Бот продавца: отвечает на /start кнопкой открытия магазина как Telegram Web App."""
    shop = await session.get(Shop, shop_id)
    if not shop or not shop.bot_secret or not hmac.compare_digest(x_telegram_bot_api_secret_token or "", shop.bot_secret):
        raise HTTPException(403, "bad secret")
    token = decrypt_secret(shop.bot_token_enc or "")
    if not token:
        return {"ok": True}
    data = await request.json()
    msg = data.get("message") or {}
    chat_id = (msg.get("chat") or {}).get("id")
    if not chat_id:
        return {"ok": True}
    from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

    cfg = shop.published_config or shop.draft_config or {}
    live = shop_state(shop)["is_live"]
    bot = make_bot(token)
    try:
        if live:
            await bot.send_message(
                chat_id,
                f"👋 Добро пожаловать в <b>{html_escape(cfg.get('name', ''))}</b>!\n{html_escape(cfg.get('description', ''))}",
                reply_markup=InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(
                    text="🛍 Открыть магазин", web_app=WebAppInfo(url=settings.shop_url(shop.slug)))]]),
            )
        else:
            await bot.send_message(chat_id, "Магазин временно недоступен. Загляните позже!")
    except Exception:
        log.exception("seller bot reply failed")
    finally:
        await bot.session.close()
    return {"ok": True}


@router.get("/cron/daily")
async def cron_daily(authorization: str | None = Header(default=None), session: AsyncSession = Depends(get_session)):
    """Vercel Cron: напоминания об окончании срока аренды (сам срок проверяется сервером при каждом запросе)."""
    if not settings.cron_secret or not hmac.compare_digest(authorization or "", f"Bearer {settings.cron_secret}"):
        raise HTTPException(401, "unauthorized")
    shops = (await session.scalars(select(Shop).where(Shop.is_blocked.is_(False)))).all()
    sent = 0
    for shop in shops:
        st = shop_state(shop)
        key = None
        if st["is_live"] and st["days_left"] <= 2:
            key = f"soon:{st['expires_at'][:10]}"
            text = f"⏳ Аренда магазина «{shop.slug}» закончится через {st['days_left']} дн. Продлите, чтобы сайт продолжал работать."
        elif st["state"] == "expired":
            key = f"expired:{st['expires_at'][:10]}"
            text = f"⛔ Срок аренды магазина «{shop.slug}» истёк — сайт скрыт от покупателей. Продлите аренду в боте или кабинете."
        if key and shop.reminder_key != key:
            owner = await session.get(User, shop.owner_id)
            if owner:
                from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

                markup = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="💎 Продлить аренду", callback_data=f"renew:{shop.id}")]])
                if await notify(owner.telegram_id, text, reply_markup=markup):
                    sent += 1
            shop.reminder_key = key
    await session.commit()
    return {"ok": True, "checked": len(shops), "sent": sent}
