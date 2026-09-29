const API_BASE_URL = window.API_BASE_URL || "http://localhost:8000";

// --- 테마 ---
const themeToggle = document.getElementById("themeToggle");
const savedTheme = localStorage.getItem("theme") || "light";
document.documentElement.setAttribute("data-theme", savedTheme);
themeToggle.addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
});

// --- 탭 전환 ---
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-section").forEach((s) => s.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`${btn.dataset.tab}-section`).classList.add("active");
  });
});

// --- 스플래시 ---
async function loadSummary() {
  const el = document.getElementById("summaryText");
  try {
    const res = await fetch(`${API_BASE_URL}/api/data/summary`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const s = await res.json();
    el.textContent = `기간 ${s.period} · 총 ${s.count}개 · 평균 ${s.metrics.average}분 · ${s.trend}`;
  } catch (err) {
    el.textContent = "요약을 불러오지 못했어요.";
  }
}

const splashMinDelay = new Promise((resolve) => setTimeout(resolve, 900));
Promise.all([loadSummary(), splashMinDelay]).then(() => {
  document.getElementById("splash").classList.add("fade-out");
});

// --- 채팅 ---
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

let currentConvId = null;

async function sendMessage(message) {
  appendMessage(message, "user");
  setLoading(true);
  try {
    const res = await fetch(`${API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, conversation_id: currentConvId }),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    currentConvId = data.conversation_id;
    appendMessage(data.reply, "assistant");
  } catch (err) {
    appendMessage("답변을 받지 못했어요. 다시 시도해주세요.", "assistant");
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

// --- 데이터 관리 ---
document.getElementById("dataForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const date = document.getElementById("dataDate").value;
  const value = parseFloat(document.getElementById("dataValue").value);
  const memo = document.getElementById("dataMemo").value || null;

  try {
    const res = await fetch(`${API_BASE_URL}/api/data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, value, memo }),
    });
    if (!res.ok) throw new Error();
    alert("기록이 추가됐습니다!");
    e.target.reset();
    loadDataList();
  } catch (err) {
    alert("추가에 실패했어요.");
  }
});

async function loadDataList() {
  const container = document.getElementById("dataListContainer");
  try {
    const res = await fetch(`${API_BASE_URL}/api/data`);
    if (!res.ok) throw new Error();
    const items = await res.json();

    if (items.length === 0) {
      container.innerHTML = "<p class='loading'>기록이 없어요.</p>";
      return;
    }

    container.innerHTML = items.reverse().map((item) => `
      <div class="data-item" id="item-${item.id}">
        <div class="data-item-info">
          <div class="data-item-date">${item.date} · ${item.value}분</div>
          <div class="data-item-meta">${item.memo || "메모 없음"}</div>
        </div>
        <div class="data-item-actions">
          <button class="btn-small btn-edit" onclick="showEditForm('${item.id}','${item.date}',${item.value},'${item.memo || ""}')">수정</button>
          <button class="btn-small btn-delete" onclick="deleteData('${item.id}')">삭제</button>
        </div>
      </div>
    `).join("");
  } catch (err) {
    container.innerHTML = "<p class='loading'>불러오지 못했어요.</p>";
  }
}

async function deleteData(id) {
  if (!confirm("삭제하시겠어요?")) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/data/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error();
    loadDataList();
  } catch (err) {
    alert("삭제에 실패했어요.");
  }
}

function showEditForm(id, date, value, memo) {
  const row = document.getElementById(`item-${id}`);
  row.innerHTML = `
    <form class="edit-inline" onsubmit="updateData(event,'${id}')">
      <input type="date" class="edit-date" value="${date}" required />
      <input type="number" class="edit-value" value="${value}" min="0" max="300" required />
      <input type="text" class="edit-memo" value="${memo}" placeholder="메모" />
      <div class="edit-actions">
        <button type="submit" class="btn-small btn-edit">저장</button>
        <button type="button" class="btn-small" onclick="loadDataList()">취소</button>
      </div>
    </form>`;
}

async function updateData(e, id) {
  e.preventDefault();
  const form = e.target;
  const date = form.querySelector(".edit-date").value;
  const value = parseFloat(form.querySelector(".edit-value").value);
  const memo = form.querySelector(".edit-memo").value || null;
  try {
    const res = await fetch(`${API_BASE_URL}/api/data/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, value, memo }),
    });
    if (!res.ok) throw new Error();
    loadDataList();
    loadStatistics();
  } catch (err) {
    alert("수정에 실패했어요.");
  }
}

// --- 통계 차트 ---
let monthlyChartInstance = null;

async function loadStatistics() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/data/statistics`);
    if (!res.ok) throw new Error();
    const stats = await res.json();

    document.getElementById("streakDays").textContent = stats.streak_days;
    document.getElementById("bestDay").textContent = stats.best_day;

    const labels = Object.keys(stats.monthly_avg_min);
    const values = Object.values(stats.monthly_avg_min);
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const barColor = isDark ? "rgba(210,170,190,0.75)" : "rgba(160,90,115,0.75)";
    const textColor = isDark ? "#e8d8df" : "#4a2535";

    if (monthlyChartInstance) monthlyChartInstance.destroy();
    monthlyChartInstance = new Chart(document.getElementById("monthlyChart"), {
      type: "bar",
      data: {
        labels,
        datasets: [{ label: "월평균 연습(분)", data: values, backgroundColor: barColor, borderRadius: 6 }],
      },
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: textColor } } },
        scales: {
          x: { ticks: { color: textColor } },
          y: { ticks: { color: textColor }, beginAtZero: true },
        },
      },
    });
  } catch (err) {
    // 통계 실패해도 다른 기능에 영향 없음
  }
}

// 다크모드 전환 시 차트 색상도 업데이트
themeToggle.addEventListener("click", () => loadStatistics());

// --- 대화 기록 ---
async function loadConversationsList() {
  const container = document.getElementById("conversationsListContainer");
  try {
    const res = await fetch(`${API_BASE_URL}/api/conversations`);
    if (!res.ok) throw new Error();
    const convs = await res.json();

    if (convs.length === 0) {
      container.innerHTML = "<p class='loading'>저장된 대화가 없어요.</p>";
      return;
    }

    container.innerHTML = convs.reverse().map((c) => `
      <div class="conversation-item">
        <div class="conversation-item-info">
          <div class="conversation-item-title">${c.title}</div>
          <div class="data-item-meta">${c.messages.length}개 메시지</div>
        </div>
        <div class="conversation-item-actions">
          <button class="btn-small btn-load" onclick="loadConversation('${c.id}', '${c.title.replace(/"/g, '\\"')}')">불러오기</button>
        </div>
      </div>
    `).join("");
  } catch (err) {
    container.innerHTML = "<p class='loading'>불러오지 못했어요.</p>";
  }
}

function loadConversation(convId, title) {
  const detail = document.getElementById("conversationDetail");
  const msgContainer = document.getElementById("conversationMessages");

  fetch(`${API_BASE_URL}/api/conversations/${convId}`)
    .then((res) => res.json())
    .then((conv) => {
      currentConvId = convId;
      document.getElementById("conversationTitle").textContent = conv.title;
      msgContainer.innerHTML = conv.messages.map((m) => `
        <div class="conversation-message ${m.role}">
          ${m.content}
        </div>
      `).join("");
      detail.classList.remove("hidden");
    })
    .catch(() => alert("불러오지 못했어요."));
}

// --- 내보내기 ---
function triggerDownload(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportCSV() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/data`);
    if (!res.ok) throw new Error();
    const items = await res.json();
    const header = "날짜,연습시간(분),메모";
    const rows = items.map((i) => `${i.date},${i.value},"${i.memo || ""}"`);
    triggerDownload([header, ...rows].join("\n"), "moncherbarre_data.csv", "text/csv;charset=utf-8;");
  } catch {
    alert("내보내기에 실패했어요.");
  }
}

async function exportJSON() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/data`);
    if (!res.ok) throw new Error();
    const items = await res.json();
    triggerDownload(JSON.stringify(items, null, 2), "moncherbarre_data.json", "application/json");
  } catch {
    alert("내보내기에 실패했어요.");
  }
}

// --- 초기화 ---
document.addEventListener("DOMContentLoaded", () => {
  loadDataList();
  loadStatistics();
  loadConversationsList();
});
