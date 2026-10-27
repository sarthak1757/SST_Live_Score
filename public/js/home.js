const statusSelect = document.getElementById('filter-status');
const sportSelect = document.getElementById('filter-sport');
const matchesBox = document.getElementById('matches');
const tournamentsBox = document.getElementById('tournaments');

const SECTIONS = [
  { status: 'live', title: 'Live now' },
  { status: 'scheduled', title: 'Upcoming' },
  { status: 'finished', title: 'Finished' },
];

async function loadSports() {
  try {
    const data = await api('GET', '/api/sports');
    Object.keys(data.sports).forEach(function (key) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = data.sports[key].label;
      sportSelect.appendChild(opt);
    });
  } catch (err) { /* filter just stays on "All sports" */ }
}

async function loadMatches(showSpinner) {
  if (showSpinner) matchesBox.innerHTML = '<div class="empty">Loading matches...</div>';
  const params = [];
  if (statusSelect.value) params.push('status=' + statusSelect.value);
  if (sportSelect.value) params.push('sport=' + sportSelect.value);
  try {
    const data = await api('GET', '/api/matches' + (params.length ? '?' + params.join('&') : ''));
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
    matchesBox.innerHTML = '<div class="empty">No matches found.</div>';
    return;
  }
  let html = '';
  SECTIONS.forEach(function (section) {
    const list = matches.filter(function (m) { return m.status === section.status; });
    if (section.status === 'finished') list.reverse(); // newest finished first
    if (list.length === 0) return;
    html += '<h2>' + section.title + '</h2>';
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
        '</strong><span class="muted">' + esc(t.sportLabel) + ' · ' + t.teams.length + ' teams · standings &rarr;</span></a>';
    }).join('');
  } catch (err) {
    tournamentsBox.innerHTML = '<div class="msg error">' + esc(err.message) + '</div>';
  }
}

statusSelect.addEventListener('change', function () { loadMatches(true); });
sportSelect.addEventListener('change', function () { loadMatches(true); });

loadSports();
loadMatches(true);
loadTournaments();
setInterval(function () { loadMatches(false); }, 10000); // keep the list fresh
