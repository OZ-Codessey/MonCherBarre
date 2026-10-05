import json

from openai import OpenAI

from app.core.config import OPENAI_MODEL
from app.schemas.chat import ChatRequest
from app.services import conversation_service, data_service, memory_service, tool_schemas

_client = OpenAI()


def _recent_line(rows: list[dict]) -> str:
    """최근 14일 기록을 한 줄로: '10/01 60분, 10/02 휴식, …'. 읽기는 최대 14건(서버가 보관)."""
    if not rows:
        return "최근 14일 기록 없음"
    items = []
    for r in rows:
        mmdd = r["date"][5:].replace("-", "/")
        v = int(r["value"])
        memo = r.get("memo") or ""
        extra = f"({memo})" if memo and memo != "normal" else ""
        items.append(f"{mmdd} {'휴식' if v == 0 else str(v) + '분'}{extra}")
    practiced = sum(1 for r in rows if r["value"] > 0)
    return f"최근 14일 중 {practiced}일 연습: " + ", ".join(items)


def _build_system_prompt(mem: dict | None = None) -> str:
    # 컨텍스트 주입: 요약(문서 1장) + 최근 14일 + 비서 메모(문서 1장)를 "참고자료"로 먼저 알려준다.
    s = data_service.get_summary()
    mem = mem if mem is not None else memory_service.load()
    try:
        recent = _recent_line(data_service.recent_days(14))
    except Exception:
        recent = ""
    return (
        "당신은 사용자를 잘 아는 개인 발레 연습 비서입니다. 아래 참고자료를 바탕으로 사용자의 상황에 맞춰 답하세요. "
        f"[연습 요약] 기간 {s['period']}, 총 {s['count']}일, "
        f"평균 {s['metrics']['average']}분, 최대 {s['metrics']['max']}분, "
        f"최소 {s['metrics']['min']}분, 트렌드 {s['trend']}. {recent}. "
        f"[나의 상황 메모]\n{memory_service.render_prompt(mem)}\n"
        "이 정보를 참고해 자연스럽게 답하세요. 메모에 아픈 부위가 있으면 그 부위에 부담이 큰 동작은 피하고, "
        "이전에 추천한 구성과 겹치지 않게 다른 동작·순서를 제안하세요. "
        # 답변 형식: 글밥을 줄이고 표 + 번호 요약으로 통일 (프론트가 마크다운 표/번호를 그려준다)
        "답변 형식 규칙: "
        "(1) 정보성 답변은 마크다운 표(| 항목 | 내용 |)로 정리하세요. 표는 내용을 충분히 담되 셀 문장은 짧게 쓰고, "
        "루틴·계획 질문이면 구간·시간·동작·포인트처럼 열을 여러 개 두어 자세히 보여주세요. "
        "(2) 표 위에는 한 줄 안내만 쓰고, 긴 줄글 문단은 쓰지 마세요. "
        "(3) 표 아래에는 핵심 요약을 '1. ', '2. ', '3. ' 처럼 번호를 붙여 3~5개, 한 줄에 하나씩 줄을 바꿔 쓰세요. "
        "(4) 번호를 문장 중간에 끼워 넣거나 긴 문단으로 쓰지 마세요. "
        "(5) 인사나 잡담처럼 정보가 필요 없는 말에만 표 없이 한두 문장으로 답하세요. "
        "(6) 정보를 묻는 질문에는 줄이지 말고 충분히 자세하게 답하세요. "
        # 부상·통증 안내: 증상 조회 도구로 주의 동작과 강화 운동(영상 링크 포함)을 연결한다
        "(7) 사용자가 아프다·다쳤다·불편하다고 하면 get_moves_by_symptom 도구로 증상을 조회하세요 "
        "(발목=ankle_pain, 무지외반=bunion_pain, 무릎=knee_pain, 허리=back_pain). "
        "피해야 할 동작과 도움이 되는 강화 운동을 나눠서 안내하세요. "
        "(8) 강화 운동은 표(| 운동 | 준비물 | 시간 | 방법 | 주의 | 영상 |)로 정리하세요. 준비물·시간·방법·주의는 도구 결과(equipment, duration, how_to, caution)를 짧게 줄여 쓰고, "
        "영상 칸에는 도구 결과의 video_url을 [영상](url) 형태로 넣고, search_url도 [검색](url)로 함께 넣으세요. "
        "도구 결과에 없는 영상 주소를 지어내지 마세요. "
        "(9) 정보를 안내한 답변 끝에는, 더 도와드릴 수 있는 것이 있으면 한 줄로 물어보세요 "
        "(예: '원하시면 ○○ 동작도 영상과 함께 찾아드릴까요?'). 인사나 잡담에는 묻지 않아도 됩니다. "
        "(10) 통증이 심하거나 오래되면 전문가 상담을 권하는 한 줄을 덧붙이세요. "
        "(11) 'N분 루틴 시작해요' 같은 루틴 요청에는 구간(준비·바·센터 등)별 시간·동작·포인트·영상을 표로 보여주고, "
        "이미 추천한 구성과 겹치지 않게 다른 동작이나 순서로 제안하세요. "
        "(12) 추천하는 동작에는 영상 열을 두고, get_move_links 도구로 얻은 링크를 [영상](url) 형태로 넣으세요. "
        "도구에 영상이 없는 동작은 도구가 준 search_url을 [검색](url) 형태로 넣으세요. 주소를 지어내지 마세요. "
        "(13) 사용자가 자신의 상태(아픈 부위, 컨디션, 일정 변경, 기억해 달라는 말)를 말하면 save_note 도구로 한 줄 저장하세요. "
        "(14) 동작 이름이 기억나지 않는다는 질문에는 search_term_by_meaning을 사용하세요."
        # TODO(나중에): "오늘"이라고 물으면 오늘 날짜 기록으로 바로 답하도록 지시문 보강 필요.
        # 지금은 되물어봄(기능 완성 우선, 품질은 나중에).
    )


def _call_with_tools(messages: list[dict], mem: dict | None = None) -> str:
    # Function Calling 루프: GPT가 도구 호출을 요청하면 실제 함수를 실행해 결과를 돌려주고,
    # 다시 물어본다. 최대 4번까지만 반복(무한루프 방지).
    mem = mem if mem is not None else memory_service.load()
    for _ in range(4):
        completion = _client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=messages,
            tools=tool_schemas.TOOLS,
            max_completion_tokens=3000,
            reasoning_effort="low",
        )
        msg = completion.choices[0].message

        if not msg.tool_calls:
            return msg.content

        messages.append({"role": "assistant", "content": msg.content, "tool_calls": msg.tool_calls})
        for call in msg.tool_calls:
            name = call.function.name
            args = json.loads(call.function.arguments or "{}")
            try:
                if name == "save_note":                      # 사용자의 상태를 비서 메모에 저장
                    memory_service.add_note(mem, args["text"])
                    result = {"saved": True}
                else:
                    result = tool_schemas.DISPATCH[name](**args)
                    if name == "get_moves_by_symptom":       # 어떤 증상을 자주 묻는지 기억
                        memory_service.add_symptom(mem, args.get("symptom_id", ""))
            except Exception:
                result = {"error": "도구 실행 중 오류가 발생했어요."}
            messages.append(
                {"role": "tool", "tool_call_id": call.id, "content": json.dumps(result, ensure_ascii=False)}
            )

    return "죄송해요, 지금은 답을 정리하지 못했어요."


# GPT에 보내는 이전 대화는 최근 10개 메시지까지만 (토큰 절약). 대화는 문서 1개에 들어 있어 읽기 횟수는 늘지 않는다.
HISTORY_LIMIT = 10


def send_message(req: ChatRequest) -> dict:
    conv_id = req.conversation_id
    mem = memory_service.load()
    # 새 대화는 GPT 답변이 성공한 뒤에 만든다 (실패 시 빈 대화방이 남지 않게)
    history = conversation_service.get_conversation(conv_id)["messages"] if conv_id else []
    messages = [{"role": "system", "content": _build_system_prompt(mem)}]
    messages += [{"role": m["role"], "content": m["content"]} for m in history[-HISTORY_LIMIT:]]
    messages.append({"role": "user", "content": req.message})

    reply = _call_with_tools(messages, mem)

    # 답변이 성공한 뒤에만 기억을 이어 붙이고(활동 합치기 포함) 1번 저장한다
    memory_service.merge_activity(mem, req.activity)
    memory_service.note_routine(mem, req.message)
    memory_service.add_exchange(mem, req.message, reply)
    try:
        memory_service.save(mem)
    except Exception:
        pass  # 기억 저장이 실패해도 답변은 돌려준다
    conv_id = conversation_service.save_exchange(conv_id, req.message[:15], req.message, reply)
    return {"reply": reply, "conversation_id": conv_id}
