"""용어 96개의 '뜻 색인'(임베딩)을 만들어 app/data/moves_embeddings.json 에 저장한다 (원본 JSON이 바뀔 때만 다시 실행).

  python scripts/build_embeddings.py

원본은 frontend/data/moves_96.json 하나이고, 이 스크립트는 거기서 한글 설명을 읽어 숫자(1536개)로 바꾸기만 한다.
저장한 파일은 서버가 시작할 때 메모리에 올려 두므로 검색할 때 Firestore를 읽지 않는다.
"""
import json
import sys

sys.path.insert(0, ".")
from openai import OpenAI  # noqa: E402

from app.services.embedding_model import EMBEDDING_MODEL  # noqa: E402
from app.services.moves_local import ROOT, load_moves  # noqa: E402

from dotenv import load_dotenv  # noqa: E402

load_dotenv()


def main() -> None:
    moves = load_moves()
    texts = [f"{m['term']} ({m.get('korean_name', '')}): {m.get('description_ko', '')}" for m in moves]
    resp = OpenAI().embeddings.create(model=EMBEDDING_MODEL, input=texts)
    items = [{"no": m["no"], "term": m["term"], "vec": [round(x, 6) for x in e.embedding]} for m, e in zip(moves, resp.data)]
    out = ROOT / "app" / "data" / "moves_embeddings.json"
    out.write_text(json.dumps({"model": EMBEDDING_MODEL, "items": items}, ensure_ascii=False), encoding="utf-8")
    print(f"{len(items)}개 용어 색인 저장: {out} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
