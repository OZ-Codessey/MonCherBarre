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
        "이 정보를 참고해 자연스럽게 답하세요."
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
            result = tool_schemas.DISPATCH[call.function.name](**args)
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
