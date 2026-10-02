from app.core.firebase import db

COLLECTION = "moves"


def list_moves() -> list[dict]:
    """Firestore moves 컬렉션에서 모든 용어 조회 (알파벳 정렬)"""
    docs = db.collection(COLLECTION).order_by("french_term").stream()
    moves = []
    for doc in docs:
        d = doc.to_dict()
        moves.append({
            "id": doc.id,
            "french_term": d.get("french_term", ""),
            "korean_name": d.get("korean_name", ""),
            "pronunciation": d.get("pronunciation", ""),
            "description": d.get("description", ""),
            "video_url": d.get("video_url", ""),  # Royal Ballet YouTube URL
        })
    return moves
