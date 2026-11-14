from aiogram import Dispatcher
from aiogram.types import BotCommand, MenuButtonWebApp, WebAppInfo

from ..config import settings
from ..services import make_bot
from .storage import DBStorage

_dp: Dispatcher | None = None


def get_dispatcher() -> Dispatcher:
    global _dp
    if _dp is None:
        from .handlers import router

        _dp = Dispatcher(storage=DBStorage())
        _dp.include_router(router)
    return _dp


COMMANDS = [
    BotCommand(command="start", description="Главное меню"),
    BotCommand(command="myshops", description="Мои сайты"),
    BotCommand(command="login", description="Вход в кабинет с компьютера"),
    BotCommand(command="help", description="Помощь"),
]


async def setup_bot(webhook: bool = True) -> dict:
    """Регистрирует webhook (для Vercel), команды и кнопку меню Web App."""
    if not settings.bot_token:
        return {"ok": False, "error": "BOT_TOKEN не задан"}
    bot = make_bot()
    result: dict = {"ok": True}
    try:
        me = await bot.get_me()
        result["bot"] = me.username
        await bot.set_my_commands(COMMANDS)
        if settings.is_https:
            await bot.set_chat_menu_button(menu_button=MenuButtonWebApp(
                text="Мои сайты", web_app=WebAppInfo(url=f"{settings.webapp_url}/panel")))
            result["menu_button"] = True
        if webhook:
            if not settings.is_https:
                result["webhook"] = "skipped: WEBAPP_URL должен быть https"
            else:
                await bot.set_webhook(
                    f"{settings.webapp_url}/api/bot/webhook",
                    secret_token=settings.webhook_secret or None,
                    allowed_updates=["message", "callback_query", "pre_checkout_query"],
                    drop_pending_updates=False,
                )
                result["webhook"] = f"{settings.webapp_url}/api/bot/webhook"
        else:
            await bot.delete_webhook(drop_pending_updates=False)
            result["webhook"] = "deleted (polling)"
    finally:
        await bot.session.close()
    return result
