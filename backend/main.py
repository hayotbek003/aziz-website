import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .routers import admin, auth, bot, me, public, subscriptions

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="AZIZ Website API", version="1.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json")

for r in (public.router, auth.router, me.router, admin.router, bot.router, subscriptions.router):
    app.include_router(r)


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(x) for x in first.get("loc", [])[1:])
    return JSONResponse(status_code=422, content={"detail": f"Проверьте поле {field}: {first.get('msg', '')}"})
