#!/usr/bin/env python3
"""
발레 용어 96개를 Firestore에 동기화.

🎯 설계:
1. CSV에서 96개 용어 읽기
2. 각 용어별 YouTube 검색 (하이브리드 스코링)
3. Royal Ballet 1순위 + YouTube 추가 영상 (상위 3~5개) 저장
4. Firestore에 저장 (한 번만 처리)
5. 프론트: Firestore에서 빠르게 로드 + YouTube 버튼으로 실시간 검색 옵션

📊 비용: YouTube API 100개 호출 ~ 1000 units (일 쿼터: 10,000 units) ✅
⚡ 응답: Firestore 읽기만 하므로 빠름 (200ms 이하)
"""
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.firebase import db
from app.services.youtube_service import search_youtube_videos, get_youtube_url

CSV_PATH = Path(__file__).parent.parent / "data" / "abt_ballet_dictionary_96.csv"

# 간단한 한글 매핑 (나머지는 프랑스어 그대로)
KOREAN_NAMES = {
    "arabesque": "아라베스크",
    "attitude": "아티튀드",
    "battement": "바뜨망",
    "plié": "플리에",
    "tendu": "텅뒤",
    "jetté": "제떼",
    "pirouette": "피루에뜨",
    "fouetté": "푸에떼",
    "entrechat": "옹트르샤",
    "cabriole": "카브리올",
    "assemblé": "앙상블레",
    "échappé": "에샤페",
    "écarté": "에까르떼",
    "croisé": "크루아제",
    "devant": "드방",
    "derrière": "데리에르",
}


def sync_moves_to_firestore(start=0, end=96):
    """
    CSV → YouTube 검색 → Firestore 저장
    각 용어마다 최고 품질의 영상을 자동으로 추천받습니다.

    start, end: 배치 처리용 인덱스 (0-based)
      예: sync_moves_to_firestore(0, 30)   # 첫 30개
          sync_moves_to_firestore(30, 60)  # 다음 30개
          sync_moves_to_firestore(60, 96)  # 마지막 36개
    """
    if not CSV_PATH.exists():
        print(f"❌ CSV 파일 없음: {CSV_PATH}")
        return

    moves_ref = db.collection("moves")
    count = 0
    failed = []

    print(f"🎬 발레 용어 [{start+1:2d}~{end:2d}]번을 YouTube에서 검색하고 Firestore에 저장 중...")
    print("=" * 60)

    with open(CSV_PATH, encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for idx, row in enumerate(reader):
            if idx < start or idx >= end:
                continue

            row_num = idx + 1
            french_term = row["term"].strip()
            # 프랑스어 첫 단어로 한글 이름 찾기
            first_word = french_term.split(",")[0].strip().lower()
            korean_name = KOREAN_NAMES.get(first_word, french_term)

            print(f"[{row_num:2d}/96] 검색 중: {french_term:<30} → ", end="", flush=True)

            # 🎯 YouTube 검색 (하이브리드 스코링 자동 적용)
            videos = search_youtube_videos(french_term, max_results=5)

            if videos:
                top_video = videos[0]
                print(f"✅ {top_video['source']}")
            else:
                print(f"⚠️  영상 없음")
                failed.append(french_term)

            # 📦 Firestore에 저장
            # - main_video: 1순위 (Royal Ballet 또는 최고 품질 YouTube)
            # - additional_videos: 추가 추천 (2~5순위)
            doc_data = {
                "french_term": french_term,
                "korean_name": korean_name,
                "description": f"{korean_name}를 설명하는 발레 기본 동작",

                # 🎬 1순위 영상 (메인 표시)
                "main_video": {
                    "title": videos[0]["title"] if videos else "",
                    "url": get_youtube_url(videos[0]["video_id"]) if videos else "",
                    "channel": videos[0]["channel"] if videos else "",
                    "source": videos[0]["source"] if videos else "none",
                } if videos else {},

                # 🎬 추가 추천 영상 (3~5개, 더보기 버튼에서 표시)
                "additional_videos": [
                    {
                        "title": v["title"],
                        "url": get_youtube_url(v["video_id"]),
                        "channel": v["channel"],
                        "score": v["score"],
                    }
                    for v in videos[1:5]  # 2~5순위
                ] if len(videos) > 1 else [],

                # 🔍 YouTube 직접 검색 링크 (사용자가 최신 영상 찾기용)
                "youtube_search_url": f"https://www.youtube.com/results?search_query={french_term}+ballet",

                # 📝 메타데이터
                "pronunciation_url": row.get("pronunciation_mp3", ""),
                "source": row.get("source", ""),
            }

            moves_ref.document(french_term).set(doc_data)
            count += 1

    print("=" * 60)
    print(f"✅ {count}개 용어가 Firestore에 저장되었습니다!")
    if failed:
        print(f"⚠️  영상 없는 용어 ({len(failed)}개): {', '.join(failed[:3])}...")


if __name__ == "__main__":
    start = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    end = int(sys.argv[2]) if len(sys.argv) > 2 else 96
    sync_moves_to_firestore(start, end)
