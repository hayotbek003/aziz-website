"""Бесплатный автоответчик без внешнего API: распознаёт частые вопросы по ключевым словам (ru / uz).

Возвращает тот же формат, что и ai_assistant.reply(): (текст, нужен_владелец, человек_отказался).
Всё, что не распознано, честно передаётся владельцу.
"""
from __future__ import annotations

import re

UZ_CYR = set("ўқғҳЎҚҒҲ")
UZ_LAT_HINTS = ("qanday", "qancha", "narx", "bepul", "salom", "assalomu", "rahmat", "kerak", "emas", "sayt",
                "do'kon", "dokon", "buyurtma", "mahsulot", "nima", "bormi", "yo'q", "yoq", "ha ", "xa ", "chegirma",
                "to'lov", "tolov", "qiziq", "yozmang", "kerakmas", "boshlash", "ochish", "shablon")


def detect_lang(text: str) -> str:
    t = text.lower()
    if any(ch in UZ_CYR for ch in text):
        return "uz"
    latin = sum(c.isascii() and c.isalpha() for c in t)
    cyr = sum("а" <= c <= "я" or c == "ё" for c in t)
    if latin > cyr and any(h in t + " " for h in UZ_LAT_HINTS):
        return "uz"
    if latin > cyr * 2 and latin > 3:
        return "uz"  # продавцы в Узбекистане пишут латиницей чаще всего по-узбекски
    return "ru"


# (интент, ключевые слова) — порядок важен: передача владельцу и отказ проверяются первыми
INTENTS: list[tuple[str, tuple[str, ...]]] = [
    ("refuse", ("не интерес", "неинтерес", "не надо", "не нужно", "не пишите", "не пиши", "отпишит", "спам", "нет спасибо",
                "нет, спасибо", "kerak emas", "kerakmas", "керак эмас", "керакмас", "qiziq emas", "қизиқ эмас",
                "yozmang", "ёзманг", "bezovta", "безовта", "qiziqish bildirmay", "қизиқиш билдирмай", "qiziqmay",
                "қизиқмай", "afsuski", "афсуски", "к сожалению", "не заинтересов", "ehtiyoj yo'q", "эҳтиёж йўқ",
                "kerak bo'lmay", "керак бўлмай")),
    ("setup", ("настройте", "настройт", "настроить нам", "сделайте нам", "сделайте бот", "подключите", "sozlab ber",
               "созлаб бер", "qilib ber", "қилиб бер", "ulab ber", "улаб бер")),
    ("promo", ("акци", "aksiya", "акция", "старая цена", "старую цену", "зачерк", "цена со скидкой", "цену со скидкой",
               "скидку на товар", "скидки на товар", "скидка на товар", "eski narx", "chegirmali", "чегирмали", "распродаж")),
    ("discount", ("скидк", "дешевле", "подешев", "акци", "chegirma", "чегирма", "arzonroq", "арзонроқ", "skidka")),
    ("transfer", ("перевод", "переве", "на карту", "картой", "карты", "click", "клик", "payme", "пейми", "uzcard", "humo", "наличн",
                  "o'tkaz", "otkaz", "ўтказ", "karta", "naqd", "нақд")),
    ("human", ("человек", "оператор", "владел", "админ", "менеджер", "позвон", "созвон", "odam", "одам", "operator",
               "admin", "egasi", "эгаси", "qo'ng'iroq", "қўнғироқ", "telefon qil")),
    ("problem", ("не работает", "ошибк", "проблем", "сломал", "не открыва", "не могу", "жалоб", "ishlamay", "ишламай",
                 "xato", "хато", "muammo", "муаммо", "ochilmay", "очилмай")),
    ("greet", ("привет", "здравств", "добрый", "салам", "салом", "ассалом", "assalom", "salom", "hello", "hi", "хай")),
    ("price", ("цен", "сколько", "стоит", "стоимост", "тариф", "оплат", "платн", "платить", " сум", "narx", "нарх", "qancha", "қанча",
               " pul", " пул", "to'lov", "tolov", "тўлов", "stars", "звезд", "obuna", "обуна", "подписк", "аренд")),
    ("free", ("бесплат", "пробн", "тест", "попроб", "bepul", "бепул", "tekin", "текин", "sinab", "синаб", "trial")),
    ("orders", ("заказ", "корзин", "покупател", "клиент", "оплата на сайт", "buyurtma", "буюртма", "xaridor", "харидор",
                "savat", "сават", "mijoz", "мижоз")),
    ("domain", ("домен", "domain", "хостинг", "адрес", "ссылк", "manzil", "манзил", "havola", "ҳавола", "link")),
    ("products", ("товар", "фото", "картин", "добав", "каталог", "категор", "mahsulot", "маҳсулот", "rasm", "расм",
                  "qo'sh", "қўш", "katalog", "каталог")),
    ("bot", ("свой бот", "своего бот", "бот магазин", "o'z bot", "ўз бот", "bot ula", "мини ап", "мини-ап", "миниап",
             "mini ap", "mini-ap", "miniap", "веб апп", "webapp", "web app", "через тг", "через телеграм", "в телеграме",
             "telegram orqali", "телеграм орқали", "instagram", "инстаграм", "insta", "инста", "taplink", "таплинк",
             "bio", "био", "ссылка в профил", "мультиссылк")),
    ("templates", ("шаблон", "дизайн", "пример", "демо", "цвет", "shablon", "шаблон", "dizayn", "дизайн", "namuna",
                   "намуна", "rang", "ранг")),
    ("start", ("как созд", "как сдел", "как начать", "как подключ", "создать", "сделать сайт", "подключ", "начать",
               "хочу", "давайте", "интересно", "да", "qanday qil", "қандай қил", "qanday och", "ochish", "очиш",
               "boshla", "бошла", "yaratish", "яратиш", "xohlayman", "хоҳлайман", "qiziq", "қизиқ", "ha", "xa", "ҳа")),
    ("thanks", ("спасибо", "благодар", "rahmat", "раҳмат", "рахмат", "tashakkur", "ташаккур")),
]

HANDOFF_INTENTS = {"discount", "transfer", "human", "problem", "setup"}


def _fmt(n: int) -> str:
    return f"{int(n):,}".replace(",", " ")


def _texts(facts: dict, lang: str) -> dict[str, str]:
    bot = "@" + (facts.get("bot_username") or "drop_uzb_bot")
    url = facts.get("webapp_url", "")
    days = facts.get("trial_days", 7)
    plans = facts.get("plans", [])
    cheapest = min(plans, key=lambda p: p["price_uzs"] / max(1, p["months"])) if plans else None
    if lang == "uz":
        plan_lines = "; ".join(f"{p['months']} oy — {_fmt(p['price_uzs'])} so'm" for p in plans)
        names = ", ".join(t["name"] for t in facts.get("templates", []))
        return {
            "greet": f"Assalomu alaykum! Men AZIZ Website yordamchisiman. Telegram'da sotuvchilar uchun internet-do'kon yaratamiz. Birinchi do'kon {days} kun bepul.",
            "price": f"Birinchi do'kon {days} kun bepul. Keyin: {plan_lines}. To'lov botda Telegram Stars orqali yoki o'tkazma bilan.",
            "free": f"Ha, birinchi do'kon {days} kun mutlaqo bepul, karta kerak emas. Boshlash uchun {bot} botida /start bosing.",
            "start": f"Boshlash oson: {bot} botida /start → «Создать сайт» → shablonni tanlang → nom va Telegram'ingizni yozing. 2–3 daqiqada tayyor, {days} kun bepul.",
            "templates": f"10 ta tayyor shablon bor: {names}. Rang, shrift, logotip, bannerlarni o'zingiz o'zgartirasiz. Namunalar: {url}",
            "orders": "Xaridor mahsulotni tanlab «Заказать в Telegram» tugmasini bosadi — sizning Telegram'ingizga tayyor xabar bilan yozadi. Saytda to'lov va savat yo'q, komissiya ham yo'q.",
            "domain": f"Domen va hosting sotib olish shart emas: do'kon manzili {url}/shop/sizning-nomingiz bo'ladi.",
            "products": "Mahsulotlarni Telegram ichida qo'shasiz: bir nechta rasm, narx, eski narx (chegirma), tavsif, xususiyatlar, kategoriyalar. Xohlasangiz, mahsulotlarni ko'chirishga yordam beramiz.",
            "bot": "Ha! Sizning do'koningiz uchun alohida Telegram-bot qilib beramiz: «Do'kon» tugmasi saytni Mini App sifatida "
                   "to'g'ridan-to'g'ri Telegram ichida ochadi. Instagram uchun bonus: profilga bitta qisqa havola — "
                   "unda Telegram'ingiz, kanalingiz, botingiz va do'koningiz bo'ladi, o'z havolalaringizni ham qo'shasiz, "
                   "hammasini o'zingiz o'zgartirasiz. Hammasini o'zimiz sozlab beramiz — «sozlab bering» deb yozing.",
            "promo": "Ha, aksiyalar bor: har bir mahsulotga eski narx va yangi narx qo'yasiz — eski narx chizilgan holda, "
                     "chegirma belgisi bilan ko'rinadi. Aksiya tugagach, eski narxni olib tashlaysiz. Bosh sahifaga aksiya "
                     "bannerini ham qo'yish mumkin.",
            "setup": "Ajoyib! Hammasini o'zimiz sozlab beramiz: do'kon, Mini App tugmali botingiz va aksiyalar. "
                     "Do'kon egasiga yetkazdim — u tez orada yozadi.",
            "thanks": "Rahmat! Savollar bo'lsa, yozing.",
            "handoff": "Bu savolni do'kon egasiga yetkazdim — u tez orada o'zi yozadi.",
            "refuse": "Tushundim, bezovta qilganim uchun uzr. Omad!",
            "unknown": "Savolingizni egasiga yetkazdim — u tez orada javob beradi.",
            "cheapest": (f" Eng foydalisi — {cheapest['months']} oy." if cheapest and cheapest["months"] > 1 else ""),
        }
    plan_lines = "; ".join(f"{p['label']} — {_fmt(p['price_uzs'])} сум" for p in plans)
    names = ", ".join(t["name"] for t in facts.get("templates", []))
    return {
        "greet": f"Здравствуйте! Я помощник AZIZ Website — делаем интернет-магазины для продавцов в Telegram. Первый магазин — {days} дней бесплатно.",
        "price": f"Первый магазин — {days} дней бесплатно. Дальше: {plan_lines}. Оплата в боте через Telegram Stars или переводом.",
        "free": f"Да, первый магазин {days} дней бесплатно, карта не нужна. Чтобы начать — нажмите /start в {bot}.",
        "start": f"Начать просто: в {bot} нажмите /start → «Создать сайт» → выберите шаблон → название и ваш Telegram. Готово за 2–3 минуты, {days} дней бесплатно.",
        "templates": f"Есть 10 готовых шаблонов: {names}. Цвета, шрифты, логотип и баннеры меняете сами. Посмотреть: {url}",
        "orders": "Покупатель выбирает товар и нажимает «Заказать в Telegram» — вам в личку приходит готовое сообщение о товаре. Корзины и оплаты на сайте нет, комиссии тоже нет.",
        "domain": f"Домен и хостинг покупать не нужно: адрес магазина будет {url}/shop/ваше-название.",
        "products": "Товары добавляете прямо в Telegram: несколько фото, цена, старая цена (скидка), описание, характеристики, категории. Можем помочь перенести товары.",
        "bot": "Да! Сделаем для вашего магазина своего Telegram-бота: кнопка «Магазин» открывает сайт как Mini App прямо "
               "в Telegram. И бонус для Instagram: одна короткая ссылка в профиль — по ней открывается страница с вашим "
               "Telegram, каналом, ботом и магазином, можно добавить и свои ссылки, меняете всё сами. "
               "Всё настроим за вас — напишите «настройте».",
        "promo": "Да, акции есть: у каждого товара ставите старую и новую цену — старая показывается зачёркнутой, "
                 "со значком скидки. Акция закончилась — убираете старую цену. На главную можно поставить баннер акции.",
        "setup": "Отлично! Всё настроим за вас: магазин, вашего бота с кнопкой Mini App и акции. "
                 "Передал владельцу — он скоро напишет вам сам.",
        "thanks": "Спасибо! Если появятся вопросы — пишите.",
        "handoff": "Этот вопрос я передал владельцу — он скоро напишет вам сам.",
        "refuse": "Понял, извините за беспокойство. Удачи в продажах!",
        "unknown": "Передал ваш вопрос владельцу — он скоро ответит.",
        "cheapest": (f" Выгоднее всего — {cheapest['label']}." if cheapest and cheapest["months"] > 1 else ""),
    }


def match_intents(text: str) -> list[str]:
    t = " " + re.sub(r"\s+", " ", text.lower().replace("ʻ", "'").replace("’", "'")) + " "
    found = []
    for intent, words in INTENTS:
        if any(_hit(w, t) for w in words):
            found.append(intent)
    return found


def _hit(word: str, text: str) -> bool:
    w = word.strip()
    if len(w) <= 3 and " " not in w:  # «да», «ha», «hi» — только отдельным словом
        return re.search(rf"(?<![\w']){re.escape(w)}(?![\w'])", text) is not None
    return word in text


def answer(text: str, facts: dict, mode: str = "bot") -> tuple[str, bool, bool]:
    lang = detect_lang(text)
    tx = _texts(facts, lang)
    intents = match_intents(text)
    if mode == "dm" and "refuse" in intents:
        return tx["refuse"], False, True
    intents = [i for i in intents if i != "refuse"]
    if "promo" in intents:  # «скидка на товар» — это акции в магазине, а не просьба скидки у нас
        intents = [i for i in intents if i != "discount"]
    if "setup" in intents:
        return tx["setup"], True, False
    if any(i in HANDOFF_INTENTS for i in intents):
        extra = tx["price"] if "price" in intents and "discount" not in intents else ""
        return (extra + " " + tx["handoff"]).strip(), True, False
    content = [i for i in intents if i not in ("greet", "thanks")]
    if not content:
        if "greet" in intents:
            return tx["greet"] + " " + tx["start"], False, False
        if "thanks" in intents:
            return tx["thanks"], False, False
        return tx["unknown"], True, False
    parts = [tx[i] for i in content[:2]]
    if "price" in content:
        parts[content.index("price") if content.index("price") < 2 else 0] += tx["cheapest"]
    if "greet" in intents:
        parts.insert(0, tx["greet"].split(".")[0] + ".")
    return " ".join(parts)[:3500], False, False
