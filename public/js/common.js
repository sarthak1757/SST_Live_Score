// Helpers shared by all pages.
const TOKEN_KEY = 'sst_token';
const USER_KEY = 'sst_user';

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch (e) { return null; }
}
function saveLogin(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.location.href = '/login.html';
}

// Escape text before putting it into innerHTML (team names etc. are user input).
function esc(text) {
  const div = document.createElement('div');
  div.textContent = text === undefined || text === null ? '' : String(text);
  return div.innerHTML;
}

function fmtDate(value) {
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}
function fmtTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// fetch wrapper: returns parsed JSON or throws an Error with a readable message.
async function api(method, url, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = 'Bearer ' + token;

  let response;
  try {
    response = await fetch(url, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined });
  } catch (networkError) {
    throw new Error('Cannot reach the server. Check your internet connection and try again.');
  }

  let data = null;
  try { data = await response.json(); } catch (e) { /* empty body */ }

  if (!response.ok) {
    // Expired or invalid token on a protected call: send the user back to login.
    if (response.status === 401 && token && url.indexOf('/api/auth/login') === -1) {
      logout();
    }
    throw new Error((data && data.error) || 'Request failed (' + response.status + ')');
  }
  return data;
}

// Shows a message box inside an element. type: error | success | info. Pass '' to clear.
function showMsg(el, type, text) {
  if (!text) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="msg ' + type + '">' + esc(text) + '</div>';
}

function statusBadge(status) {
  if (status === 'live') return '<span class="badge live"><span class="dot"></span>LIVE</span>';
  const names = { scheduled: 'Upcoming', finished: 'Full time' };
  return '<span class="badge ' + status + '">' + esc(names[status] || status) + '</span>';
}

const SPORT_ICONS = { football: '\u26BD', basketball: '\uD83C\uDFC0', volleyball: '\uD83C\uDFD0', badminton: '\uD83C\uDFF8', kabaddi: '\uD83E\uDD3C' };
function sportIcon(sport) { return SPORT_ICONS[sport] || '\uD83C\uDFC5'; }

// Colour chip for a team: known house colours by name, otherwise a stable colour from the name.
const HOUSE_COLORS = { red: '#ef4444', blue: '#3b82f6', green: '#22c55e', yellow: '#eab308', orange: '#f97316', purple: '#a855f7', pink: '#ec4899', black: '#64748b', white: '#e5e7eb', maroon: '#9f1239', navy: '#1e40af', gold: '#f59e0b' };
function teamColor(name) {
  const lower = String(name).toLowerCase();
  const keys = Object.keys(HOUSE_COLORS);
  for (let i = 0; i < keys.length; i++) {
    if (lower.indexOf(keys[i]) !== -1) return HOUSE_COLORS[keys[i]];
  }
  let hash = 0;
  for (let i = 0; i < lower.length; i++) hash = (hash * 31 + lower.charCodeAt(i)) % 360;
  return 'hsl(' + hash + ', 70%, 55%)';
}
function teamChip(name) { return '<span class="chip" style="background:' + teamColor(name) + '"></span>'; }

// Small pop-up message at the bottom of the screen. type: success | error
function toast(type, text) {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = (type === 'success' ? '\u2713 ' : '\u26A0 ') + text;
  box.appendChild(el);
  setTimeout(function () { el.classList.add('out'); setTimeout(function () { el.remove(); }, 300); }, type === 'error' ? 4500 : 2200);
}

// Confirmation dialog. Returns a Promise<boolean>.
function confirmDialog(title, text, okLabel) {
  return new Promise(function (resolve) {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = '<div class="modal" role="dialog" aria-modal="true"><h3>' + esc(title) + '</h3><div class="muted">' + esc(text) +
      '</div><div class="actions"><button class="secondary" data-v="0">Cancel</button><button class="danger" data-v="1">' + esc(okLabel || 'Confirm') + '</button></div></div>';
    function close(v) { bg.remove(); resolve(v); }
    bg.addEventListener('click', function (e) {
      if (e.target === bg) close(false);
      if (e.target.dataset && e.target.dataset.v) close(e.target.dataset.v === '1');
    });
    document.body.appendChild(bg);
    bg.querySelector('[data-v="0"]').focus();
  });
}

// Top navigation bar.
function renderNav() {
  const user = getUser();
  let right = '<a href="/login.html">Scorer login</a>';
  if (user && getToken()) {
    right = '<a href="/dashboard.html">Dashboard</a><span class="muted">' + esc(user.email) +
      '</span><a href="#" id="logout-link">Log out</a>';
  }
  const nav = document.createElement('header');
  nav.className = 'nav';
  nav.innerHTML = '<a class="brand" href="/">\uD83C\uDFC6 SST Live</a><a href="/">Matches</a><span class="spacer"></span>' + right;
  document.body.prepend(nav);
  const link = document.getElementById('logout-link');
  if (link) link.addEventListener('click', function (e) { e.preventDefault(); logout(); });
}

// Pages that need a login call this first. Returns the user or redirects.
function requireLogin(role) {
  const user = getUser();
  if (!user || !getToken()) {
    window.location.href = '/login.html';
    return null;
  }
  if (role && user.role !== role) return null;
  return user;
}

// One match card used on the home and tournament pages.
function matchCardHtml(m) {
  const hasScore = m.status !== 'scheduled';
  return '<a class="card link match-card" href="/match.html?id=' + m.id + '">' +
    '<div class="mc-top"><span class="sport-tag">' + sportIcon(m.sport) + ' ' + esc(m.sportLabel) + ' · ' + esc(m.tournamentName) + '</span>' + statusBadge(m.status) + '</div>' +
    '<div class="mc-body"><div class="mc-team">' + teamChip(m.teamA.name) + esc(m.teamA.name) + '</div>' +
    '<div class="mc-score' + (hasScore ? '' : ' vs') + '">' + (hasScore ? m.score.a + ' - ' + m.score.b : 'vs') + '</div>' +
    '<div class="mc-team right">' + teamChip(m.teamB.name) + esc(m.teamB.name) + '</div></div>' +
    '<div class="muted" style="margin-top:10px">' + fmtDate(m.scheduledAt) + '</div></a>';
}

document.addEventListener('DOMContentLoaded', renderNav);
