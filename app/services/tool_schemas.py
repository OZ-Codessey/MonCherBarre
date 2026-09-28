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
            "description": "서울의 현재 기온/풍속을 조회한다.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_moves_by_symptom",
            "description": "증상에 따라 피해야 할 발레 동작 목록을 조회한다.",
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
            "description": "동작 이름이 기억나지 않을 때, 동작 묘사(자연어)로 발레 용어를 의미 기반 검색한다.",
            "parameters": {
                "type": "object",
                "properties": {"text": {"type": "string", "description": "동작에 대한 자연어 설명"}},
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
}
