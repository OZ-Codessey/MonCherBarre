## ✅ 미션 요구사항 충족 체크표

> 

| 미션 항목 | 상태 | 구현 위치 / 확인 방법 |
|:---|:---:|:---|
| **4-1** Python 3.10+, venv, fastapi·uvicorn·firebase-admin·openai·python-dotenv | ✅ | Python 3.12, `requirements.txt` |
| **4-2** 시계열 데이터 100개 이상 + 요약(기간·개수·평균/최대/최소·추세) | ✅ | 연습 기록 **370일**, `GET /api/data/summary` → `period, count, metrics, trend` |
| **4-3** FastAPI 초기화 + CORS + `/docs` | ✅ | `app/main.py`, `ALLOWED_ORIGINS`, [Swagger](https://moncherbarre.onrender.com/docs) |
| **4-4** Firestore 연동, 키는 환경 변수, `data`·`conversations` 컬렉션 | ✅ | `app/core/firebase.py` (환경 변수에 **파일 경로 또는 JSON 문자열**), 코드에 키 없음 |
| **4-5** 데이터 API 5개 (POST/GET/PUT/DELETE + summary) | ✅ | `app/routers/data.py` · 없는 id → 404, 잘못된 입력 → 422 확인 |
| **4-6** 대화 API (POST/GET/DELETE + GET {id}) | ✅ | `app/routers/conversations.py` · 생성→조회→삭제→404 확인 |
| **4-7** `/api/chat`: 요약 조회 → 시스템 프롬프트 삽입 → GPT 호출 → 자동 저장 | ✅ | `app/services/chat_service.py` (`_build_system_prompt` → `_call_with_tools` → `save_exchange`) |
| **4-8** Render 배포 + `/docs` + 콜드스타트 안내 | ✅ | `render.yaml`, `/health`, 5초 넘게 응답이 없으면 화면에 안내 문구 |
| **4-9** 바닐라 프론트(프레임워크 없음): 채팅(로딩 표시)·데이터 관리·대화 기록·요약 표시 | ✅ | `frontend/index.html` · `css/style.css` · `js/app.js` (HTML/CSS/JS만 사용) |
| **4-10** Vercel 배포 + API 주소 설정 + README(소개·스택·URL·실행법·환경변수·스크린샷 3종) | ✅ | 이 문서. API 주소는 `frontend/config.js`의 `API_BASE_URL` (빌드 단계가 없는 정적 배포라 파일로 관리) |
| **7** 배포 고정: 백엔드 Render, 프론트 Vercel | ✅ | [URL](#deployment-urls) |
| **7** 키는 환경 변수, 입력 검증·최소 예외 처리 | ✅ | Pydantic(`schemas/`), 404/422, 도구 실행 예외를 GPT에 알려 답변 유지 |
| **7** 비용 주의(max_tokens 등) | ✅ | `max_completion_tokens=3000`, 도구 반복 최대 6회, GPT에 보내는 이전 대화는 최근 10개만 |
| **트랙 A** Function Calling + MCP 1개 + 호출 근거·흐름 정리 | ✅ | [AI 기술 적용 지도](#-ai-기술-적용-지도-rag--function-calling--mcp) |
| **트랙 B** 지표 1개+, 그래프 1개, 내보내기, 다크 모드 | ✅ | [보너스 과제 충족표](#-보너스-과제-충족표) |

<br>

## 🧭 평가 항목 대응표

> 
### 항목 1 — 실제로 동작하나요? (직접 확인)

| 평가 질문 | 쉽게 풀면 | 이 프로젝트의 답 | 확인 위치 |
|:---|:---|:---|:---|
| 배포 URL로 접속되나? | 주소를 열면 화면이 뜨는가 | 프론트 https://mon-cher-barre.vercel.app, 백엔드 https://moncherbarre.onrender.com/health → `{"status":"ok"}` | [Deployment URLs](#deployment-urls) |
| Swagger UI에서 API 문서가 보이나? | `/docs`에서 API를 눌러 볼 수 있나 | https://moncherbarre.onrender.com/docs | [Swagger 가이드](#-swagger-ui-기능-테스트-가이드) |
| 웹에서 데이터를 추가하면 Firestore에 저장되고 목록에 나오나? | 화면에서 추가 → DB에 저장 → 목록에 바로 표시 | 데이터 탭 `[기록 추가]` → `POST /api/data`(문서 id = 날짜) → 응답을 보관함에 반영해 목록 갱신 | 제출 스크린샷 2번, `js/app.js` `afterDataChange` |
| `/api/data/summary`가 응답하고 채팅이 요약을 반영하나? | 요약 숫자가 나오고, AI 답이 그 숫자를 알고 있나 | 요약(기간·개수·평균/최대/최소·추세)을 시스템 프롬프트에 끼워 넣음 | 제출 스크린샷 1번, `chat_service._build_system_prompt` |
| 대화가 저장되고 목록·불러오기가 되나? | 대화를 저장 → 목록 → 하나 골라 다시 보기 | `POST/GET/DELETE /api/conversations`, `GET /api/conversations/{id}`, 대화 탭 `불러오기` | 제출 스크린샷 3번 |
| 모바일/작은 화면에서도 쓸 수 있나? | 폰 크기에서도 깨지지 않나 | 화면 폭 320px~2560px에서 글자·표·버튼이 함께 줄고 커지며 가로 넘침 0, iPad 가로·세로 전용 배치 | [iPad 최적화](#-ipad-최적화) |  

<br>
<br>

### 항목 2 — 구조를 설명할 수 있나요? (설계 이유)

| 평가 질문 | 쉽게 풀면 | 이 프로젝트의 답 |
|:---|:---|:---|
| 라우터/서비스를 어떤 기준으로 나눴나? | 코드를 파일별로 나눈 이유 | **한 파일이 한 가지 일만** 하게 나눔. `routers/` = 요청을 받고 상태 코드로 돌려주는 창구, `services/` = Firestore·GPT를 쓰는 실제 일, `schemas/` = 입력·출력의 모양과 검사, `core/` = 환경 변수·DB 연결. 같은 로직(도구)을 GPT와 MCP가 함께 쓰려면 창구와 분리되어야 해서 `rag_tools.py` 한 곳에 둠 |
| `data`/`conversations` 컬렉션을 왜 이렇게 설계했나? | DB 안의 자료를 어떤 모양으로 담았나 | **data**: 날짜를 문서 id로 써서 같은 날 중복 방지·날짜로 바로 접근·기간 조회가 쉬움(`date`,`value`,`memo` 3칸은 미션 형식). **conversations**: 대화 1개 = 문서 1개, 메시지 목록을 문서 안에 넣어 **한 번 읽으면 대화 전체**(읽기 1건), `updated_at`으로 최근 N일 조회 |
| Pydantic 스키마를 어떤 기준으로 정의하고 어디에서 검증하나? | 입력이 올바른지 누가·어디서 검사하나 | 요청마다 모델을 둠(`DataCreate/Update`, `ConversationCreate`, `ChatRequest`). **라우터가 요청을 받는 순간** FastAPI가 자동 검사해 틀리면 `422`. 규칙: 날짜 형식, 연습 시간 0~1440분, 메모 200자, 대화 제목 100자, 질문 1~2000자. 존재하지 않는 id는 서비스에서 확인해 `404` |
| 프론트의 데이터 관리/대화 불러오기/채팅은 어떤 상태 흐름인가? | 화면 세 곳이 어떻게 이어지나 | **데이터**: 기간 보관함(`PracticeStore`) → `applyFilter` → 목록 그리기, 추가·수정·삭제하면 보관함을 바꾸고 목록·통계를 다시 그림. **대화**: 보관함(`ConvStore`) → 목록 → `불러오기`가 `currentConvId`를 그 대화로 지정. **채팅**: `sendMessage`가 `currentConvId`와 함께 `/api/chat` 호출 → 응답의 `conversation_id`를 저장해 같은 대화에 이어 쓰고, 방금 나눈 대화를 대화 보관함에 즉시 반영 |  

<br>
<br>

### 항목 3 — 왜 이렇게 했나요? (선택 이유와 장단점)

| 평가 질문 | 쉽게 풀면 | 이 프로젝트의 답 |
|:---|:---|:---|
| 컨텍스트 주입을 왜 썼고 장단점은? | AI에게 내 데이터를 알려 주는 방법 | **이유**: GPT는 내 연습 기록을 모르므로 질문 직전에 요약을 프롬프트 앞에 끼워 줌. **장점**: 구현이 단순하고, 기록 전체가 아니라 요약만 보내 토큰·비용이 적음. **단점**: 요약에 없는 세부(특정 날짜의 값)는 모르고, 프롬프트 길이에 한계가 있음. → 최근 14일과 비서 메모를 함께 넣고, 필요한 것은 도구(Function Calling)로 보완 |
| 요약(`/summary`)을 따로 둔 이유는? | 요약 계산을 왜 별도 API로 뺐나 | **책임 분리**(계산은 `data_service`, 채팅은 가져다 쓰기만)와 **재사용**(채팅·화면 카드·Swagger·MCP가 같은 값). 요약을 Firestore 문서 1장(`meta/summary`)에 저장해 읽기도 1건으로 줄임 |
| 대화는 언제·어떤 형태로 저장하나? | 저장 시점과 모양 | **GPT 답변이 성공한 뒤에** 질문·답변을 **한 번에** 저장(`save_exchange`). 실패하면 빈 대화방이 남지 않음. 형태는 `title`(첫 질문 15자) + `messages[]`(role, content) + `updated_at` |
| 환경 변수를 왜 도입했고 어떻게 적용했나? | 키를 코드에 쓰지 않는 이유와 방법 | **이유**: 코드에 키를 쓰면 GitHub와 함께 유출되고, 로컬/Render마다 값이 달라야 함. **적용**: 로컬 `.env`→`core/config.py`가 읽음, Render는 대시보드 입력(`render.yaml`에는 이름만, `sync: false`), Firebase 키는 파일 경로 또는 JSON 문자열 둘 다 지원, CORS 허용 도메인(`ALLOWED_ORIGINS`)도 변수로 |

<br>
<br>

### 항목 4 — 문제가 생기면 어떻게 하나요? (운영·보안·확장)

| 평가 질문 | 쉽게 풀면 | 이 프로젝트의 답 |
|:---|:---|:---|
| 콜드 스타트를 어떻게 안내·완화했나? | 서버가 잠들어 첫 응답이 느릴 때 | 응답이 5초 넘게 없으면 화면에 "서버가 잠들어 있었다면 최대 1분" 안내를 보여 주고, 답변 대기 중에는 "답변을 준비하고 있어요" 표시와 전송 버튼 잠금. `/health`로 서버 상태 확인 |
| CORS가 왜 생기고 어떻게 해결했나? | 다른 주소의 화면이 서버를 부를 때 브라우저가 막는 문제 | 프론트(vercel.app)와 백엔드(onrender.com)는 **주소가 달라** 브라우저가 기본으로 요청을 막음. 백엔드가 허용할 주소를 `ALLOWED_ORIGINS` 환경 변수로 등록하고 `CORSMiddleware`에 적용 |
| 사용자 입력의 위험과 최소 대응은? | 이상한 글·값이 들어오면 | **위험**: ① 화면에 넣을 때 악성 스크립트 실행 ② 터무니없는 값으로 데이터 오염 ③ 너무 긴 입력으로 비용 증가. **대응**: Pydantic으로 범위·길이 제한(`422`), 연습 시간 0~1440분·메모 200자·질문 2000자, 도구 인자(증상 id)는 4가지 목록으로 제한, **화면에 넣기 전 이스케이프**(`escHtml`)로 태그를 글자로 바꿈, 채팅 렌더러는 모든 HTML을 이스케이프한 뒤 표·번호·링크만 변환 |
| 데이터가 늘거나 요약 기준이 바뀌면(예: 최근 30일만) 어디를 고치나? | 요약 계산을 바꾸는 방법 | **`data_service._compute_summary`**: 전체(`list_data`) 대신 기간 조회(`list_data_range`)로 최근 30일만 계산. 바꾼 뒤 Firestore의 `meta/summary` 문서를 지우면 다음 조회 때 새 기준으로 다시 계산. 프롬프트 문구는 `chat_service._build_system_prompt`, "최근 14일"은 `recent_days(14)`. 데이터가 늘어도 화면·채팅은 기간 조회라 읽기가 늘지 않음 |