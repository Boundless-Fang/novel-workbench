import asyncio
import os
import socket
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from api import router
from api.config import CODE_DIR
from core._core_config import load_project_env

if os.name == "nt":
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    except AttributeError:
        pass

load_project_env()


@asynccontextmanager
async def lifespan(_: FastAPI):
    print("\n" + "=" * 60)
    print("[System] StyleSync-Novel service started successfully.")
    print("[Access] Open the app in your browser:")
    print(" -> Local: http://127.0.0.1:8000")

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        lan_ip = sock.getsockname()[0]
        sock.close()
        print(f" -> LAN: http://{lan_ip}:8000")
    except Exception:
        pass

    print("=" * 60 + "\n")
    yield


app = FastAPI(title="StyleSync-Novel", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.middleware("http")
async def no_cache_static(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/static") or request.url.path == "/":
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


app.mount("/static", StaticFiles(directory=os.path.join(CODE_DIR, "frontend")), name="static")


@app.get("/")
async def serve_frontend():
    html_path = os.path.join(CODE_DIR, "frontend", "index.html")
    return FileResponse(html_path)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
