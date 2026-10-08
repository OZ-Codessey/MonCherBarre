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
AREA_PATH = ROOT / "frontend" / "data" / "area_moves.json"

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
    area_rules = json.loads(AREA_PATH.read_text(encoding="utf-8"))
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
            rule = area_rules.get(sec["area"], {})
            if "floor_pool" in rule:
                # 매트(마루 바닥): 발레 동작이 아니라 몸을 풀고 코어를 쓰는 바닥 운동만. 곡 순서 i → pool[2i], pool[2i+1] (순환)
                moves = _floor_picks(rule["floor_pool"], i - 1, 2)
            else:
                # 곡에 맞춰 둔 동작 중, 이 구간(바/센터)에 어울리는 것만 고른다 (area_moves.json)
                allowed = rule.get("allowed_terms", "all")
                cands = [by_no[str(no)] for no in mu.get("movements", []) if str(no) in by_no]
                if allowed != "all":
                    cands = [m for m in cands if m["term"] in allowed]
                    if not cands:   # 이 곡에 어울리는 동작이 없으면 구간별 대체 동작
                        cands = [m for t in rule.get("fallback", {}).get(mk, []) if (m := find_move(t))]
                moves = []
                for m in cands:
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
    return {"routine_minutes": r["duration_min"], "areas": [x["area"] for x in sections], "sections": sections}


def _floor_exercise_cards() -> dict:
    """exercises.json의 강화 운동·스트레칭을 이름으로 찾기 쉽게 모은다 (매트 운동용)."""
    data = json.loads(EXERCISE_PATH.read_text(encoding="utf-8"))
    return {e["name"]: e for e in data["exercises"] + data["warmup_stretches"]}


def _floor_picks(pool: list[str], track_idx: int, per_track: int = 2) -> list[dict]:
    cards = _floor_exercise_cards()
    out = []
    for k in range(per_track):
        name = pool[(track_idx * per_track + k) % len(pool)]
        e = cards.get(name)
        if not e:
            continue
        out.append({
            "term": name,
            "korean_name": "",
            "description_ko": e.get("how_to", "")[:90],
            "video_url": None,   # 운동 영상은 로열발레단 영상이 아니므로 R이 아니라 지구본 하나로 연결
            "search_url": e.get("video_url") or e.get("search_url") or youtube_search_url(name),
            "equipment": e.get("equipment", ""),
            "caution": e.get("caution", ""),
        })
    return out
