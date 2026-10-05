// 차트 글꼴도 본문과 같은 서체로
if (window.Chart) {
  Chart.defaults.color = '#6B5E36';        // 그래프 글자(축·범례·툴팁 제외): 진한 그레이 골드
  Chart.defaults.font.size = 8;            // 글자 크기 축소 (제목에 맞춰 함께 줄임)
  Chart.defaults.plugins.legend.labels.color = '#6B5E36';
  Chart.defaults.scale.ticks.color = '#6B5E36';
}
if (window.Chart) Chart.defaults.font.family = '"Jost", "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", sans-serif';

const API_BASE_URL = window.API_BASE_URL || "https://moncherbarre.onrender.com";

// --- 랜덤 이미지 ---
const STUDIO_IMAGES = [
  'avi-richards-G-BPjqxb0ho-unsplash.jpg',
  'hero.jpg',
  'juli-kosolapova-H-9pOBc4c84-unsplash.jpg',
  'kazuo-ota-2x8o7ZdoB70-unsplash.jpg',
  'pexels-cottonbro-10639358.jpg',
  'pointe-shoes-reference.jpg',
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
// 챗봇 답변(마크다운 표 · 번호 목록 · 굵게)을 안전하게 HTML로 변환 (HTML은 모두 이스케이프)
function renderChatMarkdown(text) {
  const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const lines = text.split("\n");
  let html = "";
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(lines[i].trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim()));
        i++;
      }
      const body = rows.filter(r => !r.every(c => /^:?-{2,}:?$/.test(c)));
      const head = body.shift();
      html += '<div class="chat-table-wrap"><table class="chat-table"><thead><tr>' +
        head.map(c => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>" +
        body.map(r => "<tr>" + r.map(c => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") +
        "</tbody></table></div>";
      continue;
    }
    const num = line.match(/^(\d+)[.)]\s+(.*)$/);
    if (num) {
      html += `<div class="chat-num"><span class="chat-num-no">${num[1]}</span><span>${inline(num[2])}</span></div>`;
    } else if (line) {
      html += `<p class="chat-p">${inline(line)}</p>`;
    }
    i++;
  }
  return html;
}

function appendMessage(text, role) {
  const box = document.getElementById("chatBox");
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  if (role === "assistant") {
    div.innerHTML = renderChatMarkdown(text);
    if (div.querySelector(".chat-table")) div.classList.add("has-table");
  } else {
    div.textContent = text;
  }
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

let coldStartTimer = null;

function setLoading(isLoading) {
  document.getElementById("loadingRow").classList.toggle("hidden", !isLoading);
  // 응답을 기다리는 동안 입력·전송을 잠그고 버튼에 진행 표시
  const form = document.getElementById("chatForm");
  const btn = form.querySelector("button[type=submit]");
  const input = document.getElementById("chatInput");
  btn.disabled = isLoading;
  input.disabled = isLoading;
  btn.classList.toggle("sending", isLoading);
  btn.textContent = isLoading ? "Sending" : "Send";
  // 채팅창 안에 "답변을 준비하는 중" 표시를 넣고, 응답이 오면 제거
  const box = document.getElementById("chatBox");
  const old = document.getElementById("typingRow");
  if (old) old.remove();
  if (isLoading) {
    const t = document.createElement("div");
    t.id = "typingRow";
    t.className = "msg assistant typing";
    t.innerHTML = '<span class="typing-text">답변을 준비하고 있어요</span><span class="typing-dots"><i></i><i></i><i></i></span>';
    box.appendChild(t);
    box.scrollTop = box.scrollHeight;
  }
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
  const startedAt = Date.now();
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
    // 서버가 너무 빨리 실패해도 "처리 중" 표시가 눈에 보이도록 최소 0.8초는 유지
    const wait = Math.max(0, 800 - (Date.now() - startedAt));
    if (wait) await new Promise(r => setTimeout(r, wait));
    setLoading(false);
  }
}

document.getElementById("chatForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("chatInput");
  const message = input.value.trim();
  if (!message) {
    // 빈 입력으로 눌러도 반응이 보이도록 입력창을 살짝 흔들고 포커스
    input.classList.remove("shake");
    void input.offsetWidth;
    input.classList.add("shake");
    input.focus();
    return;
  }
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
const SHOW_LIMIT = 7;

// 누적 시간 게이지: 가늘고 여린 로즈골드 링 + 가운데 숫자
function drawTotalGauge(totalHours, pct, isDark, trackColor) {
  if (totalChartInstance) totalChartInstance.destroy();
  const centerText = {
    id: "centerText",
    afterDraw(chart) {
      const { ctx, chartArea: a } = chart;
      const cx = (a.left + a.right) / 2, cy = (a.top + a.bottom) / 2;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = isDark ? "#f1dfe3" : "#5E5230";
      ctx.font = '600 19px Georgia, "Noto Serif KR", serif';
      ctx.fillText(`${Math.round(totalHours)}h`, cx, cy - 6);
      ctx.fillStyle = isDark ? "#c9a9b1" : "#8A7B4E";
      ctx.font = '10px Georgia, "Noto Serif KR", serif';
      ctx.fillText(`${Math.round(pct)}%`, cx, cy + 17);
      ctx.restore();
    },
  };
  totalChartInstance = new Chart(document.getElementById("totalChart"), {
    type: "doughnut",
    data: {
      labels: ["달성", "남은"],
      datasets: [{
        data: [pct, 100 - pct],
        backgroundColor: ["#C98F8A", trackColor],
        borderWidth: 0,
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: "90%",
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
    },
    plugins: [centerText],
  });
}

// 통계 차트 인스턴스 (다크모드/필터 시 업데이트용)
let monthlyChartInstance, dayChartInstance, totalChartInstance, symptomChartInstance;

async function loadDataList() {
  const container = document.getElementById("dataListContainer");
  try {
    const dataRes = await fetch(`${API_BASE_URL}/api/data`);
    if (!dataRes.ok) throw new Error();
    const items = await dataRes.json();
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
        <div class="data-item-meta">${item.memo ? highlightMatch(item.memo, searchWord) : "메모 없음"}</div>
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
// 검색어와 일치하는 부분에 음영(<mark>)을 씌워 보여줌 (대소문자 무시, 일부 글자만 입력해도 일치)
let searchWord = "";
function highlightMatch(text, word) {
  const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (!word) return esc(text);
  const i = text.toLowerCase().indexOf(word.toLowerCase());
  if (i < 0) return esc(text);
  return esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + word.length)) + "</mark>" + esc(text.slice(i + word.length));
}

function applyFilter() {
  const date    = document.getElementById("searchDate").value;
  const start   = document.getElementById("searchStart").value;
  const end     = document.getElementById("searchEnd").value;
  const keyword = document.getElementById("searchKeyword").value.trim().toLowerCase();
  searchWord = document.getElementById("searchKeyword").value.trim();

  filteredItems = allItems.filter((item) => {
    if (date    && item.date !== date)                                     return false;
    if (start   && item.date < start)                                      return false;
    if (end     && item.date > end)                                        return false;
    if (keyword) {
      // 메모 검색: 연습 기록의 메모만 대상으로 함 (대화 기록은 검색하지 않음)
      if (!(item.memo || "").toLowerCase().includes(keyword)) return false;
    }
    return true;
  });

  showAll = false;
  renderDataList();
  updateFilteredStatistics();  // 필터된 데이터로 차트 업데이트
}

function clearFilter() {
  searchWord = "";
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
    const barColor = "#C98F8A";
    const lineColor = "#C98F8A";
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
          backgroundColor: "rgba(201, 143, 138, 0.16)",
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
    drawTotalGauge(stats.totalHours, progressPct, isDark, isDark ? "#4a363d" : "rgba(255, 255, 255, 0.75)");

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
  const streakText = stats.streak > 0 ? `${stats.streak}일 연속` : "아직 없음";
  const bestDayText = stats.bestDay !== "-" ? `${stats.bestDay}요일` : "데이터 부족";
  note.textContent = `총 ${stats.totalHours}시간 연습 · ${streakText} · 최다 요일 ${bestDayText}`;
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
  drawTotalGauge(Math.round(totalMinutes / 60 * 10) / 10, progressPct, isDark, isDark ? "#4a363d" : "rgba(255, 255, 255, 0.75)");

  // 통계 설명 업데이트
  const totalHours = Math.round(totalMinutes / 60 * 10) / 10;
  const count = filteredItems.length;
  const note = document.getElementById("statsNote");
  note.textContent = `선택 기간: ${count}개 기록 · ${totalHours}시간 · 평균 ${Math.round(totalMinutes / count)}분/기록`;
}

// 다크모드 전환 시 차트 색상도 업데이트
themeToggle.addEventListener("click", () => loadStatistics());

// --- 대화 기록 ---
let convList = [];
let convShowAll = false;

async function loadConversationsList() {
  const container = document.getElementById("conversationsListContainer");
  try {
    const res = await fetch(`${API_BASE_URL}/api/conversations`);
    if (!res.ok) throw new Error();
    convList = (await res.json()).reverse();
    convShowAll = false;
    renderConversations();
  } catch (err) {
    container.innerHTML = "<p class='loading'>불러오지 못했어요.</p>";
  }
}

// 7개만 보여주고 나머지는 접기 버튼 속에 보관
function renderConversations() {
  const container = document.getElementById("conversationsListContainer");
  const row = document.getElementById("convShowMoreRow");
  const btn = document.getElementById("convShowMoreBtn");

  if (convList.length === 0) {
    container.innerHTML = "<p class='loading'>저장된 대화가 없어요.</p>";
    row.classList.add("hidden");
    return;
  }

  const shown = convShowAll ? convList : convList.slice(0, SHOW_LIMIT);
  container.innerHTML = shown.map((c) => `
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

  if (convList.length > SHOW_LIMIT) {
    row.classList.remove("hidden");
    btn.textContent = convShowAll ? "접기 ↑" : `더 보기 (${convList.length - SHOW_LIMIT}개 더) ↓`;
  } else {
    row.classList.add("hidden");
  }
}

function toggleConvShowMore() {
  convShowAll = !convShowAll;
  renderConversations();
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
          ${renderChatMarkdown(m.content || "")}
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

let pronAudio = null;
function stopPronunciation() {
  if (pronAudio) { pronAudio.pause(); pronAudio = null; }
}

function playPronunciation(term) {
  const url = pronunciationByTerm[term];
  if (!url) return;
  stopPronunciation();  // 발음이 겹치지 않도록 이전 발음은 끊음
  pronAudio = new Audio(url);
  pronAudio.play().catch(err => console.error('발음 재생 실패:', err));
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
    const alphabets = ["ALL", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];
    alphabets.forEach((letter, idx) => {
      const btn = document.createElement("button");
      btn.className = "alphabet-btn";
      btn.textContent = letter;
      paintAlphabetBtn(btn, idx, alphabets.length);
      btn.onclick = () => filterDictionaryByAlphabet(letter);
      filterContainer.appendChild(btn);
    });

    renderDictionary();
  } catch (err) {
    console.error(err);
    document.getElementById("dictionaryListContainer").innerHTML = "<p class='loading'>불러오지 못했어요.</p>";
  }
}

// 알파벳 버튼 색: 왼쪽(ALL·A)은 연분홍, 오른쪽(Z)으로 갈수록 샴페인 골드로 옆으로 번지는 그라데이션
const AG_FROM = [248, 220, 228], AG_TO = [244, 228, 192];     // 밝은 면 (분홍 → 골드)
const AG_DARK_FROM = [96, 52, 70], AG_DARK_TO = [92, 78, 44];  // 다크 모드 면
function mixRGB(a, b, t) { return a.map((v, i) => Math.round(v + (b[i] - v) * t)); }
function paintAlphabetBtn(btn, i, n) {
  const t = n > 1 ? i / (n - 1) : 0;
  const lt = mixRGB(AG_FROM, AG_TO, t), dk = mixRGB(AG_DARK_FROM, AG_DARK_TO, t);
  const rgb = (c, k = 1) => `rgb(${c.map(v => Math.max(0, Math.min(255, Math.round(v * k)))).join(',')})`;
  btn.style.setProperty('--ag-top', rgb(lt, 1.02));
  btn.style.setProperty('--ag-bot', rgb(lt, 0.93));
  btn.style.setProperty('--ag-edge', rgb(lt, 0.8));
  btn.style.setProperty('--ag-dtop', rgb(dk, 1.15));
  btn.style.setProperty('--ag-dbot', rgb(dk, 0.85));
}

function filterDictionaryByAlphabet(letter) {
  // 눌려 있는 글자를 다시 누르면 선택 해제 → 목록이 접히고 버튼이 원래 모양으로 돌아옴
  const deselect = selectedAlphabet === letter;
  selectedAlphabet = deselect ? null : letter;
  closeDictionaryDetail();

  // 버튼 상태 업데이트
  document.querySelectorAll(".alphabet-btn").forEach(btn => {
    btn.classList.toggle("active", !deselect && btn.textContent === letter);
    btn.setAttribute("aria-pressed", !deselect && btn.textContent === letter);
  });

  if (deselect) {
    filteredMoves = [];
  } else if (letter === "ALL") {
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
  destroyInlinePlayer();
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
      btn.dataset.tip = "저장됨";
      setTimeout(() => {
        btn.classList.remove("active");
        btn.dataset.tip = "즐겨찾기";
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
    ? `<div id="inlinePlayer" class="dict-iframe"></div>`
    : "";
  videoHtml += `
    <div class="dict-bar">
      <p class="dict-bar-text">${video ? "Royal Ballet" : "Royal Ballet · no video"}</p>
      ${video ? `<button class="loupe-btn" onclick="openVideoModal('${videoId}')" aria-label="확대" data-tip="확대"><svg viewBox="0 0 32 32" width="18" height="18" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><circle cx="13" cy="13" r="9" stroke-width="2.2"/><circle cx="13" cy="13" r="6.2" stroke-width="0.9" opacity=".6"/><path d="M19.6 19.6 L21.8 21.8" stroke-width="4.2"/><path d="M22.4 22.4 L28 28" stroke-width="3"/></svg></button>` : ""}
      <a class="yt-btn" href="${video ? video.url : move.youtube_search_url}" target="_blank" rel="noopener" aria-label="검색" data-tip="검색"><svg viewBox="0 0 28 20" width="26" height="18" aria-hidden="true"><rect width="28" height="20" rx="5" fill="#E8262A"/><path d="M11.2 5.6l7 4.4-7 4.4z" fill="#fff"/></svg></a>
      <button id="favoriteBtn" class="fav-btn" onclick="addToFavorites()" aria-label="즐겨찾기" data-tip="즐겨찾기">⚜️</button>
    </div>
  `;


  destroyInlinePlayer();
  videoContainer.innerHTML = videoHtml;
  if (video) mountInlinePlayer(videoId);
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

    // 빈 배열이 캐시된 경우(서버 콜드스타트 실패 등)는 무시하고 다시 불러옴
    const parsed = cached ? JSON.parse(cached) : null;
    if (Array.isArray(parsed) && parsed.length > 0) {
      practiceLogsCache = parsed;
      return;
    }

    // Firestore에서 처음 1회만 읽기
    const res = await fetch(`${API_BASE_URL}/api/data`);
    if (!res.ok) throw new Error(`status ${res.status}`);

    practiceLogsCache = await res.json();
    if (practiceLogsCache.length > 0) localStorage.setItem(cacheKey, JSON.stringify(practiceLogsCache));
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
          backgroundColor: '#C98F8A',
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
          borderColor: '#C98F8A',
          backgroundColor: 'rgba(201, 143, 138, 0.16)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: '#C98F8A'
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
const AREA_KO = { '매트': '플로어 바', '바': '바', '센터': '센터' };
const AREA_KEY = { '매트': 'sol', '바': 'barre', '센터': 'milieu' };
const AREA_ICON = {
  // 마름모(바닥) · 토슈즈(바) · 발레리나(센터): 가는 선 아이콘
  sol: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"><path d="M16 3l9 9-9 17L7 12z"/><path d="M7 12h18M12 12l4 17M20 12l-4 17M12 12l4-9M20 12l-4-9"/></svg>',
  barre: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"><path d="M9 5c-1 5-2 9-1 14 .5 3 3 4 4 6l-3 3 4 1 3-4c-1-3-3-5-3-8 0-3 1-6 0-10z"/><path d="M19 6c-1 5-2 9-1 14 .5 3 3 4 4 6l-3 3 4 1 3-4c-1-3-3-5-3-8 0-3 1-6 0-10z"/></svg>',
  milieu: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"><circle cx="15" cy="5.5" r="2"/><path d="M15 8c-.5 4-.5 8 0 12M15 20c-1 3-1 6-1 9M15 20c4-1 8-3 11-6M15 10c-4 1-8 1-11-1M15 10c4-1 7-3 10-6M9 17h12"/></svg>',
};

// 구역 이름표: 프랑스어(크게) + 한글(작게), 아이콘과 색으로 구역을 구분
function areaPlate(area, size = 'sm') {
  const key = AREA_KEY[area] || 'barre';
  return `<span class="area-plate area-${key} area-${size}"><i>${AREA_ICON[key]}</i><span class="ap-text"><b>${AREA_FR[area] || area}</b>${size === 'lg' ? `<small>${AREA_KO[area] || ''}</small>` : ''}</span></span>`;
}
const ICON_PLAY = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';

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
  btn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
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
  audio.addEventListener('play', () => { setPlayingUI(true); keepScreenOn(true); });
  audio.addEventListener('pause', () => { setPlayingUI(false); keepScreenOn(false); });
  audio.addEventListener('ended', () => skipToMusic(1));
  initMediaSessionActions();
  document.getElementById('progressBar').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (audio.duration) audio.currentTime = audio.duration * Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  });
}

// 이전 소리를 완전히 끊는다 (pause만으로는 일부 기기에서 이전 곡이 남을 수 있어 소스를 비우고 load로 초기화)
function hardStopRoutineAudio() {
  loadToken++;
  const audio = document.getElementById('audioPlayer');
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
}

// 잠금 화면·제어 센터에 표시되는 재생 정보 (Media Session): 곡명, 구역, 큰 아트워크
function updateMediaSession(title, area) {
  if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title,
    artist: area,
    album: 'MonCherBarre ballet agent',
    artwork: [
      { src: 'icons/artwork-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icons/artwork-1024.png', sizes: '1024x1024', type: 'image/png' },
    ],
  });
}

// 잠금 화면 버튼: 재생/일시정지, 이전·다음 곡, ±4초
// 앱을 닫거나 다른 화면으로 나가면 음악도 함께 멈춤 (백그라운드에서 계속 흐르지 않게)
let wakeLock = null;
async function keepScreenOn(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');   // 루틴 연습 중엔 자동 잠금 방지
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { wakeLock = null; }
}

// 기본: 앱을 나가도(탭·페이지 전환, 홈, 화면 잠금) 음악은 계속 흐르고, 멈춘 위치도 그대로 유지됨.
// 헤더의 헤드폰 스위치를 끄면 앱이 화면에서 사라질 때 음악을 자동으로 일시정지(수동 제어용).
let bgPlay = true;
try { bgPlay = localStorage.getItem('bgPlay') !== 'off'; } catch {}

function initLeaveHandlers() {
  document.addEventListener('visibilitychange', () => {
    const audio = document.getElementById('audioPlayer');
    if (!audio) return;
    if (document.hidden) { if (!bgPlay && !audio.paused) audio.pause(); }       // 스위치가 꺼져 있을 때만 정지
    else if (!audio.paused) keepScreenOn(true);                                  // 돌아오면 화면 꺼짐 방지만 복구 (자동 재생 없음)
  });
  const t = document.getElementById('bgPlayToggle');
  if (t) {
    const sync = () => {
      t.classList.toggle('off', !bgPlay);
      t.setAttribute('aria-pressed', bgPlay);
      t.dataset.tip = bgPlay ? '백그라운드 · 켜짐' : '백그라운드 · 꺼짐';
    };
    t.addEventListener('click', () => { bgPlay = !bgPlay; try { localStorage.setItem('bgPlay', bgPlay ? 'on' : 'off'); } catch {} sync(); });
    sync();
  }
}

function initMediaSessionActions() {
  if (!('mediaSession' in navigator)) return;
  const audio = document.getElementById('audioPlayer');
  const set = (name, fn) => { try { navigator.mediaSession.setActionHandler(name, fn); } catch {} };
  set('play', () => audio.play());
  set('pause', () => audio.pause());
  set('previoustrack', () => skipToMusic(-1));
  set('nexttrack', () => skipToMusic(1));
  set('seekbackward', () => skipTime(-4));
  set('seekforward', () => skipTime(4));
  set('seekto', (d) => { if (d.seekTime != null) audio.currentTime = d.seekTime; });
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
  hardStopRoutineAudio();  // 다른 루틴을 누르면 이전 루틴 곡은 즉시 멈춤
  stopPronunciation();
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

  document.getElementById('nowPlayingArea').innerHTML = areaPlate(section.area, 'lg');
  document.getElementById('nowPlayingMusic').textContent = musicInfo.name_fr;
  document.getElementById('nowPlayingMovements').textContent = musicInfo.movements
    .map(no => movesData.find(m => m.no === no)?.term)
    .filter(Boolean).slice(0, 4).join(' · ');
  updateMusicList();
  updateMediaSession(musicInfo.name_fr, AREA_FR[section.area] || section.area);

  const audio = document.getElementById('audioPlayer');
  hardStopRoutineAudio();
  const token = loadToken;
  try {
    const url = await getAudioUrl(musicInfo.file);
    if (token !== loadToken) return;  // 그사이 다른 곡·루틴이 선택됨
    audio.src = url;
    audio.currentTime = 0;
    await audio.play();
    if (token !== loadToken) audio.pause();  // 재생이 시작되는 사이 다른 선택이 있었다면 바로 정지
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
    <div class="music-section">${areaPlate(sec.area, 'sm')}</div>
    ${sec.music_sequence.map((name, mi) => `
      <div class="music-item ${si === sectionIndex && mi === musicIndex ? 'active' : ''}"
           onclick="goToTrack(${si}, ${mi})">
        <span class="no">${mi + 1}</span><span>${musicMappingData[name].name_fr}</span>
      </div>`).join('')}
  `).join('');
}

// --- 루틴 종료 ---
function stopRoutine() {
  hardStopRoutineAudio();
  setPlayingUI(false);
  document.getElementById('musicPlayer').classList.add('hidden');
  document.querySelectorAll('.routine-chip').forEach(c => c.classList.remove('active'));
  currentRoutine = { minutes: null, sectionIndex: 0, musicIndex: 0, isPlaying: false, allSections: [] };
}

// ============================================================================
// Royal Ballet 영상 플레이어: YouTube 기본 컨트롤을 끄고, 하단에 마우스를 올리면(터치는 탭)
// 재생/일시정지 · 4초 앞뒤 · 탐색 바 · 0.5× 1× 2× 배속 컨트롤이 나타남. 본문과 확대 화면에서 같이 사용.
// ============================================================================
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

const VP_ICON = {
  play: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M11 6l-7 6 7 6zM20 6l-7 6 7 6z"/></svg>',
  fwd: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M13 6l7 6-7 6zM4 6l7 6-7 6z"/></svg>',
};

async function mountVideoPlayer(root, videoId, opts = {}) {
  root.classList.add('vp');
  root.innerHTML = `
    <div class="vp-yt"></div>
    <div class="vp-hot${opts.close ? ' full' : ''}"></div>
    <div class="vp-overlay">
      ${opts.close ? '<button class="vp-close" data-act="close" aria-label="Close">&times;</button>' : ''}
      <div class="vp-controls">
        <div class="vp-progress-row">
          <span class="vp-now">0:00</span>
          <div class="vp-progress"><div class="vp-fill"></div></div>
          <span class="vp-total">0:00</span>
        </div>
        <div class="vp-buttons">
          <button class="vp-btn" data-act="back" aria-label="-4 s">${VP_ICON.back}<em>4s</em></button>
          <button class="vp-btn vp-play" data-act="toggle" aria-label="Play">${VP_ICON.play}</button>
          <button class="vp-btn" data-act="fwd" aria-label="+4 s"><em>4s</em>${VP_ICON.fwd}</button>
          <span class="vp-sep"></span>
          <button class="vp-btn vp-speed" data-rate="0.5">0.5×</button>
          <button class="vp-btn vp-speed active" data-rate="1">1×</button>
          <button class="vp-btn vp-speed" data-rate="2">2×</button>
        </div>
      </div>
    </div>`;
  await loadYouTubeApi();
  if (!root.isConnected) return null;
  const ov = root.querySelector('.vp-overlay');
  const q = (s) => root.querySelector(s);
  let hideTimer = null, tick = null, player = null, destroyed = false;

  const show = () => { ov.classList.add('show'); clearTimeout(hideTimer); hideTimer = setTimeout(() => ov.classList.remove('show'), 2800); };
  // 영상(iframe) 위의 투명한 감지 영역: 마우스가 하단에 오면 컨트롤이 나타나고, 벗어나면 사라짐
  // (iframe 안에서는 마우스 이벤트를 받을 수 없으므로 감지 영역을 위에 덮어 둠)
  const hot = q('.vp-hot');
  root.addEventListener('mouseleave', () => { clearTimeout(hideTimer); hideTimer = setTimeout(() => ov.classList.remove('show'), 600); });
  hot.addEventListener('mousemove', show);
  hot.addEventListener('mouseleave', () => { clearTimeout(hideTimer); hideTimer = setTimeout(() => ov.classList.remove('show'), 600); });
  hot.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') show(); });
  hot.addEventListener('click', () => { show(); if (player && player.getPlayerState) { player.getPlayerState() === YT.PlayerState.PLAYING ? player.pauseVideo() : player.playVideo(); } });

  player = new YT.Player(q('.vp-yt'), {
    videoId,
    host: 'https://www.youtube-nocookie.com',
    playerVars: { controls: 0, rel: 0, modestbranding: 1, playsinline: 1, disablekb: 1, fs: 0, iv_load_policy: 3, autoplay: opts.autoplay ? 1 : 0 },
    events: {
      onReady: (e) => { if (opts.autoplay) e.target.playVideo(); },
      onStateChange: (e) => { q('.vp-play').innerHTML = e.data === YT.PlayerState.PLAYING ? VP_ICON.pause : VP_ICON.play; },
    },
  });

  const setRate = (rate) => {
    if (player.setPlaybackRate) player.setPlaybackRate(rate);
    root.querySelectorAll('.vp-speed').forEach(b => b.classList.toggle('active', Number(b.dataset.rate) === rate));
  };
  ov.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    show();
    if (b.dataset.act === 'toggle') { player.getPlayerState() === YT.PlayerState.PLAYING ? player.pauseVideo() : player.playVideo(); }
    else if (b.dataset.act === 'back') player.seekTo(Math.max(0, player.getCurrentTime() - 4), true);
    else if (b.dataset.act === 'fwd') player.seekTo(Math.min(player.getDuration() || 1e9, player.getCurrentTime() + 4), true);
    else if (b.dataset.act === 'close' && opts.onClose) opts.onClose();
    else if (b.dataset.rate) setRate(Number(b.dataset.rate));
  });
  q('.vp-progress').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect(), d = player.getDuration();
    if (d) player.seekTo(d * Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), true);
    show();
  });
  tick = setInterval(() => {
    if (!player || !player.getCurrentTime) return;
    const d = player.getDuration() || 0, t = player.getCurrentTime() || 0;
    q('.vp-now').textContent = fmtTime(t); q('.vp-total').textContent = fmtTime(d);
    q('.vp-fill').style.width = d ? `${(t / d) * 100}%` : '0%';
  }, 250);

  return {
    pause() { try { player.pauseVideo(); } catch {} },
    destroy() {
      if (destroyed) return; destroyed = true;
      clearInterval(tick); clearTimeout(hideTimer);
      try { player.destroy(); } catch {}
      root.innerHTML = ''; root.classList.remove('vp');
    },
  };
}

// 본문(사전 상세)에 들어가는 플레이어
let inlineVP = null;
function mountInlinePlayer(videoId) {
  if (inlineVP) { inlineVP.destroy(); inlineVP = null; }
  const root = document.getElementById('inlinePlayer');
  if (!root) return;
  mountVideoPlayer(root, videoId).then(vp => { inlineVP = vp; });
}
function destroyInlinePlayer() { if (inlineVP) { inlineVP.destroy(); inlineVP = null; } }

// 확대 화면
let modalVP = null;
async function openVideoModal(videoId) {
  const music = document.getElementById('audioPlayer');
  if (!music.paused) music.pause();
  stopPronunciation();
  destroyInlinePlayer();                       // 본문 영상과 소리가 겹치지 않도록 정리
  const modal = document.getElementById('videoModal');
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  try { await (modal.requestFullscreen || modal.webkitRequestFullscreen)?.call(modal); } catch {}
  try { await screen.orientation?.lock?.('landscape'); } catch {}
  modalVP = await mountVideoPlayer(document.getElementById('vmStage'), videoId, { autoplay: true, close: true, onClose: closeVideoModal });
}

function closeVideoModal() {
  if (modalVP) { modalVP.destroy(); modalVP = null; }
  document.getElementById('vmStage').innerHTML = '';
  document.getElementById('videoModal').classList.add('hidden');
  document.body.style.overflow = '';
  if (document.fullscreenElement) document.exitFullscreen?.();
  try { screen.orientation?.unlock?.(); } catch {}
  const cur = document.querySelector('#inlinePlayer');
  if (cur && currentDictTerm) {
    const m = allMoves.find(x => x.french_term === currentDictTerm);
    if (m && m.main_video) mountInlinePlayer(m.main_video.url.split('v=')[1]);
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.getElementById('videoModal').classList.contains('hidden')) closeVideoModal();
});

// ============================================================================
// 서울 날씨 칩 (Open-Meteo: 키·서버·DB 없이 브라우저에서 바로 조회, 10분마다 자동 갱신)
// ============================================================================
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.9780&current_weather=true";

const W_SVG = (d) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const W_ICONS = {
  sun:   W_SVG('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/>'),
  moon:  W_SVG('<path d="M20 14.2A8 8 0 0 1 9.8 4a8 8 0 1 0 10.2 10.2z"/>'),
  cloud: W_SVG('<path d="M7 18h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 8.9 4.6 4.6 0 0 0 7 18z"/>'),
  rain:  W_SVG('<path d="M7 14h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 4.9 4.6 4.6 0 0 0 7 14z"/><path d="M8.5 17.5l-1 2.5M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5"/>'),
  snow:  W_SVG('<path d="M7 14h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 4.9 4.6 4.6 0 0 0 7 14z"/><path d="M8.5 18v.1M12.5 19.5v.1M16.5 18v.1"/>'),
  storm: W_SVG('<path d="M7 14h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 4.9 4.6 4.6 0 0 0 7 14z"/><path d="M12.5 14l-2 3.5h3l-2 3.5"/>'),
  fog:   W_SVG('<path d="M4 9h16M6 13h12M4 17h16"/>'),
  wind:  W_SVG('<path d="M3 9h10a2.5 2.5 0 1 0-2.4-3.2M3 13h14a2.5 2.5 0 1 1-2.4 3.2M3 17h6"/>'),
};

// WMO 날씨 코드 → [영문 표기, 아이콘]
function describeWeather(code, isDay, windKmh) {
  if (windKmh >= 30) return ["Windy", "wind"];
  if (code === 0 || code === 1) return isDay ? ["Sunny", "sun"] : ["Clear night", "moon"];
  if (code === 2) return ["Partly cloudy", isDay ? "cloud" : "moon"];
  if (code === 3) return ["Overcast", "cloud"];
  if (code === 45 || code === 48) return ["Fog", "fog"];
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return ["Rain", "rain"];
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ["Snow", "snow"];
  if (code >= 95) return ["Thunderstorm", "storm"];
  return ["Cloudy", "cloud"];
}

async function loadWeather() {
  const chip = document.getElementById("weatherChip");
  if (!chip) return;
  try {
    const res = await fetch(WEATHER_URL);
    if (!res.ok) throw new Error(res.status);
    const w = (await res.json()).current_weather;
    const [label, icon] = describeWeather(w.weathercode, w.is_day === 1, w.windspeed);
    chip.innerHTML = `${W_ICONS[icon]}<span class="wc-city">Seoul</span><span class="wc-temp">${Math.round(w.temperature)}°C</span><span class="wc-label">${label}</span>`;
    chip.dataset.wx = icon;
    chip.title = `Seoul · ${w.temperature}°C · wind ${w.windspeed} km/h`;
  } catch (err) {
    console.error("날씨 조회 실패:", err);
    chip.innerHTML = `<span class="wc-city">Seoul</span><span class="wc-temp">—</span>`;
  }
}

function initWeather() {
  const chip = document.getElementById("weatherChip");
  if (!chip) return;
  chip.addEventListener("click", loadWeather);              // 눌러서 즉시 갱신도 가능
  loadWeather();
  setInterval(loadWeather, 10 * 60 * 1000);                 // 10분마다 자동 갱신
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loadWeather(); });  // 다시 열면 갱신
}

// ============================================================================
// UI 사운드: 버튼을 누르면 맑은 피아노 음, 알파벳 위를 훑으면 또로롱 아르페지오
// (파일 없이 Web Audio로 합성. 루틴 음악이 재생 중일 땐 소리를 내지 않음)
// ============================================================================
const UiSound = (() => {
  let ctx = null, master = null, lastAt = 0;
  let enabled = true;
  try { enabled = localStorage.getItem("uiSound") !== "off"; } catch {}
  const PENTA = [0, 2, 4, 7, 9];                       // 펜타토닉: 어떤 순서로 울려도 어울림
  const noteFreq = (i) => 523.25 * Math.pow(2, (PENTA[i % 5] + 12 * Math.floor(i / 5)) / 12);

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.1;   // 전체 음량: 기존의 약 30% (눌렸다는 느낌만 들릴 정도)
      // 반짝이는 잔향(짧은 피드백 딜레이)
      const delay = ctx.createDelay(0.5); delay.delayTime.value = 0.17;
      const fb = ctx.createGain(); fb.gain.value = 0.3;
      const wet = ctx.createGain(); wet.gain.value = 0.28;
      master.connect(ctx.destination);
      master.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return true;
  }

  function musicPlaying() {
    const a = document.getElementById("audioPlayer");
    return a && !a.paused && !!a.src;
  }

  function play(i, vel = 1, dur = 1.5) {
    if (!enabled || musicPlaying() || !ensure()) return;
    const t = ctx.currentTime, f = noteFreq(Math.max(0, Math.min(24, i)));
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.15 * vel, t + 0.006);  // 빠른 타건 (피아노음 크기: 기존의 30%)
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);          // 길게 사그라듦
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 7000;
    out.connect(lp); lp.connect(master);
    [[1, 0.9, "sine"], [2, 0.32, "sine"], [3, 0.12, "sine"], [4.01, 0.05, "triangle"]].forEach(([m, g, type], k) => {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = type; o.frequency.value = f * m; og.gain.value = g;
      og.gain.setValueAtTime(g, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + dur / (1 + k * 0.8));  // 높은 배음일수록 빨리 사라짐
      o.connect(og); og.connect(out);
      o.start(t); o.stop(t + dur + 0.05);
    });
  }

  // 아주 작고 낮은 "톡": 울림 없이 짧게, 들릴 듯 말 듯한 크기
  function knock(vel = 1, pitch = 1) {
    if (!enabled || musicPlaying() || !ensure()) return;
    const t = ctx.currentTime;
    const f0 = 180 * pitch * (0.97 + Math.random() * 0.06);
    const out = ctx.createGain(); out.gain.value = 0.55;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900;
    out.connect(lp); lp.connect(master);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(f0 * 1.15, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.85, t + 0.03);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.4 * vel, t + 0.002);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);          // 0.05초 만에 사라짐 (여운 없음)
    o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.06);
    const len = Math.floor(ctx.sampleRate * 0.012), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let k = 0; k < len; k++) d[k] = (Math.random() * 2 - 1) * Math.pow(1 - k / len, 2);
    const ns = ctx.createBufferSource(); ns.buffer = buf;
    const ng = ctx.createGain(); ng.gain.value = 0.12 * vel;
    ns.connect(ng); ng.connect(out); ns.start(t);
  }

  return {
    play,
    knock(vel, pitch) { knock(vel, pitch); },
    knockDouble() { knock(0.9, 1); setTimeout(() => knock(0.7, 1.1), 100); },   // 톡톡 (아주 작게)
    sweep(i) {                                          // 훑을 때: 너무 촘촘하면 간격 조절
      const n = performance.now();
      if (n - lastAt < 38) return;
      lastAt = n;
      play(i, 0.7, 1.1);
    },
    press(i = 12) { play(i, 1, 1.6); },
    isOn: () => enabled,
    toggle() {
      enabled = !enabled;
      try { localStorage.setItem("uiSound", enabled ? "on" : "off"); } catch {}
      if (enabled) play(14, 1, 1.4);
      return enabled;
    },
  };
})();

function initUiSound() {
  const tapLike = 'button, .tab-btn, .routine-chip, .alphabet-btn, .dict-bar a';
  // 버튼 누를 때: 종류별로 높낮이를 달리해 단조롭지 않게
  document.addEventListener("pointerdown", (e) => {
    const el = e.target.closest(tapLike);
    if (!el || el.disabled || el.id === "soundToggle") return;
    // 발레 사전 영역(알파벳 등)은 맑은 피아노, 그 밖의 모든 버튼은 둔탁한 노크(톡)
    if (el.classList.contains("alphabet-btn")) { UiSound.play(alphaIndex(el), 1, 1.7); return; }
    if (el.closest("#dictionary-section")) { UiSound.press(12 + Math.floor(Math.random() * 6)); return; }
    if (el.matches('button[type="submit"], .btn-primary, .btn-play, .routine-chip')) { UiSound.knockDouble(); return; }
    UiSound.knock(1, 1);
  }, true);

  // 알파벳 위를 훑을 때 (마우스·터치)
  const filter = document.getElementById("alphabetFilter");
  if (filter) {
    let lastEl = null;
    const over = (el) => { if (el && el !== lastEl && el.classList.contains("alphabet-btn")) { lastEl = el; UiSound.sweep(alphaIndex(el)); } };
    filter.addEventListener("pointerover", (e) => { if (e.pointerType === "mouse") over(e.target.closest(".alphabet-btn")); });
    filter.addEventListener("pointerleave", () => { lastEl = null; });
    filter.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" && e.buttons) over(document.elementFromPoint(e.clientX, e.clientY)?.closest(".alphabet-btn"));
    });
  }

  // 소리 켜기/끄기
  const toggle = document.getElementById("soundToggle");
  if (toggle) {
    const sync = () => {
      const on = UiSound.isOn();
      toggle.classList.toggle("off", !on);
      toggle.setAttribute("aria-pressed", on);
      toggle.dataset.tip = on ? "버튼음 · 켜짐" : "버튼음 · 꺼짐";
    };
    toggle.addEventListener("click", () => { UiSound.toggle(); sync(); });
    sync();
  }
}

function alphaIndex(el) {
  const t = el.textContent.trim();
  return /^[A-Z]$/.test(t) ? t.charCodeAt(0) - 65 : 0;   // ALL은 가장 낮은 음
}

// 채팅 입력창을 화면 아래에 고정. 가로 화면에서는 오른쪽 채팅 칸의 위치·폭에 맞춤
function positionChatBar() {
  const form = document.getElementById('chatForm'), card = document.querySelector('.chat-card');
  if (!form || !card) return;
  if (window.innerWidth >= 900) {
    const r = card.getBoundingClientRect();
    form.style.setProperty('--bar-left', `${Math.round(r.left + 12)}px`);
    form.style.setProperty('--bar-width', `${Math.round(r.width - 24)}px`);
  } else {
    form.style.removeProperty('--bar-left'); form.style.removeProperty('--bar-width');
  }
}
window.addEventListener('resize', positionChatBar);
window.addEventListener('load', positionChatBar);
document.addEventListener('DOMContentLoaded', () => { setTimeout(positionChatBar, 300); });

// 아이콘 툴팁: 마우스를 올리면 CSS로 표시, 터치에서는 꾹 누르면 잠깐 표시
(function initTips() {
  let timer = null;
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    const el = e.target.closest('[data-tip]'); if (!el) return;
    clearTimeout(timer);
    timer = setTimeout(() => { el.classList.add('tip-show'); setTimeout(() => el.classList.remove('tip-show'), 1600); }, 450);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => document.addEventListener(t, () => clearTimeout(timer)));
})();

// 제목(로고 + Mon Cher Barre)을 누르면 홈(채팅) 화면 맨 위로 돌아감
function initBrandHome() {
  const brand = document.getElementById('brandHome');
  if (!brand) return;
  const goHome = () => {
    document.querySelector('.tab-btn[data-tab="chat"]')?.click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  brand.addEventListener('click', goHome);
  brand.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goHome(); } });
}

// --- 초기화 ---
document.addEventListener("DOMContentLoaded", () => {
  // 메모 검색: 글자를 입력하는 즉시(일부만 입력해도) 결과가 갱신됨
  let searchTimer = null;
  document.getElementById("searchKeyword")?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applyFilter, 120);
  });
  ["searchDate", "searchStart", "searchEnd"].forEach(id => document.getElementById(id)?.addEventListener("change", applyFilter));
  initWeather();
  initUiSound();
  initLeaveHandlers();
  initBrandHome();
  loadPracticeDataWithCache().then(() => {
    loadDataList();
    loadStatistics();
  });
  loadConversationsList();
  loadDictionary();
  loadFavorites();
  loadRoutineDataset().then(() => initRoutineChips());
});
