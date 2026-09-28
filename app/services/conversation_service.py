from fastapi import HTTPException

from app.core.firebase import db
from app.schemas.conversation import ConversationCreate

COLLECTION = "conversations"


def list_conversations() -> list[dict]:
    docs = db.collection(COLLECTION).stream()
    return [{"id": d.id, "title": d.to_dict().get("title", ""), "messages": d.to_dict().get("messages", [])} for d in docs]


def create_conversation(item: ConversationCreate) -> dict:
    payload = {"title": item.title, "messages": []}
    ref = db.collection(COLLECTION).document()
    ref.set(payload)
    return {"id": ref.id, **payload}


def get_conversation(conv_id: str) -> dict:
    doc = db.collection(COLLECTION).document(conv_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="conversation not found")
    d = doc.to_dict()
    return {"id": doc.id, "title": d.get("title", ""), "messages": d.get("messages", [])}


def delete_conversation(conv_id: str) -> None:
    ref = db.collection(COLLECTION).document(conv_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="conversation not found")
    ref.delete()


def append_message(conv_id: str, role: str, content: str) -> None:
    ref = db.collection(COLLECTION).document(conv_id)
    doc = ref.get()
    messages = doc.to_dict().get("messages", []) if doc.exists else []
    messages.append({"role": role, "content": content})
    ref.set({"title": doc.to_dict().get("title", "새 대화") if doc.exists else content[:15], "messages": messages})
