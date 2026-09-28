# Firestore(데이터베이스)에 접속하는 "연결선"을 딱 한 번만 만들어서 db라는 이름으로 내보낸다.
# 다른 파일(services/data_service.py 등)은 "from app.core.firebase import db"로 이 연결을 재사용한다.
import firebase_admin
from firebase_admin import credentials, firestore

from app.core.config import FIREBASE_SERVICE_ACCOUNT_JSON

# 서비스 계정 키(비밀 인증서) 파일 경로를 읽어서 자격증명을 만듦 — 이 키가 있어야 우리 DB에 접속 가능.
_cred = credentials.Certificate(FIREBASE_SERVICE_ACCOUNT_JSON)
_app = firebase_admin.initialize_app(_cred)
db = firestore.client()
