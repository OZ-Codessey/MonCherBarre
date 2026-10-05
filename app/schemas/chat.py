from typing import Optional

from pydantic import BaseModel


class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    # 브라우저가 모아 둔 활동(조회한 용어, 본 영상, 즐겨찾기). 비서 메모에 합쳐진다. 없어도 됨.
    activity: Optional[dict] = None


class ChatResponse(BaseModel):
    reply: str
    conversation_id: str
