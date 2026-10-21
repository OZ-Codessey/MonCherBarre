from typing import Optional

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)   # 빈 질문·너무 긴 질문은 422 (GPT 비용 보호)
    conversation_id: Optional[str] = None
    # 브라우저가 모아 둔 활동(조회한 용어, 본 영상, 즐겨찾기). 비서 메모에 합쳐진다. 없어도 됨.
    activity: Optional[dict] = None
    # 브라우저가 날씨 칩을 위해 받아 둔 서울 날씨(최근 20분 이내). 서버가 날씨 서비스에 닿지 못할 때 대신 쓴다. 없어도 됨.
    weather: Optional[dict] = None


class ChatResponse(BaseModel):
    reply: str
    conversation_id: str
