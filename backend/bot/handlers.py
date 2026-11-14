"""Платформенный Telegram-бот AZIZ Website (aiogram 3)."""
import re
from datetime import timedelta

from aiogram import F, Router
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (
    CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, LabeledPrice, Message, PreCheckoutQuery, WebAppInfo,
)
from sqlalchemy import select

from ..config import settings
from ..db import SessionLocal
from ..models import LoginToken, Payment, Shop, User, utcnow
from ..routers.auth import upsert_tg_user
from ..security import random_token
from ..services import (
    STATE_LABELS, ShopError, create_shop, get_plans, get_template, html_escape, list_templates, mark_payment_paid,
    shop_state, slug_problem, slug_taken, unique_slug,
)

router = Router(name="platform")


class CreateShop(StatesGroup):
    name = State()
    slug = State()
    seller = State()


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


@router.message(Command("admin"))
async def cmd_admin(message: Message):
    async with SessionLocal() as s:
        user = await tg_user(s, message.from_user)
    if not (user.is_admin or user.telegram_id in settings.admin_ids):
        return
    await message.answer("🛡 Админ-панель платформы" + dev_link("/admin"), reply_markup=kb([web("Открыть админ-панель", "/admin")]))


@router.message(F.text)
async def fallback(message: Message):
    await message.answer("Нажмите /start, чтобы открыть меню.", reply_markup=welcome_kb())
