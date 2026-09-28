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


# GET /api/data — 날짜순으로 전부 조회
def list_data() -> list[dict]:
    docs = db.collection(COLLECTION).order_by("date").stream()
    return [_doc_to_out(d) for d in docs]


# POST /api/data — 새 문서를 추가(Firestore가 랜덤 id를 자동 발급)
def create_data(item: DataCreate) -> dict:
    payload = {"date": item.date.isoformat(), "value": item.value, "memo": item.memo}
    ref = db.collection(COLLECTION).document()
    ref.set(payload)
    return {"id": ref.id, **payload}


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
    return _doc_to_out(ref.get())


# DELETE /api/data/{id} — 존재 확인 후 삭제. 없으면 404.
def delete_data(item_id: str) -> None:
    ref = db.collection(COLLECTION).document(item_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="data not found")
    ref.delete()


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

    return {
        "monthly_avg_min": monthly_avg,   # {"2025-01": 48.2, ...}
        "best_day": best_day,             # "수"
        "streak_days": streak,            # 7
    }


# GET /api/data/summary — 기간/개수/평균/최대/최소/트렌드 계산
# 트렌드 계산 방식: 전체 기간을 앞/뒤 절반으로 나눠서, 뒤쪽 절반 평균이 앞쪽보다
# 얼마나 늘었는지(%)를 본다. ±3% 안쪽이면 "유지"로 판단.
def get_summary() -> dict:
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
