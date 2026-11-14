"""Локальный запуск бота в режиме polling: python -m backend.run_polling"""
import asyncio
import logging

from .bot.setup import get_dispatcher, setup_bot
from .config import settings
from .db import ensure_db
from .services import make_bot


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    if not settings.bot_token:
        raise SystemExit("Укажите BOT_TOKEN в .env")
    await ensure_db()
    print(await setup_bot(webhook=False))
    bot = make_bot()
    await get_dispatcher().start_polling(bot, allowed_updates=["message", "callback_query", "pre_checkout_query"])


if __name__ == "__main__":
    asyncio.run(main())
