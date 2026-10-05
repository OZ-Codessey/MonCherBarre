"""GPT Function Calling용 도구 스키마. 실제 로직은 rag_tools.py에 있고, 여기는 "설명서" 역할만 한다."""
from app.services import rag_tools

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_class_schedule",
            "description": "발레 수업 시간표를 조회한다. '오늘/이번주 수업 있어?' 같은 질문에 사용.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_seoul_weather",
            "description": "서울의 현재 날씨(맑음/비/눈 등), 기온, 체감온도, 풍속, 지금 비·눈이 오는지, 오늘 강수확률·최고/최저기온을 조회한다. 날씨·기온·비·눈·바람 질문에 사용.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_moves_by_symptom",
            "description": "증상(아픈 부위)에 따라 피해야 할 발레 동작과, 준비물·소요시간·방법·주의·영상 링크가 담긴 강화 운동 목록을 조회한다.",
            "parameters": {
                "type": "object",
                "properties": {
                    "symptom_id": {
                        "type": "string",
                        "enum": ["ankle_pain", "bunion_pain", "knee_pain", "back_pain"],
                        "description": "발목 통증=ankle_pain, 무지외반 통증=bunion_pain, 무릎 통증=knee_pain, 허리 통증=back_pain",
                    }
                },
                "required": ["symptom_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_term_by_meaning",
            "description": "동작 이름이 기억나지 않을 때, 동작 묘사(자연어)로 발레 용어를 의미 기반 검색한다. 가까운 후보 6개를 돌려주니, 설명을 보고 질문에 가장 맞는 것 1~3개를 골라 알려준다.",
            "parameters": {
                "type": "object",
                "properties": {"text": {"type": "string", "description": "동작에 대한 자연어 설명"}},
                "required": ["text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_move_links",
            "description": "추천하려는 발레 동작 이름들(프랑스어 또는 한글)의 영상 링크를 찾는다. 사전에 영상이 있으면 그 링크, 없으면 유튜브 검색 링크를 돌려준다. 루틴·동작을 추천할 때 영상 열에 넣을 링크를 얻는 데 사용.",
            "parameters": {
                "type": "object",
                "properties": {"terms": {"type": "array", "items": {"type": "string"}, "description": "동작 이름 목록 (최대 10개)"}},
                "required": ["terms"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "save_note",
            "description": "사용자가 자신의 상태(아픈 부위, 컨디션, 부상 변화, 수업 일정 변경, 기억해 달라는 내용)를 말하면 그 내용을 한 줄로 메모에 저장한다. 다음 대화에서도 참고하기 위함.",
            "parameters": {
                "type": "object",
                "properties": {"text": {"type": "string", "description": "저장할 내용 한 줄 (예: 오른쪽 발목이 뻐근함, 이번 주 수요일 수업 취소)"}},
                "required": ["text"],
            },
        },
    },
]

# 함수명 문자열 -> 실제 파이썬 함수 매핑(GPT가 tool_call로 이름을 보내오면 이걸로 찾아 실행)
DISPATCH = {
    "get_class_schedule": lambda **kw: rag_tools.get_class_schedule(),
    "get_seoul_weather": lambda **kw: rag_tools.get_seoul_weather(),
    "get_moves_by_symptom": lambda **kw: rag_tools.get_moves_by_symptom(kw["symptom_id"]),
    "search_term_by_meaning": lambda **kw: rag_tools.search_term_by_meaning(kw["text"]),
    "get_move_links": lambda **kw: rag_tools.get_move_links(kw["terms"][:10]),
    # save_note는 비서 메모를 바꾸므로 chat_service에서 직접 처리한다 (여기에는 없음)
}
