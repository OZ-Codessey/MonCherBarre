"""MCP 서버 점검: 실제로 서버 프로세스를 띄워 stdio로 연결하고, 도구 목록 조회 + 날씨 도구 호출을 확인한다.
Firestore를 거치지 않는 get_seoul_weather(Open-Meteo)만 호출한다.
실행(프로젝트 루트): python scripts/mcp_weather_check.py
"""
import asyncio
import json
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def main():
    params = StdioServerParameters(command=sys.executable, args=["-m", "app.mcp_server"])
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            init = await session.initialize()
            print(f"[1] 서버 연결 성공: {init.server_info.name}")

            tools = await session.list_tools()
            print(f"[2] 도구 {len(tools.tools)}개 등록:")
            for t in tools.tools:
                print(f"    - {t.name}")

            print("[3] get_seoul_weather 호출 (Open-Meteo, DB 미사용)")
            result = await session.call_tool("get_seoul_weather", {})
            text = result.content[0].text
            print("    응답:", json.dumps(json.loads(text), ensure_ascii=False))


asyncio.run(main())
