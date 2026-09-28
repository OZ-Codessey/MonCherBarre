"""symptom_map / class_schedule / routine_templates 3개 컬렉션을 Firestore에 업로드한다."""
import os

import firebase_admin
from dotenv import load_dotenv
from firebase_admin import credentials, firestore

load_dotenv()

SYMPTOM_MAP = [
    {
        "id": "ankle_pain",
        "symptom": "발목 통증",
        "avoid_terms": ["relevé", "sauté, sautée", "jeté", "jeté, grand", "échappé", "tour en l'air"],
        "memo": "발목 부하가 큰 를르베/점프/회전 계열은 통증 시 회피",
    },
    {
        "id": "bunion_pain",
        "symptom": "무지외반 통증",
        "avoid_terms": ["pointes, sur les", "battement tendu", "battement dégagé", "piqué"],
        "memo": "엄지발가락에 압력이 쏠리는 포인트/텐뷰 계열은 통증 시 회피",
    },
    {
        "id": "knee_pain",
        "symptom": "무릎 통증",
        "avoid_terms": ["battement, grand", "cabriole", "sissonne", "demi-plié"],
        "memo": "깊은 플리에·그랑바트망·점프 계열은 무릎 부담이 커서 통증 시 회피",
    },
    {
        "id": "back_pain",
        "symptom": "허리 통증",
        "avoid_terms": ["penché, penchée", "port de bras", "battement, grand"],
        "memo": "후굴·상체 젖힘이 들어가는 동작은 통증 시 회피",
    },
]

CLASS_SCHEDULE = [
    {"id": "wed", "day": "수", "start": "19:00", "end": "21:30"},
    {"id": "sat", "day": "토", "start": "13:00", "end": "16:30"},
]

ROUTINE_TEMPLATES = [
    {
        "id": "min10",
        "duration_min": 10,
        "segments": [{"name": "스트레칭", "min": 10, "focus": "다리 스트레칭, 스파인코렉터(캄브레용), 복근"}],
    },
    {
        "id": "min20",
        "duration_min": 20,
        "segments": [{"name": "스트레칭", "min": 20, "focus": "다리 스트레칭, 스파인코렉터(캄브레용), 복근"}],
    },
    {
        "id": "min30",
        "duration_min": 30,
        "segments": [
            {"name": "스트레칭", "min": 10, "focus": "다리 스트레칭, 스파인코렉터(캄브레용), 복근"},
            {"name": "바", "min": 10, "focus": "기본 동작"},
            {"name": "센터", "min": 10, "focus": "기본 동작, 점프 제외"},
        ],
    },
    {
        "id": "min60",
        "duration_min": 60,
        "segments": [
            {"name": "스트레칭", "min": 20, "focus": "발목 강화, 발가락 강화, 턴아웃 기구, 장요근, 척추기립근"},
            {"name": "바", "min": 20, "focus": "중급 동작(를르베, 쁘띠 바트망 등)"},
            {"name": "센터", "min": 20, "focus": "중급 동작"},
        ],
    },
]


def main():
    cred = credentials.Certificate(os.environ["FIREBASE_SERVICE_ACCOUNT_JSON"])
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    for name, docs in [
        ("symptom_map", SYMPTOM_MAP),
        ("class_schedule", CLASS_SCHEDULE),
        ("routine_templates", ROUTINE_TEMPLATES),
    ]:
        for d in docs:
            doc_id = d.pop("id")
            db.collection(name).document(doc_id).set(d)
        print(f"{name}: {len(docs)}건 업로드 완료")


if __name__ == "__main__":
    main()
