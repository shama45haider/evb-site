/* EVB Panel — shell: auth, navigation, settings, overview.
   Static app; state lives in this browser only (localStorage/sessionStorage). */

const EVB = {
  REPO_OWNER: 'shama45haider',
  REPO_NAME: 'evb-site',
  BRANCH: 'master',
  SITE: 'https://eastvillagebuyers.com',
  KEYS: {
    session: 'evb_panel_session',
    ghToken: 'evb_panel_gh_token',
    groqKey: 'evb_panel_groq_key',
    lastScan: 'evb_panel_last_scan',
    dailyScan: 'evb_panel_daily_scan',
    postsPublished: 'evb_panel_posts_published',
    activity: 'evb_panel_activity',
  },
};

/* Demo-grade login gate. This only hides the UI — real protection is that
   nothing works without your own GitHub/Groq tokens, which stay in your browser. */
const DEMO_USERS = { demo: 'evb2026' };

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

/* ---------- GitHub helpers (shared with Blog Maker) ---------- */
function ghToken() { return localStorage.getItem(EVB.KEYS.ghToken) || ''; }

async function gh(path, options = {}) {
  const res = await fetch(`https://api.github.com/repos/${EVB.REPO_OWNER}/${EVB.REPO_NAME}/${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${ghToken()}`,
      'Accept': 'application/vnd.github+json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.status === 204 ? null : res.json();
}

function b64EncodeUnicode(str) { return btoa(unescape(encodeURIComponent(str))); }
function b64DecodeUnicode(str) { return decodeURIComponent(escape(atob(str))); }

async function ghGetFile(path) {
  try {
    const data = await gh(`contents/${encodeURI(path)}?ref=${EVB.BRANCH}`);
    return { content: b64DecodeUnicode(data.content), sha: data.sha };
  } catch (e) {
    if (String(e.message).includes('404')) return null;
    throw e;
  }
}

async function ghPutFile(path, contentB64OrText, message, { sha, isBase64 = false } = {}) {
  return gh(`contents/${encodeURI(path)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: isBase64 ? contentB64OrText : b64EncodeUnicode(contentB64OrText),
      branch: EVB.BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
}

/* ---------- Activity log ---------- */
function logActivity(text) {
  const list = JSON.parse(localStorage.getItem(EVB.KEYS.activity) || '[]');
  list.unshift({ text, at: Date.now() });
  localStorage.setItem(EVB.KEYS.activity, JSON.stringify(list.slice(0, 12)));
  renderActivity();
}

function renderActivity() {
  const list = JSON.parse(localStorage.getItem(EVB.KEYS.activity) || '[]');
  const el = $('#activityList');
  if (!list.length) {
    el.innerHTML = '<li class="activity-empty">No activity yet this session.</li>';
    return;
  }
  el.innerHTML = list.map((a) => {
    const d = new Date(a.at);
    return `<li>${a.text}<time>${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></li>`;
  }).join('');
}

/* ---------- Overview stats ---------- */
function renderOverview() {
  const scan = JSON.parse(localStorage.getItem(EVB.KEYS.lastScan) || 'null');
  const posts = parseInt(localStorage.getItem(EVB.KEYS.postsPublished) || '0', 10);

  const statusEl = $('#statSiteStatus');
  const issuesEl = $('#statIssues');
  if (scan) {
    const issues = scan.totalIssues;
    statusEl.textContent = issues === 0 ? 'Healthy' : issues < 10 ? 'Minor Issues' : 'Needs Attention';
    statusEl.className = 'stat-value ' + (issues === 0 ? 'good' : issues < 10 ? 'warn' : 'bad');
    $('#statSiteSub').textContent = `${scan.pagesScanned} pages scanned`;
    issuesEl.textContent = issues;
    issuesEl.className = 'stat-value ' + (issues === 0 ? 'good' : issues < 10 ? 'warn' : 'bad');
    $('#statLastScan').textContent = new Date(scan.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } else {
    statusEl.textContent = '—';
    issuesEl.textContent = '—';
  }
  $('#statPosts').textContent = posts;
  renderActivity();
}

/* ---------- Auth + nav ---------- */
function isLoggedIn() { return sessionStorage.getItem(EVB.KEYS.session) === '1'; }

function showApp() {
  $('#loginScreen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#greetName').textContent = `Signed in as ${sessionStorage.getItem('evb_panel_user') || 'demo'}.`;
  renderOverview();
  updateEngineChip();
  document.dispatchEvent(new CustomEvent('evb:app-shown'));
}

function showLogin() {
  $('#app').classList.add('hidden');
  $('#loginScreen').classList.remove('hidden');
}

function switchTab(name) {
  $$('.nav-item').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === name));
  $$('.tab').forEach((t) => t.classList.toggle('is-active', t.id === `tab-${name}`));
  if (name === 'overview') renderOverview();
  document.dispatchEvent(new CustomEvent('evb:tab-shown', { detail: name }));
}

/* ---------- Settings ---------- */
function setStatus(el, kind, msg) { el.className = `status ${kind}`; el.textContent = msg; }

function updateEngineChip() {
  const chip = $('#bmEngine');
  if (localStorage.getItem(EVB.KEYS.groqKey)) {
    chip.textContent = 'AI: Groq Llama 3.3 (live)';
    chip.classList.add('live');
  } else {
    chip.textContent = 'AI: demo mode — add a free Groq key in Settings';
    chip.classList.remove('live');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (isLoggedIn()) showApp(); else showLogin();

  $('#loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const u = $('#loginUser').value.trim().toLowerCase();
    const p = $('#loginPass').value;
    if (DEMO_USERS[u] && DEMO_USERS[u] === p) {
      sessionStorage.setItem(EVB.KEYS.session, '1');
      sessionStorage.setItem('evb_panel_user', u);
      $('#loginError').textContent = '';
      showApp();
    } else {
      $('#loginError').textContent = 'Wrong username or password.';
    }
  });

  $('#logoutBtn').addEventListener('click', () => {
    sessionStorage.removeItem(EVB.KEYS.session);
    showLogin();
  });

  $$('.nav-item').forEach((b) => b.addEventListener('click', () => { switchTab(b.dataset.tab); closeSidebar(); }));
  $$('[data-goto]').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.goto)));

  // Mobile off-canvas nav
  function openSidebar() {
    $('#sidebar').classList.add('open');
    $('#sidebarOverlay').classList.add('open');
    $('#mobileHam').classList.add('open');
    $('#mobileHam').setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }
  function closeSidebar() {
    $('#sidebar').classList.remove('open');
    $('#sidebarOverlay').classList.remove('open');
    $('#mobileHam').classList.remove('open');
    $('#mobileHam').setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }
  $('#mobileHam').addEventListener('click', () => {
    $('#sidebar').classList.contains('open') ? closeSidebar() : openSidebar();
  });
  $('#sidebarClose').addEventListener('click', closeSidebar);
  $('#sidebarOverlay').addEventListener('click', closeSidebar);

  // Settings — GitHub token
  $('#setGhToken').value = ghToken();
  $('#setGhSave').addEventListener('click', async () => {
    const t = $('#setGhToken').value.trim();
    const st = $('#setGhStatus');
    if (!t) { localStorage.removeItem(EVB.KEYS.ghToken); setStatus(st, 'ok', 'Token cleared.'); return; }
    localStorage.setItem(EVB.KEYS.ghToken, t);
    setStatus(st, 'pending', 'Checking token against the repo…');
    try {
      await gh(`contents/CNAME?ref=${EVB.BRANCH}`);
      setStatus(st, 'ok', 'Connected — publishing is enabled.');
      logActivity('GitHub token connected');
    } catch (e) {
      setStatus(st, 'err', `Token saved but repo check failed: ${e.message}`);
    }
  });

  // Settings — Groq key
  $('#setGroqKey').value = localStorage.getItem(EVB.KEYS.groqKey) || '';
  $('#setGroqSave').addEventListener('click', () => {
    const k = $('#setGroqKey').value.trim();
    const st = $('#setGroqStatus');
    if (!k) {
      localStorage.removeItem(EVB.KEYS.groqKey);
      setStatus(st, 'ok', 'Key cleared — Blog Maker will use demo mode.');
    } else {
      localStorage.setItem(EVB.KEYS.groqKey, k);
      setStatus(st, 'ok', 'Saved — Blog Maker will use Groq for generation.');
      logActivity('Groq AI key connected');
    }
    updateEngineChip();
  });
});
