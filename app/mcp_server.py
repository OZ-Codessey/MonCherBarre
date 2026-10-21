#!/usr/bin/env python3
"""MCP 서버: Claude Desktop/외부 MCP 클라이언트에서 발레 AI 도구를 호출하도록 노출.

실행(프로젝트 루트에서): python -m app.mcp_server
통신 방식: stdio(JSON-RPC). 도구 4개는 앱 내부 Function Calling과 같은 함수(rag_tools)를 그대로 재사용한다.
"""
from typing import Literal

from mcp.server.mcpserver import MCPServer

from app.services import rag_tools

# MCP 서버 인스턴스 (Claude Desktop 설정의 서버 이름과 별개로 클라이언트에 보이는 이름)
server = MCPServer("ballet-ai-rag")


@server.tool()
def get_class_schedule() -> list[dict]:
    """발레 수업 시간표를 조회합니다. '오늘 수업 있어?' 같은 질문에 사용."""
    return rag_tools.get_class_schedule()


@server.tool()
def get_seoul_weather() -> dict:
    """서울의 현재 날씨(비/눈 여부 포함), 기온, 풍속, 오늘 강수확률을 조회합니다. (외부 Open-Meteo API, 키·DB 불필요)"""
    return rag_tools.get_seoul_weather()


@server.tool()
def get_moves_by_symptom(
    symptom_id: Literal["ankle_pain", "bunion_pain", "knee_pain", "back_pain"],
) -> dict:
    """증상에 따라 피해야 할 발레 동작 목록을 조회합니다.

    symptom_id: ankle_pain(발목), bunion_pain(무지외반), knee_pain(무릎), back_pain(허리)
    """
    return rag_tools.get_moves_by_symptom(symptom_id)


@server.tool()
def search_term_by_meaning(text: str) -> list[dict]:
    """동작 이름이 생각나지 않을 때, 동작을 설명하는 자연어로 발레 용어를 의미 기반 검색합니다."""
    return rag_tools.search_term_by_meaning(text)


if __name__ == "__main__":
    server.run(transport="stdio")
