// Contest Tracker - Popup Script

const PLATFORMS = {
  codeforces:  { name: 'Codeforces',  color: '#1DA1F2', icon: 'CF' },
  codechef:    { name: 'CodeChef',    color: '#B17A50', icon: 'CC' },
  atcoder:     { name: 'AtCoder',     color: '#888888', icon: 'AC' },
  leetcode:    { name: 'LeetCode',    color: '#FFA116', icon: 'LC' },
  kaggle:      { name: 'Kaggle',      color: '#20BEFF', icon: 'KG' },
  hackerrank:  { name: 'HackerRank',  color: '#00EA64', icon: 'HR' },
  hackerearth: { name: 'HackerEarth', color: '#2C3E50', icon: 'HE' },
  topcoder:    { name: 'TopCoder',    color: '#EF3B3B', icon: 'TC' },
};

let allContests = [];
let activeFilter = 'all';
let pollTimer = null;

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  bindEvents();
  await loadContests();

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'CONTESTS_UPDATED') {
      stopPolling();
      loadContestsFromStorage();
    }
    if (msg.type === 'FETCH_ERROR') {
      stopPolling();
      showError();
    }
  });
});

// ── Data ───────────────────────────────────────────────────────────────────
async function loadContests() {
  const { contests = [], lastUpdated } = await chrome.storage.local.get(['contests', 'lastUpdated']);

  if (contests.length > 0) {
    // Show cached data immediately, refresh in background
    allContests = contests;
    updateLastUpdated(lastUpdated);
    showLoading(false);
    renderContests();
    // Silently refresh
    chrome.runtime.sendMessage({ type: 'FORCE_REFRESH' }).catch(() => {});
  } else {
    // First launch — need to fetch
    showLoading(true);
    triggerFetchAndPoll();
  }
}

async function loadContestsFromStorage() {
  const { contests = [], lastUpdated } = await chrome.storage.local.get(['contests', 'lastUpdated']);
  allContests = contests;
  updateLastUpdated(lastUpdated);
  showLoading(false);
  renderContests();
}

function triggerFetchAndPoll() {
  // Tell background to fetch
  chrome.runtime.sendMessage({ type: 'FORCE_REFRESH' }).catch(() => {});

  const START = Date.now();
  const TIMEOUT_MS = 20000;

  stopPolling();
  pollTimer = setInterval(async () => {
    const elapsed = Math.floor((Date.now() - START) / 1000);
    updateElapsed(elapsed);

    const { contests = [], fetchError } = await chrome.storage.local.get(['contests', 'fetchError']);

    if (fetchError) {
      stopPolling();
      showError();
      return;
    }

    if (contests.length > 0) {
      stopPolling();
      allContests = contests;
      const { lastUpdated } = await chrome.storage.local.get('lastUpdated');
      updateLastUpdated(lastUpdated);
      showLoading(false);
      renderContests();
      return;
    }

    if (elapsed >= TIMEOUT_MS / 1000) {
      stopPolling();
      showError();
    }
  }, 600);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// ── Render ─────────────────────────────────────────────────────────────────
function renderContests() {
  const list  = document.getElementById('contestList');
  const empty = document.getElementById('empty');

  const filtered = filterContests(allContests, activeFilter);

  if (filtered.length === 0) {
    list.style.display  = 'none';
    empty.style.display = 'flex';
    return;
  }

  list.style.display  = 'block';
  empty.style.display = 'none';

  const groups = groupByDate(filtered);
  let html = '';

  for (const [label, contests] of Object.entries(groups)) {
    html += `<div class="date-sep">${label}</div>`;
    contests.forEach(c => { html += renderCard(c); });
  }

  list.innerHTML = html;

  list.querySelectorAll('.contest-card').forEach((el, i) => {
    el.style.animationDelay = `${i * 35}ms`;
  });
}

function renderCard(c) {
  const now    = Date.now();
  const msLeft = c.startTime - now;
  const isUrgent = msLeft < 3600000;
  const isSoon   = msLeft < 86400000;

  const p       = PLATFORMS[c.platformKey] || { name: c.platformName, color: '#888', icon: '??' };
  const badgeBg = hexToRgba(p.color, 0.15);
  const startStr = new Date(c.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const durStr   = formatDuration(c.duration);
  const countdown = formatCountdown(msLeft);

  return `
    <a class="contest-card ${isSoon ? 'soon' : ''}" href="${c.url}" target="_blank" rel="noopener"
       style="--stripe-color:${p.color};">
      <div class="card-stripe"></div>
      <div class="card-body">
        <div class="card-top">
          <span class="platform-badge" style="background:${badgeBg};color:${p.color};">${p.icon}</span>
          <span class="countdown ${isUrgent ? 'urgent' : isSoon ? 'soon' : ''}">${countdown}</span>
        </div>
        <div class="contest-name" title="${c.name}">${c.name}</div>
        <div class="card-meta">
          <span>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            ${startStr}
          </span>
          ${durStr ? `<span>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
            </svg>
            ${durStr}
          </span>` : ''}
        </div>
      </div>
    </a>`;
}

// ── Filters ────────────────────────────────────────────────────────────────
function filterContests(contests, filter) {
  const now = Date.now();
  if (filter === 'all')   return contests.filter(c => c.startTime > now);
  if (filter === 'today') {
    const t = new Date();
    return contests.filter(c => {
      const s = new Date(c.startTime);
      return s.getDate()     === t.getDate()  &&
             s.getMonth()    === t.getMonth() &&
             s.getFullYear() === t.getFullYear();
    });
  }
  return contests.filter(c => c.platformKey === filter && c.startTime > now);
}

function groupByDate(contests) {
  const groups  = {};
  const today   = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

  for (const c of contests) {
    const d = new Date(c.startTime);
    let label;
    if (isSameDay(d, today))    label = '◉ TODAY';
    else if (isSameDay(d, tomorrow)) label = '◈ TOMORROW';
    else label = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();

    if (!groups[label]) groups[label] = [];
    groups[label].push(c);
  }
  return groups;
}

function isSameDay(a, b) {
  return a.getDate() === b.getDate() &&
         a.getMonth() === b.getMonth() &&
         a.getFullYear() === b.getFullYear();
}

// ── Settings ───────────────────────────────────────────────────────────────
async function loadSettings() {
  const {
    notifySettings   = { enabled: true, advance: [60, 15] },
    disabledPlatforms = []
  } = await chrome.storage.local.get(['notifySettings', 'disabledPlatforms']);

  document.getElementById('notifEnabled').checked = notifySettings.enabled;
  document.querySelectorAll('.advance').forEach(cb => {
    cb.checked = notifySettings.advance.includes(Number(cb.value));
  });

  const container = document.getElementById('platformToggles');
  container.innerHTML = Object.entries(PLATFORMS).map(([key, p]) => `
    <div class="platform-toggle-row">
      <div class="platform-toggle-info">
        <span class="pt-badge" style="background:${hexToRgba(p.color,0.15)};color:${p.color};">${p.icon}</span>
        ${p.name}
      </div>
      <label class="toggle">
        <input type="checkbox" class="platform-toggle" data-key="${key}"
          ${disabledPlatforms.includes(key) ? '' : 'checked'} />
        <span class="toggle-slider"></span>
      </label>
    </div>
  `).join('');

  bindSettingListeners();
}

async function saveSettings() {
  const enabled  = document.getElementById('notifEnabled').checked;
  const advance  = [...document.querySelectorAll('.advance:checked')].map(cb => Number(cb.value));
  const disabled = [...document.querySelectorAll('.platform-toggle')]
    .filter(cb => !cb.checked).map(cb => cb.dataset.key);

  await chrome.storage.local.set({
    notifySettings:   { enabled, advance: advance.length ? advance : [60] },
    disabledPlatforms: disabled
  });
  chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS' }).catch(() => {});
}

function bindSettingListeners() {
  document.getElementById('notifEnabled').addEventListener('change', saveSettings);
  document.querySelectorAll('.advance').forEach(cb => cb.addEventListener('change', saveSettings));
  document.querySelectorAll('.platform-toggle').forEach(cb => cb.addEventListener('change', saveSettings));
}

// ── Events ─────────────────────────────────────────────────────────────────
function bindEvents() {
  document.getElementById('filters').addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeFilter = chip.dataset.filter;
    renderContests();
  });

  document.getElementById('refreshBtn').addEventListener('click', () => {
    const btn = document.getElementById('refreshBtn');
    btn.classList.add('spinning');
    showLoading(true);
    // Clear stale fetchError flag
    chrome.storage.local.remove('fetchError');
    triggerFetchAndPoll();
    setTimeout(() => btn.classList.remove('spinning'), 1500);
  });

  document.getElementById('settingsBtn').addEventListener('click', () => {
    document.getElementById('settingsPanel').style.display = 'flex';
  });
  document.getElementById('closeSettings').addEventListener('click', () => {
    document.getElementById('settingsPanel').style.display = 'none';
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────
function showLoading(show) {
  const loading = document.getElementById('loading');
  const list    = document.getElementById('contestList');
  const empty   = document.getElementById('empty');

  loading.style.display = show ? 'flex' : 'none';
  list.style.display    = show ? 'none' : 'block';
  empty.style.display   = 'none';

  if (show) {
    loading.innerHTML = `
      <div class="spinner"></div>
      <p>Fetching contests…</p>
      <div class="elapsed" id="elapsed">contacting APIs…</div>
    `;
  }
}

function updateElapsed(secs) {
  const el = document.getElementById('elapsed');
  if (!el) return;
  if (secs < 3)       el.textContent = 'contacting APIs…';
  else if (secs < 8)  el.textContent = `${secs}s — fetching from Codeforces & Kontests…`;
  else if (secs < 14) el.textContent = `${secs}s — APIs are slow, hang tight…`;
  else                el.textContent = `${secs}s — almost there…`;
}

function showError() {
  const loading = document.getElementById('loading');
  loading.style.display = 'flex';
  loading.innerHTML = `
    <span style="font-size:26px;color:var(--text3)">⚠</span>
    <p style="color:var(--text2);margin-top:6px;font-size:13px">Couldn't reach contest APIs</p>
    <small style="color:var(--text3);margin-bottom:14px;font-size:11px;text-align:center;line-height:1.5">
      Check your internet connection.<br>Codeforces & Kontests may be down.
    </small>
    <button id="retryBtn" style="
      font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.08em;
      padding:7px 20px;border-radius:100px;border:1px solid var(--accent);
      background:transparent;color:var(--accent);cursor:pointer;transition:all .15s;">
      RETRY
    </button>
  `;
  document.getElementById('retryBtn').addEventListener('click', () => {
    chrome.storage.local.remove('fetchError');
    showLoading(true);
    triggerFetchAndPoll();
  });
}

function formatCountdown(ms) {
  if (ms < 0) return 'LIVE';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 24) { const d = Math.floor(h/24); return `${d}d ${h%24}h`; }
  if (h > 0)   return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return '';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 24) return `${Math.floor(h/24)}d`;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function hexToRgba(hex, alpha) {
  if (!hex || hex.length < 7) return `rgba(128,128,128,${alpha})`;
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function updateLastUpdated(ts) {
  const el = document.getElementById('lastUpdated');
  if (!el || !ts) return;
  const d = new Date(ts);
  el.textContent = `Last synced: ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}
