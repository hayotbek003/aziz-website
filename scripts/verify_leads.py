"""Проверка новых продавцов перед рассылкой.

Для каждой строки leads.csv со статусом pending_review проверяет по публичным страницам Telegram:
  * канал t.me/<канал> существует, это канал (есть подписчики), подписчиков >= 300;
  * контакт для заказов есть в описании канала, существует и не является ботом;
  * демо-магазин открывается на сайте и в нём указан этот же контакт;
  * в outreach_messages.md есть сообщение для этого контакта со ссылкой на демо,
    фразой про примерные товары и строкой про бота.

Запуск:
    .venv\\Scripts\\python scripts\\verify_leads.py            # только отчёт
    .venv\\Scripts\\python scripts\\verify_leads.py --apply    # прошедшие -> new (уйдут в рассылку), остальные -> invalid
"""
from __future__ import annotations

import argparse
import csv
import html
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEADS = ROOT / "leads.csv"
MESSAGES = ROOT / "outreach_messages.md"
SITE = "https://aziz-website-five.vercel.app"
MIN_SUBS = 300


def fetch(url: str) -> str:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        return urllib.request.urlopen(req, timeout=25).read().decode("utf-8", "ignore")
    except Exception:
        return ""


def handle(x: str) -> str:
    return x.strip().replace("https://", "").replace("http://", "").replace("t.me/", "").lstrip("@").split("/")[0].split("?")[0]


def tg_page(h: str) -> dict:
    page = fetch(f"https://t.me/{h}")
    title = re.search(r'<meta property="og:title" content="([^"]*)"', page)
    if not page or "tgme_page_title" not in page or (title and title.group(1).startswith("Telegram: Contact")):
        return {"exists": False}
    extra = re.search(r'<div class="tgme_page_extra">\s*([^<]*)', page)
    extra = extra.group(1).strip() if extra else ""
    subs = re.search(r"([\d\s]+)\s+(subscribers|members)", extra)
    d = re.search(r'<div class="tgme_page_description[^"]*"[^>]*>(.*?)</div>', page, re.S)
    raw = html.unescape(re.sub(r"<br\s*/?>", " ", d.group(1))) if d else ""
    text = re.sub(r"<[^>]+>", " ", raw)
    mentions = {m.lower() for m in re.findall(r"@([A-Za-z0-9_]{4,32})", text) + re.findall(r"t\.me/([A-Za-z0-9_]{4,32})", raw)}
    return {
        "exists": True,
        "is_channel": bool(subs),
        "subs": int(re.sub(r"\D", "", subs.group(1))) if subs else 0,
        "kind": subs.group(2) if subs else "user",
        "mentions": mentions,
        "title": html.unescape(title.group(1)) if title else "",
    }


def check(row: dict, messages: str) -> list[str]:
    problems = []
    ch, contact = handle(row.get("channel_url", "")), handle(row.get("order_contact", ""))
    p = tg_page(ch)
    if not p["exists"]:
        return [f"канал t.me/{ch} не существует"]
    if not p["is_channel"] or p["kind"] != "subscribers":
        problems.append("это не канал магазина (группа или личный аккаунт)")
    elif p["subs"] < MIN_SUBS:
        problems.append(f"мало подписчиков: {p['subs']}")
    if not contact or contact.lower().endswith("bot"):
        problems.append(f"контакт @{contact} — бот или пустой")
    elif contact.lower() not in p["mentions"]:
        problems.append(f"@{contact} нет в описании канала (там: {', '.join(sorted(p['mentions'])) or 'ничего'})")
    elif not tg_page(contact)["exists"]:
        problems.append(f"аккаунт @{contact} не существует")
    slug = row.get("demo_url", "").rstrip("/").split("/")[-1]
    if not slug:
        problems.append("нет демо-магазина")
    else:
        try:
            d = json.loads(fetch(f"{SITE}/api/public/shops/{slug}") or "{}")
            seller = handle(d.get("config", {}).get("contacts", {}).get("telegram", ""))
            if d.get("status") != "active":
                problems.append(f"демо {slug} не открывается")
            elif seller.lower() != contact.lower():
                problems.append(f"в демо указан другой Telegram: @{seller}")
        except json.JSONDecodeError:
            problems.append(f"демо {slug} не открывается")
    block = next((b for b in re.split(r"(?m)^### ", messages) if re.search(rf"`@?{re.escape(contact)}`", b, re.I)), "")
    text = re.search(r"```text\n(.*?)\n```", block, re.S)
    if not text:
        problems.append("нет сообщения в outreach_messages.md")
    else:
        t = text.group(1)
        if slug and slug not in t:
            problems.append("в сообщении нет ссылки на его демо")
        if "@drop_uzb_bot" not in t:
            problems.append("в сообщении нет строки про бота")
        if not re.search(r"пример|namuna|намуна", t, re.I):
            problems.append("в сообщении нет честной фразы про примерные товары")
    return problems


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="прошедшие -> new, остальные -> invalid")
    args = ap.parse_args()
    rows = list(csv.DictReader(LEADS.open(encoding="utf-8")))
    messages = MESSAGES.read_text(encoding="utf-8") if MESSAGES.exists() else ""
    known = {}
    ok = bad = 0
    for r in rows:
        if r.get("status") != "pending_review":
            known.setdefault(handle(r.get("order_contact", "")).lower(), r.get("name"))
            continue
        problems = check(r, messages)
        contact = handle(r.get("order_contact", ""))
        if contact.lower() in known:
            problems.append(f"уже есть в списке ({known[contact.lower()]})")
        known.setdefault(contact.lower(), r.get("name"))
        if problems:
            bad += 1
            print(f"✗ {r.get('name', '')[:30]:30} @{contact:24} " + "; ".join(problems))
            if args.apply:
                r["status"] = "invalid"
        else:
            ok += 1
            print(f"✓ {r.get('name', '')[:30]:30} @{contact}")
            if args.apply:
                r["status"] = "new"
    print(f"\nПрошли проверку: {ok}, не прошли: {bad}")
    if args.apply and (ok or bad):
        with LEADS.open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)
        print("leads.csv обновлён: прошедшие получили статус new и попадут в рассылку.")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
