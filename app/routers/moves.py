from fastapi import APIRouter
from pydantic import BaseModel
from datetime import datetime
from app.services.moves_service import list_moves
from app.core.firebase import db

router = APIRouter(prefix="/api/moves", tags=["moves"])


@router.get("")
async def get_moves():
    """GET /api/moves — 발레 용어 전체 조회 (알파벳 정렬)"""
    return list_moves()


# ============================================================================
# 🎭 FAVORITES (즐겨찾기)
# ============================================================================

class FavoriteCreate(BaseModel):
    """즐겨찾기 추가 요청 스키마"""
    french_term: str
    korean_name: str
    video_id: str
    video_title: str
    video_url: str
    channel: str
    source: str


@router.post("/favorites", tags=["favorites"])
async def add_favorite(fav: FavoriteCreate):
    """POST /api/favorites — 즐겨찾기에 영상 추가"""
    try:
        favorites_ref = db.collection("favorites")
        doc_id = f"{fav.french_term}_{fav.video_id}"

        favorites_ref.document(doc_id).set({
            "id": doc_id,
            "french_term": fav.french_term,
            "korean_name": fav.korean_name,
            "video_id": fav.video_id,
            "video_title": fav.video_title,
            "video_url": fav.video_url,
            "channel": fav.channel,
            "source": fav.source,
            "saved_at": datetime.utcnow().isoformat(),
        })

        return {
            "success": True,
            "id": doc_id,
            "message": f"'{fav.korean_name}' 영상이 즐겨찾기에 저장되었습니다."
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


@router.get("/favorites", tags=["favorites"])
async def get_favorites():
    """GET /api/favorites — 모든 즐겨찾기 목록 조회"""
    try:
        favorites_ref = db.collection("favorites")
        docs = favorites_ref.stream()

        favorites = []
        for doc in docs:
            fav_data = doc.to_dict()
            fav_data["id"] = doc.id
            favorites.append(fav_data)

        # 저장일 기준 내림차순 정렬
        favorites.sort(key=lambda x: x.get("saved_at", ""), reverse=True)

        return favorites
    except Exception as e:
        print(f"즐겨찾기 조회 오류: {e}")
        return []


@router.delete("/favorites/{fav_id}", tags=["favorites"])
async def delete_favorite(fav_id: str):
    """DELETE /api/favorites/{id} — 즐겨찾기 삭제"""
    try:
        db.collection("favorites").document(fav_id).delete()
        return {
            "success": True,
            "message": "즐겨찾기가 삭제되었습니다."
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }
