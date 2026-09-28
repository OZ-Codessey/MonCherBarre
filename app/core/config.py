# 앱 전체가 공유하는 "설정값 모음집". .env 파일의 값을 한 번만 읽어서
# 다른 파일들(firebase.py 등)이 이 파일에서 import해서 재사용한다.
import os

from dotenv import load_dotenv

load_dotenv()  # .env 파일 내용을 os.environ으로 불러옴

# os.environ["..."] : 값이 없으면 즉시 에러(필수 키이므로 조용히 넘어가면 안 됨)
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
# os.getenv(key, 기본값) : 값이 없어도 기본값으로 넘어감(선택적 설정)
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5-mini")
FIREBASE_SERVICE_ACCOUNT_JSON = os.environ["FIREBASE_SERVICE_ACCOUNT_JSON"]
# "a.com,b.com" 형태 문자열을 ["a.com", "b.com"] 리스트로 쪼갬. 없으면 전체 허용("*").
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",")]
