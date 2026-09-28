"""GPT가 Function Calling으로 호출할 4개 도구. FastAPI와 독립적인 순수 함수로 먼저 작성한다."""
import math

import requests
from openai import OpenAI

from app.core.firebase import db

_client = OpenAI()
EMBEDDING_MODEL = "text-embedding-3-small"


def get_class_schedule() -> list[dict]:
    """규칙기반: class_schedule(수업 시간표) 컬렉션을 그대로 반환."""
    return [d.to_dict() for d in db.collection("class_schedule").stream()]


def get_seoul_weather() -> dict:
    """RAG 아님: 외부 API(Open-Meteo, 키 불필요) 직접호출. 실패 시 에러 메시지 반환."""
    try:
        resp = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={"latitude": 37.5665, "longitude": 126.9780, "current_weather": "true"},
            timeout=8,
        )
        resp.raise_for_status()
        w = resp.json()["current_weather"]
        return {"temperature_c": w["temperature"], "windspeed_kmh": w["windspeed"]}
    except Exception:
        return {"error": "날씨 정보를 가져오지 못했어요. 잠시 후 다시 시도해주세요."}


def get_moves_by_symptom(symptom_id: str) -> dict:
    """규칙기반 RAG: symptom_map(증상별 주의 동작표)에서 1:N 리스트 반환."""
    doc = db.collection("symptom_map").document(symptom_id).get()
    if not doc.exists:
        return {"symptom": None, "avoid_terms": []}
    return doc.to_dict()


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb)


def search_term_by_meaning(text: str, top_k: int = 3) -> list[dict]:
    """벡터기반 RAG: 질문을 임베딩해서 moves 컬렉션(핵심 25개, embedding 보유)과 코사인 유사도 비교."""
    query_emb = _client.embeddings.create(model=EMBEDDING_MODEL, input=[text]).data[0].embedding

    candidates = []
    for d in db.collection("moves").where("core", "==", True).stream():
        v = d.to_dict()
        score = _cosine(query_emb, v["embedding"])
        candidates.append({"term_fr": v["term_fr"], "term_kr": v["term_kr"], "def_en": v["def_en"], "score": score})

    candidates.sort(key=lambda x: x["score"], reverse=True)
    return candidates[:top_k]
