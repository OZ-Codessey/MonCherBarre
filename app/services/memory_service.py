"""'나를 아는 비서'의 기억 문서 하나(assistant/memory)를 관리한다.

채팅할 때마다 이 문서 1장을 읽어(서버 메모리에 보관해 두므로 보통 읽기 0~1건) 프롬프트에 넣고,
답변이 끝나면 새 내용을 이어 붙여 1번만 쓴다. 대화방을 지워도 이 요약은 남아서 이전 추천을 계속 참고한다.

기억하는 것:
  notes            : 사용자가 말한 상태(통증 부위, 컨디션, 수업 변경 등) — 날짜와 함께
  recent           : 최근 질문과 답변의 요지 (최대 12개)
  history_summary  : 오래된 대화를 GPT로 요약해 이어 붙인 글 (600자 안팎)
  counts           : 자주 찾은 용어, 본 영상, 한 루틴, 문의한 증상 횟수
  favorites        : 즐겨찾기 용어
"""
import re
from datetime import datetime
from zoneinfo import ZoneInfo

from app.core.firebase import db

_KST = ZoneInfo("Asia/Seoul")
_ref = lambda: db.collection("assistant").document("memory")  # noqa: E731
_cache: dict = {"v": None, "at": 0.0}
CACHE_TTL = 300   # 초. 서버 메모리에 5분만 보관해, 문서를 직접 고쳤을 때 오래된 사본이 덮어쓰는 일을 막는다

MAX_NOTES = 20
MAX_RECENT = 12
FOLD_COUNT = 6          # 최근 목록이 넘치면 가장 오래된 N개를 요약 속으로 접어 넣는다


def _today() -> str:
    return datetime.now(_KST).strftime("%Y-%m-%d")


def _default() -> dict:
    return {
        "notes": [],
        "recent": [],
        "history_summary": "",
        "counts": {"terms": {}, "videos": {}, "routines": {}, "symptoms": {}},
        "favorites": [],
        "updated_at": None,
    }


def load() -> dict:
    """기억 문서를 돌려준다. 서버 메모리에 있으면 읽기 0건, 없으면 1건."""
    import time

    if _cache["v"] is None or time.time() - _cache["at"] > CACHE_TTL:
        snap = _ref().get()
        mem = _default()
        if snap.exists:
            data = snap.to_dict()
            for k, v in data.items():
                mem[k] = v
            for k in ("terms", "videos", "routines", "symptoms"):
                mem["counts"].setdefault(k, {})
        _cache["v"], _cache["at"] = mem, time.time()
    return _cache["v"]


def save(mem: dict) -> None:
    mem["updated_at"] = datetime.now(_KST).strftime("%Y-%m-%dT%H:%M:%S")
    _ref().set(mem)
    import time

    _cache["v"], _cache["at"] = mem, time.time()


def _bump(counter: dict, key: str, n: int = 1) -> None:
    if key:
        counter[key] = counter.get(key, 0) + n


def add_note(mem: dict, text: str) -> None:
    mem["notes"].append({"date": _today(), "text": text.strip()[:200]})
    mem["notes"] = mem["notes"][-MAX_NOTES:]


def add_symptom(mem: dict, symptom_id: str) -> None:
    _bump(mem["counts"]["symptoms"], symptom_id)


def merge_activity(mem: dict, activity: dict | None) -> None:
    """브라우저가 모아 둔 활동(조회한 용어, 본 영상, 즐겨찾기)을 합친다."""
    if not activity:
        return
    for t in (activity.get("terms") or [])[:50]:
        _bump(mem["counts"]["terms"], str(t)[:60])
    for v in (activity.get("videos") or [])[:50]:
        _bump(mem["counts"]["videos"], str(v)[:60])
    if activity.get("favorites") is not None:
        mem["favorites"] = [str(f)[:60] for f in activity["favorites"]][:40]


def note_routine(mem: dict, message: str) -> None:
    m = re.search(r"(\d+)\s*분\s*루틴", message)
    if m:
        _bump(mem["counts"]["routines"], m.group(1))


def _gist(text: str, n: int) -> str:
    t = re.sub(r"[|*#\-]+", " ", text)
    t = re.sub(r"\s+", " ", t).strip()
    return t[:n]


def add_exchange(mem: dict, question: str, reply: str) -> None:
    mem["recent"].append({"date": _today(), "q": _gist(question, 80), "a": _gist(reply, 160)})
    if len(mem["recent"]) > MAX_RECENT:
        old, mem["recent"] = mem["recent"][:FOLD_COUNT], mem["recent"][FOLD_COUNT:]
        mem["history_summary"] = _fold(mem.get("history_summary", ""), old)


def _fold(summary: str, old: list[dict]) -> str:
    """밀려난 대화들을 기존 요약에 합쳐 600자 안팎으로 다시 요약한다(GPT 1회). 실패하면 단순히 이어 붙인다."""
    lines = "\n".join(f"- {o['date']} 질문: {o['q']} / 답: {o['a']}" for o in old)
    try:
        from openai import OpenAI

        from app.core.config import OPENAI_MODEL

        resp = OpenAI().chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": "사용자와 발레 연습 비서의 이전 대화를 요약합니다. 사용자 상황(부상·통증, 선호, 진행 상황, 이미 추천한 내용) 중심으로 600자 이내 한국어로 씁니다."},
                {"role": "user", "content": f"기존 요약:\n{summary or '(없음)'}\n\n새로 합칠 대화:\n{lines}"},
            ],
            max_completion_tokens=900,
            reasoning_effort="low",
        )
        text = (resp.choices[0].message.content or "").strip()
        if text:
            return text[:900]
    except Exception:
        pass
    return (summary + " " + lines.replace("\n", " "))[-900:]


def _top(counter: dict, n: int = 5) -> str:
    items = sorted(counter.items(), key=lambda kv: kv[1], reverse=True)[:n]
    return ", ".join(f"{k}({v})" for k, v in items)


def render_prompt(mem: dict) -> str:
    """프롬프트에 끼워 넣을 '나의 상황 메모' 글."""
    parts = []
    if mem["notes"]:
        parts.append("상태 메모: " + " / ".join(f"{n['date']} {n['text']}" for n in mem["notes"][-8:]))
    if mem.get("history_summary"):
        parts.append("지난 대화 요약: " + mem["history_summary"])
    if mem["recent"]:
        parts.append("최근 대화: " + " / ".join(f"{r['date']} Q:{r['q']} → A:{r['a']}" for r in mem["recent"][-6:]))
    c = mem["counts"]
    if c["terms"]:
        parts.append("자주 찾은 용어: " + _top(c["terms"]))
    if c["videos"]:
        parts.append("자주 본 영상(용어): " + _top(c["videos"]))
    if c["routines"]:
        parts.append("주로 한 루틴(분): " + _top(c["routines"]))
    if c["symptoms"]:
        parts.append("문의한 증상: " + _top(c["symptoms"]))
    if mem["favorites"]:
        parts.append("즐겨찾기 용어: " + ", ".join(mem["favorites"][:15]))
    return "\n".join(parts) if parts else "(아직 쌓인 메모가 없음)"
