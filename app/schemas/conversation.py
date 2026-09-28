from typing import Optional

from pydantic import BaseModel


class Message(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ConversationOut(BaseModel):
    id: str
    title: str
    messages: list[Message] = []


class ConversationCreate(BaseModel):
    title: Optional[str] = "새 대화"
