"""발레 용어 96개를 Firestore 없이 파일에서 읽는다.

원본은 프론트엔드가 쓰는 frontend/data/moves_96.json 하나뿐이다(복사본을 만들지 않음).
백엔드는 같은 저장소 안의 그 파일을 디스크에서 직접 읽으므로 Firestore 읽기가 0건이다.
"""
import json
from pathlib import Path
from urllib.parse import quote_plus

ROOT = Path(__file__).resolve().parents[2]
MOVES_PATH = ROOT / "frontend" / "data" / "moves_96.json"
SYMPTOM_PATH = ROOT / "frontend" / "data" / "symptom_map.json"
EXERCISE_PATH = ROOT / "app" / "data" / "exercises.json"

_moves: list[dict] | None = None


def load_moves() -> list[dict]:
    global _moves
    if _moves is None:
        _moves = json.loads(MOVES_PATH.read_text(encoding="utf-8"))
    return _moves


def youtube_search_url(term: str) -> str:
    return "https://www.youtube.com/results?search_query=" + quote_plus(f"{term} ballet")


def move_card(m: dict) -> dict:
    """용어 하나를 챗봇이 쓰기 좋은 모양으로. 영상이 있으면 그 링크, 없으면 유튜브 검색 링크."""
    return {
        "term": m["term"],
        "korean_name": m.get("korean_name", ""),
        "description_ko": m.get("description_ko", ""),
        "video_url": m.get("video_url") or None,
        "search_url": youtube_search_url(m["term"]),
    }


def find_move(query: str) -> dict | None:
    """프랑스어 용어 또는 한글 이름으로 찾기 (대소문자·쉼표 무시, 부분 일치)."""
    q = query.strip().lower()
    if not q:
        return None
    best = None
    for m in load_moves():
        names = [m["term"].lower(), (m.get("korean_name") or "").lower()]
        if q in names:
            return m
        if best is None and any(q and (q in n or n in q) and len(n) >= 3 for n in names if n):
            best = m
    return best


def move_links(terms: list[str]) -> list[dict]:
    out = []
    for t in terms:
        m = find_move(t)
        if m:
            out.append(move_card(m))
        else:
            out.append({"term": t, "korean_name": "", "description_ko": "", "video_url": None, "search_url": youtube_search_url(t)})
    return out


def symptom_info(symptom_id: str) -> dict:
    """증상별 주의 동작(symptom_map.json) + 하드코딩한 강화 운동(exercises.json)."""
    sm = {s["id"]: s for s in json.loads(SYMPTOM_PATH.read_text(encoding="utf-8"))}
    s = sm.get(symptom_id)
    if not s:
        return {"symptom": None, "avoid_terms": [], "exercises": []}
    ex = json.loads(EXERCISE_PATH.read_text(encoding="utf-8"))["exercises"]
    avoid = [move_card(m) if (m := find_move(t)) else {"term": t} for t in s.get("avoid_terms", [])]
    return {
        "symptom": s["symptom"],
        "memo": s.get("memo", ""),
        "avoid_terms": avoid,
        "strengthening_exercises": [e for e in ex if e["symptom_id"] == symptom_id],
    }
