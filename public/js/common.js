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
  return '<span class="badge ' + status + '">' + esc(status) + '</span>';
}

// Top navigation bar.
function renderNav() {
  const user = getUser();
  let right = '<a href="/login.html">Scorer login</a>';
  if (user && getToken()) {
    right = '<a href="/dashboard.html">Dashboard</a><span class="muted" style="color:#9fb0dd">' + esc(user.email) +
      '</span><a href="#" id="logout-link">Log out</a>';
  }
  const nav = document.createElement('header');
  nav.className = 'nav';
  nav.innerHTML = '<a class="brand" href="/">SST Live</a><a href="/">Matches</a><span class="spacer"></span>' + right;
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

// One match row used on the home and tournament pages.
function matchCardHtml(m) {
  const scoreText = m.status === 'scheduled' ? 'vs' : m.score.a + ' - ' + m.score.b;
  return '<a class="card link row" href="/match.html?id=' + m.id + '">' +
    '<div class="teams"><strong>' + esc(m.teamA.name) + '</strong> vs <strong>' + esc(m.teamB.name) + '</strong>' +
    '<div class="muted">' + esc(m.sportLabel) + ' · ' + esc(m.tournamentName) + ' · ' + fmtDate(m.scheduledAt) + '</div></div>' +
    '<div class="score">' + scoreText + '</div>' + statusBadge(m.status) + '</a>';
}

document.addEventListener('DOMContentLoaded', renderNav);
