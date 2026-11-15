"""Автоответчик в ЛИЧНОМ Telegram владельца (Telethon; бесплатные ответы по ключевым словам или Claude).

Что делает:
  * НИКОМУ не пишет первым.
  * Отвечает только продавцам из leads.csv (verified=yes, статус не refused/invalid),
    и только в чатах, где вы уже написали первым (ваше сообщение с демо).
  * Ждёт 40–90 секунд, пока человек допишет, «печатает» и отвечает: бесплатно по ключевым словам
    (backend/faq_assistant.py) или через Claude, если в .env задан ANTHROPIC_API_KEY.
  * Если вы сами написали в чат после ответа продавца — автоответчик молчит в этом чате 12 часов.
  * Скидки, оплата переводом, жалобы, «позовите человека» — отвечает, что вы скоро напишете,
    пишет вам в «Избранное» и молчит в этом чате 24 часа.
  * «Не интересно / не пишите» — вежливо прощается, ставит статус refused и больше не отвечает.
  * Лимиты: 60 ответов в день всего, 15 в одном чате.

Запуск (из корня проекта):
    .venv\\Scripts\\python -m scripts.userbot.auto_reply            # работа
    .venv\\Scripts\\python -m scripts.userbot.auto_reply --dry-run  # только показывать ответы, не отправлять
При первом запуске Telethon спросит телефон и код из Telegram — вводите их сами, в этом окне.
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import json
import logging
import os
import random
import re
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

# переменные из .env (как у backend), без перезаписи уже заданных
for _name in (".env.local", ".env"):
    _p = ROOT / _name
    if _p.exists():
        for _line in _p.read_text(encoding="utf-8").splitlines():
            if "=" in _line and not _line.lstrip().startswith("#"):
                _k, _v = _line.split("=", 1)
                os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))

from backend import ai_assistant as ai  # noqa: E402
from backend import faq_assistant as faq  # noqa: E402

HERE = Path(__file__).resolve().parent
SESSION = HERE / "aziz_owner"          # aziz_owner.session — ключ к вашему аккаунту, никому не передавайте
STATE_FILE = HERE / "state.json"
LEADS = ROOT / "leads.csv"
DAILY_LIMIT = int(os.getenv("USERBOT_DAILY_LIMIT", "60"))
PER_CHAT_LIMIT = int(os.getenv("USERBOT_PER_CHAT_LIMIT", "15"))
MANUAL_PAUSE = 12 * 3600
HANDOFF_PAUSE = 24 * 3600
FOREVER = 10 ** 12

log = logging.getLogger("userbot")


# ---------------- состояние ----------------
def load_state() -> dict:
    try:
        st = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        st = {}
    st.setdefault("paused", {})
    st.setdefault("sent_ids", {})
    st.setdefault("daily", {"date": "", "total": 0, "per_chat": {}})
    return st


def save_state(st: dict) -> None:
    STATE_FILE.write_text(json.dumps(st, ensure_ascii=False, indent=1), encoding="utf-8")


def bump_daily(st: dict, chat: str) -> bool:
    d = st["daily"]
    today = date.today().isoformat()
    if d.get("date") != today:
        st["daily"] = d = {"date": today, "total": 0, "per_chat": {}}
    if d["total"] >= DAILY_LIMIT or d["per_chat"].get(chat, 0) >= PER_CHAT_LIMIT:
        return False
    d["total"] += 1
    d["per_chat"][chat] = d["per_chat"].get(chat, 0) + 1
    return True


def paused(st: dict, chat: str) -> bool:
    return st["paused"].get(chat, 0) > time.time()


def pause(st: dict, chat: str, seconds: int) -> None:
    st["paused"][chat] = time.time() + seconds


# ---------------- лиды ----------------
def _norm(u: str) -> str:
    return (u or "").strip().lstrip("@").replace("https://t.me/", "").lower()


def allowed_usernames() -> set[str]:
    if not LEADS.exists():
        return set()
    out = set()
    for r in csv.DictReader(LEADS.open(encoding="utf-8")):
        if r.get("verified", "").startswith("yes") and r.get("status") not in ("refused", "invalid"):
            out.add(_norm(r.get("order_contact", "")))
    out.discard("")
    return out


def set_lead_status(username: str, status: str) -> None:
    if not LEADS.exists():
        return
    rows = list(csv.DictReader(LEADS.open(encoding="utf-8")))
    if not rows:
        return
    changed = False
    for r in rows:
        if _norm(r.get("order_contact", "")) == _norm(username) and r.get("status") != status:
            if r.get("status") == "refused":
                continue
            r["status"] = status
            changed = True
    if changed:
        with LEADS.open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)


# ---------------- факты о платформе (с боевого сайта) ----------------
def load_facts() -> dict:
    base = os.environ.get("WEBAPP_URL", "").rstrip("/")
    cfg = json.load(urllib.request.urlopen(f"{base}/api/public/config", timeout=30))
    tpl = json.load(urllib.request.urlopen(f"{base}/api/public/templates", timeout=30))["templates"]
    return {"plans": cfg.get("plans", []), "templates": tpl, "trial_days": cfg.get("trial_days", 7),
            "webapp_url": cfg.get("webapp_url", base), "bot_username": cfg.get("bot_username", "")}


def history_from(messages) -> list[dict]:
    """messages — от старых к новым (объекты Telethon Message)."""
    out = []
    for m in messages:
        text = (m.message or "").strip() or ("(фото/файл)" if m.media else "")
        if text:
            out.append({"role": "assistant" if m.out else "user", "content": text})
    return out


# ---------------- первые сообщения продавцам (по расписанию) ----------------
OUTREACH_FILE = ROOT / "outreach_messages.md"
TASHKENT = timezone(timedelta(hours=5))
WINDOW = (10, 19)  # отправлять только в рабочее время по Ташкенту


def parse_outreach() -> list[tuple[str, str]]:
    """[(username, текст)] в порядке файла outreach_messages.md."""
    if not OUTREACH_FILE.exists():
        return []
    out = []
    for block in re.split(r"(?m)^### ", OUTREACH_FILE.read_text(encoding="utf-8"))[1:]:
        who = re.search(r"\*\*Кому[^*]*\*\*\s*`?@?([A-Za-z0-9_]{4,32})`?", block)
        text = re.search(r"```text\n(.*?)\n```", block, re.S)
        if who and text and text.group(1).strip():
            out.append((who.group(1), text.group(1).strip()))
    return out


def lead_statuses() -> dict[str, str]:
    if not LEADS.exists():
        return {}
    return {_norm(r.get("order_contact", "")): r.get("status", "")
            for r in csv.DictReader(LEADS.open(encoding="utf-8")) if r.get("verified", "").startswith("yes")}


def outreach_queue() -> list[tuple[str, str]]:
    st = lead_statuses()
    return [(u, t) for u, t in parse_outreach() if st.get(_norm(u)) == "new"]


def next_window_start(now: datetime) -> datetime:
    start = now.replace(hour=WINDOW[0], minute=0, second=0, microsecond=0)
    if now >= start:
        start += timedelta(days=1)
    return start + timedelta(minutes=random.uniform(0, 20))


# ---------------- основной цикл ----------------
async def main(dry_run: bool, outreach_limit: int = 0) -> None:
    from telethon import TelegramClient, events

    api_id, api_hash = os.environ.get("TG_API_ID"), os.environ.get("TG_API_HASH")
    if not api_id or not api_hash:
        raise SystemExit("Укажите TG_API_ID и TG_API_HASH в .env (получить: https://my.telegram.org → API development tools).")
    facts = load_facts()
    use_ai = ai.available()  # без ANTHROPIC_API_KEY — бесплатные ответы по ключевым словам
    system = ai.build_system(facts, "dm") if use_ai else ""
    st = load_state()
    client = TelegramClient(str(SESSION), int(api_id), api_hash)
    from telethon.errors import PhoneCodeInvalidError, PhoneNumberInvalidError

    # при первом запуске спросит телефон и код — вводите сами; при ошибке спросит снова
    while True:
        try:
            await client.start(
                phone=lambda: os.environ.pop("TG_PHONE", "").strip()
                or input("\nНомер телефона в формате +998XXXXXXXXX: ").strip().replace(" ", ""),
                code_callback=lambda: input("Код из Telegram (придёт в приложение): ").strip(),
            )
            break
        except PhoneNumberInvalidError:
            print("Неверный номер. Нужно +998 и ещё 9 цифр, например +998901234567. Попробуйте снова.")
        except PhoneCodeInvalidError:
            print("Неверный код. Попробуйте снова — придёт новый код.")
    me = await client.get_me()
    log.info("Вошли как @%s. Автоответчик работает (%s)%s.", me.username,
             "ИИ Claude" if use_ai else "ответы по ключевым словам", " (dry-run)" if dry_run else "")
    timers: dict[str, asyncio.Task] = {}

    async def respond(chat_id: int, username: str) -> None:
        chat = str(chat_id)
        msgs = list(reversed(await client.get_messages(chat_id, limit=24)))
        if not msgs or msgs[-1].out:
            return  # последним писали вы — отвечать нечего
        if not any(m.out for m in msgs):
            return  # вы не писали этому человеку первым — не наш диалог
        if not bump_daily(st, chat):
            log.warning("Лимит ответов достигнут (чат %s)", username)
            save_state(st)
            return
        try:
            if use_ai:
                text, handoff, stop = await ai.reply(history_from(msgs), system)
            else:
                fresh = []  # все сообщения продавца после вашего последнего
                for m in reversed(msgs):
                    if m.out:
                        break
                    fresh.insert(0, (m.message or "").strip())
                text, handoff, stop = faq.answer(" ".join(x for x in fresh if x) or "?", facts, "dm")
        except Exception:
            log.exception("ИИ не ответил")
            text, handoff, stop = None, True, False
        last_in = next((m.message for m in reversed(msgs) if not m.out), "") or ""
        if text:
            if dry_run:
                log.info("[dry-run] @%s ← %s", username, text)
            else:
                async with client.action(chat_id, "typing"):
                    await asyncio.sleep(min(8.0, 2 + len(text) / 40))
                sent = await client.send_message(chat_id, text)
                st["sent_ids"].setdefault(chat, []).append(sent.id)
                st["sent_ids"][chat] = st["sent_ids"][chat][-200:]
        set_lead_status(username, "replied")
        if stop:
            pause(st, chat, FOREVER)
            set_lead_status(username, "refused")
            log.info("@%s отказался — больше не отвечаем", username)
        elif handoff:
            pause(st, chat, HANDOFF_PAUSE)
            set_lead_status(username, "handoff")
            note = f"🙋 Нужен ваш ответ: @{username}\nНаписал: {last_in[:500]}\n" + (f"ИИ ответил: {text[:300]}" if text else "ИИ не ответил")
            if not dry_run:
                await client.send_message("me", note)
            log.info("Передано вам: @%s", username)
        save_state(st)

    def schedule(chat_id: int, username: str) -> None:
        chat = str(chat_id)
        if chat in timers and not timers[chat].done():
            timers[chat].cancel()  # человек дописывает — ждём заново

        async def delayed():
            await asyncio.sleep(random.uniform(40, 90))
            await respond(chat_id, username)

        timers[chat] = asyncio.create_task(delayed())

    @client.on(events.NewMessage(incoming=True, func=lambda e: e.is_private))
    async def on_incoming(event):
        sender = await event.get_sender()
        if not sender or getattr(sender, "bot", False):
            return
        username = _norm(getattr(sender, "username", "") or "")
        if not username or username not in allowed_usernames():
            return  # друзья, семья и все остальные — не трогаем
        if paused(st, str(event.chat_id)):
            return
        log.info("Сообщение от @%s", username)
        schedule(event.chat_id, username)

    @client.on(events.NewMessage(outgoing=True, func=lambda e: e.is_private))
    async def on_outgoing(event):
        chat = str(event.chat_id)
        if event.chat_id == me.id or event.id in st["sent_ids"].get(chat, []):
            return
        # Вы написали сами. Если продавец уже отвечал в этом чате — вы взяли разговор на себя.
        msgs = await client.get_messages(event.chat_id, limit=20)
        if any(not m.out for m in msgs):
            pause(st, chat, MANUAL_PAUSE)
            if chat in timers:
                timers[chat].cancel()
            save_state(st)
            log.info("Вы ответили сами в чате %s — автоответчик молчит 12 часов", chat)

    async def outreach_loop() -> None:
        """Первые сообщения продавцам: только 10:00–19:00 по Ташкенту, до N в день, пауза 5–10 минут."""
        from telethon.errors import FloodWaitError, PeerFloodError, RPCError

        while True:
            now = datetime.now(TASHKENT)
            o = st.setdefault("outreach", {"date": "", "count": 0, "stopped_until": 0})
            if o["date"] != now.date().isoformat():
                o.update(date=now.date().isoformat(), count=0)
            if not (WINDOW[0] <= now.hour < WINDOW[1]) or o["count"] >= outreach_limit or time.time() < o["stopped_until"]:
                wake = next_window_start(now)
                if time.time() < o["stopped_until"]:
                    wake = max(wake, datetime.fromtimestamp(o["stopped_until"], TASHKENT))
                log.info("Рассылка: следующая отправка %s по Ташкенту", wake.strftime("%d.%m %H:%M"))
                await asyncio.sleep(max(60, (wake - now).total_seconds()))
                continue
            queue = outreach_queue()
            if not queue:
                log.info("Рассылка: всем проверенным продавцам уже написали")
                return
            user, text = queue[0]
            try:
                entity = await client.get_entity(user)
                if getattr(entity, "bot", False) or (await client.get_messages(entity, limit=1)):
                    set_lead_status(user, "contacted")  # бот или переписка уже есть — не пишем
                    log.info("Рассылка: @%s пропущен (уже есть переписка)", user)
                    continue
                if dry_run:
                    log.info("[dry-run] рассылка → @%s: %s", user, text[:120])
                else:
                    sent = await client.send_message(entity, text)
                    st["sent_ids"].setdefault(str(sent.chat_id), []).append(sent.id)
                set_lead_status(user, "contacted")
                o["count"] += 1
                save_state(st)
                log.info("Рассылка: отправлено @%s (%d/%d сегодня)", user, o["count"], outreach_limit)
            except PeerFloodError:
                o["stopped_until"] = time.time() + 48 * 3600
                save_state(st)
                log.error("Telegram ограничил отправку (PeerFlood) — рассылка остановлена на 2 суток")
                await client.send_message("me", "⛔ Telegram ограничил отправку сообщений незнакомым (PeerFlood). "
                                                "Рассылка AZIZ остановлена на 2 суток. Автоответы продолжают работать.")
                continue
            except FloodWaitError as e:
                log.warning("Telegram просит подождать %s сек", e.seconds)
                await asyncio.sleep(e.seconds + 30)
                continue
            except (ValueError, RPCError) as e:
                set_lead_status(user, "unreachable")  # username не найден или личка закрыта
                log.warning("Рассылка: @%s недоступен (%s)", user, type(e).__name__)
                continue
            await asyncio.sleep(random.uniform(300, 600))

    if outreach_limit > 0:
        asyncio.create_task(outreach_loop())
        log.info("Рассылка включена: до %d в день, %d:00–%d:00 по Ташкенту, в очереди %d продавцов",
                 outreach_limit, WINDOW[0], WINDOW[1], len(outreach_queue()))
    await client.run_until_disconnected()


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="не отправлять, только показывать ответы")
    ap.add_argument("--outreach", type=int, default=0, metavar="N",
                    help="отправлять первые сообщения из outreach_messages.md: до N в день (не больше 10)")
    ap.add_argument("--preview-outreach", action="store_true", help="показать очередь рассылки и выйти")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
    if args.preview_outreach:
        for i, (u, t) in enumerate(outreach_queue(), 1):
            print(f"\n=== {i}. @{u} ===\n{t}")
        raise SystemExit
    asyncio.run(main(args.dry_run, min(max(args.outreach, 0), 10)))
