# Pydantic 모델 = "이 요청 데이터는 이런 모양이어야 한다"는 규칙서.
# 예: value에 문자열("칠십")을 보내면 FastAPI가 자동으로 422 에러를 돌려준다(우리가 따로 검증 코드를 안 짜도 됨).
from datetime import date as date_type
from typing import Optional

from pydantic import BaseModel


# POST /api/data 요청 바디의 규칙 — date/value는 필수, memo는 없어도 됨(기본값 None)
class DataCreate(BaseModel):
    date: date_type
    value: float
    memo: Optional[str] = None


# PUT /api/data/{id} 요청 바디의 규칙 — 전부 선택값(보내는 필드만 수정)
class DataUpdate(BaseModel):
    date: Optional[date_type] = None
    value: Optional[float] = None
    memo: Optional[str] = None


# 응답으로 내려줄 때의 모양 — Firestore 문서 id를 포함해서 돌려준다
class DataOut(BaseModel):
    id: str
    date: str
    value: float
    memo: Optional[str] = None


# GET /api/data/summary 응답 모양 — MISSION 교안 8번 Test Case의 형식과 동일
class DataSummary(BaseModel):
    period: str
    count: int
    metrics: dict
    trend: str
