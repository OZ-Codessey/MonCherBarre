// 차트 글꼴도 본문과 같은 서체로
if (window.Chart) {
  Chart.defaults.color = '#6B5E36';        // 그래프 글자(축·범례·툴팁 제외): 진한 그레이 골드
  Chart.defaults.font.size = 8;            // 글자 크기 축소 (제목에 맞춰 함께 줄임)
  Chart.defaults.plugins.legend.labels.color = '#6B5E36';
  Chart.defaults.scale.ticks.color = '#6B5E36';
}
if (window.Chart) Chart.defaults.font.family = '"Jost", "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", sans-serif';

const API_BASE_URL = window.API_BASE_URL || "https://moncherbarre.onrender.com";

// 사용자가 입력한 글(메모·대화 제목)을 화면 HTML에 넣기 전에 반드시 거치는 이스케이프: < > & " ' 를 글자로 바꿔 태그·스크립트로 실행되지 않게 한다
function escHtml(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ============================================================================
// 읽어 온 기간을 쌓아 두는 저장소: 한 번 읽은 기간은 브라우저에 보관하고 다시 읽지 않는다.
// 새로 필요한 기간(아직 안 읽은 부분)만 서버에 요청하므로 Firestore 읽기가 그만큼만 발생한다.
// ============================================================================
function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function todayStr() { return ymd(new Date()); }
function addDays(dateStr, n) { const d = new Date(dateStr + "T00:00:00"); d.setDate(d.getDate() + n); return ymd(d); }
const FULL_START = "1900-01-01", FULL_END = "2999-12-31";

function makeRangeStore({ key, url, dateOf, idOf }) {
  let records = {}, ranges = [];
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "null");
    if (raw) { records = raw.records || {}; ranges = raw.ranges || []; }
  } catch (e) { /* 저장소를 못 읽으면 빈 상태로 시작 */ }
  const persist = () => { try { localStorage.setItem(key, JSON.stringify({ records, ranges })); } catch (e) { /* 용량 초과 등: 메모리에만 유지 */ } };
  const mergeRanges = () => {
    ranges.sort((a, b) => a[0].localeCompare(b[0]));
    const out = [];
    for (const r of ranges) {
      const last = out[out.length - 1];
      if (last && r[0] <= addDays(last[1], 1)) { if (r[1] > last[1]) last[1] = r[1]; }
      else out.push([r[0], r[1]]);
    }
    ranges = out;
  };
  // [start,end] 중 아직 읽지 않은 구간들
  const gaps = (start, end) => {
    let cur = start; const out = [];
    for (const [a, b] of ranges) {
      if (b < cur) continue;
      if (a > end) break;
      if (a > cur) out.push([cur, addDays(a, -1)]);
      cur = addDays(b, 1);
      if (cur > end) break;
    }
    if (cur <= end) out.push([cur, end]);
    return out;
  };
  return {
    // 아직 안 읽은 구간만 서버에서 읽어 쌓는다. 서버에 요청한 횟수를 돌려준다.
    async ensure(start, end) {
      const need = gaps(start, end);
      for (const [a, b] of need) {
        const res = await fetch(`${API_BASE_URL}${url}?start=${a}&end=${b}`);
        if (!res.ok) throw new Error(`status ${res.status}`);
        (await res.json()).forEach((r) => { records[idOf(r)] = r; });
        ranges.push([a, b]); mergeRanges(); persist();
      }
      return need.length;
    },
    list: (start, end) => Object.values(records)
      .filter((r) => { const d = dateOf(r); return d && d >= start && d <= end; })
      .sort((x, y) => dateOf(x).localeCompare(dateOf(y))),
    all: () => Object.values(records),
    get: (id) => records[id],
    upsert(r) { records[idOf(r)] = r; persist(); },
    remove(id) { delete records[id]; persist(); },
    // 어느 구간을 "아직 안 읽음"으로 되돌림 (다른 기기에서 바뀐 내용을 하루 한 번 반영할 때)
    forget(start, end) {
      const out = [];
      for (const [a, b] of ranges) {
        if (b < start || a > end) { out.push([a, b]); continue; }
        if (a < start) out.push([a, addDays(start, -1)]);
        if (b > end) out.push([addDays(end, 1), b]);
      }
      ranges = out; persist();
    },
    importFull(rows) { rows.forEach((r) => { records[idOf(r)] = r; }); ranges = [[FULL_START, FULL_END]]; persist(); },
    hasRanges: () => ranges.length > 0,
  };
}
const PracticeStore = makeRangeStore({ key: "practice_store_v2", url: "/api/data", dateOf: (r) => r.date, idOf: (r) => r.id });
const ConvStore = makeRangeStore({ key: "conv_store_v1", url: "/api/conversations", dateOf: (r) => (r.updated_at || "").slice(0, 10), idOf: (r) => r.id });
// 예전 방식으로 보관해 둔 전체 기록이 있으면 그대로 옮겨 와서 다시 읽지 않는다
try {
  const old = JSON.parse(localStorage.getItem("practice_logs_cache") || "null");
  if (Array.isArray(old) && old.length > 0 && !PracticeStore.hasRanges()) PracticeStore.importFull(old);
  localStorage.removeItem("practice_logs_cache");
} catch (e) { /* 무시 */ }

// 비서가 참고할 활동(조회한 용어, 본 영상): 브라우저에 모았다가 다음 채팅 요청에 함께 보낸다 (클릭마다 서버에 쓰지 않음)
const ACT_KEY = "assistant_activity_v1";
function readActivity() { try { return JSON.parse(localStorage.getItem(ACT_KEY) || "{}"); } catch (e) { return {}; } }
function trackActivity(kind, term) {
  if (!term) return;
  const a = readActivity();
  a[kind] = (a[kind] || []).concat(term).slice(-50);
  try { localStorage.setItem(ACT_KEY, JSON.stringify(a)); } catch (e) { /* 무시 */ }
}
function clearActivity() { try { localStorage.removeItem(ACT_KEY); } catch (e) { /* 무시 */ } }

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
// 탭을 바꿀 때 주소 뒤에 #data 처럼 기록해서(History API), 브라우저의 뒤로 가기·앞으로 가기로 탭 사이를 오갈 수 있고
// 새로고침해도 보던 탭이 유지된다. 한 페이지 안에서 구역(섹션)만 바꾸므로 재생 중인 음악은 끊기지 않는다.
const TAB_NAMES = [...document.querySelectorAll(".tab-btn")].map((b) => b.dataset.tab);
let currentTab = null;

function showTab(tab) {
  if (!TAB_NAMES.includes(tab)) tab = "chat";
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-section").forEach((s) => s.classList.toggle("active", s.id === `${tab}-section`));
  const changed = tab !== currentTab;
  currentTab = tab;
  if (changed) {   // 선택한 탭이 한 번 반짝임
    const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
    if (btn) { btn.classList.remove("tab-flash"); void btn.offsetWidth; btn.classList.add("tab-flash"); setTimeout(() => btn.classList.remove("tab-flash"), 950); }
  }
  lazyLoadTab(tab);
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    if (tab !== currentTab) {
      try { history.pushState({ tab }, "", `#${tab}`); } catch (e) { /* 무시 */ }
    }
    showTab(tab);
  });
});
window.addEventListener("popstate", (e) => {
  showTab((e.state && e.state.tab) || location.hash.slice(1) || "chat");
});
// 처음 열 때: 주소의 #탭이름이 있으면 그 탭으로, 없으면 채팅. 이 항목은 새 기록을 쌓지 않고 현재 기록만 맞춘다.
document.addEventListener("DOMContentLoaded", () => {
  const first = TAB_NAMES.includes(location.hash.slice(1)) ? location.hash.slice(1) : "chat";
  try { history.replaceState({ tab: first }, "", `#${first}`); } catch (e) { /* 무시 */ }
  showTab(first);
});

// 탭을 처음 열 때 한 번만 데이터를 불러옴 (페이지를 열자마자 모든 걸 읽지 않도록)
const _tabLoaded = {};
function lazyLoadTab(tab) {
  if (_tabLoaded[tab]) return;
  _tabLoaded[tab] = true;
  if (tab === "data") loadDataList();
  if (tab === "conversations") loadConversationsList();
  if (tab === "favorites") loadFavorites();
}

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
  // [라벨](https://...) 링크는 작은 버튼으로: 유튜브 영상은 재생(▶), 그 밖의 주소(검색 등)는 지구본(🌐)
  // R = 로열발레단 영상(사전에 연결된 29개), 지구본 = 웹(유튜브) 링크. 사전 영상 주소 목록으로 구분한다.
  const royal = (u) => (typeof movesData !== "undefined" && Array.isArray(movesData)) && movesData.some(m => m.video_url && m.video_url === u);
  const linkBtn = (label, url) => {
    const r = royal(url);
    const ico = r
      ? '<svg viewBox="6.1 5.8 11.2 12.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.2 17.2V6.8h3.6a2.9 2.9 0 0 1 0 5.8H8.2M11.6 12.6l3.6 4.6"/></svg>'
      : '<svg viewBox="1.9 1.9 20.2 20.2" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/></svg>';
    return `<a class="chat-link ${r ? "yt" : "web"}" href="${url}" target="_blank" rel="noopener noreferrer" aria-label="${label}" title="${r ? "로열발레단 영상" : "웹에서 찾기"}">${ico}</a>`;
  };
  const inline = (t) => esc(t)
    .replace(/&lt;br\s*\/?&gt;/gi, "<br>")   // GPT가 표 칸 안에 넣은 줄바꿈 태그만 줄바꿈으로 (그 밖의 HTML은 그대로 이스케이프)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => linkBtn(label, url))
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // 표 칸: 동작마다 한 줄씩 적고, 그 동작의 링크는 지구본 아이콘 하나로 합친다(영상이 있으면 영상 주소로 연결)
  const cellHtml = (c) => {
    if (!/\]\(https?:/.test(c)) return inline(c);
    return c.split(/\)\s*,\s*/).map((part, k, arr) => {
      const t = k < arr.length - 1 ? part + ")" : part;
      const links = [...t.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g)].map(m => m[2]);
      const name = t.replace(/\[[^\]]+\]\(https?:\/\/[^\s)]+\)/g, "").trim();
      const vid = links.find(u => royal(u));
      const web = links.find(u => u !== vid) || (vid ? null : links[0]);
      return links.length ? `${esc(name)}${vid ? " " + linkBtn("영상", vid) : ""}${web ? (vid ? "" : " ") + linkBtn("검색", web) : ""}` : inline(t);
    }).join("<br>");
  };
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
      // 머리글이 '영상'인 칸만 링크 버튼이 한 줄로 나란히 보이도록 표시한다
      const vi = head.findIndex(c => c.trim() === "영상");
      html += '<div class="chat-table-wrap"><table class="chat-table"><thead><tr>' +
        head.map((c, i) => `<th${i === vi ? ' class="col-video"' : ""}>${inline(c)}</th>`).join("") + "</tr></thead><tbody>" +
        body.map(r => "<tr>" + r.map((c, i) => `<td${i === vi ? ' class="col-video"' : ""}>${cellHtml(c)}</td>`).join("") + "</tr>").join("") +
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

// 비서 메모에 합칠 활동: 조회한 용어·본 영상(모아 둔 것)과 즐겨찾기 이름(보관함에 있을 때만)
function buildActivity() {
  const a = readActivity();
  return {
    terms: a.terms || [],
    videos: a.videos || [],
    favorites: Array.isArray(favoritesCache) ? favoritesCache.map((f) => f.korean_name || f.french_term) : undefined,
  };
}

// 방금 나눈 대화를 대화 보관함에 바로 반영 (서버에서 다시 읽지 않음)
async function syncConvAfterChat(message, reply, convId, wasNewRoom) {
  try {
    const now = new Date();
    const iso = `${ymd(now)}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    const pair = [{ role: "user", content: message }, { role: "assistant", content: reply }];
    const kept = ConvStore.get(convId);
    if (kept) ConvStore.upsert({ ...kept, messages: [...(kept.messages || []), ...pair], updated_at: iso });
    else if (wasNewRoom) ConvStore.upsert({ id: convId, title: message.slice(0, 15), messages: pair, updated_at: iso });
    else {                                           // 보관함에 없는 옛 방에 이어 쓴 경우: 그 방 1개만 읽어 온다
      const res = await fetch(`${API_BASE_URL}/api/conversations/${convId}`);
      if (res.ok) { const c = await res.json(); if (c && c.id) ConvStore.upsert({ ...c, updated_at: iso }); }
    }
  } catch (e) { /* 보관함 반영 실패는 무시: 다음 조회 때 서버에서 읽음 */ }
}

async function sendMessage(message) {
  appendMessage(message, "user");
  setLoading(true);
  const startedAt = Date.now();
  try {
    const res = await fetch(`${API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, conversation_id: currentConvId, activity: buildActivity(), weather: weatherSnapshot }),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    const wasNewRoom = !currentConvId;
    currentConvId = data.conversation_id;
    clearActivity();                                  // 서버가 비서 메모에 합쳤으니 모아 둔 활동은 비움
    appendMessage(data.reply, "assistant");
    syncConvAfterChat(message, data.reply, data.conversation_id, wasNewRoom);
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

// 루틴 버튼: 재생기(initRoutineChips)와 함께 채팅에도 "N분 루틴 시작해요"를 보내 그날의 동작을 추천받는다
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
    PracticeStore.upsert(await res.json());
    alert("기록이 추가됐습니다!");
    e.target.reset();
    afterDataChange();
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

// 데이터 탭: 기본은 최근 14일만 읽는다. 날짜·기간을 정하면 그 기간 중 아직 안 읽은 부분만 읽는다.
let dataView = { start: addDays(todayStr(), -13), end: todayStr() };

function computeDataView() {
  const date = document.getElementById("searchDate").value;
  const start = document.getElementById("searchStart").value;
  const end = document.getElementById("searchEnd").value;
  const today = todayStr();
  if (date) return { start: date, end: date };
  if (start || end) { const e = end || today; return { start: start || addDays(e, -13), end: e }; }
  return { start: addDays(today, -13), end: today };
}

async function loadDataList() {
  return applyFilter();
}

function renderDataList() {
  const container = document.getElementById("dataListContainer");
  const showMoreRow = document.getElementById("showMoreRow");
  const showMoreBtn = document.getElementById("showMoreBtn");

  if (filteredItems.length === 0) {
    container.innerHTML = "<p class='loading'>이 기간에 해당하는 기록이 없어요.</p>";
    showMoreRow.classList.add("hidden");
    document.getElementById("filterStatus").textContent = `${dataView.start} ~ ${dataView.end} 기록 없음`;
    return;
  }

  // D1: 기본 20개만 표시
  const toShow = showAll ? filteredItems : filteredItems.slice(0, SHOW_LIMIT);

  container.innerHTML = toShow.map((item) => `
    <div class="data-item" id="item-${escHtml(item.id)}">
      <div class="data-item-info">
        <div class="data-item-date">${escHtml(item.date)} · ${escHtml(item.value)}분</div>
        <div class="data-item-meta">${item.memo ? highlightMatch(item.memo, searchWord) : "메모 없음"}</div>
      </div>
      <div class="data-item-actions">
        <button class="btn-small btn-edit" data-id="${escHtml(item.id)}" data-date="${escHtml(item.date)}" data-value="${escHtml(item.value)}" data-memo="${escHtml(item.memo || "")}" onclick="showEditForm(this.dataset.id, this.dataset.date, Number(this.dataset.value), this.dataset.memo)">수정</button>
        <button class="btn-small btn-delete" data-id="${escHtml(item.id)}" onclick="deleteData(this.dataset.id)">삭제</button>
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
  const isDefault = dataView.start === addDays(todayStr(), -13) && dataView.end === todayStr();
  const span = isDefault ? "최근 14일" : `${dataView.start} ~ ${dataView.end}`;
  document.getElementById("filterStatus").textContent =
    allItems.length !== filteredItems.length
      ? `${span} ${allItems.length}개 중 ${filteredItems.length}개 표시`
      : `${span} ${allItems.length}개`;
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

async function applyFilter() {
  const keyword = document.getElementById("searchKeyword").value.trim().toLowerCase();
  searchWord = document.getElementById("searchKeyword").value.trim();
  const container = document.getElementById("dataListContainer");
  dataView = computeDataView();
  try {
    await PracticeStore.ensure(dataView.start, dataView.end);   // 아직 안 읽은 기간만 서버에서 읽음
  } catch (err) {
    container.innerHTML = "<p class='loading'>불러오지 못했어요.</p>";
    return;
  }
  allItems = PracticeStore.list(dataView.start, dataView.end).reverse();   // 최신이 위
  // 메모 검색은 지금 불러온 기간 안의 기록만 대상으로 함
  filteredItems = keyword ? allItems.filter((i) => (i.memo || "").toLowerCase().includes(keyword)) : [...allItems];
  showAll = false;
  renderDataList();
}

function clearFilter() {
  searchWord = "";
  ["searchDate", "searchStart", "searchEnd", "searchKeyword"].forEach((id) => {
    document.getElementById(id).value = "";
  });
  applyFilter();
}

// 기록을 추가·수정·삭제한 뒤: 서버가 돌려준 내용을 보관함에 바로 반영하고 목록만 다시 그린다 (다시 읽지 않음)
function afterDataChange() {
  statsDirty = true;
  applyFilter();
  refreshStatsIfShown();
}

async function deleteData(id) {
  if (!confirm("삭제하시겠어요?")) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/data/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error();
    PracticeStore.remove(id);
    afterDataChange();
  } catch (err) {
    alert("삭제에 실패했어요.");
  }
}

function showEditForm(id, date, value, memo) {
  const row = document.getElementById(`item-${id}`);
  // date 포맷 보장: YYYY-MM-DD (2자리 월일)
  const dateStr = date.includes('-') ? date : new Date(date).toISOString().split('T')[0];
  row.innerHTML = `
    <form class="edit-inline" data-id="${escHtml(id)}" onsubmit="updateData(event,this.dataset.id)">
      <input type="date" class="edit-date" value="${escHtml(dateStr)}" required />
      <input type="number" class="edit-value" value="${escHtml(value)}" min="0" max="1440" required />
      <input type="text" class="edit-memo" value="${escHtml(memo)}" maxlength="200" placeholder="메모" />
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
    PracticeStore.upsert(await res.json());
    afterDataChange();
  } catch (err) {
    alert("수정에 실패했어요.");
  }
}

// --- 통계 차트 (4개: 월별평균, 요일별분포, 누적시간, 부상별운동) ---
async function loadStatistics() {
  try {
    // 이미 읽어 둔 기록으로 계산 (Firestore 읽기 0회)
    const stats = calculateStats(PracticeStore.list(statsRange.start, statsRange.end));

    // 배지 업데이트
    document.getElementById("streakDays").textContent = stats.streak;
    document.getElementById("bestDay").textContent = stats.bestDay;
    document.getElementById("totalHours").textContent = stats.totalHours;

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    if (window.Chart) { const tc = isDark ? "#D9C896" : "#6B5E36"; Chart.defaults.color = tc; Chart.defaults.scale.ticks.color = tc; Chart.defaults.plugins.legend.labels.color = tc; }
    const barColor = "#C98F8A";
    const lineColor = "#C98F8A";
    const textColor = isDark ? "#e8d8df" : "#4a2535";
    const axisBg = isDark ? "rgba(50,40,45,0.5)" : "rgba(244,229,234,0.5)";

    // 1️⃣ 월별 평균 (선 그래프)
    const monthLabels = stats.monthly.map((m) => m.label);
    if (monthlyChartInstance) monthlyChartInstance.destroy();
    monthlyChartInstance = new Chart(document.getElementById("monthlyChart"), {
      type: "line",
      data: {
        labels: monthLabels,
        datasets: [{
          label: "평균 분",
          data: stats.monthly.map((m) => m.avg),
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

    // 통계 설명 생성
    updateStatsNote(stats);
  } catch (err) {
    console.error("Statistics load failed:", err);
  }
}

function updateStatsNote(stats) {
  const note = document.getElementById("statsNote");
  const streakText = stats.streak > 0 ? `${stats.streak}일 연속` : "연속 없음";
  const bestDayText = stats.bestDay !== "-" ? `${stats.bestDay}요일` : "데이터 부족";
  const span = statsRange ? `${statsRange.start} ~ ${statsRange.end}` : "";
  note.textContent = `${span} · 기록 ${stats.count}일 · 총 ${stats.totalHours}시간 연습 · 최장 ${streakText} · 최다 요일 ${bestDayText}`;
}


// 다크모드 전환 시 차트 색상도 업데이트
themeToggle.addEventListener("click", () => refreshStatsIfShown());

// --- 대화 기록 ---
let convList = [];
let convShowAll = false;

let convRangeLabel = "최근 7일";
let convKeyword = "";
let convView = { start: addDays(todayStr(), -6), end: todayStr() };

// 대화 목록: 기본은 최근 7일 방만 읽는다. 기간을 정하면 그 기간 중 아직 안 읽은 방만 읽고, 읽은 방은 보관해 다시 읽지 않는다.
async function loadConversationsList(start, end, forceRecent) {
  const container = document.getElementById("conversationsListContainer");
  try {
    const t = todayStr();
    if (!start && !end) {
      convView = { start: addDays(t, -6), end: t };
      convRangeLabel = "최근 7일";
      // 다른 기기에서 만든 대화를 반영하도록, 최근 7일 구간은 하루에 한 번만 새로 읽는다
      let stamp = null;
      try { stamp = localStorage.getItem("conv_recent_stamp"); } catch (e) { /* 무시 */ }
      if (forceRecent || stamp !== t) {
        ConvStore.forget(convView.start, convView.end);
        try { localStorage.setItem("conv_recent_stamp", t); } catch (e) { /* 무시 */ }
      }
    } else {
      convView = { start: start || FULL_START, end: end || t };
      convRangeLabel = `${start || "처음"} ~ ${end || "오늘"}`;
    }
    await ConvStore.ensure(convView.start, convView.end);
    convShowAll = false;
    renderConversations();
  } catch (err) {
    container.innerHTML = "<p class='loading'>대화 기록을 불러오지 못했어요.</p>";
  }
}

let convFolded = false, convOpenKey = "recent";
function setConvFolded(f) {
  convFolded = f;
  document.querySelector(".conversations-list-card")?.classList.toggle("conv-folded", f);
  const note = document.getElementById("convRangeNote");
  if (f && note) note.textContent = "접혀 있어요. 같은 버튼을 다시 누르면 펼쳐져요.";
  if (!f) renderConversations();
}

// 날짜 입력 칸마다 달력 아이콘 오른쪽(칸 안)에 작은 지우기(↺) 버튼을 붙인다. 누르면 그 칸만 비운다.
function initDateClearButtons() {
  const ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4v4.5H8"/></svg>';
  ["dataDate", "convStart", "convEnd", "statsStart", "statsEnd", "searchDate", "searchStart", "searchEnd"].forEach((id) => {
    const input = document.getElementById(id);
    if (!input || input.parentElement.classList.contains("date-field")) return;
    const wrap = document.createElement("span");
    wrap.className = "date-field";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "date-clear"; btn.title = "날짜 지우기"; btn.setAttribute("aria-label", "날짜 지우기");
    btn.innerHTML = ICON;
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      input.value = "";
      input.dispatchEvent(new Event("change", { bubbles: true }));   // 데이터 탭은 change로 목록을 다시 맞춘다
    });
    wrap.appendChild(btn);
  });
}

function initConversationToolbar() {
  const s = document.getElementById("convStart"), e = document.getElementById("convEnd");
  const kwInput = document.getElementById("convKeyword");
  const showRecent = () => { convOpenKey = "recent"; setConvFolded(false); return loadConversationsList(); };
  // 같은 버튼을 다시 누르면 접히고(사전의 알파벳 버튼처럼), 다시 누르면 펼쳐진다. 이미 읽어 둔 것은 다시 읽지 않는다.
  document.getElementById("convRangeBtn")?.addEventListener("click", () => {
    if (!s.value && !e.value) { s.focus(); return; }
    const key = `${s.value}~${e.value}`;
    if (convOpenKey === key && !convFolded) { setConvFolded(true); return; }
    convOpenKey = key; setConvFolded(false);
    loadConversationsList(s.value, e.value);
  });
  document.getElementById("convRecentBtn")?.addEventListener("click", () => {
    if (convOpenKey === "recent" && !convFolded) { setConvFolded(true); return; }
    s.value = ""; e.value = ""; kwInput.value = ""; convKeyword = "";
    showRecent();
  });
  // 초기화: 날짜·검색어를 비우고 기본(최근 7일) 목록으로 되돌린다 (이미 읽어 둔 것이라 읽기 없음)
  // 두 날짜 칸이 모두 비면(칸 안의 ↺로 지웠을 때) 기본(최근 7일) 목록으로 되돌린다 (이미 읽어 둔 것이라 읽기 없음)
  [s, e].forEach((el) => el.addEventListener("change", () => {
    if (!s.value && !e.value && convOpenKey !== "recent") { kwInput.value = ""; convKeyword = ""; showRecent(); }
  }));
  // 검색: 지금까지 읽어 둔 모든 대화에서 찾는다. 아직 안 읽은 옛 대화까지 찾으려면 '전체에서 검색'(안 읽은 방만 읽음)
  document.getElementById("convAllBtn")?.addEventListener("click", async () => {
    const btn = document.getElementById("convAllBtn");
    btn.disabled = true; btn.textContent = "불러오는 중…";
    try { await ConvStore.ensure(FULL_START, todayStr()); } catch (err) { alert("불러오지 못했어요."); }
    btn.disabled = false; btn.textContent = "전체 기간에서 검색";
    renderConversations();
  });
  let t = null;
  kwInput?.addEventListener("input", (ev) => {
    clearTimeout(t);
    t = setTimeout(() => { convKeyword = ev.target.value.trim(); convShowAll = false; setConvFolded(false); renderConversations(); }, 120);
  });
}

function renderConversations() {
  const container = document.getElementById("conversationsListContainer");
  const row = document.getElementById("convShowMoreRow");
  const btn = document.getElementById("convShowMoreBtn");
  const note = document.getElementById("convRangeNote");

  // 검색어가 있으면 지금까지 읽어 둔 모든 대화에서, 없으면 선택한 기간(기본 최근 7일)의 대화를 보여준다
  const kw = convKeyword.toLowerCase();
  const byNew = (a, b) => (b.updated_at || "").localeCompare(a.updated_at || "");
  convList = ConvStore.list(convView.start, convView.end).sort(byNew);
  const list = kw
    ? ConvStore.all().filter((c) => (c.title || "").toLowerCase().includes(kw) || (c.messages || []).some((m) => (m.content || "").toLowerCase().includes(kw))).sort(byNew)
    : convList;
  const allBtn = document.getElementById("convAllBtn");
  if (allBtn) allBtn.classList.toggle("hidden", !kw);
  if (note) note.textContent = kw
    ? `읽어 둔 대화 ${ConvStore.all().length}개 중 검색 결과 ${list.length}개`
    : `${convRangeLabel} · 대화 ${convList.length}개`;

  if (list.length === 0) {
    container.innerHTML = `<p class='loading'>${kw ? "검색 결과가 없어요." : "이 기간에 저장된 대화가 없어요."}</p>`;
    row.classList.add("hidden");
    return;
  }

  const shown = convShowAll ? list : list.slice(0, SHOW_LIMIT);
  container.innerHTML = shown.map((c) => {
    const hit = kw ? (c.messages || []).find((m) => (m.content || "").toLowerCase().includes(kw)) : null;
    const snippet = hit ? `<div class="data-item-meta conv-snippet">${highlightMatch(String(hit.content).replace(/\s+/g, " ").slice(0, 90), convKeyword)}</div>` : "";
    return `
    <div class="conversation-item">
      <div class="conversation-item-info">
        <div class="conversation-item-title">${kw ? highlightMatch(c.title || "", convKeyword) : escHtml(c.title)}</div>
        <div class="data-item-meta">${(c.updated_at || "").slice(0, 10)} · ${(c.messages || []).length}개 메시지</div>
        ${snippet}
      </div>
      <div class="conversation-item-actions">
        <button class="btn-small btn-load" data-id="${escHtml(c.id)}" data-title="${escHtml(c.title || "")}" onclick="loadConversation(this.dataset.id, this.dataset.title)">불러오기</button>
      </div>
    </div>`;
  }).join("");

  if (list.length > SHOW_LIMIT) {
    row.classList.remove("hidden");
    btn.textContent = convShowAll ? "접기 ↑" : `더 보기 (${list.length - SHOW_LIMIT}개 더) ↓`;
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
  const show = (conv) => {
    currentConvId = convId;
    document.getElementById("conversationTitle").textContent = conv.title;
    msgContainer.innerHTML = (conv.messages || []).map((m) => `
      <div class="conversation-message ${m.role}">
        ${renderChatMarkdown(m.content || "")}
      </div>
    `).join("");
    detail.classList.remove("hidden");
  };
  // 이미 읽어 둔 대화는 서버에 다시 묻지 않는다
  const kept = ConvStore.get(convId);
  if (kept && kept.messages) { show(kept); return; }
  fetch(`${API_BASE_URL}/api/conversations/${convId}`)
    .then((res) => res.json())
    .then(show)
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
    // 내보내기는 전체가 필요하므로, 아직 안 읽은 부분만 읽어 와서 보관함 전체로 만든다
    await PracticeStore.ensure(FULL_START, FULL_END);
    const items = PracticeStore.all().sort((a, b) => a.date.localeCompare(b.date));
    const header = "날짜,연습시간(분),메모";
    const rows = items.map((i) => `${i.date},${i.value},"${i.memo || ""}"`);
    triggerDownload([header, ...rows].join("\n"), "moncherbarre_data.csv", "text/csv;charset=utf-8;");
  } catch {
    alert("내보내기에 실패했어요.");
  }
}

async function exportJSON() {
  try {
    await PracticeStore.ensure(FULL_START, FULL_END);
    const items = PracticeStore.all().sort((a, b) => a.date.localeCompare(b.date));
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

    const saved = response.ok ? await response.json() : null;
    if (saved && saved.success) {
      const item = {
        id: saved.id, french_term: move.french_term, korean_name: move.korean_name,
        video_id: video.url.split("v=")[1] || "search", video_title: video.title, video_url: video.url,
        channel: video.channel, source: video.source, saved_at: new Date().toISOString(),
      };
      if (Array.isArray(favoritesCache)) {
        favoritesCache = favoritesCache.filter((f) => f.id !== item.id).concat(item);
        saveFavCache();
      }
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
// 즐겨찾기는 한 번 읽어 브라우저에 보관하고, 추가·삭제는 보관함에 바로 반영한다(서버에서 다시 읽지 않음)
const FAV_KEY = "favorites_cache_v1";
let favoritesCache = null;
try { favoritesCache = JSON.parse(localStorage.getItem(FAV_KEY) || "null"); } catch (e) { favoritesCache = null; }
function saveFavCache() { try { localStorage.setItem(FAV_KEY, JSON.stringify(favoritesCache)); } catch (e) { /* 무시 */ } }

async function loadFavorites(force) {
  const container = document.getElementById("favoritesList");
  try {
    if (!Array.isArray(favoritesCache) || force) {
      const response = await fetch(`${API_BASE_URL}/api/moves/favorites`);
      if (!response.ok) throw new Error(`status ${response.status}`);
      favoritesCache = await response.json();
      saveFavCache();
    }
    const favorites = favoritesCache;

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
          <button class="btn-remove" data-id="${String(fav.id).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")}">삭제</button>
        </div>
      </div>
    `).join("");
  } catch (err) {
    console.error("즐겨찾기 로드 오류:", err);
    container.innerHTML = `<div class="favorites-empty"><p>즐겨찾기를 불러오지 못했어요.</p></div>`;
  }
}

// 즐겨찾기 제거
// 삭제 버튼: id에 작은따옴표(예: air, en l')가 들어 있어도 동작하도록 인라인 onclick 대신 data-id와 이벤트 위임을 쓴다
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest(".btn-remove");
  if (b && b.dataset.id !== undefined) removeFavorite(b.dataset.id);
});

async function removeFavorite(id) {
  if (!confirm("정말 삭제하시겠습니까?")) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/moves/favorites/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    if (response.ok) {
      if (Array.isArray(favoritesCache)) { favoritesCache = favoritesCache.filter((f) => f.id !== id); saveFavCache(); }
      loadFavorites();  // 보관함 기준으로 목록 다시 그림 (서버 읽기 없음)
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
  trackActivity('terms', frenchTerm);   // 비서가 자주 찾은 용어를 참고하도록 기록
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

// --- 통계: 기간을 정하고 '분석'을 눌렀을 때만 (그 기간 중 아직 안 읽은 부분만 읽고, 읽어 둔 기록으로 계산) ---
let statsShown = false, statsDirty = false, statsRange = null;

function initStatsButton() {
  const run = document.getElementById("statsRunBtn"), toggle = document.getElementById("statsToggleBtn");
  const body = document.getElementById("statsBody");
  const s = document.getElementById("statsStart"), e = document.getElementById("statsEnd");
  if (!run || !body) return;
  const setOpen = (open) => {
    statsShown = open;
    body.classList.toggle("hidden", !open);
    toggle.textContent = open ? "접기" : "펼치기";
  };
  const analyze = async () => {
    const today = todayStr();
    if (!e.value) e.value = today;
    if (!s.value) s.value = addDays(e.value, -89);          // 기간을 비워 두면 최근 90일
    if (s.value > e.value) { const t = s.value; s.value = e.value; e.value = t; }
    run.disabled = true; run.textContent = "분석 중…";
    try {
      await PracticeStore.ensure(s.value, e.value);         // 이 기간 중 아직 안 읽은 부분만 서버에서 읽음
      statsRange = { start: s.value, end: e.value };
      toggle.classList.remove("hidden");
      setOpen(true);
      await loadStatistics();
      statsDirty = false;
    } catch (err) {
      document.getElementById("statsNote").textContent = "기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";
      body.classList.remove("hidden");
    } finally {
      run.disabled = false; run.textContent = "분석";
    }
  };
  run.addEventListener("click", analyze);
  toggle.addEventListener("click", () => setOpen(!statsShown));   // 접었다 펼쳐도 다시 읽거나 계산하지 않음
  // 초기화: 기간·결과를 비우고 접는다 (읽기 없음)
  [s, e].forEach((el) => el.addEventListener("change", () => {
    if (!s.value && !e.value) {          // 두 칸이 모두 비면 결과를 접고 처음 상태로 (읽기 없음)
      statsRange = null; setOpen(false); toggle.classList.add("hidden");
      document.getElementById("statsNote").textContent = "";
    }
  }));
  document.querySelectorAll(".stats-preset").forEach((b) => b.addEventListener("click", () => {
    const days = b.dataset.days;
    e.value = todayStr();
    s.value = days === "all" ? "2000-01-01" : addDays(e.value, -(parseInt(days, 10) - 1));
    analyze();
  }));
}
// 열려 있으면 이미 읽어 둔 기록으로 다시 그리고(읽기 0), 접혀 있으면 다음 '분석' 때 반영
function refreshStatsIfShown() { if (statsShown && statsRange) loadStatistics(); else statsDirty = true; }

// --- 통계 계산 (정해진 기간의 기록만 사용) ---
function calculateStats(logs) {
  const dayNames = ['월', '화', '수', '목', '금', '토', '일'];
  const val = (l) => (l.value ?? l.minutes) || 0;
  const dayOfWeekData = [0, 0, 0, 0, 0, 0, 0];
  const monthSum = {}, monthCnt = {};
  let totalMinutes = 0;
  [...logs].forEach((l) => {
    const v = val(l);
    const d = new Date(l.date + "T00:00:00");
    dayOfWeekData[d.getDay() === 0 ? 6 : d.getDay() - 1] += v;       // 월=0, 일=6
    const m = l.date.slice(0, 7);
    monthSum[m] = (monthSum[m] || 0) + v; monthCnt[m] = (monthCnt[m] || 0) + 1;
    totalMinutes += v;
  });
  // 최장 연속 연습일: 연습 시간이 있는 날이 하루씩 이어진 가장 긴 구간
  let streak = 0, run = 0, prev = null;
  logs.filter((l) => val(l) > 0).map((l) => l.date).sort().forEach((d) => {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    streak = Math.max(streak, run); prev = d;
  });
  const months = Object.keys(monthSum).sort();
  const monthly = months.map((m) => ({ label: `${m.slice(2, 4)}.${m.slice(5)}`, avg: Math.round(monthSum[m] / monthCnt[m]) }));
  const max = Math.max(...dayOfWeekData);
  return {
    streak,
    bestDay: logs.length && max > 0 ? dayNames[dayOfWeekData.indexOf(max)] : '-',
    totalHours: Math.round(totalMinutes / 60 * 10) / 10,
    dayOfWeekData,
    monthly,
    count: logs.length,
  };
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
// 루틴 구간(매트/바/센터)별로 어울리는 동작만 보여 준다. 채팅(get_routine)도 같은 규칙 파일(area_moves.json)을 쓴다.
let areaRules = null;
async function loadAreaRules() {
  try { areaRules = await (await fetch('data/area_moves.json')).json(); } catch (e) { areaRules = null; }
}
function movesForArea(area, musicKey, nos, trackIdx = 0) {
  const rule = areaRules && areaRules[area];
  // 매트(마루 바닥)는 발레 동작이 아니라 몸을 풀고 코어를 쓰는 바닥 운동만: 곡 순서 i → pool[2i], pool[2i+1] (채팅과 같은 규칙)
  if (rule && rule.floor_pool) {
    const pool = rule.floor_pool, labels = rule.labels || {};
    return [0, 1].map(k => pool[(trackIdx * 2 + k) % pool.length]).map(n => ({ term: labels[n] || n }));
  }
  const all = nos.map(no => movesData.find(m => m.no === no)).filter(Boolean);
  if (!rule || rule.allowed_terms === 'all') return all;
  let ok = all.filter(m => rule.allowed_terms.includes(m.term));
  if (!ok.length) ok = ((rule.fallback || {})[musicKey] || []).map(t => movesData.find(m => m.term === t)).filter(Boolean);
  return ok;
}

async function loadRoutineDataset() {
  await loadAreaRules();
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

let currentTrackSeconds = 0;   // 재생기에 표시하는 곡 길이: 음악 매핑표의 값(채팅 답변의 시간과 같은 값)

function initAudioEvents() {
  const audio = document.getElementById('audioPlayer');
  audio.addEventListener('timeupdate', () => {
    const d = audio.duration || 0;
    document.getElementById('timeNow').textContent = fmtTime(audio.currentTime);
    document.getElementById('progressFill').style.width = d ? `${(audio.currentTime / d) * 100}%` : '0%';
  });
  audio.addEventListener('loadedmetadata', () => {
    document.getElementById('timeTotal').textContent = fmtTime(currentTrackSeconds || audio.duration);
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
  // 사진이 위에 있으므로, 시작하면 재생기가 보이도록 왼쪽 칸을 그 위치로 부드럽게 내린다
  setTimeout(() => document.querySelector('.routine-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}

// --- 현재 위치의 곡 재생 ---
async function playCurrent() {
  const { allSections, sectionIndex, musicIndex } = currentRoutine;
  const section = allSections[sectionIndex];
  const musicName = section && section.music_sequence[musicIndex];
  const musicInfo = musicName && musicMappingData[musicName];
  if (!musicInfo) return;

  document.getElementById('nowPlayingArea').innerHTML = areaPlate(section.area, 'lg');
  currentTrackSeconds = musicInfo.duration_sec || 0;
  document.getElementById('timeTotal').textContent = fmtTime(currentTrackSeconds);
  document.getElementById('nowPlayingMusic').textContent = musicInfo.name_fr;
  document.getElementById('nowPlayingMovements').textContent = movesForArea(section.area, musicName, musicInfo.movements, musicIndex)
    .map(m => m.term).slice(0, 4).join(' · ');
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
  trackActivity('videos', currentDictTerm);
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
  trackActivity('videos', currentDictTerm);
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
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.9780&current_weather=true&daily=precipitation_probability_max,precipitation_sum,temperature_2m_max,temperature_2m_min&timezone=Asia%2FSeoul&forecast_days=1";

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

// 날씨 칩이 받은 값을 채팅 요청에 함께 보낸다: 서버가 날씨 서비스에 닿지 못해도(서버 IP 제한 등) 채팅이 날씨를 답할 수 있다.
let weatherSnapshot = null;
function wmoKo(code) {
  if (code === 0 || code === 1) return "맑음";
  if (code === 2) return "구름 조금";
  if (code === 3) return "흐림";
  if (code === 45 || code === 48) return "안개";
  if (code >= 51 && code <= 57) return "이슬비";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "비";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "눈";
  if (code >= 95) return "뇌우";
  return "흐림";
}
function keepWeatherSnapshot(j) {
  try {
    const w = j.current_weather, d = j.daily || {};
    const rainy = (w.weathercode >= 51 && w.weathercode <= 67) || (w.weathercode >= 80 && w.weathercode <= 82) || w.weathercode >= 95;
    const snowy = (w.weathercode >= 71 && w.weathercode <= 77) || w.weathercode === 85 || w.weathercode === 86;
    weatherSnapshot = {
      condition: wmoKo(w.weathercode), temperature_c: w.temperature, windspeed_kmh: w.windspeed,
      raining_now: rainy, snowing_now: snowy,
      today_rain_probability_pct: d.precipitation_probability_max ? d.precipitation_probability_max[0] : null,
      today_precipitation_mm: d.precipitation_sum ? d.precipitation_sum[0] : null,
      today_high_c: d.temperature_2m_max ? d.temperature_2m_max[0] : null,
      today_low_c: d.temperature_2m_min ? d.temperature_2m_min[0] : null,
      fetched_at: Date.now(),
    };
  } catch (e) { weatherSnapshot = null; }
}

async function loadWeather() {
  const chip = document.getElementById("weatherChip");
  if (!chip) return;
  try {
    const res = await fetch(WEATHER_URL);
    if (!res.ok) throw new Error(res.status);
    const j = await res.json();
    const w = j.current_weather;
    keepWeatherSnapshot(j);
    const [label, icon] = describeWeather(w.weathercode, w.is_day === 1, w.windspeed);
    // 비·눈 정보: 지금 비/눈이면 라벨(Rain/Snow)과 아이콘으로, 오늘 강수확률이 20% 이상이면 숫자도 함께 표시
    const pop = j.daily && j.daily.precipitation_probability_max ? j.daily.precipitation_probability_max[0] : null;
    const popTxt = (pop !== null && (pop >= 20 || icon === "rain" || icon === "snow")) ? `<span class="wc-pop">${icon === "snow" ? "눈" : "비"} ${pop}%</span>` : "";
    chip.innerHTML = `${W_ICONS[icon]}<span class="wc-city">Seoul</span><span class="wc-temp">${Math.round(w.temperature)}°C</span><span class="wc-label">${label}</span>${popTxt}`;
    chip.dataset.wx = icon;
    // 툴팁은 다른 화면 요소 뒤로 가려지지 않는 사이트 공통 툴팁(data-tip)을 쓴다
    chip.removeAttribute("title");
    chip.dataset.tipPos = "bottom";
    chip.dataset.tip = `서울 ${w.temperature}°C · 바람 ${w.windspeed}km/h` + (pop !== null ? ` · 강수확률 ${pop}%` : "") + (j.daily && j.daily.precipitation_sum ? ` · 오늘 ${j.daily.precipitation_sum[0]}mm` : "");
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
// 가로 화면: 위쪽 메뉴 높이만큼 뺀 높이에 두 칸을 맞춤(각 칸이 따로 스크롤)
function setChromeHeight() {
  const t = document.querySelector('#chat-section .layout');
  if (t) document.documentElement.style.setProperty('--chrome-h', `${Math.round(t.getBoundingClientRect().top + window.scrollY)}px`);
}
// 답변을 읽는 동안(맨 아래가 아닐 때) 입력창을 숨기고, 입력하려는 동작(입력창 쪽 터치·마우스 이동, 입력칸 선택,
// 글자 입력, 맨 아래 도착)이 있으면 다시 보이게 한다
function initChatBarDim() {
  const form = document.getElementById('chatForm'), box = document.getElementById('chatBox');
  const card = document.querySelector('.chat-card'), input = document.getElementById('chatInput');
  if (!form || !box || !card) return;
  const ZONE = 90;                                   // 화면 아래쪽 이 높이(px) 안을 건드리면 나타남
  let hideTimer = null;
  const landscape = () => window.innerWidth >= 900;
  const nearBottom = () => landscape()
    ? box.scrollHeight - box.scrollTop - box.clientHeight < 60
    : window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 120;
  const show = () => form.classList.remove('bar-dim');
  const hide = () => { if (!nearBottom() && document.activeElement !== input && !input.value) form.classList.add('bar-dim'); };
  const scheduleHide = () => { clearTimeout(hideTimer); hideTimer = setTimeout(hide, 1600); };
  const onScroll = () => { if (nearBottom()) { show(); } else { clearTimeout(hideTimer); hide(); } };
  const inZone = (y) => {
    const r = landscape() ? card.getBoundingClientRect() : { bottom: window.innerHeight };
    return y > r.bottom - ZONE && y < r.bottom + 40;
  };
  const touch = (ev) => { if (inZone(ev.clientY)) { show(); scheduleHide(); } };

  box.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  card.addEventListener('pointermove', touch, { passive: true });
  card.addEventListener('pointerdown', touch, { passive: true });
  window.addEventListener('pointerdown', (ev) => { if (!landscape()) touch(ev); }, { passive: true });
  window.addEventListener('pointermove', (ev) => { if (!landscape()) touch(ev); }, { passive: true });
  input.addEventListener('focus', () => { clearTimeout(hideTimer); show(); });
  input.addEventListener('input', () => { clearTimeout(hideTimer); show(); });
  form.addEventListener('transitionend', () => {});
}
window.addEventListener('resize', setChromeHeight);
window.addEventListener('load', () => { setChromeHeight(); initChatBarDim(); });
document.addEventListener('DOMContentLoaded', () => { setTimeout(setChromeHeight, 300); });
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
  // 첫 화면으로: 채팅 탭의 왼쪽(대표 사진이 있는 맨 위)과 채팅 맨 위로 돌아간다. 대표 사진은 접속할 때 정해진 그대로이고, 재생 중인 음악은 계속 나온다.
  const goHome = () => {
    document.querySelector('.tab-btn[data-tab="chat"]')?.click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.querySelector('#chat-section .col-left')?.scrollTo({ top: 0, behavior: 'smooth' });
    document.getElementById('chatBox')?.scrollTo({ top: 0, behavior: 'smooth' });
    document.getElementById('conversationDetail')?.classList.add('hidden');
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
  // 데이터 목록·대화 목록은 해당 탭을 처음 열 때만 불러오고, 통계는 '통계 보기' 버튼을 눌렀을 때만 계산한다
  initDateClearButtons();
  initStatsButton();
  initConversationToolbar();
  loadDictionary();
  loadRoutineDataset().then(() => initRoutineChips());
});
