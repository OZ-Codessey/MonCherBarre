const API_BASE_URL = window.API_BASE_URL || "https://moncherbarre.onrender.com";

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

let coldStartTimer = null;

function setLoading(isLoading) {
  document.getElementById("loadingRow").classList.toggle("hidden", !isLoading);
  const notice = document.getElementById("coldStartNotice");
  if (isLoading) {
    // 5초 후에도 응답 없으면 콜드스타트 안내 표시
    coldStartTimer = setTimeout(() => notice.classList.remove("hidden"), 5000);
  } else {
    clearTimeout(coldStartTimer);
    notice.classList.add("hidden");
  }
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

// D1~D5: 전체 데이터, 필터된 데이터, 표시 상태 관리
let allItems = [];
let filteredItems = [];
let allConversations = [];  // 메모 검색에 포함할 대화 기록
let showAll = false;
const SHOW_LIMIT = 20;

// 통계 차트 인스턴스 (다크모드/필터 시 업데이트용)
let monthlyChartInstance, dayChartInstance, totalChartInstance, symptomChartInstance;

async function loadDataList() {
  const container = document.getElementById("dataListContainer");
  try {
    const [dataRes, convRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/data`),
      fetch(`${API_BASE_URL}/api/conversations`)
    ]);
    if (!dataRes.ok) throw new Error();
    const items = await dataRes.json();
    allConversations = convRes.ok ? await convRes.json() : [];  // 메모 검색용
    // D5: 날짜 내림차순 정렬(최신이 위) — 추가/수정/삭제 후에도 일관성 보장
    allItems = items.sort((a, b) => b.date.localeCompare(a.date));
    filteredItems = [...allItems];
    showAll = false;
    renderDataList();
  } catch (err) {
    container.innerHTML = "<p class='loading'>불러오지 못했어요.</p>";
  }
}

function renderDataList() {
  const container = document.getElementById("dataListContainer");
  const showMoreRow = document.getElementById("showMoreRow");
  const showMoreBtn = document.getElementById("showMoreBtn");

  if (filteredItems.length === 0) {
    container.innerHTML = "<p class='loading'>검색 결과가 없어요.</p>";
    showMoreRow.classList.add("hidden");
    document.getElementById("filterStatus").textContent = "검색 결과 없음";
    return;
  }

  // D1: 기본 20개만 표시
  const toShow = showAll ? filteredItems : filteredItems.slice(0, SHOW_LIMIT);

  container.innerHTML = toShow.map((item) => `
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

  // 더보기/접기 버튼
  if (filteredItems.length > SHOW_LIMIT) {
    showMoreRow.classList.remove("hidden");
    showMoreBtn.textContent = showAll
      ? `접기 ↑`
      : `더 보기 (${filteredItems.length - SHOW_LIMIT}개 더) ↓`;
  } else {
    showMoreRow.classList.add("hidden");
  }

  // 필터 상태 표시
  document.getElementById("filterStatus").textContent =
    allItems.length !== filteredItems.length
      ? `전체 ${allItems.length}개 중 ${filteredItems.length}개 표시`
      : `전체 ${allItems.length}개`;
}

// D1: 더보기/접기 토글
function toggleShowMore() {
  showAll = !showAll;
  renderDataList();
}

// D2~D4: 날짜·기간·키워드 필터
function applyFilter() {
  const date    = document.getElementById("searchDate").value;
  const start   = document.getElementById("searchStart").value;
  const end     = document.getElementById("searchEnd").value;
  const keyword = document.getElementById("searchKeyword").value.trim().toLowerCase();

  filteredItems = allItems.filter((item) => {
    if (date    && item.date !== date)                                     return false;
    if (start   && item.date < start)                                      return false;
    if (end     && item.date > end)                                        return false;
    if (keyword) {
      // 메모 검색: data의 memo + conversations의 모든 메시지 포함
      const inMemo = (item.memo || "").toLowerCase().includes(keyword);
      const inConversations = allConversations.some(conv =>
        conv.title.toLowerCase().includes(keyword) ||
        (conv.messages || []).some(msg =>
          (msg.content || msg.reply || "").toLowerCase().includes(keyword)
        )
      );
      if (!inMemo && !inConversations) return false;
    }
    return true;
  });

  showAll = false;
  renderDataList();
  updateFilteredStatistics();  // 필터된 데이터로 차트 업데이트
}

function clearFilter() {
  ["searchDate","searchStart","searchEnd","searchKeyword"].forEach((id) => {
    document.getElementById(id).value = "";
  });
  filteredItems = [...allItems];
  showAll = false;
  renderDataList();
  loadStatistics();  // 전체 통계 복원
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
  // date 포맷 보장: YYYY-MM-DD (2자리 월일)
  const dateStr = date.includes('-') ? date : new Date(date).toISOString().split('T')[0];
  row.innerHTML = `
    <form class="edit-inline" onsubmit="updateData(event,'${id}')">
      <input type="date" class="edit-date" value="${dateStr}" required />
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

// --- 통계 차트 (4개: 월별평균, 요일별분포, 누적시간, 부상별운동) ---
async function loadStatistics() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/data/statistics`);
    if (!res.ok) throw new Error();
    const stats = await res.json();

    // 배지 업데이트
    document.getElementById("streakDays").textContent = stats.streak_days;
    document.getElementById("bestDay").textContent = stats.best_day;
    document.getElementById("totalHours").textContent = Math.floor(stats.total_hours);

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const barColor = isDark ? "rgba(210,170,190,0.75)" : "rgba(160,90,115,0.75)";
    const pieColor1 = isDark ? "rgba(210,170,190,0.85)" : "rgba(160,90,115,0.85)";
    const pieColor2 = isDark ? "rgba(175,130,155,0.85)" : "rgba(190,130,155,0.85)";
    const textColor = isDark ? "#e8d8df" : "#4a2535";
    const axisBg = isDark ? "rgba(50,40,45,0.5)" : "rgba(244,229,234,0.5)";

    // 1️⃣ 월별 평균 (bar)
    if (monthlyChartInstance) monthlyChartInstance.destroy();
    monthlyChartInstance = new Chart(document.getElementById("monthlyChart"), {
      type: "bar",
      data: {
        labels: Object.keys(stats.monthly_avg_min),
        datasets: [{ label: "분", data: Object.values(stats.monthly_avg_min), backgroundColor: barColor, borderRadius: 6 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { labels: { color: textColor }, display: false } },
        scales: {
          x: { ticks: { color: textColor, font: { size: 11 } }, grid: { display: false } },
          y: { ticks: { color: textColor, font: { size: 11 } }, beginAtZero: true, grid: { color: axisBg } },
        },
      },
    });

    // 2️⃣ 요일별 분포 (bar)
    const dayNames = ["월", "화", "수", "목", "금", "토", "일"];
    if (dayChartInstance) dayChartInstance.destroy();
    dayChartInstance = new Chart(document.getElementById("dayChart"), {
      type: "bar",
      data: {
        labels: dayNames,
        datasets: [{ label: "분", data: dayNames.map(d => stats.day_totals_min[d] || 0), backgroundColor: barColor, borderRadius: 6 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { labels: { color: textColor }, display: false } },
        scales: {
          x: { ticks: { color: textColor, font: { size: 11 } }, grid: { display: false } },
          y: { ticks: { color: textColor, font: { size: 11 } }, beginAtZero: true, grid: { color: axisBg } },
        },
      },
    });

    // 3️⃣ 누적 시간 (doughnut gauge)
    const totalMinutes = stats.total_minutes;
    const targetMinutes = 20000; // 목표: 333시간(20000분)
    const progressPct = Math.min((totalMinutes / targetMinutes) * 100, 100);
    if (totalChartInstance) totalChartInstance.destroy();
    totalChartInstance = new Chart(document.getElementById("totalChart"), {
      type: "doughnut",
      data: {
        labels: ["달성", "남은"],
        datasets: [{
          data: [progressPct, 100 - progressPct],
          backgroundColor: [pieColor1, axisBg],
          borderColor: [isDark ? "#1d1719" : "#ffffff", "transparent"],
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: () => "" } },
        },
      },
    });

    // 4️⃣ 부상별 강화운동 (pie)
    const symptomNames = Object.keys(stats.symptom_exercise_counts);
    const symptomCounts = Object.values(stats.symptom_exercise_counts);
    const colors = [pieColor1, pieColor2, barColor].concat(Array(symptomNames.length).fill(axisBg));
    if (symptomChartInstance) symptomChartInstance.destroy();
    symptomChartInstance = new Chart(document.getElementById("symptomChart"), {
      type: "pie",
      data: {
        labels: symptomNames,
        datasets: [{
          data: symptomCounts,
          backgroundColor: colors.slice(0, symptomNames.length),
          borderColor: isDark ? "#1d1719" : "#ffffff",
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { labels: { color: textColor, font: { size: 11 } }, position: "bottom" },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.parsed}개` } },
        },
      },
    });

    // 통계 설명 생성
    updateStatsNote(stats);
  } catch (err) {
    console.error("Statistics load failed:", err);
  }
}

function updateStatsNote(stats) {
  const note = document.getElementById("statsNote");
  const totalHours = Math.floor(stats.total_hours);
  const streakText = stats.streak_days > 0 ? `${stats.streak_days}일 연속` : "아직 없음";
  const bestDayText = stats.best_day !== "-" ? `${stats.best_day}요일` : "데이터 부족";
  note.textContent = `📊 총 ${totalHours}시간 연습 · ${streakText} · 최다 요일 ${bestDayText} · ${stats.monthly_avg_min ? Object.keys(stats.monthly_avg_min).length : 0}개월 기록`;
}

// 필터된 데이터로 차트 업데이트 (search/filter 적용 시)
function updateFilteredStatistics() {
  if (filteredItems.length === 0) {
    document.getElementById("statsNote").textContent = "선택한 기간/키워드에 해당하는 데이터가 없어요.";
    return;
  }

  const DAY_NAMES = ["월", "화", "수", "목", "금", "토", "일"];
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const barColor = isDark ? "rgba(210,170,190,0.75)" : "rgba(160,90,115,0.75)";
  const pieColor1 = isDark ? "rgba(210,170,190,0.85)" : "rgba(160,90,115,0.85)";
  const pieColor2 = isDark ? "rgba(175,130,155,0.85)" : "rgba(190,130,155,0.85)";
  const textColor = isDark ? "#e8d8df" : "#4a2535";
  const axisBg = isDark ? "rgba(50,40,45,0.5)" : "rgba(244,229,234,0.5)";

  // 필터된 데이터 분석
  const monthly = {};
  const dayTotals = {};
  let totalMinutes = 0;

  filteredItems.forEach(item => {
    const dt = new Date(item.date);
    const monthKey = item.date.substring(0, 7);
    const dayIdx = dt.getDay() === 0 ? 6 : dt.getDay() - 1;
    const dayName = DAY_NAMES[dayIdx];

    monthly[monthKey] = (monthly[monthKey] || 0) + item.value;
    dayTotals[dayName] = (dayTotals[dayName] || 0) + item.value;
    totalMinutes += item.value;
  });

  // 월별 평균 (월별 합계 / 그 달의 기록 개수)
  const monthCounts = {};
  filteredItems.forEach(item => {
    const monthKey = item.date.substring(0, 7);
    monthCounts[monthKey] = (monthCounts[monthKey] || 0) + 1;
  });
  const monthlyAvg = Object.entries(monthly).reduce((acc, [k, v]) => {
    acc[k] = Math.round((v / monthCounts[k]) * 10) / 10;
    return acc;
  }, {});

  // 1️⃣ 월별 평균 업데이트
  if (monthlyChartInstance) monthlyChartInstance.destroy();
  monthlyChartInstance = new Chart(document.getElementById("monthlyChart"), {
    type: "bar",
    data: {
      labels: Object.keys(monthlyAvg),
      datasets: [{ label: "분", data: Object.values(monthlyAvg), backgroundColor: barColor, borderRadius: 6 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { labels: { color: textColor }, display: false } },
      scales: {
        x: { ticks: { color: textColor, font: { size: 11 } }, grid: { display: false } },
        y: { ticks: { color: textColor, font: { size: 11 } }, beginAtZero: true, grid: { color: axisBg } },
      },
    },
  });

  // 2️⃣ 요일별 분포 업데이트
  if (dayChartInstance) dayChartInstance.destroy();
  dayChartInstance = new Chart(document.getElementById("dayChart"), {
    type: "bar",
    data: {
      labels: DAY_NAMES,
      datasets: [{ label: "분", data: DAY_NAMES.map(d => dayTotals[d] || 0), backgroundColor: barColor, borderRadius: 6 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { labels: { color: textColor }, display: false } },
      scales: {
        x: { ticks: { color: textColor, font: { size: 11 } }, grid: { display: false } },
        y: { ticks: { color: textColor, font: { size: 11 } }, beginAtZero: true, grid: { color: axisBg } },
      },
    },
  });

  // 3️⃣ 누적 시간 업데이트
  const targetMinutes = 20000;
  const progressPct = Math.min((totalMinutes / targetMinutes) * 100, 100);
  if (totalChartInstance) totalChartInstance.destroy();
  totalChartInstance = new Chart(document.getElementById("totalChart"), {
    type: "doughnut",
    data: {
      labels: ["달성", "남은"],
      datasets: [{
        data: [progressPct, 100 - progressPct],
        backgroundColor: [pieColor1, axisBg],
        borderColor: [isDark ? "#1d1719" : "#ffffff", "transparent"],
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: () => "" } },
      },
    },
  });

  // 통계 설명 업데이트
  const totalHours = Math.round(totalMinutes / 60 * 10) / 10;
  const count = filteredItems.length;
  const note = document.getElementById("statsNote");
  note.textContent = `📊 선택 기간: ${count}개 기록 · ${totalHours}시간 · 평균 ${Math.round(totalMinutes / count)}분/기록`;
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

// --- 발레 사전 ---
let allMoves = [];
let filteredMoves = [];
let selectedAlphabet = "A";

async function loadDictionary() {
  try {
    // ⚡ 성능 최적화: localStorage 캐싱으로 Firestore 할당량 99% 절감
    // - 첫 방문: API에서 96개 용어 조회 (Firestore 읽기 96회, 1회만)
    // - 이후 방문: localStorage에서 로드 (네트워크 요청 0회, 초고속!)
    // - 알파벳 검색: 로컬 필터링만 수행 (Firestore 쿼리 0회)
    const cached = localStorage.getItem('allMoves');
    if (cached) {
      allMoves = JSON.parse(cached);
    } else {
      // 첫 방문 시에만 API 호출 → 96개 용어를 받아서 localStorage에 저장
      const res = await fetch(`${API_BASE_URL}/api/moves`);
      if (!res.ok) throw new Error();
      allMoves = await res.json();
      localStorage.setItem('allMoves', JSON.stringify(allMoves));
    }

    // 알파벳 필터 UI 생성 (A-Z 버튼, "전체" 버튼)
    const filterContainer = document.getElementById("alphabetFilter");
    filterContainer.innerHTML = "";
    const alphabets = ["전체", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];
    alphabets.forEach(letter => {
      const btn = document.createElement("button");
      btn.className = `alphabet-btn ${letter === "전체" ? "active" : ""}`;
      btn.textContent = letter;
      btn.onclick = () => filterDictionaryByAlphabet(letter);
      filterContainer.appendChild(btn);
    });

    // 기본 화면: 전체 용어 표시
    filterDictionaryByAlphabet("전체");
  } catch (err) {
    document.getElementById("dictionaryListContainer").innerHTML = "<p class='loading'>불러오지 못했어요.</p>";
  }
}

function filterDictionaryByAlphabet(letter) {
  selectedAlphabet = letter;

  // 버튼 상태 업데이트
  document.querySelectorAll(".alphabet-btn").forEach(btn => {
    btn.classList.toggle("active", btn.textContent === letter);
  });

  if (letter === "전체") {
    filteredMoves = [...allMoves];
  } else {
    filteredMoves = allMoves.filter(move =>
      move.french_term.toUpperCase().startsWith(letter)
    );
  }

  renderDictionary();
}

function renderDictionary() {
  const container = document.getElementById("dictionaryListContainer");

  if (filteredMoves.length === 0) {
    container.innerHTML = "<p class='loading'>해당하는 용어가 없어요.</p>";
    return;
  }

  // 🎬 각 용어 리스트 (클릭하면 Firestore 데이터로 상세보기)
  container.innerHTML = filteredMoves.map(move => `
    <div class="dictionary-item" onclick="showDictionaryDetail('${move.french_term.replace(/'/g, "\\'")}')">
      <div>
        <span class="dictionary-item-term">${move.french_term}</span>
        <span class="dictionary-item-pron">(${move.korean_name})</span>
      </div>
    </div>
  `).join("");
}

function closeDictionaryDetail() {
  document.getElementById("dictionaryDetail").classList.add("hidden");
}

// ============================================================================
// 🎭 FAVORITES (즐겨찾기)
// ============================================================================

let currentDictTerm = null;  // 현재 선택한 발레 용어

// 즐겨찾기에 추가
async function addToFavorites() {
  if (!currentDictTerm) {
    alert("용어를 선택해주세요.");
    return;
  }

  const move = allMoves.find(m => m.french_term === currentDictTerm);
  if (!move || !move.main_video || !move.main_video.url) {
    alert("저장할 영상이 없습니다.");
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/favorites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        french_term: move.french_term,
        korean_name: move.korean_name,
        video_id: move.main_video.url.split("v=")[1],
        video_title: move.main_video.title,
        video_url: move.main_video.url,
        channel: move.main_video.channel,
        source: move.main_video.source,
      }),
    });

    if (response.ok) {
      const btn = document.getElementById("favoriteBtn");
      btn.classList.add("active");
      btn.textContent = "⚜️ Sauvegardé";
      setTimeout(() => {
        btn.classList.remove("active");
        btn.textContent = "⚜️ Ajouter";
      }, 2000);
      loadFavorites();  // 목록 새로고침
    }
  } catch (err) {
    console.error("즐겨찾기 저장 오류:", err);
    alert("저장에 실패했습니다.");
  }
}

// 즐겨찾기 목록 로드
async function loadFavorites() {
  const container = document.getElementById("favoritesList");
  try {
    const response = await fetch(`${API_BASE_URL}/api/favorites`);
    if (!response.ok) throw new Error(`status ${response.status}`);
    const favorites = await response.json();

    if (!favorites || favorites.length === 0) {
      container.innerHTML = `
        <div class="favorites-empty">
          <p>⚜️ Votre collection est vide</p>
          <p style="font-size: 0.85rem; margin-top: 8px;">발레 사전에서 영상을 보고 추가 버튼을 눌러보세요.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = favorites.map(fav => `
      <div class="favorite-card">
        <div class="favorite-card-header">
          <h4>${fav.korean_name || fav.french_term}</h4>
          <p>${fav.french_term}</p>
        </div>
        <div class="favorite-card-body">
          <div class="favorite-meta">
            <div class="favorite-meta-item">
              <span class="favorite-meta-label">채널:</span>
              <span>${fav.channel}</span>
            </div>
            <div class="favorite-meta-item">
              <span class="favorite-meta-label">소스:</span>
              <span>${fav.source}</span>
            </div>
            <div class="favorite-meta-item">
              <span class="favorite-meta-label">저장일:</span>
              <span>${new Date(fav.saved_at).toLocaleDateString("ko-KR")}</span>
            </div>
          </div>
        </div>
        <div class="favorite-card-footer">
          <a href="${fav.video_url}" target="_blank" class="btn-play">🎬 재생</a>
          <button class="btn-remove" onclick="removeFavorite('${fav.id}')">삭제</button>
        </div>
      </div>
    `).join("");
  } catch (err) {
    console.error("즐겨찾기 로드 오류:", err);
    container.innerHTML = `<div class="favorites-empty"><p>즐겨찾기를 불러오지 못했어요.</p></div>`;
  }
}

// 즐겨찾기 제거
async function removeFavorite(id) {
  if (!confirm("정말 삭제하시겠습니까?")) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/favorites/${id}`, {
      method: "DELETE",
    });

    if (response.ok) {
      loadFavorites();  // 목록 새로고침
    }
  } catch (err) {
    console.error("즐겨찾기 삭제 오류:", err);
    alert("삭제에 실패했습니다.");
  }
}

// 더 많은 영상 찾기 (on-demand YouTube 검색)
async function searchMoreVideos() {
  if (!currentDictTerm) return;

  const moreBtn = document.getElementById("moreVideosBtn");
  moreBtn.textContent = "🔄 검색 중...";
  moreBtn.disabled = true;

  try {
    const response = await fetch(`${API_BASE_URL}/api/moves/${currentDictTerm}/videos`);
    if (response.ok) {
      const videos = await response.json();
      // 기존 showDictionaryDetail 호출하여 업데이트
      const move = allMoves.find(m => m.french_term === currentDictTerm);
      if (move && videos.length > 0) {
        move.additional_videos = videos.slice(1, 5);
        showDictionaryDetail(currentDictTerm);
      }
    }
  } catch (err) {
    console.error("영상 검색 오류:", err);
  } finally {
    moreBtn.textContent = "🔍 더 많은 영상 찾기";
    moreBtn.disabled = false;
  }
}

// 용어 선택 시 currentDictTerm 저장
function showDictionaryDetail(frenchTerm) {
  currentDictTerm = frenchTerm;
  const move = allMoves.find(m => m.french_term === frenchTerm);
  if (!move) {
    console.error(`용어를 찾을 수 없습니다: ${frenchTerm}`);
    return;
  }

  const detail = document.getElementById("dictionaryDetail");
  const termTitle = document.getElementById("dictTermTitle");
  const pronunciation = document.getElementById("dictPronunciation");
  const description = document.getElementById("dictDescription");
  const videoContainer = document.getElementById("dictVideo");
  const moreVideosBtn = document.getElementById("moreVideosBtn");
  const favoriteBtn = document.getElementById("favoriteBtn");

  termTitle.textContent = `${move.korean_name} (${move.french_term})`;
  pronunciation.textContent = move.french_term;
  description.textContent = move.description || "";

  // "더 많은 영상 찾기" 버튼 표시 여부
  moreVideosBtn.style.display = move.additional_videos && move.additional_videos.length > 0 ? "none" : "inline-block";

  // 즐겨찾기 버튼 리셋
  favoriteBtn.classList.remove("active");
  favoriteBtn.textContent = "❤️ 즐겨찾기";

  let videoHtml = "";

  // 🎬 Royal Ballet 공식 영상 (1순위 - 최고 품질 보장)
  // + "🎬 YouTube에서 보기" 직접 링크 추가
  if (move.main_video && move.main_video.url) {
    const videoId = move.main_video.url.split("v=")[1];
    videoHtml += `
      <div style="margin-bottom: 12px;">
        <p style="margin: 0 0 8px; font-size: 0.85rem; color: #F37021; font-weight: 600;">
          🎭 Royal Ballet (공식 영상)
        </p>
        <!-- 임베드 영상: 페이지 내에서 바로 재생 -->
        <iframe src="https://www.youtube.com/embed/${videoId}"
                style="width: 100%; height: 225px; border-radius: 6px;" allowfullscreen></iframe>
        <!-- YouTube 직접 링크: 전체 화면, 댓글, 구독 기능 사용 가능 -->
        <!-- Parang-Sê 브랜드 컬러(주황색 #F37021) 적용, 호버 시 반전 효과 -->
        <a href="https://www.youtube.com/watch?v=${videoId}" target="_blank" rel="noopener" style="
          display: inline-block;
          margin-top: 8px;
          padding: 8px 14px;
          background: #F37021;
          color: white;
          text-decoration: none;
          border-radius: 6px;
          font-size: 0.85rem;
          font-weight: 600;
          transition: all 0.15s ease;
          border: 2px solid #F37021;
        " onmouseover="this.style.background='white'; this.style.color='#F37021';"
           onmouseout="this.style.background='#F37021'; this.style.color='white';">
          🎬 YouTube에서 보기
        </a>
      </div>
    `;
  } else {
    videoHtml += `
      <p style="color: var(--mut); font-size: 0.9rem;">Royal Ballet 영상이 없습니다.</p>
    `;
  }

  // 2️⃣ 추가 추천 영상 (있으면 표시)
  if (move.additional_videos && move.additional_videos.length > 0) {
    videoHtml += `
      <div style="margin-top: 16px;">
        <p style="margin: 0 0 8px; font-size: 0.85rem; color: #C8A078; font-weight: 600;">
          📚 추가 추천 영상
        </p>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          ${move.additional_videos.map((v, i) => `
            <a href="${v.url}" target="_blank" rel="noopener" style="
              color: var(--acc);
              text-decoration: none;
              padding: 8px 10px;
              background: var(--acc-soft);
              border-radius: 6px;
              transition: all 0.15s ease;
              border: 1px solid transparent;
            " onmouseover="this.style.background='var(--acc)'; this.style.color='white'; this.style.borderColor='var(--acc)';"
               onmouseout="this.style.background='var(--acc-soft)'; this.style.color='var(--acc)'; this.style.borderColor='transparent';">
              ${i+1}. ${v.title.substring(0, 45)}... (점수: ${v.score})
            </a>
          `).join("")}
        </div>
      </div>
    `;
  }

  // 3️⃣ YouTube 직접 검색 버튼 (최신 영상 실시간 검색)
  if (move.youtube_search_url) {
    videoHtml += `
      <div style="margin-top: 16px; text-align: center;">
        <a href="${move.youtube_search_url}" target="_blank" rel="noopener" style="
          display: inline-block;
          padding: 10px 18px;
          background: #ff0000;
          color: white;
          border-radius: 6px;
          text-decoration: none;
          font-weight: 600;
          font-size: 0.9rem;
          transition: all 0.15s ease;
        " onmouseover="this.style.opacity='0.8'; this.style.transform='scale(1.02)';"
           onmouseout="this.style.opacity='1'; this.style.transform='scale(1)';">
          🔍 YouTube에서 더 찾기 (최신 영상)
        </a>
      </div>
    `;
  }

  videoContainer.innerHTML = videoHtml;
  detail.classList.remove("hidden");
}

// --- 초기화 ---
document.addEventListener("DOMContentLoaded", () => {
  loadDataList();
  loadStatistics();
  loadConversationsList();
  loadDictionary();
  loadFavorites();
});
