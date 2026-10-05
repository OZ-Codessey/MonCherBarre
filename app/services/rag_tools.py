"""GPT가 Function Calling으로 호출할 도구(날씨·시간표·증상별 운동·용어 검색·영상 링크). FastAPI와 독립적인 순수 함수.

Firestore 읽기를 줄이기 위해: 용어 사전·증상표·강화 운동·용어 색인은 모두 저장소의 파일에서 읽는다(읽기 0건).
수업 시간표만 사용자가 바꿀 수 있어 Firestore에 두되, 서버 메모리에 6시간 보관한다.
"""
import json
import math
import time

import requests
from openai import OpenAI

from app.core.firebase import db
from app.services import moves_local
from app.services.embedding_model import EMBEDDING_MODEL

_client = OpenAI()

_schedule_cache: dict = {"at": 0.0, "rows": None}


def get_class_schedule() -> list[dict]:
    """규칙기반: class_schedule(수업 시간표) 컬렉션. 서버 메모리에 6시간 보관해 읽기를 아낀다."""
    if _schedule_cache["rows"] is not None and time.time() - _schedule_cache["at"] < 6 * 3600:
        return _schedule_cache["rows"]
    rows = [d.to_dict() for d in db.collection("class_schedule").stream()]
    _schedule_cache["rows"], _schedule_cache["at"] = rows, time.time()
    return rows


def _wmo_ko(code: int) -> str:
    """WMO 날씨 코드를 한글 설명으로."""
    if code in (0, 1):
        return "맑음"
    if code == 2:
        return "구름 조금"
    if code == 3:
        return "흐림"
    if code in (45, 48):
        return "안개"
    if 51 <= code <= 57:
        return "이슬비"
    if 61 <= code <= 67 or 80 <= code <= 82:
        return "비"
    if 71 <= code <= 77 or code in (85, 86):
        return "눈"
    if code >= 95:
        return "뇌우"
    return "흐림"


def get_seoul_weather() -> dict:
    """RAG 아님: 외부 API(Open-Meteo, 키 불필요) 직접호출. 기온·체감·풍속·날씨(비/눈 포함)·강수량·오늘 강수확률을 돌려준다.
    Firestore를 읽지 않는다. 실패 시 에러 메시지 반환."""
    try:
        resp = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": 37.5665,
                "longitude": 126.9780,
                "current": "temperature_2m,apparent_temperature,precipitation,rain,snowfall,weather_code,wind_speed_10m,is_day",
                "daily": "precipitation_probability_max,precipitation_sum,temperature_2m_max,temperature_2m_min",
                "timezone": "Asia/Seoul",
                "forecast_days": 1,
            },
            timeout=8,
        )
        resp.raise_for_status()
        j = resp.json()
        c, d = j["current"], j["daily"]
        return {
            "condition": _wmo_ko(c["weather_code"]),
            "temperature_c": c["temperature_2m"],
            "feels_like_c": c["apparent_temperature"],
            "windspeed_kmh": c["wind_speed_10m"],
            "raining_now": (c.get("rain") or 0) > 0 or (c.get("precipitation") or 0) > 0,
            "snowing_now": (c.get("snowfall") or 0) > 0,
            "precipitation_mm_now": c.get("precipitation"),
            "today_rain_probability_pct": d["precipitation_probability_max"][0],
            "today_precipitation_mm": d["precipitation_sum"][0],
            "today_high_c": d["temperature_2m_max"][0],
            "today_low_c": d["temperature_2m_min"][0],
        }
    except Exception:
        return {"error": "날씨 정보를 가져오지 못했어요. 잠시 후 다시 시도해주세요."}


def get_moves_by_symptom(symptom_id: str) -> dict:
    """규칙기반 RAG: 증상별 주의 동작(symptom_map.json)과 하드코딩한 강화 운동(준비물·시간·방법·주의·영상 링크). 파일에서 읽는다."""
    return moves_local.symptom_info(symptom_id)


_index: dict | None = None


def _load_index() -> dict:
    """용어 96개의 색인(숫자)을 한 번만 읽어 메모리에 올려 둔다."""
    global _index
    if _index is None:
        _index = json.loads((moves_local.ROOT / "app" / "data" / "moves_embeddings.json").read_text(encoding="utf-8"))
    return _index


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb)


def search_term_by_meaning(text: str, top_k: int = 6) -> list[dict]:
    """벡터기반 RAG: 질문을 임베딩해서 96개 용어 색인과 코사인 유사도를 비교, 가까운 순으로 top_k개를 돌려준다.
    결과에는 한글 설명과 영상 링크(없으면 유튜브 검색 링크)가 붙는다. Firestore 읽기 0건."""
    query_emb = _client.embeddings.create(model=EMBEDDING_MODEL, input=[text]).data[0].embedding
    by_no = {str(m["no"]): m for m in moves_local.load_moves()}
    scored = []
    for item in _load_index()["items"]:
        m = by_no.get(str(item["no"]))
        if m:
            scored.append((_cosine(query_emb, item["vec"]), m))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [{**moves_local.move_card(m), "score": round(sc, 3)} for sc, m in scored[:top_k]]


def get_move_links(terms: list[str]) -> list[dict]:
    """추천한 동작 이름(프랑스어 또는 한글)들의 영상 링크를 찾는다. 사전에 영상이 있으면 그 링크, 없으면 유튜브 검색 링크."""
    return moves_local.move_links(terms)
