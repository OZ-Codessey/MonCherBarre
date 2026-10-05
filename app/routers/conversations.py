from fastapi import APIRouter

from app.schemas.conversation import ConversationCreate, ConversationOut
from app.services import conversation_service

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


@router.get("", response_model=list[ConversationOut])
def list_conversations(days: int = 7, start: str | None = None, end: str | None = None):
    # 기본: 최근 7일. start/end(YYYY-MM-DD)를 주면 그 기간만 조회 → 기간에 해당하는 방 개수만큼만 읽는다
    return conversation_service.list_conversations(days=days, start=start, end=end)


@router.post("", response_model=ConversationOut, status_code=201)
def create_conversation(item: ConversationCreate):
    return conversation_service.create_conversation(item)


@router.get("/{conv_id}", response_model=ConversationOut)
def get_conversation(conv_id: str):
    return conversation_service.get_conversation(conv_id)


@router.delete("/{conv_id}", status_code=204)
def delete_conversation(conv_id: str):
    conversation_service.delete_conversation(conv_id)
