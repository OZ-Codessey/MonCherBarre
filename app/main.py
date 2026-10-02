# 이 파일이 앱의 "시작점"이다. uvicorn app.main:app 으로 이 app 객체를 실행한다.
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import ALLOWED_ORIGINS
from app.routers import chat, conversations, data, moves

app = FastAPI(title="발레 AI 비서 API")


@app.get("/")
async def root():
    """루트 경로 — API 서버임을 나타냄."""
    return {"status": "ok"}


@app.get("/health")
async def health():
    """배포 환경의 헬스 체크 엔드포인트(Render 등에서 앱 상태 확인용)."""
    return {"status": "ok"}

# CORS: 프론트(Vercel 등 다른 주소)에서 이 백엔드로 요청을 보낼 때 브라우저가 막지 않도록 허용 목록을 등록.
# ALLOWED_ORIGINS는 .env의 ALLOWED_ORIGINS 환경변수에서 읽어온다(하드코딩 금지).
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
app.include_router(data.router)
app.include_router(conversations.router)
app.include_router(chat.router)
app.include_router(moves.router)
