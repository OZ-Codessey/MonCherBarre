"""ABT 발레 사전 96개 용어를 Firestore moves 컬렉션에 업로드한다.

핵심 용어(약 25개)는 OpenAI 임베딩까지 채워 벡터 RAG(search_term_by_meaning)에 사용한다.
"""
import csv
import os
from pathlib import Path

import firebase_admin
from dotenv import load_dotenv
from firebase_admin import credentials, firestore
from openai import OpenAI

load_dotenv()

CSV_PATH = Path(__file__).resolve().parent.parent / "data" / "abt_ballet_dictionary_96.csv"
EMBEDDING_MODEL = "text-embedding-3-small"

# CSV의 96개 항목과 1:1 순서로 대응하는 ABT 원문 한 줄 정의(영문).
DEFINITIONS_IN_ORDER = [
    "Forward. A direction for the execution of a step.",
    "In the air. Indicates that a movement is to be made in the air.",
    "One of the basic poses in ballet, arabesque takes its name from a form of Moorish ornament.",
    "Backward. Used to indicate that a step is executed moving away from the audience.",
    "Assembled or joined together. A step in which the working foot slides well along the ground.",
    "Big assemblé, turning. This assemblé is done in the same manner as grand assemblé.",
    "A particular pose in dancing derived by Carlo Blasis from the statue of Mercury.",
    "Tossed. This step consists of coupé dessous and coupé dessus performed in a series.",
    "Beating. A beating action of the extended or bent leg.",
    "Disengaged battement. A term of the Cecchetti method.",
    "Large battement like a bell. A term of the French School.",
    "Battement fondu developed. This is performed in the same manner as battement fondu simple.",
    "Struck battement. An exercise in which the dancer forcefully extends the working leg.",
    "Small battement on the ankle. This is an exercise at the bar.",
    "Battement stretched. A battement tendu is the commencing portion and ending portion.",
    "Large battement. An exercise in which the working leg is raised from the hip.",
    "Arms low or down. This is the dancer's 'attention.'",
    "Rocking step. This step is very much like a pas de valse.",
    "Bounce. Ballon is the light, elastic quality in jumping.",
    "Ball-like or bouncing step. A step in which the dancer springs into the air.",
    "Positions of the arms. Although the positions of the feet are standard.",
    "Broken, breaking. A small beating step in which the movement is broken.",
    "Flying brisé. In this brisé the dancer finishes on one foot after the beat.",
    "Caper. An allegro step in which the extended legs are beaten in the air.",
    "Double cabriole. This is a cabriole in which one leg strikes the other.",
    "Chains, links. This is an abbreviation of the term 'tours chaînés déboulés'.",
    "Change of feet. The term is usually abbreviated to changement.",
    "Chased. A step in which one foot literally chases the other foot.",
    "Like a bell. Refers to grands battements executed continuously.",
    "Sideways. Used to indicate that a step is to be made to the side.",
    "On the cou-de-pied. The working foot is placed on the part of the leg.",
    "A compound step consisting of a coupé dessous making a three-quarter turn.",
    "Running. As, for example, in pas de bourrée couru.",
    "Crossed. One of the directions of épaulement.",
    "In the shape of a cross. Indicates that an exercise is to be executed.",
    "Inward. In steps and exercises the term en dedans indicates.",
    "Outward. In steps and exercises the term en dehors indicates.",
    "Half-bend of the knees. All steps of elevation begin and end with a demi-plié.",
    "On the half-points. Indicates that the dancer is to stand high.",
    "Behind, back. This term may refer to a movement, step or placing.",
    "Under. Indicates that the working foot passes behind the supporting foot.",
    "Over. Indicates that the working foot passes in front of the supporting foot.",
    "In front. This term may refer to a step, movement or the placing of a limb.",
    "Time developed, developing movement. Through common usage the term has become abridged.",
    "In a diagonal. Indicates that a step is to be done traveling.",
    "Separated, thrown wide apart. Écarté is one of the eight directions.",
    "Escaping or slipping movement. An échappé is a level opening of both feet.",
    "Échappé on the points or toes. Fifth position R foot front.",
    "Shaded. One of the directions of épaulement.",
    "Interweaving or braiding. A step of beating in which the dancer jumps.",
    "Six crossings. Demi-plié in the fifth position R foot front.",
    "Shouldering. The placing of the shoulders. A term used to indicate.",
    "Sinking down. A term used to describe a lowering of the body.",
    "Whipped. A term applied to a whipping movement.",
    "Large fouetté, turning. This fouetté may be done on demi-pointe.",
    "Whipped circle of the leg turning. This is the popular turn.",
    "Opposite (the audience); facing the audience.",
    "Glide. A traveling step executed by gliding the working foot.",
    "Throwing step. A jump from one foot to the other.",
    "Jeté beaten. Both jeté dessus and jeté dessous may be beaten.",
    "Large jeté forward. A big leap forward preceded by a preliminary movement.",
    "Jeté interlaced. A term of the Russian School.",
    "Large jeté. In this step the legs are thrown to 90 degrees.",
    "Small jeté. From a demi-plié in the fifth position the working foot.",
    "Circular. A term applied to steps or enchaînements executed in a circle.",
    "A Polish folk dance in 3/4 time which has been introduced.",
    "The art of using the face and body to express emotion and dramatic action.",
    "Open, opened. This may refer to positions (the second and fourth positions).",
    "Large pirouette in the second position. This pirouette is usually performed.",
    "Pricked pirouette. A term of the French School.",
    "Bent, bending. A bending of the knee or knees.",
    "On the points. The raising of the body on the tips of the toes.",
    "Pas de bourrée, running. A term of the French School.",
    "Cat's-step. The step owes its name to the likeness of the movement.",
    "Dance for two.",
    "Marching step. This is the dignified, classical walk.",
    "Leaning, inclining. As, for example, in arabesque penchée.",
    "Five positions of the feet. There are five basic positions.",
    "Pricked, pricking. Executed by stepping directly on the point or demi-pointe.",
    "Whirl or spin. A complete turn of the body on one foot.",
    "A processional dance in 3/4 time with which the court ballets.",
    "Carriage of the arms. The term port de bras has two meanings.",
    "Carried. Refers either to a step which is traveled in the air.",
    "Turn in a walk. A term of the French School.",
    "Withdrawn. A position in which the thigh is raised to the second position.",
    "Rond de jambe on the ground. An exercise at the barre or in the centre.",
    "Ronds de jambe en l'air are done at the bar and in centre practice.",
    "Royal. A changement in which the calves are beaten together.",
    "Raised. A raising of the body on the points or demi-pointes.",
    "Jumped, jumping. When this term is added to the name of a step.",
    "Sissonne is named for the originator of the step.",
    "Closed sissonne. A step of low elevation performed to a quick tempo.",
    "Big open sissonne. This sissonne is usually performed with high elevation.",
    "Basque jump. A traveling step in which the dancer turns in the air.",
    "Turn in the air. This is essentially a male dancer's step.",
    "Turning. Indicates that the body is to turn while executing a given step.",
]

# 기존 발레 루틴 자료(ballet-routine.html)에 이미 한글 번역이 있던 9개.
KOREAN_BY_TERM = {
    "plié": "플리에",
    "battement tendu": "텐뒤",
    "battement dégagé": "데가제",
    "rond de jambe à terre": "롱드장브",
    "fondu, fondue": "퐁뒤",
    "battement frappé": "프라페",
    "développé, temps": "아다지오 / 드벨로페",
    "battement, grand": "그랑바트망",
    "pirouette": "피루엣",
    # 기초 필수 용어로 추가한 16개.
    "arabesque": "아라베스크",
    "attitude": "아띠뜌드",
    "assemblé": "아쌈블레",
    "demi-plié": "드미 플리에",
    "échappé": "에샤페",
    "glissade": "글리사드",
    "jeté": "쥬떼",
    "jeté, grand": "그랑 쥬떼",
    "pas de chat": "빠 드 샤",
    "pas de deux": "빠 드 두",
    "relevé": "를르베",
    "retiré": "르티레",
    "sissonne": "시손느",
    "port de bras": "뽀르드브라",
    "chassé": "샤세",
    "tour en l'air": "뚜르 앙 레르",
}

CORE_TERMS = set(KOREAN_BY_TERM.keys())


def build_docs():
    with CSV_PATH.open(encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    docs = []
    for row, def_en in zip(rows, DEFINITIONS_IN_ORDER):
        term = row["term"]
        docs.append(
            {
                "no": int(row["no"]),
                "term_fr": term,
                "term_kr": KOREAN_BY_TERM.get(term, ""),
                "def_en": def_en,
                "audio_url": row["pronunciation_mp3"] or None,
                "source": row["source"],
                "core": term in CORE_TERMS,
            }
        )
    return docs


def main():
    cred = credentials.Certificate(os.environ["FIREBASE_SERVICE_ACCOUNT_JSON"])
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    openai_client = OpenAI()

    docs = build_docs()
    core_docs = [d for d in docs if d["core"]]
    print(f"전체 {len(docs)}개, 핵심(embedding 대상) {len(core_docs)}개")

    texts = [f"{d['term_fr']} ({d['term_kr']}): {d['def_en']}" for d in core_docs]
    resp = openai_client.embeddings.create(model=EMBEDDING_MODEL, input=texts)
    for d, e in zip(core_docs, resp.data):
        d["embedding"] = e.embedding

    batch = db.batch()
    collection = db.collection("moves")
    for i, d in enumerate(docs):
        doc_id = f"m{d['no']:02d}"
        batch.set(collection.document(doc_id), d)
        if (i + 1) % 400 == 0:
            batch.commit()
            batch = db.batch()
    batch.commit()

    print(f"업로드 완료: {len(docs)}건 (embedding 포함 {len(core_docs)}건)")


if __name__ == "__main__":
    main()
