"""
YouTube API를 사용해서 발레 용어 영상 검색.
Royal Ballet 공식 채널 우선, 없으면 일반 YouTube 영상 추천.
하이브리드 스코링으로 최고 품질 영상 선택.
"""
import os
from googleapiclient.discovery import build
from datetime import datetime

# YouTube API 초기화
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "")
youtube = build("youtube", "v3", developerKey=YOUTUBE_API_KEY) if YOUTUBE_API_KEY else None

# Royal Ballet 공식 채널 ID
ROYAL_BALLET_CHANNEL_ID = "UCvExg_Ni2xLz9YuV3Ih8jWQ"


def search_youtube_videos(query: str, max_results: int = 5) -> list[dict]:
    """
    YouTube에서 발레 용어 검색.
    1. Royal Ballet 공식 채널에서 먼저 검색
    2. 없으면 일반 YouTube 검색
    3. 하이브리드 스코링으로 상위 N개 반환
    """
    if not youtube:
        print("❌ YouTube API Key가 없습니다. .env 파일을 확인하세요.")
        return []

    videos = []

    # 1️⃣ Royal Ballet 공식 채널에서 검색
    try:
        request = youtube.search().list(
            part="snippet",
            q=f"{query} tutorial",
            channelId=ROYAL_BALLET_CHANNEL_ID,
            type="video",
            maxResults=1,
            order="relevance",
        )
        response = request.execute()

        if response.get("items"):
            for item in response["items"]:
                videos.append({
                    "title": item["snippet"]["title"],
                    "video_id": item["id"]["videoId"],
                    "channel": item["snippet"]["channelTitle"],
                    "source": "Royal Ballet",
                    "score": 1.0,  # 공식 채널은 최고 점수
                })
            return videos  # Royal Ballet 찾으면 바로 반환
    except Exception as e:
        print(f"Royal Ballet 검색 오류 ({query}): {e}")

    # 2️⃣ 일반 YouTube 검색 (Royal Ballet 없을 때)
    try:
        request = youtube.search().list(
            part="snippet",
            q=f"{query} ballet tutorial",
            type="video",
            maxResults=10,
            order="relevance",
            relevanceLanguage="en",
        )
        response = request.execute()

        for item in response.get("items", []):
            video_id = item["id"]["videoId"]

            # 영상 상세 정보 (조회수, 길이 등) 가져오기
            try:
                video_request = youtube.videos().list(
                    part="statistics,contentDetails",
                    id=video_id,
                )
                video_response = video_request.execute()

                if video_response.get("items"):
                    video_details = video_response["items"][0]
                    stats = video_details.get("statistics", {})
                    views = int(stats.get("viewCount", 0))
                    duration = video_details.get("contentDetails", {}).get("duration", "")

                    # 하이브리드 스코어 계산
                    score = calculate_hybrid_score(
                        title=item["snippet"]["title"],
                        views=views,
                        query=query,
                        duration=duration,
                    )

                    videos.append({
                        "title": item["snippet"]["title"],
                        "video_id": video_id,
                        "channel": item["snippet"]["channelTitle"],
                        "views": views,
                        "source": "YouTube",
                        "score": score,
                    })
            except Exception as e:
                print(f"영상 상세 조회 오류 ({video_id}): {e}")
                continue

    except Exception as e:
        print(f"YouTube 검색 오류 ({query}): {e}")

    # 스코어 기준 정렬
    videos.sort(key=lambda x: x["score"], reverse=True)
    return videos[:max_results]


def calculate_hybrid_score(title: str, views: int, query: str, duration: str = "") -> float:
    """
    하이브리드 스코링: 제목 유사도 + 조회수 + 영상 길이

    점수 = (제목 유사도 × 0.4) + (조회수 스코어 × 0.4) + (길이 스코어 × 0.2)
    """
    # 1️⃣ 제목 유사도 (0~1)
    title_lower = title.lower()
    query_terms = query.lower().split()
    matching_terms = sum(1 for term in query_terms if term in title_lower)
    title_score = min(matching_terms / max(len(query_terms), 1), 1.0)

    # 2️⃣ 조회수 스코어 (로그 스케일: 0~1)
    # 100만 조회 = 0.8, 1000만 조회 = 0.95
    view_score = min(1.0, (1.0 + (views / 100000)) / 20.0)

    # 3️⃣ 영상 길이 스코어 (레슨은 5~20분이 최적)
    duration_score = 0.5
    try:
        # ISO 8601 duration 파싱 (예: PT12M30S)
        import re
        match = re.search(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", duration)
        if match:
            hours = int(match.group(1) or 0)
            minutes = int(match.group(2) or 0)
            seconds = int(match.group(3) or 0)
            total_minutes = hours * 60 + minutes + seconds / 60

            if 5 <= total_minutes <= 20:
                duration_score = 1.0
            elif 3 <= total_minutes <= 30:
                duration_score = 0.8
            else:
                duration_score = 0.5
    except:
        pass

    # 최종 스코어
    score = (title_score * 0.4) + (view_score * 0.4) + (duration_score * 0.2)
    return round(score, 3)


def get_youtube_url(video_id: str) -> str:
    """YouTube URL 생성"""
    return f"https://www.youtube.com/watch?v={video_id}"
