const API_BASE_URL = window.API_BASE_URL || "https://moncherbarre.onrender.com";

// --- 랜덤 이미지 ---
const STUDIO_IMAGES = [
  'avi-richards-G-BPjqxb0ho-unsplash.jpg',
  'carolin-thiergart-jVJB6t7xJrU-unsplash.jpg',
  'juli-kosolapova-H-9pOBc4c84-unsplash.jpg',
  'kazuo-ota-2x8o7ZdoB70-unsplash.jpg',
  'pexels-cottonbro-10639358.jpg',
];

function getRandomImage() {
  return STUDIO_IMAGES[Math.floor(Math.random() * STUDIO_IMAGES.length)];
}

document.addEventListener('DOMContentLoaded', () => {
  const splashImg = document.getElementById('splashImg');
  const heroImg = document.getElementById('heroImg');
  if (splashImg) splashImg.src = `studio/${getRandomImage()}`;
  if (heroImg) heroImg.src = `studio/${getRandomImage()}`;
});

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
    // 캐시된 데이터에서 로컬 계산 (Firestore 읽기 0회)
    await loadPracticeDataWithCache();
    const stats = calculateStats();

    // 배지 업데이트
    document.getElementById("streakDays").textContent = stats.streak;
    document.getElementById("bestDay").textContent = stats.bestDay;
    document.getElementById("totalHours").textContent = stats.totalHours;

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const barColor = "#F37021";
    const lineColor = "#F37021";
    const textColor = isDark ? "#e8d8df" : "#4a2535";
    const axisBg = isDark ? "rgba(50,40,45,0.5)" : "rgba(244,229,234,0.5)";

    // 1️⃣ 월별 평균 (선 그래프)
    const monthLabels = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
    if (monthlyChartInstance) monthlyChartInstance.destroy();
    monthlyChartInstance = new Chart(document.getElementById("monthlyChart"), {
      type: "line",
      data: {
        labels: monthLabels,
        datasets: [{
          label: "평균 분",
          data: stats.monthlyAverage,
          borderColor: lineColor,
          backgroundColor: "rgba(243, 112, 33, 0.1)",
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: lineColor
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: axisBg } },
        },
      },
    });

    // 2️⃣ 요일별 분포 (막대 그래프)
    const dayNames = ["월", "화", "수", "목", "금", "토", "일"];
    if (dayChartInstance) dayChartInstance.destroy();
    dayChartInstance = new Chart(document.getElementById("dayChart"), {
      type: "bar",
      data: {
        labels: dayNames,
        datasets: [{
          label: "누적 분",
          data: stats.dayOfWeekData,
          backgroundColor: barColor,
          borderRadius: 6
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: axisBg } },
        },
      },
    });

    // 3️⃣ 누적 시간 (도넛 게이지)
    const totalMinutes = stats.totalHours * 60;
    const targetMinutes = 20000; // 목표: 333시간
    const progressPct = Math.min((totalMinutes / targetMinutes) * 100, 100);
    if (totalChartInstance) totalChartInstance.destroy();
    totalChartInstance = new Chart(document.getElementById("totalChart"), {
      type: "doughnut",
      data: {
        labels: ["달성", "남은"],
        datasets: [{
          data: [progressPct, 100 - progressPct],
          backgroundColor: [barColor, axisBg],
          borderColor: [isDark ? "#1d1719" : "#ffffff", "transparent"],
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: false } },
      },
    });

    // 4️⃣ 부상별 강화운동 개수 (막대 그래프)
    const symRes = await fetch('data/symptom_map.json');
    const symptoms = await symRes.json();
    if (symptomChartInstance) symptomChartInstance.destroy();
    symptomChartInstance = new Chart(document.getElementById("symptomChart"), {
      type: "bar",
      data: {
        labels: symptoms.map(s => s.symptom),
        datasets: [{
          label: "강화운동 개수",
          data: symptoms.map(s => s.strengthening_exercises.length),
          backgroundColor: barColor,
          borderRadius: 6
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: axisBg } },
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
  const streakText = stats.streak > 0 ? `🔥 ${stats.streak}일 연속` : "아직 없음";
  const bestDayText = stats.bestDay !== "-" ? `${stats.bestDay}요일` : "데이터 부족";
  note.textContent = `📊 총 ${stats.totalHours}시간 연습 · ${streakText} · 최다 요일 ${bestDayText}`;
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
let selectedAlphabet = null;  // 탭 진입 시 아무 글자도 선택하지 않음

// 불어 발음 음원 (ABT 원본 mp3): term → mp3 URL
let pronunciationByTerm = {};

async function loadPronunciations() {
  try {
    const res = await fetch('data/moves_96.json');
    const moves = await res.json();
    moves.forEach(m => { if (m.pronunciation_mp3) pronunciationByTerm[m.term] = m.pronunciation_mp3; });
  } catch (err) {
    console.error('발음 데이터 로드 실패:', err);
  }
}

function playPronunciation(term) {
  const url = pronunciationByTerm[term];
  if (!url) return;
  new Audio(url).play().catch(err => console.error('발음 재생 실패:', err));
}

async function loadDictionary() {
  await loadPronunciations();
  try {
    // 번역·영상·음악이 모두 들어 있는 로컬 JSON이 단일 출처 (서버 호출 없음)
    const res = await fetch('data/moves_96.json');
    if (!res.ok) throw new Error('moves_96.json 로드 실패');
    const moves = await res.json();
    allMoves = moves.map(m => ({
      french_term: m.term,
      korean_name: m.korean_name,
      ipa: m.ipa,
      description: m.description_ko,
      music_file: m.music_file,
      main_video: m.video_url
        ? { url: m.video_url, title: m.video_title, channel: m.video_channel, source: "Royal Ballet" }
        : null,
      youtube_search_url: "https://www.youtube.com/results?search_query=" +
        encodeURIComponent(m.term + " ballet step"),
    })).sort((a, b) => a.french_term.localeCompare(b.french_term, "fr"));

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

    renderDictionary();
  } catch (err) {
    console.error(err);
    document.getElementById("dictionaryListContainer").innerHTML = "<p class='loading'>불러오지 못했어요.</p>";
  }
}

function filterDictionaryByAlphabet(letter) {
  selectedAlphabet = letter;
  closeDictionaryDetail();

  // 버튼 상태 업데이트
  document.querySelectorAll(".alphabet-btn").forEach(btn => {
    btn.classList.toggle("active", btn.textContent === letter);
    btn.setAttribute("aria-pressed", btn.textContent === letter);
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

  if (!selectedAlphabet) {
    container.innerHTML = "";
    return;
  }

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
        ${move.main_video ? '<span class="rb-badge">Royal Ballet</span>' : ''}
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
  if (!move) return;
  const video = move.main_video || {
    url: move.youtube_search_url,
    title: `${move.french_term} - YouTube 검색`,
    channel: "YouTube",
    source: "YouTube 검색",
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/moves/favorites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        french_term: move.french_term,
        korean_name: move.korean_name,
        video_id: video.url.split("v=")[1] || "search",
        video_title: video.title,
        video_url: video.url,
        channel: video.channel,
        source: video.source,
      }),
    });

    if (response.ok) {
      const btn = document.getElementById("favoriteBtn");
      btn.classList.add("active");
      btn.textContent = "⚜️ 저장됨";
      setTimeout(() => {
        btn.classList.remove("active");
        btn.textContent = "⚜️ 즐겨찾기";
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
    const response = await fetch(`${API_BASE_URL}/api/moves/favorites`);
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
    const response = await fetch(`${API_BASE_URL}/api/moves/favorites/${id}`, {
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

  termTitle.textContent = `${move.korean_name} (${move.french_term})`;
  pronunciation.textContent = move.french_term;
  if (pronunciationByTerm[move.french_term]) {
    const b = document.createElement("button");
    b.className = "btn-secondary";
    b.textContent = "🔊 발음 듣기";
    b.style.cssText = "margin-left:8px;padding:3px 12px;font-size:0.78rem;";
    b.onclick = () => playPronunciation(move.french_term);
    pronunciation.appendChild(b);
  }
  description.textContent = move.description || "";

  // "더 많은 영상 찾기" 버튼 표시 여부
  moreVideosBtn.style.display = "none";

  const video = move.main_video;
  const videoId = video ? video.url.split("v=")[1] : "";
  let videoHtml = video
    ? `<iframe class="dict-iframe" src="https://www.youtube.com/embed/${videoId}" allowfullscreen></iframe>`
    : "";
  videoHtml += `
    <div class="dict-bar">
      <p class="dict-bar-text">${video ? "Royal Ballet" : "Royal Ballet 영상이 없습니다"}</p>
      ${video ? `<button onclick="openVideoModal('${videoId}')">확대 보기</button>` : ""}
      <a href="${video ? video.url : move.youtube_search_url}" target="_blank" rel="noopener">YouTube</a>
      <button id="favoriteBtn" onclick="addToFavorites()">⚜️ 즐겨찾기</button>
    </div>
  `;

  videoContainer.innerHTML = videoHtml;
  detail.classList.remove("hidden");
  detail.scrollIntoView({ behavior: "smooth", block: "start" });
}

// --- 데이터 캐싱 전역 변수 ---
let practiceLogsCache = null;

// --- 365일 데이터 캐싱 (Firestore 1회만 읽기) ---
async function loadPracticeDataWithCache() {
  try {
    const cacheKey = 'practice_logs_cache';
    const cached = localStorage.getItem(cacheKey);

    if (cached) {
      practiceLogsCache = JSON.parse(cached);
      return;
    }

    // Firestore에서 처음 1회만 읽기
    const res = await fetch(`${API_BASE_URL}/api/data`);
    if (!res.ok) throw new Error(`status ${res.status}`);

    practiceLogsCache = await res.json();
    localStorage.setItem(cacheKey, JSON.stringify(practiceLogsCache));
  } catch (err) {
    console.error('연습 기록 로드 실패:', err);
    practiceLogsCache = [];
  }
}

// --- 통계 계산 (로컬 데이터만 사용) ---
function calculateStats() {
  if (!practiceLogsCache || practiceLogsCache.length === 0) {
    return {
      streak: 0,
      bestDay: '-',
      totalHours: 0,
      dayOfWeekData: [0, 0, 0, 0, 0, 0, 0],
      monthlyAverage: Array(12).fill(0)
    };
  }

  const logs = practiceLogsCache;
  const now = new Date();
  const dayNames = ['월', '화', '수', '목', '금', '토', '일'];

  // 1️⃣ 연속 일수 (스트릭)
  let streak = 0;
  const sortedByDate = [...logs].sort((a, b) => new Date(b.date) - new Date(a.date));
  let checkDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (const log of sortedByDate) {
    const logDate = new Date(log.date);
    if (logDate.toDateString() === checkDate.toDateString()) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else if (logDate < checkDate) {
      break;
    }
  }

  // 2️⃣ 요일별 분포
  const dayOfWeekData = [0, 0, 0, 0, 0, 0, 0];
  logs.forEach(log => {
    const date = new Date(log.date);
    const day = date.getDay() === 0 ? 6 : date.getDay() - 1; // 월=0, 일=6
    dayOfWeekData[day] += (log.value ?? log.minutes) || 0;
  });

  // 3️⃣ 월별 평균
  const monthlyData = Array(12).fill(0);
  const monthlyCounts = Array(12).fill(0);
  logs.forEach(log => {
    const date = new Date(log.date);
    const month = date.getMonth();
    monthlyData[month] += (log.value ?? log.minutes) || 0;
    monthlyCounts[month]++;
  });
  const monthlyAverage = monthlyData.map((total, i) =>
    monthlyCounts[i] > 0 ? Math.round(total / monthlyCounts[i]) : 0
  );

  // 4️⃣ 최다 요일
  const maxDayIndex = dayOfWeekData.indexOf(Math.max(...dayOfWeekData));
  const bestDay = dayNames[maxDayIndex];

  // 5️⃣ 총 시간
  const totalMinutes = logs.reduce((sum, log) => sum + ((log.value ?? log.minutes) || 0), 0);
  const totalHours = Math.round(totalMinutes / 60 * 10) / 10;

  return {
    streak,
    bestDay,
    totalHours,
    dayOfWeekData,
    monthlyAverage
  };
}

// --- 그래프 렌더링 (Chart.js) ---
function renderGraphs() {
  const stats = calculateStats();

  // 1️⃣ 요일별 분포 (막대)
  const dayCtx = document.getElementById('dayChart');
  if (dayCtx) {
    new Chart(dayCtx, {
      type: 'bar',
      data: {
        labels: ['월', '화', '수', '목', '금', '토', '일'],
        datasets: [{
          label: '누적 분',
          data: stats.dayOfWeekData,
          backgroundColor: '#F37021',
          borderRadius: 6,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }
        }
      }
    });
  }

  // 2️⃣ 월별 평균 (선)
  const monthCtx = document.getElementById('monthlyChart');
  if (monthCtx) {
    new Chart(monthCtx, {
      type: 'line',
      data: {
        labels: ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'],
        datasets: [{
          label: '평균 분',
          data: stats.monthlyAverage,
          borderColor: '#F37021',
          backgroundColor: 'rgba(243, 112, 33, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: '#F37021'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }
        }
      }
    });
  }

  // 3️⃣ 배지 업데이트 (스트릭, 최다요일, 총시간)
  document.getElementById('streakDays').textContent = stats.streak;
  document.getElementById('bestDay').textContent = stats.bestDay;
  document.getElementById('totalHours').textContent = stats.totalHours;
}

// --- 루틴 전역 변수 ---
let routineData = null;
let musicMappingData = null;
let movesData = null;
let currentRoutine = {
  minutes: null,
  sectionIndex: 0,
  musicIndex: 0,
  isPlaying: false,
  allSections: []
};

// --- 루틴 데이터 로드 (캐싱) ---
async function loadRoutineDataset() {
  try {
    // localStorage에서 확인
    const cached = localStorage.getItem('routineDataset_v3');
    if (cached) {
      const data = JSON.parse(cached);
      routineData = data.routines;
      musicMappingData = data.musicMapping;
      movesData = data.moves;
      return;
    }

    // 없으면 JSON 파일에서 로드
    const [routinesRes, musicRes, movesRes] = await Promise.all([
      fetch('data/routines.json'),
      fetch('data/music_mapping.json'),
      fetch('data/moves_96.json')
    ]);

    routineData = await routinesRes.json();
    musicMappingData = await musicRes.json();
    movesData = await movesRes.json();

    // localStorage에 저장
    localStorage.setItem('routineDataset_v3', JSON.stringify({
      routines: routineData,
      musicMapping: musicMappingData,
      moves: movesData
    }));
  } catch (err) {
    console.error('루틴 데이터 로드 실패:', err);
  }
}

// --- 루틴 칩 클릭 이벤트 ---
function initRoutineChips() {
  document.querySelectorAll('.routine-chip').forEach(btn => {
    btn.addEventListener('click', () => startRoutine(parseInt(btn.dataset.min)));
  });
  initAudioEvents();
}

// 구역 이름 (원어)
const AREA_FR = { '매트': 'Barre au sol', '바': 'Barre', '센터': 'Au milieu' };
const ICON_PLAY = '▶️';
const ICON_PAUSE = '⏸️';

// 음원은 통째로 내려받아 메모리(Blob)에서 재생 → 서버가 구간 요청을 지원하지 않아도 ±4초 이동이 정확히 동작
const audioBlobCache = new Map();
let loadToken = 0;

async function getAudioUrl(file) {
  if (audioBlobCache.has(file)) return audioBlobCache.get(file);
  const res = await fetch(file);
  if (!res.ok) throw new Error(`${file} ${res.status}`);
  const url = URL.createObjectURL(await res.blob());
  audioBlobCache.set(file, url);
  return url;
}

function fmtTime(sec) {
  if (!isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function setPlayingUI(playing) {
  currentRoutine.isPlaying = playing;
  const btn = document.getElementById('playPauseBtn');
  btn.textContent = playing ? ICON_PAUSE : ICON_PLAY;
  btn.setAttribute('aria-label', playing ? 'Pause' : 'Jouer');
}

function initAudioEvents() {
  const audio = document.getElementById('audioPlayer');
  audio.addEventListener('timeupdate', () => {
    const d = audio.duration || 0;
    document.getElementById('timeNow').textContent = fmtTime(audio.currentTime);
    document.getElementById('progressFill').style.width = d ? `${(audio.currentTime / d) * 100}%` : '0%';
  });
  audio.addEventListener('loadedmetadata', () => {
    document.getElementById('timeTotal').textContent = fmtTime(audio.duration);
  });
  audio.addEventListener('play', () => setPlayingUI(true));
  audio.addEventListener('pause', () => setPlayingUI(false));
  audio.addEventListener('ended', () => skipToMusic(1));
  document.getElementById('progressBar').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (audio.duration) audio.currentTime = audio.duration * Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  });
}

// --- 루틴 시작 ---
function startRoutine(minutes) {
  if (!routineData || !musicMappingData) {
    alert('Les données de la séance n’ont pas pu être chargées.');
    return;
  }
  const routine = routineData[minutes.toString()];
  if (!routine) {
    alert(`Aucune séance de ${minutes} minutes.`);
    return;
  }
  currentRoutine = { minutes, sectionIndex: 0, musicIndex: 0, isPlaying: false, allSections: routine.sections };
  document.querySelectorAll('.routine-chip').forEach(c => c.classList.toggle('active', c.dataset.min === String(minutes)));
  document.getElementById('musicPlayer').classList.remove('hidden');
  playCurrent();
}

// --- 현재 위치의 곡 재생 ---
async function playCurrent() {
  const { allSections, sectionIndex, musicIndex } = currentRoutine;
  const section = allSections[sectionIndex];
  const musicName = section && section.music_sequence[musicIndex];
  const musicInfo = musicName && musicMappingData[musicName];
  if (!musicInfo) return;

  document.getElementById('nowPlayingArea').textContent = AREA_FR[section.area] || section.area;
  document.getElementById('nowPlayingMusic').textContent = musicInfo.name_fr;
  document.getElementById('nowPlayingMovements').textContent = musicInfo.movements
    .map(no => movesData.find(m => m.no === no)?.term)
    .filter(Boolean).slice(0, 4).join(' · ');
  updateMusicList();

  const audio = document.getElementById('audioPlayer');
  const token = ++loadToken;
  audio.pause();
  try {
    const url = await getAudioUrl(musicInfo.file);
    if (token !== loadToken) return;  // 그사이 다른 곡이 선택됨
    audio.src = url;
    audio.currentTime = 0;
    await audio.play();
  } catch (err) {
    console.error('음악 재생 실패:', musicInfo.file, err);
  }
}

// --- 재생/일시정지 토글 ---
function togglePlayPause() {
  const audio = document.getElementById('audioPlayer');
  if (!audio.src) { playCurrent(); return; }
  if (audio.paused) audio.play().catch(err => console.error('음악 재생 실패:', err));
  else audio.pause();
}

// --- 현재 위치에서 ±4초 이동 ---
function skipTime(seconds) {
  const audio = document.getElementById('audioPlayer');
  if (!audio.src) return;
  const target = audio.currentTime + seconds;
  if (audio.duration && target >= audio.duration) { skipToMusic(1); return; }
  audio.currentTime = Math.max(0, target);
}

// --- 전체 곡 목록(매트 → 바 → 센터)에서 한 곡씩 이동 ---
function flatTracks() {
  const list = [];
  currentRoutine.allSections.forEach((sec, si) => sec.music_sequence.forEach((_, mi) => list.push({ si, mi })));
  return list;
}

function goToTrack(si, mi) {
  currentRoutine.sectionIndex = si;
  currentRoutine.musicIndex = mi;
  playCurrent();
}

function skipToMusic(direction) {
  const flat = flatTracks();
  const cur = flat.findIndex(t => t.si === currentRoutine.sectionIndex && t.mi === currentRoutine.musicIndex);
  const next = cur + direction;
  if (next >= flat.length) {
    alert('La séance est terminée. Bravo.');
    stopRoutine();
    return;
  }
  if (next < 0) { goToTrack(flat[0].si, flat[0].mi); return; }
  goToTrack(flat[next].si, flat[next].mi);
}

// --- 곡 목록: 구역별 머리글과 함께 전체 표시 ---
function updateMusicList() {
  const { allSections, sectionIndex, musicIndex } = currentRoutine;
  document.getElementById('musicList').innerHTML = allSections.map((sec, si) => `
    <div class="music-section">${AREA_FR[sec.area] || sec.area}</div>
    ${sec.music_sequence.map((name, mi) => `
      <div class="music-item ${si === sectionIndex && mi === musicIndex ? 'active' : ''}"
           onclick="goToTrack(${si}, ${mi})">
        <span class="no">${mi + 1}</span><span>${musicMappingData[name].name_fr}</span>
      </div>`).join('')}
  `).join('');
}

// --- 루틴 종료 ---
function stopRoutine() {
  loadToken++;
  const audio = document.getElementById('audioPlayer');
  audio.pause();
  audio.removeAttribute('src');
  setPlayingUI(false);
  document.getElementById('musicPlayer').classList.add('hidden');
  document.querySelectorAll('.routine-chip').forEach(c => c.classList.remove('active'));
  currentRoutine = { minutes: null, sectionIndex: 0, musicIndex: 0, isPlaying: false, allSections: [] };
}

// ============================================================================
// 영상 확대 보기: YouTube 기본 컨트롤을 끄고 반투명 오버레이로 직접 조작
// ============================================================================
let vmPlayer = null;
let vmTimer = null;
let vmHideTimer = null;
let vmInlineSrc = null;

function loadYouTubeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  return new Promise(resolve => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(); };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
}

async function openVideoModal(videoId) {
  const modal = document.getElementById('videoModal');
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  // 본문에 있던 영상은 소리가 겹치지 않도록 잠시 비움
  const inline = document.querySelector('#dictVideo iframe');
  if (inline) { vmInlineSrc = inline.src; inline.src = ''; }
  // 전체 화면 · 가로 모드는 지원되는 기기에서만 시도 (iPad는 모달이 화면 전체를 채움)
  try { await (modal.requestFullscreen || modal.webkitRequestFullscreen)?.call(modal); } catch {}
  try { await screen.orientation?.lock?.('landscape'); } catch {}

  await loadYouTubeApi();
  document.getElementById('vmStage').innerHTML = '<div id="vmPlayer"></div>' + vmOverlayHtml();
  vmBindOverlay();
  vmPlayer = new YT.Player('vmPlayer', {
    videoId,
    host: 'https://www.youtube-nocookie.com',
    playerVars: { controls: 0, rel: 0, modestbranding: 1, playsinline: 1, disablekb: 1, fs: 0, iv_load_policy: 3, autoplay: 1 },
    events: {
      onReady: (e) => { e.target.playVideo(); vmSetRate(1); vmShowControls(); },
      onStateChange: (e) => {
        const playing = e.data === YT.PlayerState.PLAYING;
        document.getElementById('vmPlayBtn').textContent = playing ? '⏸️' : '▶️';
      },
    },
  });
  clearInterval(vmTimer);
  vmTimer = setInterval(vmTick, 250);
}

function vmOverlayHtml() {
  return document.getElementById('vmOverlayTemplate').innerHTML;
}

function vmBindOverlay() {
  // 화면 어디를 터치하거나 마우스를 올려도 컨트롤이 나타남 (onXXX 대입이라 열 때마다 중복 등록되지 않음)
  const modal = document.getElementById('videoModal');
  modal.onpointerdown = vmShowControls;
  modal.onmousemove = vmShowControls;
  document.getElementById('vmProgress').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const d = vmPlayer.getDuration();
    if (d) vmPlayer.seekTo(d * Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), true);
  });
}

function vmShowControls() {
  const ov = document.getElementById('vmOverlay');
  if (!ov) return;
  ov.classList.add('show');
  clearTimeout(vmHideTimer);
  vmHideTimer = setTimeout(() => ov.classList.remove('show'), 3000);
}

function vmTick() {
  if (!vmPlayer || !vmPlayer.getCurrentTime) return;
  const d = vmPlayer.getDuration() || 0, t = vmPlayer.getCurrentTime() || 0;
  document.getElementById('vmTimeNow').textContent = fmtTime(t);
  document.getElementById('vmTimeTotal').textContent = fmtTime(d);
  document.getElementById('vmProgressFill').style.width = d ? `${(t / d) * 100}%` : '0%';
}

function vmTogglePlay() {
  vmShowControls();
  if (vmPlayer.getPlayerState() === YT.PlayerState.PLAYING) vmPlayer.pauseVideo();
  else vmPlayer.playVideo();
}

function vmSeek(sec) {
  vmShowControls();
  const d = vmPlayer.getDuration() || 0;
  vmPlayer.seekTo(Math.min(d, Math.max(0, vmPlayer.getCurrentTime() + sec)), true);
}

function vmSetRate(rate) {
  vmShowControls();
  if (vmPlayer && vmPlayer.setPlaybackRate) vmPlayer.setPlaybackRate(rate);
  document.querySelectorAll('.vm-speed').forEach(b => b.classList.toggle('active', Number(b.dataset.rate) === rate));
}

function closeVideoModal() {
  clearInterval(vmTimer);
  clearTimeout(vmHideTimer);
  if (vmPlayer && vmPlayer.destroy) vmPlayer.destroy();
  vmPlayer = null;
  document.getElementById('vmStage').innerHTML = '';
  document.getElementById('videoModal').classList.add('hidden');
  document.body.style.overflow = '';
  if (document.fullscreenElement) document.exitFullscreen?.();
  try { screen.orientation?.unlock?.(); } catch {}
  const inline = document.querySelector('#dictVideo iframe');
  if (inline && vmInlineSrc) inline.src = vmInlineSrc;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.getElementById('videoModal').classList.contains('hidden')) closeVideoModal();
});

// --- 초기화 ---
document.addEventListener("DOMContentLoaded", () => {
  loadPracticeDataWithCache().then(() => {
    loadDataList();
    loadStatistics();
  });
  loadConversationsList();
  loadDictionary();
  loadFavorites();
  loadRoutineDataset().then(() => initRoutineChips());
});
