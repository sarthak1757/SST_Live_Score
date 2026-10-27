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

// Colour chip: Team A is pink, Team B is lime (CSS classes .chip.a / .chip.b). No side = neutral grey.
function teamChip(name, side) { return '<span class="chip ' + (side || '') + '"></span>'; }

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
  let right = '<a href="/signup.html">Sign up</a><a href="/login.html">Log in</a>';
  if (user && getToken()) {
    right = '<a href="/feed.html">My feed</a>' + (user.role === 'fan' ? '' : '<a href="/dashboard.html">Dashboard</a>') +
      '<span class="muted">' + esc(user.email) + '</span><a href="#" id="logout-link">Log out</a>';
  }
  const nav = document.createElement('header');
  nav.className = 'nav';
  nav.innerHTML = '<a class="brand" href="/">SST LIVE</a><a href="/">Matches</a><span class="spacer"></span>' + right;
  document.body.prepend(nav);
  const link = document.getElementById('logout-link');
  if (link) link.addEventListener('click', function (e) { e.preventDefault(); logout(); });
}

// Where to go after login: fans get their feed, staff get the dashboard.
function homeFor(user) {
  return user && user.role === 'fan' ? '/feed.html' : '/dashboard.html';
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

const STAGE_LABELS = { sf1: 'Semifinal 1', sf2: 'Semifinal 2', final: 'Final' };
function stageLabel(stage) { return STAGE_LABELS[stage] || ''; }

// One match card used on the home and tournament pages.
function matchCardHtml(m) {
  const hasScore = m.status !== 'scheduled';
  return '<a class="card link match-card" href="/match.html?id=' + m.id + '">' +
    '<div class="mc-top"><span class="sport-tag">' + sportIcon(m.sport) + ' ' + esc(m.sportLabel) + ' · ' + esc(m.tournamentName) + (stageLabel(m.stage) ? ' · <span class="stage">' + stageLabel(m.stage) + '</span>' : '') + '</span>' + statusBadge(m.status) + '</div>' +
    '<div class="mc-body"><div class="mc-team">' + teamChip(m.teamA.name, 'a') + esc(m.teamA.name) + '</div>' +
    '<div class="mc-score' + (hasScore ? '' : ' vs') + '">' + (hasScore ? m.score.a + ' - ' + m.score.b : 'vs') + '</div>' +
    '<div class="mc-team right">' + teamChip(m.teamB.name, 'b') + esc(m.teamB.name) + '</div></div>' +
    '<div class="muted" style="margin-top:10px">' + fmtDate(m.scheduledAt) + '</div></a>';
}

document.addEventListener('DOMContentLoaded', renderNav);
