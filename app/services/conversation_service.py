from fastapi import HTTPException

from app.core.firebase import db
from app.schemas.conversation import ConversationCreate

COLLECTION = "conversations"


# 대화 목록은 "기간"으로 조회한다(기본 최근 7일). 기간에 해당하는 방 개수만큼만 Firestore를 읽는다.
# 같은 조회는 서버 메모리에 보관해 재사용하고, 대화 생성·삭제·메시지 추가 시 비운다.
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

_LIST_TTL = 6 * 3600
_list_cache: dict = {}
_KST = ZoneInfo("Asia/Seoul")


def _now_iso() -> str:
    return datetime.now(_KST).strftime("%Y-%m-%dT%H:%M:%S")


def _invalidate_list() -> None:
    _list_cache.clear()


def list_conversations(days: int = 7, start: str | None = None, end: str | None = None) -> list[dict]:
    """최근 N일 또는 start~end(YYYY-MM-DD, 양끝 포함) 사이에 갱신된 대화를 최신순으로 돌려준다."""
    import time

    if start or end:
        lo = f"{start}T00:00:00" if start else "0000-01-01T00:00:00"
        hi = f"{end}T23:59:59" if end else "9999-12-31T23:59:59"
    else:
        lo = (datetime.now(_KST) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%S")
        hi = "9999-12-31T23:59:59"
    key = (lo, hi)
    hit = _list_cache.get(key)
    if hit and time.time() - hit[0] < _LIST_TTL:
        return hit[1]
    q = db.collection(COLLECTION).where("updated_at", ">=", lo).where("updated_at", "<=", hi).order_by("updated_at", direction="DESCENDING")
    rows = []
    for d in q.stream():
        x = d.to_dict()
        rows.append({"id": d.id, "title": x.get("title", ""), "messages": x.get("messages", []), "updated_at": x.get("updated_at")})
    _list_cache[key] = (time.time(), rows)
    return rows


def create_conversation(item: ConversationCreate) -> dict:
    payload = {"title": item.title, "messages": [], "updated_at": _now_iso()}
    ref = db.collection(COLLECTION).document()
    ref.set(payload)
    _invalidate_list()
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
    _invalidate_list()


def append_message(conv_id: str, role: str, content: str) -> None:
    ref = db.collection(COLLECTION).document(conv_id)
    doc = ref.get()
    messages = doc.to_dict().get("messages", []) if doc.exists else []
    messages.append({"role": role, "content": content})
    ref.set({"title": doc.to_dict().get("title", "새 대화") if doc.exists else content[:15], "messages": messages, "updated_at": _now_iso()})
    _invalidate_list()


def save_exchange(conv_id: str | None, title: str, user_text: str, reply: str) -> str:
    """질문·답변 한 쌍을 한 번에 저장. 새 대화(conv_id 없음)는 쓰기 1번(읽기 0), 기존 대화는 읽기 1 + 쓰기 1.
    GPT 답변이 성공한 뒤에만 호출하므로, 빈 대화방(메시지 0개)이 만들어지지 않는다."""
    pair = [{"role": "user", "content": user_text}, {"role": "assistant", "content": reply}]
    if not conv_id:
        ref = db.collection(COLLECTION).document()
        ref.set({"title": title, "messages": pair, "updated_at": _now_iso()})
    else:
        ref = db.collection(COLLECTION).document(conv_id)
        doc = ref.get()
        d = doc.to_dict() if doc.exists else {}
        ref.set({"title": d.get("title", title), "messages": d.get("messages", []) + pair, "updated_at": _now_iso()})
    _invalidate_list()
    return ref.id
