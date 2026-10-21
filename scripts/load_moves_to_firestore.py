#!/usr/bin/env python3
"""
96개 발레 용어를 CSV에서 읽어서 YouTube 영상과 매칭 후 Firestore에 저장.
1. Royal Ballet 공식 채널 우선
2. 없으면 일반 YouTube (하이브리드 스코링)
3. Firestore에 저장
"""
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.firebase import db
from app.services.youtube_service import search_youtube_videos, get_youtube_url

# CSV 파일 경로
CSV_PATH = Path(__file__).parent.parent / "data" / "abt_ballet_dictionary_96.csv"

# 발레 용어 → 한글 이름 매핑 (부분 리스트, 나머지는 프랑스어 그대로 사용)
KOREAN_NAMES = {
    "arabesque": "아라베스크",
    "attitude": "아티튀드",
    "battement": "바뜨망",
    "piqué": "피케",
    "relevé": "르르레",
    "plié": "플리에",
    "tendu": "텅뒤",
    "dégagé": "데가제",
    "adagio": "아다주",
    "allegro": "알레그로",
    "grand": "그랑",
    "petit": "쁘띠",
    "jeté": "제떼",
    "pirouette": "피루에뜨",
    "chaîné": "셰네",
    "fouetté": "푸에떼",
    "entrechat": "옹트르샤",
    "cabriole": "카브리올",
    "soutenu": "수떼뉘",
    "assemblé": "앙상블레",
    "échappé": "에샤페",
    "écarté": "에까르떼",
    "croisé": "크루아제",
    "effacé": "에파세",
    "devant": "드방",
    "derrière": "데리에르",
    "en l'air": "앙 레르",
    "adéveloppé": "아 데벨로페",
    "ballon": "발롱",
    "port de bras": "포르 드 브라",
}


def load_moves_to_firestore():
    """CSV 읽기 → YouTube 검색 → Firestore 저장"""

    if not CSV_PATH.exists():
        print(f"❌ CSV 파일 없음: {CSV_PATH}")
        return

    moves_ref = db.collection("moves")
    count = 0
    failed = []

    with open(CSV_PATH, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        total = sum(1 for _ in csv.DictReader(open(CSV_PATH, encoding="utf-8")))

        # 다시 읽기
        f.seek(0)
        next(f)  # 헤더 스킵

        for idx, row in enumerate(reader, 1):
            french_term = row["term"].strip()
            korean_name = KOREAN_NAMES.get(french_term.split(",")[0].strip().lower(), french_term)

            print(f"[{idx}/{96}] 검색 중: {french_term}...", end=" ", flush=True)

            # YouTube 검색
            videos = search_youtube_videos(french_term, max_results=5)

            if videos:
                top_video = videos[0]
                video_url = get_youtube_url(top_video["video_id"])
                source = top_video["source"]
                print(f"✅ {source} ({top_video['title'][:40]}...)")
            else:
                video_url = ""
                source = "none"
                print(f"⚠️ 영상 없음")
                failed.append(french_term)

            # Firestore 저장
            doc_data = {
                "french_term": french_term,
                "korean_name": korean_name,
                "pronunciation": row.get("pronunciation_mp3", ""),
                "description": f"{korean_name}를 설명하는 발레 동작",
                "video_url": video_url,
                "video_source": source,
                "youtube_videos": [
                    {
                        "title": v["title"],
                        "url": get_youtube_url(v["video_id"]),
                        "channel": v["channel"],
                        "score": v["score"],
                    }
                    for v in videos
                ],
                "source": row.get("source", ""),
            }

            moves_ref.document(french_term).set(doc_data)
            count += 1

    print(f"\n✅ {count}개 용어 저장 완료!")
    if failed:
        print(f"⚠️ 영상 없는 용어 ({len(failed)}개): {', '.join(failed[:5])}...")


if __name__ == "__main__":
    load_moves_to_firestore()
