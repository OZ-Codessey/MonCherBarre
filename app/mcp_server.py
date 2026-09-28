#!/usr/bin/env python3
"""MCP 서버: Claude Desktop/외부 MCP 클라이언트에서 발레 AI 도구를 호출하도록 노출."""
import json
import sys

from mcp.server import Server
from mcp.types import Tool, TextContent, ToolResult

from app.services import rag_tools

# MCP 서버 인스턴스
server = Server("ballet-ai-rag")


@server.list_tools()
async def list_tools() -> list[Tool]:
    """사용 가능한 도구 목록 정의."""
    return [
        Tool(
            name="get_class_schedule",
            description="발레 수업 시간표를 조회합니다. '오늘 수업 있어?' 같은 질문에 사용.",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
        Tool(
            name="get_seoul_weather",
            description="서울의 현재 기온과 풍속을 조회합니다.",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
        Tool(
            name="get_moves_by_symptom",
            description="증상에 따라 피해야 할 발레 동작 목록을 조회합니다.",
            inputSchema={
                "type": "object",
                "properties": {
                    "symptom_id": {
                        "type": "string",
                        "enum": ["ankle_pain", "bunion_pain", "knee_pain", "back_pain"],
                        "description": "증상 ID (발목_통증, 무지외반_통증, 무릎_통증, 허리_통증)",
                    }
                },
                "required": ["symptom_id"],
            },
        ),
        Tool(
            name="search_term_by_meaning",
            description="동작 이름이 생각나지 않을 때, 동작을 설명하는 자연어로 발레 용어를 의미 기반 검색합니다.",
            inputSchema={
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": "동작에 대한 자연어 설명",
                    }
                },
                "required": ["text"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> ToolResult:
    """도구 호출을 처리하고 결과를 반환."""
    try:
        if name == "get_class_schedule":
            result = rag_tools.get_class_schedule()
        elif name == "get_seoul_weather":
            result = rag_tools.get_seoul_weather()
        elif name == "get_moves_by_symptom":
            result = rag_tools.get_moves_by_symptom(arguments["symptom_id"])
        elif name == "search_term_by_meaning":
            result = rag_tools.search_term_by_meaning(arguments["text"])
        else:
            return ToolResult(content=[TextContent(type="text", text=f"Unknown tool: {name}")])

        return ToolResult(content=[TextContent(type="text", text=json.dumps(result, ensure_ascii=False))])
    except Exception as e:
        return ToolResult(content=[TextContent(type="text", text=f"Error: {str(e)}")])


async def main():
    async with server:
        print(f"Ballet AI MCP Server running on stdio", file=sys.stderr)
        await server.wait_closed()


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
