"""Платформенный Telegram-бот AZIZ Website (aiogram 3)."""
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from aiogram import F, Router
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (
    CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, LabeledPrice, Message, PreCheckoutQuery, WebAppInfo,
)
from sqlalchemy import func, select

from ..ai_assistant import available as ai_available
from ..ai_assistant import build_system
from ..ai_assistant import reply as ai_reply
from ..faq_assistant import answer as faq_answer
from ..config import settings
from ..db import SessionLocal
from ..models import AiMessage, LoginToken, Payment, Shop, SubscriptionAction, User, utcnow
from ..routers.auth import upsert_tg_user
from ..security import random_token
from ..services import (
    STATE_LABELS, ShopError, aware, create_shop, get_plans, get_template, html_escape, list_templates, mark_payment_paid,
    notify, notify_admins, platform_bot_username, shop_state, slug_problem, slug_taken, unique_slug,
)

router = Router(name="platform")
log = logging.getLogger("aziz.bot")


class CreateShop(StatesGroup):
    name = State()
    slug = State()
    seller = State()


class AdminSubscription(StatesGroup):
    search = State()
    days = State()
    expiry = State()


# ---------- helpers ----------
def btn(text: str, cb: str) -> InlineKeyboardButton:
    return InlineKeyboardButton(text=text, callback_data=cb)


def web(text: str, path: str) -> InlineKeyboardButton | None:
    """Кнопка Telegram Web App (требует HTTPS). В локальной разработке ссылка добавляется в текст."""
    if not settings.is_https:
        return None
    return InlineKeyboardButton(text=text, web_app=WebAppInfo(url=settings.webapp_url + path))


def kb(*rows: list) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[b for b in row if b] for row in rows if any(row)])


def dev_link(path: str) -> str:
    return "" if settings.is_https else f"\n\n🔗 {settings.webapp_url}{path}"


async def tg_user(session, u) -> User:
    user = await upsert_tg_user(session, {
        "id": u.id, "username": u.username, "first_name": u.first_name, "last_name": u.last_name,
        "language_code": u.language_code,
    })
    if not user.bot_started:
        user.bot_started = True
        await session.commit()
    return user


def fmt_date(iso: str | None) -> str:
    return f"{iso[8:10]}.{iso[5:7]}.{iso[0:4]}" if iso else "—"


WELCOME = (
    "👋 <b>Добро пожаловать в AZIZ Website!</b>\n"
    "Создай свой интернет-магазин за несколько минут.\n\n"
    "✅ 10 готовых шаблонов\n"
    "✅ Управление прямо в Telegram\n"
    "✅ Первые {days} дней — бесплатно\n"
    "✅ Заказы приходят вам в личный Telegram"
)


def welcome_kb() -> InlineKeyboardMarkup:
    return kb(
        [btn("🚀 Создать сайт", "create")],
        [btn("🗂 Мои сайты", "my"), web("⚙️ Кабинет", "/panel")],
        [btn("❓ Помощь", "help")],
    )


async def send_welcome(target: Message | CallbackQuery) -> None:
    text = WELCOME.format(days=settings.trial_days) + dev_link("/panel")
    if isinstance(target, CallbackQuery):
        await target.message.edit_text(text, reply_markup=welcome_kb())
    else:
        await target.answer(text, reply_markup=welcome_kb())


# ---------- /start ----------
@router.message(CommandStart())
async def cmd_start(message: Message, command: CommandObject, state: FSMContext):
    await state.clear()
    async with SessionLocal() as s:
        user = await tg_user(s, message.from_user)
        if (command.args or "") == "login":
            await send_login(message, s, user)
            return
    await send_welcome(message)


@router.callback_query(F.data == "home")
async def cb_home(cq: CallbackQuery, state: FSMContext):
    await state.clear()
    await send_welcome(cq)
    await cq.answer()


@router.callback_query(F.data == "help")
@router.message(Command("help"))
async def help_(event: Message | CallbackQuery):
    text = (
        "❓ <b>Как это работает</b>\n\n"
        "1. Нажмите «Создать сайт» и выберите тип магазина.\n"
        "2. Посмотрите демо всех страниц шаблона.\n"
        "3. Укажите название, ссылку и свой Telegram.\n"
        f"4. Магазин сразу опубликуется — {settings.trial_days} дней бесплатно.\n"
        "5. В кабинете меняйте дизайн, баннеры, товары и цены.\n"
        "6. Покупатели нажимают «Заказать в Telegram» и пишут вам.\n\n"
        "Команды: /start /myshops /login (вход с компьютера)"
    )
    markup = kb([btn("⬅️ Назад", "home")])
    if isinstance(event, CallbackQuery):
        await event.message.edit_text(text, reply_markup=markup)
        await event.answer()
    else:
        await event.answer(text, reply_markup=markup)


# ---------- Выбор шаблона ----------
@router.callback_query(F.data == "create")
async def cb_create(cq: CallbackQuery, state: FSMContext):
    await state.clear()
    async with SessionLocal() as s:
        tpls = await list_templates(s)
    rows, row = [], []
    for t in tpls:
        row.append(btn(f"{t['emoji']} {t['name']}", f"tpl:{t['key']}"))
        if len(row) == 2:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    rows.append([btn("⬅️ Назад", "home")])
    lines = "\n".join(f"{t['emoji']} <b>{t['name']}</b> — {t['short']}" for t in tpls)
    await cq.message.edit_text(f"<b>Выберите тип сайта:</b>\n\n{lines}", reply_markup=InlineKeyboardMarkup(inline_keyboard=rows))
    await cq.answer()


@router.callback_query(F.data.startswith("tpl:"))
async def cb_template(cq: CallbackQuery):
    key = cq.data.split(":", 1)[1]
    async with SessionLocal() as s:
        tpls = await list_templates(s)
    keys = [t["key"] for t in tpls]
    if key not in keys:
        await cq.answer("Шаблон недоступен", show_alert=True)
        return
    i = keys.index(key)
    t = tpls[i]
    prev_k, next_k = keys[(i - 1) % len(keys)], keys[(i + 1) % len(keys)]
    text = (
        f"{t['emoji']} <b>Шаблоны {t['name']}</b>\n"
        f"<i>{html_escape(t['short'])}</i>\n\n"
        f"{html_escape(t['description'])}\n\n"
        "📄 Страницы: Главная, Каталог, Категории, Товар, О магазине, Доставка, FAQ, Контакты, Избранное"
        + dev_link(f"/demo/{key}")
    )
    await cq.message.edit_text(text, reply_markup=kb(
        [btn("◀️", f"tpl:{prev_k}"), btn(f"{i + 1} / {len(keys)}", "noop"), btn("▶️", f"tpl:{next_k}")],
        [web("👁 Смотреть демо", f"/demo/{key}")],
        [btn("✅ Выбрать этот шаблон", f"pick:{key}")],
        [btn("⬅️ Назад", "create")],
    ))
    await cq.answer()


@router.callback_query(F.data == "noop")
async def cb_noop(cq: CallbackQuery):
    await cq.answer()


CANCEL = kb([btn("✖️ Отмена", "home")])


@router.callback_query(F.data.startswith("pick:"))
async def cb_pick(cq: CallbackQuery, state: FSMContext):
    key = cq.data.split(":", 1)[1]
    tpl = get_template(key)
    if not tpl:
        await cq.answer("Шаблон не найден", show_alert=True)
        return
    await state.set_state(CreateShop.name)
    await state.set_data({"template": key})
    await cq.message.edit_text(
        f"<b>Создание сайта</b>\nШаблон: {tpl['emoji']} {tpl['name']}\n\n"
        "🏷 Введите <b>название магазина</b>:\n<i>Например: HAYOT Gaming</i>",
        reply_markup=CANCEL,
    )
    await cq.answer()


@router.message(CreateShop.name, F.text)
async def st_name(message: Message, state: FSMContext):
    name = message.text.strip()
    if len(name) < 2 or len(name) > 80:
        await message.answer("Название должно быть от 2 до 80 символов. Попробуйте ещё раз:", reply_markup=CANCEL)
        return
    async with SessionLocal() as s:
        suggestion = await unique_slug(s, name)
    await state.update_data(name=name, suggestion=suggestion)
    await state.set_state(CreateShop.slug)
    await message.answer(
        f"🔗 <b>Ссылка (ID) магазина</b>\n\nАдрес будет таким:\n<code>{settings.webapp_url}/shop/{suggestion}</code>\n\n"
        "Отправьте свой вариант (латиница, цифры, дефис) или оставьте предложенный.",
        reply_markup=kb([btn(f"✅ Оставить {suggestion}", "slug_ok")], [btn("✖️ Отмена", "home")]),
    )


async def ask_seller(target: Message, state: FSMContext, username: str | None):
    await state.set_state(CreateShop.seller)
    rows = []
    if username:
        rows.append([btn(f"✅ Использовать @{username}", "seller_me")])
    rows.append([btn("✖️ Отмена", "home")])
    await target.answer(
        "💬 <b>Ваш Telegram для заказов</b>\nПокупатели будут писать сюда. Отправьте username, например <code>@hayotbek_shop</code>.",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=rows),
    )


@router.callback_query(CreateShop.slug, F.data == "slug_ok")
async def cb_slug_ok(cq: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    await state.update_data(slug=data.get("suggestion"))
    await cq.answer()
    await ask_seller(cq.message, state, cq.from_user.username)


@router.message(CreateShop.slug, F.text)
async def st_slug(message: Message, state: FSMContext):
    slug = message.text.strip().lower().replace(" ", "-")
    if p := slug_problem(slug):
        await message.answer(f"⚠️ {p}. Попробуйте ещё раз:", reply_markup=CANCEL)
        return
    async with SessionLocal() as s:
        if await slug_taken(s, slug):
            await message.answer("⚠️ Этот адрес уже занят. Введите другой:", reply_markup=CANCEL)
            return
    await state.update_data(slug=slug)
    await ask_seller(message, state, message.from_user.username)


async def finish_create(message: Message, state: FSMContext, tg_from, seller: str):
    data = await state.get_data()
    async with SessionLocal() as s:
        user = await tg_user(s, tg_from)
        try:
            shop = await create_shop(s, user, data["template"], data["name"], data.get("slug"), seller)
        except ShopError as e:
            await message.answer(f"⚠️ {e}", reply_markup=CANCEL)
            return
    await state.clear()
    await send_created(message, shop)


async def send_created(message: Message, shop: Shop):
    st = shop_state(shop)
    url = settings.shop_url(shop.slug)
    if st["state"] == "trial":
        period = f"Бесплатный период: {settings.trial_days} дней (до {fmt_date(st['expires_at'])}) ✅"
    else:
        period = "⚠️ Бесплатный период уже использован. Оплатите аренду, чтобы магазин увидели покупатели."
    await message.answer(
        f"✅ <b>Сайт успешно создан!</b>\n\nВаш магазин готов 🎉\n{period}\n\nСсылка на сайт:\n{url}"
        + dev_link(f"/panel/shop/{shop.id}/editor"),
        reply_markup=kb(
            [web("🌐 Открыть сайт", f"/shop/{shop.slug}")],
            [web("✏️ Редактировать", f"/panel/shop/{shop.id}/editor")],
            [btn("💎 Продлить аренду", f"renew:{shop.id}")],
            [btn("🗂 Мои сайты", "my")],
        ),
        disable_web_page_preview=True,
    )


@router.callback_query(CreateShop.seller, F.data == "seller_me")
async def cb_seller_me(cq: CallbackQuery, state: FSMContext):
    await cq.answer()
    await finish_create(cq.message, state, cq.from_user, cq.from_user.username or "")


@router.message(CreateShop.seller, F.text)
async def st_seller(message: Message, state: FSMContext):
    seller = re.sub(r"^(https?://)?t\.me/", "", message.text.strip()).lstrip("@")
    if not re.match(r"^[A-Za-z0-9_]{4,32}$", seller):
        await message.answer("⚠️ Отправьте корректный username (латиница, цифры, _), например @hayotbek_shop", reply_markup=CANCEL)
        return
    await finish_create(message, state, message.from_user, seller)


# ---------- Мои сайты ----------
@router.callback_query(F.data == "my")
@router.message(Command("myshops"))
async def my_shops(event: Message | CallbackQuery):
    tg = event.from_user
    async with SessionLocal() as s:
        user = await tg_user(s, tg)
        shops = (await s.scalars(select(Shop).where(Shop.owner_id == user.id).order_by(Shop.id.desc()))).all()
    if not shops:
        text, rows = "У вас пока нет сайтов.", [[btn("🚀 Создать сайт", "create")], [btn("⬅️ Назад", "home")]]
    else:
        lines = []
        rows = []
        for sh in shops:
            st = shop_state(sh)
            name = (sh.published_config or sh.draft_config or {}).get("name", sh.slug)
            lines.append(f"• <b>{html_escape(name)}</b> — {STATE_LABELS[st['state']]}" + (f", до {fmt_date(st['expires_at'])}" if st["expires_at"] else ""))
            rows.append([btn(f"🛍 {name}", f"shop:{sh.id}")])
        rows.append([btn("🚀 Создать ещё", "create"), btn("⬅️ Назад", "home")])
        text = "🗂 <b>Мои сайты</b>\n\n" + "\n".join(lines)
    markup = InlineKeyboardMarkup(inline_keyboard=rows)
    if isinstance(event, CallbackQuery):
        await event.message.edit_text(text, reply_markup=markup)
        await event.answer()
    else:
        await event.answer(text, reply_markup=markup)


async def _own_shop(s, tg_id: int, shop_id: int) -> Shop | None:
    user = await s.scalar(select(User).where(User.telegram_id == tg_id))
    shop = await s.get(Shop, shop_id)
    return shop if user and shop and shop.owner_id == user.id else None


@router.callback_query(F.data.startswith("shop:"))
async def cb_shop(cq: CallbackQuery):
    async with SessionLocal() as s:
        shop = await _own_shop(s, cq.from_user.id, int(cq.data.split(":")[1]))
    if not shop:
        await cq.answer("Магазин не найден", show_alert=True)
        return
    st = shop_state(shop)
    name = (shop.published_config or {}).get("name", shop.slug)
    await cq.message.edit_text(
        f"🛍 <b>{html_escape(name)}</b>\nСтатус: {STATE_LABELS[st['state']]}\n"
        f"Срок: до {fmt_date(st['expires_at'])} (осталось дней: {st['days_left']})\n\n{settings.shop_url(shop.slug)}"
        + dev_link(f"/panel/shop/{shop.id}"),
        reply_markup=kb(
            [web("🌐 Открыть сайт", f"/shop/{shop.slug}")],
            [web("✏️ Редактировать", f"/panel/shop/{shop.id}/editor"), web("📦 Товары", f"/panel/shop/{shop.id}/products")],
            [btn("💎 Продлить аренду", f"renew:{shop.id}")],
            [btn("⬅️ Мои сайты", "my")],
        ),
        disable_web_page_preview=True,
    )
    await cq.answer()


# ---------- Оплата аренды (Telegram Stars) ----------
@router.callback_query(F.data.startswith("renew:"))
async def cb_renew(cq: CallbackQuery):
    shop_id = int(cq.data.split(":")[1])
    async with SessionLocal() as s:
        shop = await _own_shop(s, cq.from_user.id, shop_id)
        plans = await get_plans(s)
    if not shop:
        await cq.answer("Магазин не найден", show_alert=True)
        return
    rows = [[btn(f"{p['label']} — {p['stars']} ⭐", f"plan:{shop_id}:{p['months']}")] for p in plans]
    rows.append([web("💳 Другие способы оплаты", f"/panel/shop/{shop_id}/billing")])
    rows.append([btn("⬅️ Назад", f"shop:{shop_id}")])
    await cq.message.answer(
        "💎 <b>Продление аренды</b>\nВыберите срок. Оплата Telegram Stars — срок продлится автоматически.",
        reply_markup=kb(*rows),
    )
    await cq.answer()


@router.callback_query(F.data.startswith("plan:"))
async def cb_plan(cq: CallbackQuery):
    _, shop_id, months = cq.data.split(":")
    async with SessionLocal() as s:
        shop = await _own_shop(s, cq.from_user.id, int(shop_id))
        if not shop:
            await cq.answer("Магазин не найден", show_alert=True)
            return
        if shop.is_blocked:
            await cq.answer("Магазин заблокирован администратором", show_alert=True)
            return
        plan = next((p for p in await get_plans(s) if int(p["months"]) == int(months)), None)
        if not plan:
            await cq.answer("Тариф не найден", show_alert=True)
            return
        pay = Payment(shop_id=shop.id, user_id=shop.owner_id, months=plan["months"], amount=int(plan["stars"]),
                      currency="XTR", method="stars")
        s.add(pay)
        await s.commit()
        name = (shop.published_config or {}).get("name", shop.slug)
    await cq.message.answer_invoice(
        title=f"Аренда — {plan['label']}",
        description=f"Продление магазина «{name}» на {plan['label']}",
        payload=f"renew:{pay.id}",
        currency="XTR",
        prices=[LabeledPrice(label=plan["label"], amount=int(plan["stars"]))],
    )
    await cq.answer()


@router.pre_checkout_query()
async def pre_checkout(q: PreCheckoutQuery):
    ok, err = False, "Платёж не найден"
    if q.invoice_payload.startswith("renew:"):
        async with SessionLocal() as s:
            pay = await s.get(Payment, int(q.invoice_payload.split(":")[1]))
            if pay and pay.status == "pending" and pay.amount == q.total_amount and q.currency == "XTR":
                shop = await s.get(Shop, pay.shop_id)
                ok = bool(shop and not shop.is_blocked)
                err = "Магазин заблокирован" if not ok else ""
    await q.answer(ok=ok, error_message=err or None)


@router.message(F.successful_payment)
async def paid(message: Message):
    sp = message.successful_payment
    if not sp.invoice_payload.startswith("renew:"):
        return
    async with SessionLocal() as s:
        pay = await s.get(Payment, int(sp.invoice_payload.split(":")[1]))
        if not pay:
            return
        shop = await mark_payment_paid(s, pay, external_id=sp.telegram_payment_charge_id)
    if shop:
        st = shop_state(shop)
        await message.answer(
            f"✅ <b>Оплата прошла!</b>\nМагазин активен до {fmt_date(st['expires_at'])}. Спасибо!",
            reply_markup=kb([web("🌐 Открыть сайт", f"/shop/{shop.slug}")], [btn("🗂 Мои сайты", "my")]),
        )


# ---------- Вход с компьютера ----------
async def send_login(message: Message, s, user: User):
    token = random_token(24)
    s.add(LoginToken(token=token, user_id=user.id, expires_at=utcnow() + timedelta(minutes=15)))
    await s.commit()
    url = f"{settings.webapp_url}/login?token={token}"
    markup = kb([InlineKeyboardButton(text="🔐 Войти в кабинет", url=url)]) if settings.is_https else None
    await message.answer(
        f"🔐 Одноразовая ссылка для входа в кабинет с компьютера (действует 15 минут):\n\n{url}",
        reply_markup=markup, disable_web_page_preview=True,
    )


@router.message(Command("login"))
async def cmd_login(message: Message):
    async with SessionLocal() as s:
        user = await tg_user(s, message.from_user)
        await send_login(message, s, user)



# ---------- Ручное управление подписками из Telegram ----------
def _is_subscription_admin(telegram_id: int) -> bool:
    return telegram_id in settings.admin_ids or telegram_id in settings.subscription_admin_ids


def _sub_status_text(shop: Shop) -> tuple[str, str]:
    state = shop_state(shop)
    label = STATE_LABELS.get(state["state"], state["state"])
    expiry = fmt_date(state["expires_at"])
    return label, expiry


async def _subscription_shop_view(shop_id: int):
    async with SessionLocal() as s:
        shop = await s.get(Shop, shop_id)
        if not shop:
            return None, None
        owner = await s.get(User, shop.owner_id)
        status, expiry = _sub_status_text(shop)
        cfg = shop.published_config or shop.draft_config or {}
        name = cfg.get("name") or shop.slug
        owner_label = (
            f"@{owner.username}" if owner and owner.username
            else (owner.first_name if owner else "неизвестен")
        )
        owner_tg = owner.telegram_id if owner else "—"
        text = (
            f"🧾 <b>Подписка магазина</b>\n\n"
            f"Магазин: <b>{html_escape(name)}</b>\n"
            f"ID: <code>{shop.id}</code>\n"
            f"Адрес: <code>{html_escape(shop.slug)}</code>\n"
            f"Владелец: {html_escape(owner_label)} ({owner_tg})\n"
            f"Статус: <b>{html_escape(status)}</b>\n"
            f"Окончание: <b>{expiry}</b>\n"
            f"Блокировка: {'да' if shop.is_blocked else 'нет'}"
        )
    markup = kb(
        [btn("➕ 7 дней", f"subadm:extend:7:{shop_id}"), btn("➕ 30 дней", f"subadm:extend:30:{shop_id}")],
        [btn("✍️ Свой срок", f"subadm:days:{shop_id}"), btn("📅 Установить дату", f"subadm:expiry:{shop_id}")],
        [btn("♾ Бессрочно", f"subadm:lifetime:{shop_id}")],
        [btn("📜 История", f"subadm:history:{shop_id}")],
        [btn("⛔ Отозвать доступ", f"subadm:revoke_confirm:{shop_id}")],
        [btn("🔎 Новый поиск", "subadm:search")],
    )
    return text, markup


async def _apply_manual_subscription(actor: Message | CallbackQuery, shop_id: int, action: str,
                                     days: int | None = None, expires_at: datetime | None = None):
    if not _is_subscription_admin(actor.from_user.id):
        return False, "Нет доступа"
    async with SessionLocal() as s:
        admin = await tg_user(s, actor.from_user)
        shop = await s.get(Shop, shop_id)
        if not shop:
            return False, "Магазин не найден"
        now = utcnow()
        if action == "extend":
            ends = [aware(d) for d in (shop.trial_ends_at, shop.paid_until) if d]
            shop.paid_until = max([now, *ends]) + timedelta(days=days or 0)
        elif action == "set_expiry":
            if not expires_at or expires_at <= now:
                return False, "Дата окончания должна быть в будущем"
            shop.paid_until = expires_at
        elif action == "lifetime":
            shop.paid_until = datetime(9999, 12, 31, 23, 59, 59, tzinfo=timezone.utc)
        elif action == "revoke":
            shop.paid_until = None
            shop.trial_ends_at = None
        else:
            return False, "Неизвестное действие"
        shop.reminder_key = None
        row = SubscriptionAction(
            shop_id=shop.id,
            admin_user_id=admin.id,
            action=action,
            days=days if action == "extend" else None,
            expires_at=shop.paid_until,
            reason="Изменено администратором через Telegram-бота",
        )
        s.add(row)
        await s.commit()
        owner = await s.get(User, shop.owner_id)
        status = shop_state(shop)
        shop_name = (shop.published_config or shop.draft_config or {}).get("name") or shop.slug
        if owner:
            if action == "revoke":
                notice = f"⛔ Доступ к магазину «{html_escape(shop_name)}» отозван администратором."
            elif action == "lifetime":
                notice = f"♾ Для магазина «{html_escape(shop_name)}» включён бессрочный доступ."
            else:
                notice = f"✅ Подписка магазина «{html_escape(shop_name)}» обновлена до {fmt_date(status['expires_at'])}."
            await notify(owner.telegram_id, notice)
    return True, "Подписка обновлена"


async def _show_subscription_shop(cq: CallbackQuery, shop_id: int):
    text, markup = await _subscription_shop_view(shop_id)
    if text is None:
        await cq.answer("Магазин не найден", show_alert=True)
        return
    await cq.message.edit_text(text, reply_markup=markup)
    await cq.answer()


@router.message(Command("subscriptions"))
async def cmd_subscriptions(message: Message, state: FSMContext):
    if not _is_subscription_admin(message.from_user.id):
        return
    await state.set_state(AdminSubscription.search)
    await message.answer(
        "🧾 <b>Ручное управление подписками</b>\n"
        "Отправь ID магазина, его адрес (slug), название или Telegram ID владельца.",
        reply_markup=kb([btn("✖️ Отмена", "subadm:cancel")]),
    )


@router.callback_query(F.data == "subadm:search")
async def cb_subscriptions_search(cq: CallbackQuery, state: FSMContext):
    if not _is_subscription_admin(cq.from_user.id):
        await cq.answer("Нет доступа", show_alert=True)
        return
    await state.set_state(AdminSubscription.search)
    await cq.message.answer(
        "🔎 Введи ID магазина, его адрес (slug), название или Telegram ID владельца.",
        reply_markup=kb([btn("✖️ Отмена", "subadm:cancel")]),
    )
    await cq.answer()


@router.callback_query(F.data == "subadm:cancel")
async def cb_subscriptions_cancel(cq: CallbackQuery, state: FSMContext):
    await state.clear()
    await cq.message.answer("Действие отменено.")
    await cq.answer()


@router.message(AdminSubscription.search, F.text)
async def st_subscriptions_search(message: Message, state: FSMContext):
    if not _is_subscription_admin(message.from_user.id):
        await state.clear()
        return
    query = (message.text or "").strip().casefold()
    if not query:
        await message.answer("Введи ID, адрес, название или Telegram ID владельца.")
        return
    async with SessionLocal() as s:
        shops = (await s.scalars(select(Shop).order_by(Shop.id.desc()).limit(500))).all()
        owner_ids = {shop.owner_id for shop in shops}
        owners = {
            u.id: u for u in (
                await s.scalars(select(User).where(User.id.in_(owner_ids or {0})))
            ).all()
        }
        matches = []
        for shop in shops:
            owner = owners.get(shop.owner_id)
            config = shop.published_config or shop.draft_config or {}
            name = str(config.get("name") or "")
            haystack = " ".join([
                str(shop.id), shop.slug, name,
                str(owner.telegram_id if owner else ""),
                owner.username or "" if owner else "",
                owner.first_name or "" if owner else "",
            ]).casefold()
            if query in haystack:
                matches.append((shop, name or shop.slug))
    if not matches:
        await message.answer(
            "Ничего не найдено. Попробуй другой запрос.",
            reply_markup=kb([btn("🔎 Искать снова", "subadm:search")]),
        )
        return
    rows = []
    for shop, name in matches[:15]:
        status, _ = _sub_status_text(shop)
        rows.append([btn(f"#{shop.id} · {name[:24]} · {status[:14]}", f"subadm:shop:{shop.id}")])
    rows.append([btn("🔎 Новый поиск", "subadm:search")])
    await message.answer(
        f"Найдено магазинов: <b>{len(matches)}</b>. Выбери нужный:",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=rows),
    )
    await state.clear()


@router.callback_query(F.data.startswith("subadm:shop:"))
async def cb_subscription_shop(cq: CallbackQuery):
    if not _is_subscription_admin(cq.from_user.id):
        await cq.answer("Нет доступа", show_alert=True)
        return
    await _show_subscription_shop(cq, int(cq.data.split(":")[2]))


@router.callback_query(F.data.startswith("subadm:extend:"))
async def cb_subscription_extend(cq: CallbackQuery):
    if not _is_subscription_admin(cq.from_user.id):
        await cq.answer("Нет доступа", show_alert=True)
        return
    _, _, days_text, shop_id_text = cq.data.split(":")
    days, shop_id = int(days_text), int(shop_id_text)
    ok, result = await _apply_manual_subscription(cq, shop_id, "extend", days=days)
    if not ok:
        await cq.answer(result, show_alert=True)
        return
    await _show_subscription_shop(cq, shop_id)


@router.callback_query(F.data.startswith("subadm:days:"))
async def cb_subscription_custom_days(cq: CallbackQuery, state: FSMContext):
    if not _is_subscription_admin(cq.from_user.id):
        await cq.answer("Нет доступа", show_alert=True)
        return
    shop_id = int(cq.data.split(":")[2])
    await state.set_data({"shop_id": shop_id})
    await state.set_state(AdminSubscription.days)
    await cq.message.answer("На сколько дней продлить? Введи число от 1 до 36500.")
    await cq.answer()


@router.message(AdminSubscription.days, F.text)
async def st_subscription_custom_days(message: Message, state: FSMContext):
    if not _is_subscription_admin(message.from_user.id):
        await state.clear()
        return
    raw = (message.text or "").strip()
    if not raw.isdigit() or not 1 <= int(raw) <= 36500:
        await message.answer("Введи целое число от 1 до 36500.")
        return
    data = await state.get_data()
    shop_id = int(data["shop_id"])
    await state.clear()
    ok, result = await _apply_manual_subscription(message, shop_id, "extend", days=int(raw))
    if not ok:
        await message.answer(result)
        return
    text, markup = await _subscription_shop_view(shop_id)
    await message.answer("✅ Срок продлён.", reply_markup=None)
    if text:
        await message.answer(text, reply_markup=markup)


@router.callback_query(F.data.startswith("subadm:expiry:"))
async def cb_subscription_expiry(cq: CallbackQuery, state: FSMContext):
    if not _is_subscription_admin(cq.from_user.id):
        await cq.answer("Нет доступа", show_alert=True)
        return
    shop_id = int(cq.data.split(":")[2])
    await state.set_data({"shop_id": shop_id})
    await state.set_state(AdminSubscription.expiry)
    await cq.message.answer("Введи дату окончания в формате <code>ДД.ММ.ГГГГ</code>. Подписка будет действовать до конца этого дня.")
    await cq.answer()


@router.message(AdminSubscription.expiry, F.text)
async def st_subscription_expiry(message: Message, state: FSMContext):
    if not _is_subscription_admin(message.from_user.id):
        await state.clear()
        return
    raw = (message.text or "").strip()
    try:
        day = datetime.strptime(raw, "%d.%m.%Y").date()
        expiry = datetime.combine(day, datetime.max.time().replace(microsecond=0), tzinfo=ZoneInfo("Asia/Tashkent"))
        if expiry <= datetime.now(ZoneInfo("Asia/Tashkent")):
            raise ValueError
    except ValueError:
        await message.answer("Неверная или прошедшая дата. Используй формат ДД.ММ.ГГГГ.")
        return
    data = await state.get_data()
    shop_id = int(data["shop_id"])
    await state.clear()
    ok, result = await _apply_manual_subscription(message, shop_id, "set_expiry", expires_at=expiry)
    if not ok:
        await message.answer(result)
        return
    text, markup = await _subscription_shop_view(shop_id)
    await message.answer("✅ Дата окончания установлена.")
    if text:
        await message.answer(text, reply_markup=markup)


@router.callback_query(F.data.startswith("subadm:lifetime:"))
async def cb_subscription_lifetime(cq: CallbackQuery):
    if not _is_subscription_admin(cq.from_user.id):
        await cq.answer("Нет доступа", show_alert=True)
        return
    shop_id = int(cq.data.split(":")[2])
    ok, result = await _apply_manual_subscription(cq, shop_id, "lifetime")
    if not ok:
        await cq.answer(result, show_alert=True)
        return
    await _show_subscription_shop(cq, shop_id)


@router.callback_query(F.data.startswith("subadm:revoke_confirm:"))
async def cb_subscription_revoke_confirm(cq: CallbackQuery):
    if not _is_subscription_admin(cq.from_user.id):
        await cq.answer("Нет доступа", show_alert=True)
        return
    shop_id = int(cq.data.split(":")[2])
    await cq.message.edit_text(
        f"⚠️ <b>Отозвать доступ к магазину #{shop_id}?</b>\nСрок пробного и оплаченного доступа будет сброшен.",
        reply_markup=kb(
            [btn("Да, отозвать доступ", f"subadm:revoke:{shop_id}")],
            [btn("Отмена", f"subadm:shop:{shop_id}")],
        ),
    )
    await cq.answer()


@router.callback_query(F.data.startswith("subadm:revoke:"))
async def cb_subscription_revoke(cq: CallbackQuery):
    if not _is_subscription_admin(cq.from_user.id):
        await cq.answer("Нет доступа", show_alert=True)
        return
    shop_id = int(cq.data.split(":")[2])
    ok, result = await _apply_manual_subscription(cq, shop_id, "revoke")
    if not ok:
        await cq.answer(result, show_alert=True)
        return
    await _show_subscription_shop(cq, shop_id)


@router.callback_query(F.data.startswith("subadm:history:"))
async def cb_subscription_history(cq: CallbackQuery):
    if not _is_subscription_admin(cq.from_user.id):
        await cq.answer("Нет доступа", show_alert=True)
        return
    shop_id = int(cq.data.split(":")[2])
    async with SessionLocal() as s:
        rows = (await s.scalars(
            select(SubscriptionAction)
            .where(SubscriptionAction.shop_id == shop_id)
            .order_by(SubscriptionAction.id.desc()).limit(15)
        )).all()
        if not await s.get(Shop, shop_id):
            await cq.answer("Магазин не найден", show_alert=True)
            return
        admin_ids = {row.admin_user_id for row in rows}
        admins = {
            user.id: user for user in (
                await s.scalars(select(User).where(User.id.in_(admin_ids or {0})))
            ).all()
        }
    if not rows:
        text = f"📜 <b>История подписки магазина #{shop_id}</b>\n\nИзменений ещё не было."
    else:
        lines = []
        labels = {"extend": "Продление", "set_expiry": "Установка даты", "lifetime": "Бессрочно", "revoke": "Отзыв доступа"}
        for row in rows:
            admin = admins.get(row.admin_user_id)
            by = admin.username and f"@{admin.username}" or (admin.first_name if admin else "админ")
            details = f" на {row.days} дн." if row.action == "extend" else (f" до {fmt_date(row.expires_at.isoformat())}" if row.expires_at and row.action == "set_expiry" else "")
            lines.append(
                f"• <b>{labels.get(row.action, row.action)}</b>{details}\n"
                f"  {row.created_at.strftime('%d.%m.%Y %H:%M')} · {html_escape(by)}"
            )
        text = f"📜 <b>История подписки магазина #{shop_id}</b>\n\n" + "\n".join(lines)
    await cq.message.edit_text(text, reply_markup=kb([btn("⬅️ К магазину", f"subadm:shop:{shop_id}")]))
    await cq.answer()


@router.message(Command("admin"))
async def cmd_admin(message: Message):
    async with SessionLocal() as s:
        user = await tg_user(s, message.from_user)
    if not (user.is_admin or user.telegram_id in settings.admin_ids or user.telegram_id in settings.subscription_admin_ids):
        return
    rows = []
    if _is_subscription_admin(user.telegram_id):
        rows.append([btn("🧾 Управление подписками", "subadm:search")])
    rows.append([web("Открыть веб-админку", "/admin")])
    await message.answer("🛡 <b>Админ-панель платформы</b>", reply_markup=kb(*rows))


# ---------- Консультант: Claude, если задан ключ, иначе бесплатные ответы по ключевым словам ----------
AI_DAILY_LIMIT = 40
AI_HISTORY = 16
_system_cache: dict[str, str] = {}


async def _facts(s) -> dict:
    return {
        "plans": await get_plans(s),
        "templates": await list_templates(s),
        "trial_days": settings.trial_days,
        "webapp_url": settings.webapp_url,
        "bot_username": await platform_bot_username(),
    }


def _ai_system(facts: dict) -> str:
    key = json.dumps(facts, sort_keys=True, ensure_ascii=False)
    if key not in _system_cache:
        _system_cache.clear()
        _system_cache[key] = build_system(facts, "bot")
    return _system_cache[key]


@router.message(F.text)
async def fallback(message: Message):
    text = (message.text or "").strip()
    if text.startswith("/"):
        await message.answer("Нажмите /start, чтобы открыть меню.", reply_markup=welcome_kb())
        return
    uid = message.from_user.id
    async with SessionLocal() as s:
        await tg_user(s, message.from_user)
        since = utcnow() - timedelta(days=1)
        used = await s.scalar(select(func.count(AiMessage.id)).where(
            AiMessage.tg_user_id == uid, AiMessage.role == "user", AiMessage.created_at >= since))
        if (used or 0) >= AI_DAILY_LIMIT:
            await message.answer("На сегодня я ответил на много вопросов 🙂 Владелец свяжется с вами, или нажмите /start.")
            return
        rows = (await s.scalars(
            select(AiMessage)
            .where(AiMessage.tg_user_id == uid, AiMessage.role.in_(("user", "assistant")),
                   AiMessage.created_at >= utcnow() - timedelta(days=7))
            .order_by(AiMessage.id.desc()).limit(AI_HISTORY)
        )).all()
        s.add(AiMessage(tg_user_id=uid, role="user", content=text[:4000]))
        await s.commit()
        facts = await _facts(s)
    history = [{"role": r.role, "content": r.content} for r in reversed(rows)] + [{"role": "user", "content": text}]
    try:
        if ai_available():
            await message.bot.send_chat_action(message.chat.id, "typing")
            answer, handoff, _ = await ai_reply(history, _ai_system(facts))
        else:  # бесплатный режим без внешнего API
            answer, handoff, _ = faq_answer(text, facts, "bot")
    except Exception:
        log.exception("AI reply failed")
        answer, handoff = "Сейчас не могу ответить — передал ваш вопрос владельцу, он скоро напишет.", True
    notify_owner = False
    async with SessionLocal() as s:
        s.add(AiMessage(tg_user_id=uid, role="assistant", content=answer))
        if handoff:
            recent = await s.scalar(select(AiMessage.id).where(
                AiMessage.tg_user_id == uid, AiMessage.role == "handoff",
                AiMessage.created_at >= utcnow() - timedelta(minutes=30)))
            if not recent:
                notify_owner = True
                s.add(AiMessage(tg_user_id=uid, role="handoff", content=text[:500]))
        await s.commit()
    await message.answer(html_escape(answer), reply_markup=kb(
        [btn("🚀 Создать сайт", "create"), btn("🗂 Мои сайты", "my")]))
    if notify_owner:
        u = message.from_user
        who = html_escape(" ".join(x for x in (u.first_name, u.last_name) if x) or "без имени")
        await notify_admins(
            f"🙋 <b>Нужен владелец</b>\nОт: <a href=\"tg://user?id={u.id}\">{who}</a>"
            + (f" @{html_escape(u.username)}" if u.username else "")
            + f"\nСообщение: {html_escape(text[:500])}\nОтвет ИИ: {html_escape(answer[:300])}"
        )
