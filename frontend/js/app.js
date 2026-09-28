// 배포 후엔 이 값을 실제 Render 백엔드 주소로 바꿔야 한다(README의 API_BASE_URL 환경변수와 대응).
const API_BASE_URL = window.API_BASE_URL || "http://localhost:8000";

// --- 다크모드: <html data-theme="dark|light">에 따라 css/style.css의 CSS 변수가 통째로 바뀐다.
// localStorage에 저장해두면 새로고침해도 마지막 선택이 유지된다.
const themeToggle = document.getElementById("themeToggle");
const savedTheme = localStorage.getItem("theme") || "light";
document.documentElement.setAttribute("data-theme", savedTheme);

themeToggle.addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
});

// async/await 예시 1: 데이터 요약을 백엔드에서 가져와 화면에 그대로 문장으로 박아넣는다.
async function loadSummary() {
  const el = document.getElementById("summaryText");
  try {
    const res = await fetch(`${API_BASE_URL}/api/data/summary`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const s = await res.json();
    el.textContent = `기간 ${s.period} · 총 ${s.count}개 · 평균 ${s.metrics.average}분 · ${s.trend}`;
  } catch (err) {
    el.textContent = "요약을 불러오지 못했어요. 백엔드 서버가 켜져 있는지 확인해주세요.";
  }
}

function appendMessage(text, role) {
  const box = document.getElementById("chatBox");
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.textContent = text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function setLoading(isLoading) {
  document.getElementById("loadingRow").classList.toggle("hidden", !isLoading);
}

// async/await 예시 2: 사용자가 보낸 메시지를 화면에 먼저 붙이고(user 말풍선),
// /api/chat 응답이 올 때까지 로딩 점 세 개를 보여준 뒤, 응답을 assistant 말풍선으로 붙인다.
// 지금은 /api/chat이 없어서 catch로 빠지지만, Day2에서 그 엔드포인트가 생기면
// 이 코드는 수정 없이 그대로 정상 동작한다.
async function sendMessage(message) {
  appendMessage(message, "user");
  setLoading(true);
  try {
    const res = await fetch(`${API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    appendMessage(data.reply, "assistant");
  } catch (err) {
    appendMessage("아직 /api/chat이 준비되지 않았어요 (Day 2에서 연결됩니다).", "assistant");
  } finally {
    setLoading(false);
  }
}

document.getElementById("chatForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("chatInput");
  const message = input.value.trim();
  if (!message) return;
  input.value = "";
  sendMessage(message);
});

document.querySelectorAll(".routine-chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    sendMessage(`${btn.dataset.min}분 루틴 시작해요`);
  });
});

// 스플래시: 최소 900ms는 보여주고, summary 로딩까지 끝나면 살짝 페이드아웃하며 사라진다.
// "최소 시간"을 두는 이유는 요약 fetch가 너무 빨리 끝나면 스플래시가 깜빡이듯 사라져 어색하기 때문.
const splashMinDelay = new Promise((resolve) => setTimeout(resolve, 900));
Promise.all([loadSummary(), splashMinDelay]).then(() => {
  document.getElementById("splash").classList.add("fade-out");
});
