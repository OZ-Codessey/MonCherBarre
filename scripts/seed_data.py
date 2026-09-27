"""365일 발레 훈련 데이터를 Firestore data 컬렉션에 업로드한다.

date, value(=practice_time_min), memo(=event_type) 포맷으로 변환한다.
"""
import csv
import os
from pathlib import Path

import firebase_admin
from dotenv import load_dotenv
from firebase_admin import credentials, firestore

load_dotenv()

CSV_PATH = Path(__file__).resolve().parent.parent / "data" / "ballet_training_cleaned_365.csv"


def main() -> None:
    cred = credentials.Certificate(os.environ["FIREBASE_SERVICE_ACCOUNT_JSON"])
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    with CSV_PATH.open(encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    batch = db.batch()
    collection = db.collection("data")
    for i, row in enumerate(rows):
        doc_ref = collection.document(row["date"])
        batch.set(
            doc_ref,
            {
                "date": row["date"],
                "value": float(row["practice_time_min"]),
                "memo": row["event_type"],
            },
        )
        if (i + 1) % 400 == 0:
            batch.commit()
            batch = db.batch()
    batch.commit()

    print(f"업로드 완료: {len(rows)}건")


if __name__ == "__main__":
    main()
