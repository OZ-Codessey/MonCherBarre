from typing import Optional

from pydantic import BaseModel, Field


class Message(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ConversationOut(BaseModel):
    id: str
    title: str
    messages: list[Message] = []
    updated_at: Optional[str] = None


class ConversationCreate(BaseModel):
    title: Optional[str] = Field(default="새 대화", max_length=100)
