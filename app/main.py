# 이 파일이 앱의 "시작점"이다. uvicorn app.main:app 으로 이 app 객체를 실행한다.
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import ALLOWED_ORIGINS
from app.routers import chat, conversations, data

app = FastAPI(title="발레 AI 비서 API")

# CORS: 프론트(Vercel 등 다른 주소)에서 이 백엔드로 요청을 보낼 때 브라우저가 막지 않도록 허용 목록을 등록.
# ALLOWED_ORIGINS는 .env의 ALLOWED_ORIGINS 환경변수에서 읽어온다(하드코딩 금지).
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# routers/data.py에 정의된 /api/data 관련 5개 엔드포인트를 이 앱에 등록.
# 대화기록(conversations), 챗봇(chat) 라우터도 Day2에서 여기 한 줄씩만 추가하면 된다.
app.include_router(data.router)
app.include_router(conversations.router)
app.include_router(chat.router)

# 개발용: 루트("/")에서 frontend/index.html이 바로 열리도록 정적 파일 서빙.
# 배포 시엔 Vercel이 프론트를 따로 서빙하므로 이 마운트는 로컬 확인용이다.
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
