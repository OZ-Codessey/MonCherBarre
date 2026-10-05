# "진짜 일 하는 코드"가 여기 있다. routers/data.py는 그냥 창구일 뿐이고,
# 실제로 Firestore를 읽고/쓰고/계산하는 로직은 전부 이 파일에 모여 있다.
from fastapi import HTTPException

from app.core.firebase import db
from app.schemas.data import DataCreate, DataUpdate

COLLECTION = "data"  # Firestore 안의 "data"라는 이름의 컬렉션(=테이블)을 다룬다


# Firestore 문서(내부 형식)를 우리 API가 응답할 딱딱한 dict 형태로 바꿔주는 헬퍼
def _doc_to_out(doc) -> dict:
    d = doc.to_dict()
    return {"id": doc.id, "date": d["date"], "value": d["value"], "memo": d.get("memo")}


# Firestore 무료 한도(하루 읽기 5만 건)를 아끼기 위한 서버 메모리 캐시.
# 같은 조회(전체 또는 같은 기간)는 6시간 재사용하고, 기록을 추가·수정·삭제할 때만 즉시 비운다.
# (기록은 이 서버를 통해서만 바뀌므로 오래 보관해도 어긋나지 않는다)
_CACHE_TTL = 6 * 3600
_cache: dict = {"at": 0.0, "rows": None}
_range_cache: dict = {}
_summary_cache: dict = {"v": None}


def _invalidate_cache() -> None:
    _cache["rows"] = None
    _range_cache.clear()
    _summary_cache["v"] = None
    try:  # 저장된 요약 문서는 지워 두고, 다음 요약 요청 때 한 번 다시 계산한다
        db.collection("meta").document("summary").delete()
    except Exception:
        pass


# GET /api/data — 날짜순으로 전부 조회 (전체가 꼭 필요할 때만: 내보내기, 요약 재계산)
def list_data() -> list[dict]:
    import time

    if _cache["rows"] is not None and time.time() - _cache["at"] < _CACHE_TTL:
        return _cache["rows"]
    docs = db.collection(COLLECTION).order_by("date").stream()
    rows = [_doc_to_out(d) for d in docs]
    _cache["rows"], _cache["at"] = rows, time.time()
    return rows


# GET /api/data?start=&end= — 그 기간(양끝 포함, YYYY-MM-DD)의 기록만 읽는다 (읽기 = 기간 일수만큼)
def list_data_range(start: str | None, end: str | None) -> list[dict]:
    import time

    key = (start or "", end or "")
    hit = _range_cache.get(key)
    if hit and time.time() - hit[0] < _CACHE_TTL:
        return hit[1]
    q = db.collection(COLLECTION)
    if start:
        q = q.where("date", ">=", start)
    if end:
        q = q.where("date", "<=", end)
    rows = [_doc_to_out(d) for d in q.order_by("date").stream()]
    _range_cache[key] = (time.time(), rows)
    return rows


def recent_days(days: int = 14) -> list[dict]:
    """오늘 포함 최근 N일의 기록 (챗봇 맞춤 답변용, 읽기 N건 이하)."""
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo

    today = datetime.now(ZoneInfo("Asia/Seoul")).date()
    return list_data_range((today - timedelta(days=days - 1)).isoformat(), today.isoformat())


# POST /api/data — 날짜를 문서 ID로 사용(삭제/수정 시 날짜로 직접 접근 가능)
# 기존 365개 데이터는 건드리지 않음. 새로 추가되는 기록만 날짜 ID 적용.
def create_data(item: DataCreate) -> dict:
    date_str = item.date.isoformat()                          # "2025-01-01" 형식
    payload = {"date": date_str, "value": item.value, "memo": item.memo}
    ref = db.collection(COLLECTION).document(date_str)        # 날짜를 문서 ID로 지정
    ref.set(payload)
    _invalidate_cache()
    return {"id": date_str, **payload}


# PUT /api/data/{id} — 존재하는 문서만 부분 수정. 없으면 404.
def update_data(item_id: str, item: DataUpdate) -> dict:
    ref = db.collection(COLLECTION).document(item_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="data not found")
    # exclude_none=True: 사용자가 실제로 보낸 필드만 골라서 그 부분만 덮어씀
    payload = item.model_dump(exclude_none=True)
    if "date" in payload:
        payload["date"] = payload["date"].isoformat()
    ref.update(payload)
    _invalidate_cache()
    return _doc_to_out(ref.get())


# DELETE /api/data/{id} — 존재 확인 후 삭제. 없으면 404.
def delete_data(item_id: str) -> None:
    ref = db.collection(COLLECTION).document(item_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="data not found")
    ref.delete()
    _invalidate_cache()


# GET /api/data/statistics — 월별 평균 / 최다 연습 요일 / 연속 연습일 수
def get_statistics() -> dict:
    from collections import defaultdict
    from datetime import datetime, timedelta

    docs = list_data()
    if not docs:
        raise HTTPException(status_code=404, detail="no data available")

    DAY_NAMES = ["월", "화", "수", "목", "금", "토", "일"]
    monthly: dict = defaultdict(list)
    day_totals: dict = defaultdict(float)

    for d in docs:
        dt = datetime.strptime(d["date"], "%Y-%m-%d")
        monthly[dt.strftime("%Y-%m")].append(d["value"])
        day_totals[DAY_NAMES[dt.weekday()]] += d["value"]

    # 월별 평균 연습시간(분)
    monthly_avg = {k: round(sum(v) / len(v), 1) for k, v in sorted(monthly.items())}

    # 최다 연습 요일 (누적 시간 기준)
    best_day = max(day_totals, key=lambda x: day_totals[x]) if day_totals else "-"

    # 연속 연습일 수(streak): 가장 최근 날짜부터 역방향으로 연속된 날 카운트
    dates_sorted = sorted({d["date"] for d in docs}, reverse=True)
    streak = 0
    if dates_sorted:
        expected = datetime.strptime(dates_sorted[0], "%Y-%m-%d")
        for ds in dates_sorted:
            if datetime.strptime(ds, "%Y-%m-%d") == expected:
                streak += 1
                expected -= timedelta(days=1)
            else:
                break

    # 요일별 총 분
    day_totals_sorted = {day: round(day_totals.get(day, 0), 1) for day in DAY_NAMES}

    # 누적 연습 시간
    total_minutes = sum(d["value"] for d in docs)
    total_hours = round(total_minutes / 60, 1)

    # 부상별 운동 횟수 (symptom_map에서 강화운동 링크 개수)
    from app.core.firebase import db
    symptom_docs = list(db.collection("symptom_map").stream())
    symptom_exercise_counts = {}
    for doc in symptom_docs:
        data = doc.to_dict()
        symptom_exercise_counts[data.get("symptom", "기타")] = len(data.get("strengthening_exercises", []))

    return {
        "monthly_avg_min": monthly_avg,        # {"2025-01": 48.2, ...}
        "day_totals_min": day_totals_sorted,   # {"월": 240.5, "화": 180.2, ...}
        "best_day": best_day,                  # "수"
        "streak_days": streak,                 # 7
        "total_minutes": total_minutes,        # 15480
        "total_hours": total_hours,            # 258.0
        "symptom_exercise_counts": symptom_exercise_counts,  # {"발목": 3, "무릎": 2, ...}
    }


# GET /api/data/summary — 기간/개수/평균/최대/최소/트렌드 계산
# 트렌드 계산 방식: 전체 기간을 앞/뒤 절반으로 나눠서, 뒤쪽 절반 평균이 앞쪽보다
# 얼마나 늘었는지(%)를 본다. ±3% 안쪽이면 "유지"로 판단.
def _compute_summary() -> dict:
    docs = list_data()
    if not docs:
        raise HTTPException(status_code=404, detail="no data available")

    values = [d["value"] for d in docs]
    count = len(values)
    total = sum(values)
    average = total / count

    mid = count // 2
    first_half_avg = sum(values[:mid]) / mid if mid else average
    second_half_avg = sum(values[mid:]) / (count - mid)
    change_pct = ((second_half_avg - first_half_avg) / first_half_avg * 100) if first_half_avg else 0

    if change_pct > 3:
        trend = f"상승 (+{change_pct:.1f}%)"
    elif change_pct < -3:
        trend = f"하락 ({change_pct:.1f}%)"
    else:
        trend = f"유지 ({change_pct:+.1f}%)"

    return {
        "period": f"{docs[0]['date']} ~ {docs[-1]['date']}",
        "count": count,
        "metrics": {
            "total": round(total, 2),
            "average": round(average, 2),
            "max": max(values),
            "min": min(values),
        },
        "trend": trend,
    }


# GET /api/data/summary — 요약은 Firestore 문서 1장(meta/summary)에 저장해 두고 읽기 1번으로 돌려준다.
# 문서가 없을 때(처음이거나 기록이 바뀐 직후)만 전체를 한 번 읽어 다시 계산해서 저장한다.
def get_summary() -> dict:
    if _summary_cache["v"] is not None:
        return _summary_cache["v"]
    ref = db.collection("meta").document("summary")
    snap = ref.get()
    if snap.exists:
        result = snap.to_dict()
    else:
        result = _compute_summary()
        ref.set(result)
    _summary_cache["v"] = result
    return result
