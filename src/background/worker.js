// Contest Tracker - Background Service Worker
// Uses multiple independent platform APIs — no single point of failure

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

const REFRESH_INTERVAL_MINS = 60;

// ── Startup ────────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  scheduleRefresh();
  fetchAndStoreContests();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleRefresh();
  fetchAndStoreContests();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'refresh-contests') fetchAndStoreContests();
  else if (alarm.name.startsWith('notify-')) fireNotification(alarm.name);
});

function scheduleRefresh() {
  chrome.alarms.create('refresh-contests', {
    periodInMinutes: REFRESH_INTERVAL_MINS,
    delayInMinutes: 1
  });
}

// ── Main fetch orchestrator ────────────────────────────────────────────────
async function fetchAndStoreContests() {
  // Run all fetchers in parallel — each is independent
  const results = await Promise.allSettled([
    fetchCodeforces(),
    fetchAtCoder(),
    fetchLeetCode(),
    fetchCodeChef(),
    fetchHackerRank(),
    fetchKontests(),     // fallback aggregator
  ]);

  const all = [];
  const seen = new Set();

  for (const r of results) {
    if (r.status === 'fulfilled') {
      for (const c of r.value) {
        const key = c.platformKey + '::' + c.name;
        if (!seen.has(key)) { seen.add(key); all.push(c); }
      }
    } else {
      console.warn('[ContestTracker] A fetcher failed:', r.reason?.message);
    }
  }

  const now = Date.now();
  const contests = all
    .filter(c => c.startTime > now)
    .sort((a, b) => a.startTime - b.startTime);

  console.log(`[ContestTracker] Total upcoming contests: ${contests.length}`);

  if (contests.length > 0) {
    await chrome.storage.local.set({ contests, lastUpdated: now, fetchError: false });
    await scheduleNotifications(contests);
    chrome.runtime.sendMessage({ type: 'CONTESTS_UPDATED' }).catch(() => {});
  } else {
    await chrome.storage.local.set({ fetchError: true });
    chrome.runtime.sendMessage({ type: 'FETCH_ERROR' }).catch(() => {});
  }
}

// ── Codeforces — official public API, open CORS ────────────────────────────
async function fetchCodeforces() {
  const res  = await go('https://codeforces.com/api/contest.list?gym=false', 10000);
  const data = await res.json();
  if (data.status !== 'OK') throw new Error('CF bad status');

  return data.result
    .filter(c => c.phase === 'BEFORE')
    .slice(0, 20)
    .map(c => ({
      id: 'cf_' + c.id,
      name: c.name,
      url: `https://codeforces.com/contest/${c.id}`,
      startTime: c.startTimeSeconds * 1000,
      endTime:  (c.startTimeSeconds + c.durationSeconds) * 1000,
      duration:  c.durationSeconds * 1000,
      ...meta('codeforces'),
    }));
}

// ── AtCoder — scrapes the public contests page JSON embed ──────────────────
// AtCoder doesn't have a public API, but their contest list page
// embeds contest data as JSON in a <script> tag we can parse.
// We use the reliable community mirror: kenkoooo AtCoder Problems API
async function fetchAtCoder() {
  // kenkoooo.com hosts an open API with full contest history + upcoming
  const res  = await go('https://kenkoooo.com/atcoder/resources/contests.json', 10000);
  const data = await res.json();

  const now = Date.now();
  return data
    .filter(c => {
      const start = c.start_epoch_second * 1000;
      const end   = (c.start_epoch_second + c.duration_second) * 1000;
      return start > now || end > now; // upcoming or ongoing
    })
    .slice(0, 15)
    .map(c => ({
      id: 'ac_' + c.id,
      name: c.title,
      url: `https://atcoder.jp/contests/${c.id}`,
      startTime: c.start_epoch_second * 1000,
      endTime:  (c.start_epoch_second + c.duration_second) * 1000,
      duration:  c.duration_second * 1000,
      ...meta('atcoder'),
    }));
}

// ── LeetCode — uses their public GraphQL endpoint ─────────────────────────
async function fetchLeetCode() {
  const res = await go('https://leetcode.com/graphql', 12000, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Referer': 'https://leetcode.com',
    },
    body: JSON.stringify({
      query: `{
        topTwoContests {
          title
          titleSlug
          startTime
          duration
        }
        allContests {
          title
          titleSlug
          startTime
          duration
        }
      }`
    })
  });

  const json = await res.json();
  const contests = json?.data?.allContests || json?.data?.topTwoContests || [];
  const now = Date.now();

  return contests
    .filter(c => c.startTime * 1000 > now)
    .slice(0, 10)
    .map(c => ({
      id: 'lc_' + c.titleSlug,
      name: c.title,
      url: `https://leetcode.com/contest/${c.titleSlug}`,
      startTime: c.startTime * 1000,
      endTime:   c.startTime * 1000 + c.duration * 1000,
      duration:  c.duration * 1000,
      ...meta('leetcode'),
    }));
}

// ── CodeChef — public contest list API ────────────────────────────────────
async function fetchCodeChef() {
  const res  = await go(
    'https://www.codechef.com/api/list/contests/all?sort_by=START&sorting_order=asc&offset=0&mode=all',
    12000,
    { headers: { 'Accept': 'application/json' } }
  );
  const data = await res.json();
  const now  = Date.now();

  const upcoming = [
    ...(data.future_contests || []),
    ...(data.present_contests || []),
  ];

  return upcoming.slice(0, 15).map(c => {
    const startTime = new Date(c.contest_start_date_iso || c.contest_start_date).getTime();
    const endTime   = new Date(c.contest_end_date_iso   || c.contest_end_date).getTime();
    return {
      id: 'cc_' + c.contest_code,
      name: c.contest_name,
      url: `https://www.codechef.com/${c.contest_code}`,
      startTime,
      endTime,
      duration: endTime - startTime,
      ...meta('codechef'),
    };
  }).filter(c => c.startTime > now - 86400000);
}

// ── HackerRank — public contests API ──────────────────────────────────────
async function fetchHackerRank() {
  const res  = await go(
    'https://www.hackerrank.com/rest/contests/upcoming?limit=20&offset=0',
    10000,
    { headers: { 'Accept': 'application/json' } }
  );
  const data = await res.json();
  const now  = Date.now();

  return (data.models || [])
    .map(c => {
      const startTime = new Date(c.epoch_starttime * 1000).getTime();
      const endTime   = new Date(c.epoch_endtime   * 1000).getTime();
      return {
        id: 'hr_' + c.slug,
        name: c.name,
        url: `https://www.hackerrank.com/contests/${c.slug}`,
        startTime,
        endTime,
        duration: endTime - startTime,
        ...meta('hackerrank'),
      };
    })
    .filter(c => c.startTime > now);
}

// ── Kontests — fallback aggregator (may be unreliable) ────────────────────
async function fetchKontests() {
  const res  = await go('https://kontests.net/api/v1/all', 12000);
  const data = await res.json();
  const now  = Date.now();

  return data
    .filter(c => c.status === 'BEFORE')
    .map(c => {
      const site = (c.site || '').toLowerCase().replace(/\s/g, '');
      const pk   = Object.keys(PLATFORMS).find(k => site.includes(k)) || 'other';
      const p    = PLATFORMS[pk] || { name: c.site, color: '#888', icon: '??' };
      const startTime = new Date(c.start_time).getTime();
      const endTime   = new Date(c.end_time).getTime();
      if (isNaN(startTime) || startTime < now) return null;
      return {
        id: pk + '_k_' + c.name.replace(/\W/g,'').slice(0,16),
        name: c.name,
        url: c.url,
        startTime,
        endTime,
        duration: endTime - startTime,
        platformKey:   pk,
        platformName:  p.name,
        platformColor: p.color,
        platformIcon:  p.icon,
      };
    })
    .filter(Boolean);
}

// ── Utilities ──────────────────────────────────────────────────────────────
function meta(platformKey) {
  const p = PLATFORMS[platformKey];
  return {
    platformKey,
    platformName:  p.name,
    platformColor: p.color,
    platformIcon:  p.icon,
  };
}

function go(url, ms = 10000, opts = {}) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal, ...opts })
    .finally(() => clearTimeout(timer));
}

// ── Notifications ──────────────────────────────────────────────────────────
async function scheduleNotifications(contests) {
  const all = await chrome.alarms.getAll();
  for (const a of all) { if (a.name.startsWith('notify-')) chrome.alarms.clear(a.name); }

  const { notifySettings = { enabled: true, advance: [60, 15] } } =
    await chrome.storage.local.get('notifySettings');
  if (!notifySettings.enabled) return;

  const { disabledPlatforms = [] } = await chrome.storage.local.get('disabledPlatforms');

  for (const c of contests) {
    if (disabledPlatforms.includes(c.platformKey)) continue;
    for (const mins of notifySettings.advance) {
      const fireAt = c.startTime - mins * 60000;
      if (fireAt > Date.now()) {
        const name = `notify-${c.id}-${mins}`;
        chrome.alarms.create(name, { when: fireAt });
        await chrome.storage.local.set({ [name]: { contestId: c.id, mins } });
      }
    }
  }
}

async function fireNotification(alarmName) {
  const { [alarmName]: meta } = await chrome.storage.local.get(alarmName);
  const { contests = [] }     = await chrome.storage.local.get('contests');
  const contest = contests.find(c => c.id === meta?.contestId);
  if (!contest) return;

  const label = meta.mins >= 60 ? `${meta.mins / 60}h` : `${meta.mins}min`;
  chrome.notifications.create(alarmName, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: `⏰ ${contest.platformName} in ${label}`,
    message: contest.name,
    priority: 2,
  });
}

// ── Messages ───────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'FORCE_REFRESH') {
    fetchAndStoreContests()
      .then(() => reply({ ok: true }))
      .catch(()  => reply({ ok: false }));
    return true;
  }
  if (msg.type === 'UPDATE_SETTINGS') {
    chrome.storage.local.get('contests').then(({ contests = [] }) =>
      scheduleNotifications(contests)
    );
  }
});
