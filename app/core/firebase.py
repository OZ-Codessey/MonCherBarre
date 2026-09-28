# Firestore(데이터베이스)에 접속하는 "연결선"을 딱 한 번만 만들어서 db라는 이름으로 내보낸다.
# 다른 파일(services/data_service.py 등)은 "from app.core.firebase import db"로 이 연결을 재사용한다.
import json

import firebase_admin
from firebase_admin import credentials, firestore

from app.core.config import FIREBASE_SERVICE_ACCOUNT_JSON

# 로컬: 환경변수 값이 파일 경로("/Users/.../adminsdk.json") → Certificate(경로)
# Render: 환경변수 값이 JSON 문자열("{...}") → dict로 파싱 후 Certificate(dict)
# 키 파일은 .gitignore에 있어 Render 서버에 없으므로 이 분기가 필수.
if FIREBASE_SERVICE_ACCOUNT_JSON.strip().startswith("{"):
    _cred = credentials.Certificate(json.loads(FIREBASE_SERVICE_ACCOUNT_JSON))
else:
    _cred = credentials.Certificate(FIREBASE_SERVICE_ACCOUNT_JSON)

_app = firebase_admin.initialize_app(_cred)
db = firestore.client()
