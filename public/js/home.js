const tabsBox = document.getElementById('sport-tabs');
const matchesBox = document.getElementById('matches');
const tournamentsBox = document.getElementById('tournaments');

const SECTIONS = [
  { status: 'live', title: '<span class="badge live"><span class="dot"></span>LIVE</span> Live now', empty: 'No matches are live right now.' },
  { status: 'scheduled', title: 'Upcoming', empty: 'No upcoming matches scheduled.' },
  { status: 'finished', title: 'Results', empty: 'No results yet.' },
];

let currentSport = '';

async function loadSports() {
  try {
    const data = await api('GET', '/api/sports');
    Object.keys(data.sports).forEach(function (key) {
      const btn = document.createElement('button');
      btn.className = 'tab';
      btn.dataset.sport = key;
      btn.textContent = sportIcon(key) + ' ' + data.sports[key].label;
      tabsBox.appendChild(btn);
    });
  } catch (err) { /* tabs just stay on "All sports" */ }
}

tabsBox.addEventListener('click', function (e) {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  currentSport = tab.dataset.sport;
  tabsBox.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t === tab); });
  loadMatches(true);
});

async function loadMatches(showSpinner) {
  if (showSpinner) matchesBox.innerHTML = '<div class="empty">Loading matches...</div>';
  try {
    const data = await api('GET', '/api/matches' + (currentSport ? '?sport=' + currentSport : ''));
    renderMatches(data.matches);
  } catch (err) {
    // keep old content on background refresh failures; show an error on first load
    if (showSpinner) {
      matchesBox.innerHTML = '<div class="msg error">' + esc(err.message) + ' <button class="secondary" id="retry">Retry</button></div>';
      document.getElementById('retry').addEventListener('click', function () { loadMatches(true); });
    }
  }
}

function renderMatches(matches) {
  if (matches.length === 0) {
    matchesBox.innerHTML = '<div class="empty">No matches found' + (currentSport ? ' for this sport' : '') + ' yet.</div>';
    return;
  }
  let html = '';
  SECTIONS.forEach(function (section) {
    const list = matches.filter(function (m) { return m.status === section.status; });
    if (section.status === 'finished') list.reverse(); // newest result first
    html += '<h2>' + section.title + (list.length ? ' <span class="count">' + list.length + '</span>' : '') + '</h2>';
    if (list.length === 0) html += '<div class="empty small">' + section.empty + '</div>';
    list.forEach(function (m) { html += matchCardHtml(m); });
  });
  matchesBox.innerHTML = html;
}

async function loadTournaments() {
  try {
    const data = await api('GET', '/api/tournaments');
    if (data.tournaments.length === 0) {
      tournamentsBox.innerHTML = '<div class="empty">No tournaments yet.</div>';
      return;
    }
    tournamentsBox.innerHTML = data.tournaments.map(function (t) {
      return '<a class="card link row between" href="/tournament.html?id=' + t.id + '"><strong>' + esc(t.name) +
        '</strong><span class="muted">' + sportIcon(t.sport) + ' ' + esc(t.sportLabel) + ' · ' + t.teams.length + ' teams · standings &rarr;</span></a>';
    }).join('');
  } catch (err) {
    tournamentsBox.innerHTML = '<div class="msg error">' + esc(err.message) + '</div>';
  }
}


loadSports();
loadMatches(true);
loadTournaments();
setInterval(function () { loadMatches(false); }, 10000); // keep the list fresh
