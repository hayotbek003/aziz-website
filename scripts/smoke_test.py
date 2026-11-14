"""Сквозная проверка API (локально, DEV_MODE=true): python scripts/smoke_test.py [base_url]"""
import hashlib
import hmac
import json
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import urlencode

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
ok_count = 0


def req(method, path, body=None, token=None, expect=200):
    global ok_count
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    if data is not None:
        r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(r) as resp:
            status, payload = resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        status, payload = e.code, json.loads(e.read() or b"null")
    assert status == expect, f"{method} {path}: expected {expect}, got {status}: {payload}"
    ok_count += 1
    return payload


def check(cond, msg):
    global ok_count
    assert cond, msg
    ok_count += 1


req("GET", "/api/health")
cfg = req("GET", "/api/public/config")
check(cfg["dev_mode"] is True, "dev mode")
tpls = req("GET", "/api/public/templates")["templates"]
check(len(tpls) == 10, "10 templates")

a = req("POST", "/api/auth/dev", {"telegram_id": 111, "username": "seller_a", "first_name": "A"})
b = req("POST", "/api/auth/dev", {"telegram_id": 222, "username": "seller_b", "first_name": "B"})
ta, tb = a["token"], b["token"]

# Создание магазинов из всех 10 шаблонов
shops = []
for i, t in enumerate(tpls):
    s = req("POST", "/api/me/shops", {"template": t["key"], "name": f"Test {t['name']}", "seller": "@seller_a"}, ta)["shop"]
    shops.append(s)
check(shops[0]["status"]["state"] == "trial", "first shop is trial")
check(shops[1]["status"]["state"] == "unpaid", "second shop needs payment (trial used once)")
req("POST", "/api/me/shops", {"template": "gaming", "name": "Dup", "slug": shops[0]["slug"]}, ta, expect=400)
req("POST", "/api/me/shops", {"template": "gaming", "name": "Bad", "slug": "A B"}, ta, expect=400)

sid = shops[0]["id"]
slug = shops[0]["slug"]
full = req("GET", f"/api/me/shops/{sid}", token=ta)
check(len(full["products"]) == 6 and len(full["categories"]) == 4, "seeded demo products")

# Изоляция: пользователь B не видит и не меняет магазин A
req("GET", f"/api/me/shops/{sid}", token=tb, expect=404)
req("PUT", f"/api/me/shops/{sid}/draft", {"config": full["draft"]}, tb, expect=404)
req("DELETE", f"/api/me/products/{full['products'][0]['id']}", token=tb, expect=404)
req("GET", f"/api/me/shops/{sid}", expect=401)

# Черновик → публикация
draft = full["draft"]
draft["theme"]["primary"] = "#FF0000"
draft["hero"]["title"] = "Новый заголовок"
req("PUT", f"/api/me/shops/{sid}/draft", {"config": draft}, ta)
pub = req("GET", f"/api/public/shops/{slug}")
check(pub["config"]["hero"]["title"] != "Новый заголовок", "draft not public before publish")
tok = req("POST", f"/api/me/shops/{sid}/preview-token", {}, ta)["token"]
prev = req("GET", f"/api/public/shops/{slug}?preview={tok}")
check(prev["preview"] and prev["config"]["hero"]["title"] == "Новый заголовок", "preview shows draft")
req("POST", f"/api/me/shops/{sid}/publish", {}, ta)
pub = req("GET", f"/api/public/shops/{slug}")
check(pub["config"]["theme"]["primary"] == "#FF0000", "published")
# Отмена изменений
draft["hero"]["title"] = "Черновик 2"
req("PUT", f"/api/me/shops/{sid}/draft", {"config": draft}, ta)
d = req("POST", f"/api/me/shops/{sid}/discard", {}, ta)
check(d["draft"]["hero"]["title"] == "Новый заголовок", "discard restores published")

# Товары и категории
cat = req("POST", f"/api/me/shops/{sid}/categories", {"name": "Новая категория", "icon": "Star"}, ta)["category"]
p = req("POST", f"/api/me/shops/{sid}/products", {
    "name": "Тестовый товар", "categoryId": cat["id"], "price": 15000, "oldPrice": 20000, "description": "desc",
    "specs": [{"k": "Цвет", "v": "Чёрный"}], "images": [], "isPopular": True, "inStock": True,
}, ta)["product"]
req("PATCH", f"/api/me/products/{p['id']}", {"inStock": False}, ta)
other = req("POST", "/api/me/shops", {"template": "tech", "name": "B shop"}, tb)["shop"]
other_cat = req("GET", f"/api/me/shops/{other['id']}", token=tb)["categories"][0]["id"]
req("PUT", f"/api/me/products/{p['id']}", {"name": "x", "price": 1, "categoryId": other_cat}, ta, expect=400)
req("DELETE", f"/api/me/categories/{cat['id']}", token=ta)
pub = req("GET", f"/api/public/shops/{slug}")
tp = next(x for x in pub["products"] if x["id"] == p["id"])
check(tp["inStock"] is False and tp["categoryId"] is None, "product updated live")

# Изображения
boundary = "----aziz"
png = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6360000002000154a24f5d0000000049454e44ae426082")
body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.png\"\r\nContent-Type: image/png\r\n\r\n").encode() + png + f"\r\n--{boundary}--\r\n".encode()
r = urllib.request.Request(BASE + "/api/me/media", data=body, method="POST")
r.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
r.add_header("Authorization", f"Bearer {ta}")
mid = json.loads(urllib.request.urlopen(r).read())["id"]
with urllib.request.urlopen(BASE + f"/api/media/{mid}") as resp:
    check(resp.read() == png, "media roundtrip")

# Статистика
req("POST", f"/api/public/shops/{slug}/event", {"type": "view"})
req("POST", f"/api/public/shops/{slug}/event", {"type": "product_view", "product_id": p["id"]})
req("POST", f"/api/public/shops/{slug}/event", {"type": "order_click", "product_id": p["id"]})
st = req("GET", f"/api/me/shops/{sid}/stats", token=ta)
check(st["totals"] == {"view": 1, "product_view": 1, "order_click": 1}, f"stats {st['totals']}")

# Настройки (сразу в опубликованной версии) + смена адреса
req("PATCH", f"/api/me/shops/{sid}/info", {"info": {"contacts": {"phone": "+998901112233"}, "language": "uz"}, "slug": "hayotgaming"}, ta)
pub = req("GET", "/api/public/shops/hayotgaming")
check(pub["config"]["contacts"]["phone"] == "+998901112233" and pub["config"]["language"] == "uz", "info applied")

# Неоплаченный магазин скрыт
inactive = req("GET", f"/api/public/shops/{shops[1]['slug']}")
check(inactive["status"] == "inactive" and inactive["reason"] == "unpaid", "unpaid hidden")

# Оплата переводом → админ подтверждает
bill = req("GET", f"/api/me/shops/{shops[1]['id']}/billing", token=ta)
check(len(bill["plans"]) == 4, "plans")
pay = req("POST", f"/api/me/shops/{shops[1]['id']}/billing/manual", {"months": 1, "note": "чек 123"}, ta)["payment"]
req("GET", "/api/admin/overview", token=tb, expect=403)  # B — не администратор
req("POST", f"/api/admin/payments/{pay['id']}/confirm", {}, ta)
live = req("GET", f"/api/public/shops/{shops[1]['slug']}")
check(live["status"] == "active", "paid shop is live")

# Админ: блокировка / продление / шаблоны / тарифы
ov = req("GET", "/api/admin/overview", token=ta)
check(ov["shops"] == 11, f"overview shops {ov['shops']}")
req("POST", f"/api/admin/shops/{other['id']}/block", {"blocked": True, "reason": "spam"}, ta)
blk = req("GET", f"/api/public/shops/{other['slug']}")
check(blk["status"] == "inactive" and blk["reason"] == "blocked", "blocked hidden")
req("POST", f"/api/admin/shops/{other['id']}/block", {"blocked": False}, ta)
ext = req("POST", f"/api/admin/shops/{shops[2]['id']}/extend", {"days": 30}, ta)["shop"]
check(ext["status"]["state"] == "active", "extended")
req("PUT", "/api/admin/templates/kids", {"is_active": False, "sort": 9}, ta)
check(len(req("GET", "/api/public/templates")["templates"]) == 9, "template disabled")
req("POST", "/api/me/shops", {"template": "kids", "name": "Kids shop"}, ta, expect=400)
req("PUT", "/api/admin/templates/kids", {"is_active": True, "sort": 8}, ta)
req("GET", "/api/admin/users", token=ta)
req("GET", "/api/admin/payments", token=ta)

# Проверка подписи initData Telegram
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.dirname(__import__("os").path.abspath(__file__))))
from backend.security import verify_init_data  # noqa: E402

bot_token = "123456:TEST_TOKEN_abcdefghijklmnopqrstuvwxyz"
fields = {"auth_date": str(int(time.time())), "query_id": "AAA", "user": json.dumps({"id": 333, "first_name": "T"})}
dcs = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
h = hmac.new(secret, dcs.encode(), hashlib.sha256).hexdigest()
check(verify_init_data(urlencode({**fields, "hash": h}), bot_token)["id"] == 333, "initData valid")
try:
    verify_init_data(urlencode({**fields, "hash": "0" * 64}), bot_token)
    check(False, "tampered initData must fail")
except ValueError:
    check(True, "")

# Токен бота продавца не утекает во frontend
check("bot_token_enc" not in json.dumps(req("GET", f"/api/me/shops/{sid}", token=ta)), "no token leak")

print(f"OK: {ok_count} checks passed")
