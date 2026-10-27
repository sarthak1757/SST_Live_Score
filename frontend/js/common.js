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
function fmtDay(value) {
  return new Date(value).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
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

const SPORT_ICONS = { football: '\u26BD', basketball: '\uD83C\uDFC0', volleyball: '\uD83C\uDFD0', badminton: '\uD83C\uDFF8', kabaddi: '\uD83E\uDD3C', cricket: '\uD83C\uDFCF' };
function sportIcon(sport) { return SPORT_ICONS[sport] || '\uD83C\uDFC5'; }

// Colour chip: Team A is pink, Team B is lime (CSS classes .chip.a / .chip.b). No side = neutral grey.
function teamChip(name, side) { return '<span class="chip ' + (side || '') + '"></span>'; }

// Last-5 form as coloured dots: W lime, D grey, L pink.
function formDots(form) {
  if (!form || form.length === 0) return '<span class="muted">-</span>';
  return '<span class="form">' + form.map(function (r) { return '<i class="f-' + r + '" title="' + r + '">' + r + '</i>'; }).join('') + '</span>';
}

// Tabs: <div class="tabbar" data-tabs="x"><button class="tab" data-tab="a">..</button></div> and
// <section class="panel" data-panel="a">. The open tab is kept in the URL hash (#a) so links and reloads keep it.
function setupTabs(bar, onShow) {
  const buttons = Array.prototype.slice.call(bar.querySelectorAll('[data-tab]'));
  const panels = Array.prototype.slice.call(document.querySelectorAll('[data-panel]'));
  function show(name, push) {
    if (!buttons.some(function (b) { return b.dataset.tab === name; })) name = buttons[0].dataset.tab;
    buttons.forEach(function (b) { b.classList.toggle('active', b.dataset.tab === name); b.setAttribute('aria-selected', b.dataset.tab === name); });
    panels.forEach(function (p) { p.hidden = p.dataset.panel !== name; });
    if (push) history.replaceState(null, '', '#' + name);
    if (onShow) onShow(name);
  }
  bar.addEventListener('click', function (e) {
    const b = e.target.closest('[data-tab]');
    if (b) show(b.dataset.tab, true);
  });
  show(window.location.hash.slice(1), false);
  return show;
}

// Groups items into [{ key, items }] keeping first-seen order.
function groupBy(items, keyFn) {
  const groups = [];
  const index = {};
  items.forEach(function (item) {
    const key = keyFn(item);
    if (index[key] === undefined) { index[key] = groups.length; groups.push({ key: key, items: [] }); }
    groups[index[key]].items.push(item);
  });
  return groups;
}

// ---- Match clock (timed sports). The server sends elapsedMs; we add the time since it arrived.
let clockState = null;
let clockReceivedAt = 0;
function setClock(c) { clockState = c; clockReceivedAt = Date.now(); paintClock(); }
function fmtClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
}
function clockHtml(c) {
  if (!c || c.state === 'not_started') return '';
  const ms = c.offsetMinutes * 60000 + c.elapsedMs + (c.running ? Date.now() - clockReceivedAt : 0);
  return '<span class="clock' + (c.running ? ' run' : '') + '">' + fmtClock(ms) + '</span> <span class="clock-label">' + esc(c.label) + '</span>';
}
function paintClock() {
  document.querySelectorAll('[data-clock]').forEach(function (el) { el.innerHTML = clockHtml(clockState); });
}
setInterval(function () { if (clockState && clockState.running) paintClock(); }, 1000);

// Small markers for the feed: minute and card icons.
function minuteTag(ev) { return ev.minute ? '<span class="minute">' + ev.minute + "'</span> " : ''; }
function cardIcon(type) { return type === 'yellow' ? '\uD83D\uDFE8 ' : type === 'red' ? '\uD83D\uDFE5 ' : ''; }

// ---- Cricket helpers (score.cricket comes from the server)
function cricketTotal(inn) { return inn.runs + '/' + inn.wickets; }

// One line: "Red batting - 3.2 of 10 overs", "Target 61 - Blue need 16 off 27 balls" or "Blue won by 7 wickets"
function cricketSummary(m, s) {
  const c = s.cricket;
  function name(side) { return esc(side === 'a' ? m.teamA.name : m.teamB.name); }
  if (c.result) return c.result.winner === 'draw' ? 'Match tied' : name(c.result.winner) + ' ' + esc(c.result.text);
  if (m.status === 'finished') return 'Match ended early' + (m.winner === 'draw' ? ' - level on runs' : ' - ' + name(m.winner) + ' ahead on runs');
  if (m.status === 'scheduled') return name('a') + ' bat first · ' + c.maxOvers + ' overs per side';
  if (c.current === 0) return name('a') + ' batting · ' + c.innings[0].overs + ' of ' + c.maxOvers + ' overs';
  const need = c.target - c.innings[1].runs;
  return 'Target ' + c.target + ' · ' + name('b') + ' need ' + need + ' off ' + c.ballsLeft + (c.ballsLeft === 1 ? ' ball' : ' balls');
}

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

// Links to team and player pages (one place, so pages can change later).
function teamUrl(name) { return '/teams.html?q=' + encodeURIComponent(name); }
function playerUrl(p) { return '/players.html?q=' + encodeURIComponent(p.name); }

// App shell: left sidebar + top bar with global search. Built on every page.
function renderNav() {
  const user = getUser();
  const signedIn = !!(user && getToken());
  const staff = signedIn && (user.role === 'admin' || user.role === 'scorer');
  const links = [
    { href: '/', label: 'Home', icon: '\u2302' },
    { href: '/?status=live', label: 'Live', icon: '\u25CF', live: true },
    { href: '/tournaments.html', label: 'Tournaments', icon: '\uD83C\uDFC6' },
    { href: '/teams.html', label: 'Teams', icon: '\uD83D\uDEE1' },
    { href: '/players.html', label: 'Players', icon: '\uD83D\uDC64' },
    { href: '/feed.html', label: 'My Feed', icon: '\u2605' },
  ];
  if (staff) links.push({ href: '/dashboard.html', label: 'Admin', icon: '\u2699' });
  if (signedIn && user.role === 'admin') links.push({ href: '/audit.html', label: 'Audit log', icon: '\u2630', sub: true });

  const path = window.location.pathname;
  const isLiveView = path === '/' && new URLSearchParams(window.location.search).get('status') === 'live';
  function active(l) {
    if (l.live) return isLiveView;
    if (l.href === '/') return (path === '/' || path === '/index.html') && !isLiveView;
    // detail pages light up their section
    const section = { '/tournament.html': '/tournaments.html', '/team.html': '/teams.html', '/player.html': '/players.html', '/score.html': '/dashboard.html' }[path];
    return path === l.href || section === l.href;
  }

  const side = document.createElement('aside');
  side.className = 'sidebar';
  side.innerHTML = '<a class="brand" href="/">SST <span>LIVE</span></a><nav>' + links.map(function (l) {
    return '<a href="' + l.href + '" class="' + (active(l) ? 'active ' : '') + (l.sub ? 'sub ' : '') + (l.live ? 'live-link' : '') + '"><span class="ico">' + l.icon + '</span>' + l.label + '</a>';
  }).join('') + '</nav>';

  const top = document.createElement('header');
  top.className = 'topbar';
  const account = signedIn
    ? '<span class="who" title="' + esc(user.email) + '">' + esc(user.email.split('@')[0]) + ' <span class="badge finished">' + esc(user.role) + '</span></span><a href="#" id="logout-link">Log out</a>'
    : '<a href="/signup.html">Sign up</a><a href="/login.html" class="btn small">Log in</a>';
  top.innerHTML = '<button class="menu-btn secondary" id="menu-btn" aria-label="Menu">\u2630</button>' +
    '<div class="search"><input id="global-search" type="search" placeholder="Search teams, players, tournaments..." autocomplete="off" maxlength="50" aria-label="Search">' +
    '<div class="search-results" id="search-results" hidden></div></div><div class="account">' + account + '</div>';

  document.body.classList.add('app');
  document.body.prepend(top);
  document.body.prepend(side);

  document.getElementById('menu-btn').onclick = function () { document.body.classList.toggle('nav-open'); };
  const link = document.getElementById('logout-link');
  if (link) link.addEventListener('click', function (e) { e.preventDefault(); logout(); });
  setupSearch();
}

// Global search with a small dropdown (debounced).
function setupSearch() {
  const input = document.getElementById('global-search');
  const box = document.getElementById('search-results');
  let timer = null;
  let lastQuery = '';

  function group(title, items, html) {
    return items.length ? '<div class="sr-group">' + title + '</div>' + items.map(html).join('') : '';
  }
  async function run(q) {
    lastQuery = q;
    box.hidden = false;
    box.innerHTML = '<div class="sr-empty">Searching...</div>';
    try {
      const r = await api('GET', '/api/search?q=' + encodeURIComponent(q));
      if (q !== lastQuery) return; // a newer search is running
      const html =
        group('Tournaments', r.tournaments, function (t) { return '<a href="/tournament.html?id=' + t.id + '">' + sportIcon(t.sport) + ' ' + esc(t.name) + '</a>'; }) +
        group('Teams', r.teams, function (t) { return '<a href="' + teamUrl(t.name) + '">\uD83D\uDEE1 ' + esc(t.name) + ' <span class="muted">' + esc(t.sports.join(', ')) + '</span></a>'; }) +
        group('Players', r.players, function (p) { return '<a href="' + playerUrl(p) + '">#' + p.jersey + ' ' + esc(p.name) + ' <span class="muted">' + esc(p.team) + ' \u00B7 ' + esc(p.tournamentName) + '</span></a>'; });
      box.innerHTML = html || '<div class="sr-empty">No results for "' + esc(q) + '"</div>';
    } catch (err) {
      box.innerHTML = '<div class="sr-empty">' + esc(err.message) + '</div>';
    }
  }
  input.addEventListener('input', function () {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { box.hidden = true; return; }
    timer = setTimeout(function () { run(q); }, 250);
  });
  input.addEventListener('keydown', function (e) { if (e.key === 'Escape') { box.hidden = true; input.blur(); } });
  document.addEventListener('click', function (e) { if (!e.target.closest('.search')) box.hidden = true; });
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
