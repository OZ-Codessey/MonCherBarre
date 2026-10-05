import json

from openai import OpenAI

from app.core.config import OPENAI_MODEL
from app.schemas.chat import ChatRequest
from app.services import conversation_service, data_service, tool_schemas

_client = OpenAI()


def _build_system_prompt() -> str:
    # 컨텍스트 주입: GPT에게 매 요청마다 최신 데이터 요약을 "참고자료"로 먼저 알려준다.
    s = data_service.get_summary()
    return (
        "당신은 발레 연습 데이터를 참고해서 답하는 AI 비서입니다. "
        f"사용자의 연습 데이터 요약: 기간 {s['period']}, 총 {s['count']}일, "
        f"평균 연습시간 {s['metrics']['average']}분, 최대 {s['metrics']['max']}분, "
        f"최소 {s['metrics']['min']}분, 트렌드 {s['trend']}. "
        "이 정보를 참고해 자연스럽게 답하세요. "
        # 답변 형식: 글밥을 줄이고 표 + 번호 요약으로 통일 (프론트가 마크다운 표/번호를 그려준다)
        "답변 형식 규칙: "
        "(1) 정보성 답변은 마크다운 표(| 항목 | 내용 |)로 정리하고, 셀 문장은 짧게 쓰세요. "
        "(2) 표 위에는 한 줄 안내만 쓰세요. "
        "(3) 표 아래에는 핵심 요약을 '1. ', '2. ', '3. ' 처럼 번호를 붙여 한 줄에 하나씩, 줄을 바꿔 쓰세요. "
        "(4) 번호를 문장 중간에 끼워 넣거나 긴 문단으로 쓰지 마세요. "
        "(5) 인사나 아주 짧은 질문에는 표 없이 한두 문장으로 답하세요. "
        "(6) 전체 분량은 짧게 유지하세요. "
        # 부상·통증 안내: 증상 조회 도구로 주의 동작과 강화 운동(영상 링크 포함)을 연결한다
        "(7) 사용자가 아프다·다쳤다·불편하다고 하면 get_moves_by_symptom 도구로 증상을 조회하세요 "
        "(발목=ankle_pain, 무지외반=bunion_pain, 무릎=knee_pain, 허리=back_pain). "
        "피해야 할 동작과 도움이 되는 강화 운동을 나눠서 안내하세요. "
        "(8) 강화 운동은 표(| 운동 | 준비물 | 시간 | 방법 | 영상 |)로 정리하세요. 준비물·시간·방법은 짧고 일반적인 내용으로 쓰고, "
        "영상 칸에는 도구 결과의 url을 [영상](url) 형태로 넣으세요. 도구에 url이 없는 운동은 "
        "[검색](https://www.youtube.com/results?search_query=운동+이름) 형태의 유튜브 검색 링크를 넣으세요(공백은 +). "
        "도구 결과에 없는 영상 주소를 지어내지 마세요. "
        "(9) 마지막 줄에 '원하시면 다른 운동도 찾아드릴까요?'라고 물어보세요. "
        "(10) 통증이 심하거나 오래되면 전문가 상담을 권하는 한 줄을 덧붙이세요."
        # TODO(나중에): "오늘"이라고 물으면 오늘 날짜 기록으로 바로 답하도록 지시문 보강 필요.
        # 지금은 되물어봄(기능 완성 우선, 품질은 나중에).
    )


def _call_with_tools(messages: list[dict]) -> str:
    # Function Calling 루프: GPT가 도구 호출을 요청하면 실제 함수를 실행해 결과를 돌려주고,
    # 다시 물어본다. 최대 3번까지만 반복(무한루프 방지).
    for _ in range(3):
        completion = _client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=messages,
            tools=tool_schemas.TOOLS,
            max_completion_tokens=2000,
            reasoning_effort="low",
        )
        msg = completion.choices[0].message

        if not msg.tool_calls:
            return msg.content

        messages.append({"role": "assistant", "content": msg.content, "tool_calls": msg.tool_calls})
        for call in msg.tool_calls:
            args = json.loads(call.function.arguments or "{}")
            try:
                result = tool_schemas.DISPATCH[call.function.name](**args)
            except Exception:
                result = {"error": "도구 실행 중 오류가 발생했어요."}
            messages.append(
                {"role": "tool", "tool_call_id": call.id, "content": json.dumps(result, ensure_ascii=False)}
            )

    return "죄송해요, 지금은 답을 정리하지 못했어요."


def send_message(req: ChatRequest) -> dict:
    conv_id = req.conversation_id
    if not conv_id:
        from app.schemas.conversation import ConversationCreate

        conv = conversation_service.create_conversation(ConversationCreate(title=req.message[:15]))
        conv_id = conv["id"]

    history = conversation_service.get_conversation(conv_id)["messages"]
    messages = [{"role": "system", "content": _build_system_prompt()}]
    messages += [{"role": m["role"], "content": m["content"]} for m in history]
    messages.append({"role": "user", "content": req.message})

    reply = _call_with_tools(messages)

    conversation_service.append_message(conv_id, "user", req.message)
    conversation_service.append_message(conv_id, "assistant", reply)

    return {"reply": reply, "conversation_id": conv_id}
