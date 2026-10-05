"""대화 문서 정리 (1회성): 빈 대화방·날씨 질문뿐인 방을 지우고, 남는 방에 updated_at 필드를 채운다.

기본은 점검만 한다(dry-run, 읽기만). 실제 삭제·쓰기는 --apply 를 붙였을 때만 한다.
  python scripts/migrate_conversations.py          # 대상 목록만 보기
  python scripts/migrate_conversations.py --apply  # 삭제 + updated_at 채우기
"""
import sys
from zoneinfo import ZoneInfo

sys.path.insert(0, ".")
from app.core.firebase import db  # noqa: E402

WEATHER_WORDS = ("날씨", "기온", "몇도", "몇 도", "비 와", "비와", "비 오", "비오", "눈 와", "눈와", "바람", "우산", "weather")
KST = ZoneInfo("Asia/Seoul")


def is_weather_only(messages: list[dict]) -> bool:
    users = [m.get("content", "") for m in messages if m.get("role") == "user"]
    return bool(users) and all(any(w in u for w in WEATHER_WORDS) for u in users)


def main(apply: bool) -> None:
    docs = list(db.collection("conversations").stream())  # 읽기: 대화 문서 수만큼
    empty, weather, keep = [], [], []
    for d in docs:
        x = d.to_dict()
        msgs = x.get("messages", [])
        if not msgs:
            empty.append(d)
        elif is_weather_only(msgs):
            weather.append(d)
        else:
            keep.append(d)
    print(f"전체 {len(docs)}개 → 빈 방 {len(empty)}개, 날씨 질문뿐인 방 {len(weather)}개, 남길 방 {len(keep)}개")
    print("\n[날씨 질문뿐인 방]")
    for d in weather:
        print(" -", d.id[:6], (d.to_dict().get("title") or "")[:30], f"({len(d.to_dict().get('messages', []))}개 메시지)")
    no_stamp = [d for d in keep if not d.to_dict().get("updated_at")]
    print(f"\n남길 방 중 updated_at 없는 것: {len(no_stamp)}개")
    if not apply:
        print("\n(점검만 했습니다. 실제 반영은 --apply)")
        return
    for d in empty + weather:
        d.reference.delete()
    for d in no_stamp:
        ts = d.update_time.astimezone(KST).strftime("%Y-%m-%dT%H:%M:%S")
        d.reference.update({"updated_at": ts})
    print(f"삭제 {len(empty) + len(weather)}개, updated_at 기록 {len(no_stamp)}개 완료")


if __name__ == "__main__":
    main("--apply" in sys.argv)
