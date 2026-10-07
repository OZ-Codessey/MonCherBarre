"""발레 용어 96개를 Firestore 없이 파일에서 읽는다.

원본은 프론트엔드가 쓰는 frontend/data/moves_96.json 하나뿐이다(복사본을 만들지 않음).
백엔드는 같은 저장소 안의 그 파일을 디스크에서 직접 읽으므로 Firestore 읽기가 0건이다.
"""
import json
import random
from pathlib import Path
from urllib.parse import quote_plus

ROOT = Path(__file__).resolve().parents[2]
MOVES_PATH = ROOT / "frontend" / "data" / "moves_96.json"
SYMPTOM_PATH = ROOT / "frontend" / "data" / "symptom_map.json"
EXERCISE_PATH = ROOT / "app" / "data" / "exercises.json"
ROUTINE_PATH = ROOT / "frontend" / "data" / "routines.json"
MUSIC_PATH = ROOT / "frontend" / "data" / "music_mapping.json"

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


def _mmss(sec: int) -> str:
    return f"{int(sec) // 60}:{int(sec) % 60:02d}"


def routine_info(minutes: int) -> dict:
    """사용자가 만든 루틴 구성표(routines.json)와 곡별 동작표(music_mapping.json)를 그대로 돌려준다.

    구간은 매트/바/센터이고 각 구간은 곡 순서(music_sequence)로 이루어진다. 곡마다 맞춰 둔 동작(movements)은
    용어 번호이므로 사전(moves_96.json)에서 한글 설명·영상 링크를 붙여 준다. 파일에서 읽으므로 Firestore 읽기 0건.
    """
    routines = json.loads(ROUTINE_PATH.read_text(encoding="utf-8"))
    music = json.loads(MUSIC_PATH.read_text(encoding="utf-8"))
    key = str(minutes)
    if key not in routines:
        return {"error": "루틴은 10, 20, 30, 60분만 있어요.", "available_minutes": sorted(int(k) for k in routines)}
    r = routines[key]
    by_no = {str(m["no"]): m for m in load_moves()}
    n_sec = len(r["sections"])
    sections = []
    for sec in r["sections"]:
        tracks = []
        for i, mk in enumerate(sec["music_sequence"], 1):
            mu = music[mk]
            moves = []
            for no in mu.get("movements", []):
                m = by_no.get(str(no))
                if m:
                    c = move_card(m)
                    c["description_ko"] = c["description_ko"][:90]
                    moves.append(c)
            random.shuffle(moves)   # 호출할 때마다 순서를 섞어, 그날 상태에 맞는 동작을 매번 다르게 고를 수 있게 함
            tracks.append({
                "order": i,
                "music_ko": mu["name"],
                "music_fr": mu.get("name_fr", ""),
                "duration": _mmss(mu["duration_sec"]),     # 재생기에 표시되는 곡 길이와 같은 값(mm:ss). 그대로 써야 함
                "meter": mu.get("meter", ""),
                "matched_moves": moves,                    # 재생기에 명시된 이 곡의 동작들 (이 안에서만 고른다)
            })
        sections.append({
            "area": sec["area"],                                   # 매트 / 바 / 센터
            "label_minutes": r["duration_min"] // n_sec,           # 구간 이름용(10분=매트 10 / 20분=바 10+센터 10 / 60분=각 20). 시간 열에는 쓰지 않는다
            "total_duration": _mmss(sec["total_duration"]),        # 구간 전체 재생 시간(mm:ss)
            "tracks": tracks,
        })
    extras = _mat_extras(int(key))
    for sec in sections:
        if sec["area"] == "매트" and extras:
            sec["extra_exercises"] = extras["items"]
            sec["extra_focus"] = extras["focus"]
    return {"routine_minutes": r["duration_min"], "areas": [x["area"] for x in sections], "sections": sections}


def _mat_extras(minutes: int) -> dict | None:
    """매트 구간에 더하는 운동. 10분 루틴 = 이완·스트레칭 위주, 60분 루틴의 매트 20분 = 복근·장요근·척추기립근 강화."""
    data = json.loads(EXERCISE_PATH.read_text(encoding="utf-8"))
    if minutes == 10:
        return {"focus": "이완·스트레칭 위주(햄스트링 늘리기, 몸을 따뜻하고 부드럽게 풀기)", "items": data["warmup_stretches"]}
    if minutes == 60:
        want = {"허리 강화 - 코어 안정화": "복근", "장요근 스트레칭 및 강화": "장요근", "척추기립근 강화 운동": "척추기립근"}
        items = [{**e, "target": want[e["name"]]} for e in data["exercises"] if e["name"] in want]
        return {"focus": "복근·장요근·척추기립근 강화 운동을 매트 20분에 포함", "items": items}
    return None
