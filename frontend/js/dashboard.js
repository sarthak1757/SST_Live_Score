const user = requireLogin();
if (user && user.role === 'fan') window.location.href = '/feed.html'; // dashboard is for staff only
let tournaments = [];

const tMsg = document.getElementById('t-msg');
const mMsg = document.getElementById('m-msg');
const matchSelect = document.getElementById('m-tournament');
const whenInput = document.getElementById('m-when');
attachDateTimePicker(whenInput);

function fillSelect(select, items, valueKey, textKey) {
  select.innerHTML = '';
  items.forEach(function (item) {
    const opt = document.createElement('option');
    opt.value = item[valueKey];
    opt.textContent = item[textKey];
    select.appendChild(opt);
  });
}

function fillTeamSelects() {
  const t = tournaments.find(function (x) { return x.id === matchSelect.value; });
  const teams = t ? t.teams : [];
  fillSelect(document.getElementById('m-a'), teams, 'id', 'name');
  fillSelect(document.getElementById('m-b'), teams, 'id', 'name');
  if (teams.length > 1) document.getElementById('m-b').selectedIndex = 1;
}

async function loadTournaments() {
  const data = await api('GET', '/api/tournaments');
  tournaments = data.tournaments;
  fillSelect(matchSelect, tournaments, 'id', 'name');
  fillTeamSelects();
  fillSelect(rTournament, tournaments, 'id', 'name');
  fillRosterTeams();
}

// ---- rosters
const rTournament = document.getElementById('r-tournament');
const rTeam = document.getElementById('r-team');
const rPlayers = document.getElementById('r-players');

function currentTeam() {
  const t = tournaments.find(function (x) { return x.id === rTournament.value; });
  return t ? t.teams.find(function (x) { return x.id === rTeam.value; }) : null;
}
function fillRosterTeams() {
  const t = tournaments.find(function (x) { return x.id === rTournament.value; });
  fillSelect(rTeam, t ? t.teams : [], 'id', 'name');
  showRoster();
}
function showRoster() {
  const team = currentTeam();
  rPlayers.value = team ? team.players.map(function (p) { return (p.jersey === null ? '' : p.jersey + ' ') + p.name; }).join('\n') : '';
}
rTournament.addEventListener('change', fillRosterTeams);
rTeam.addEventListener('change', showRoster);

document.getElementById('roster-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  const out = document.getElementById('r-msg');
  showMsg(out, '', '');
  if (!rTeam.value) { showMsg(out, 'error', 'Create a tournament first.'); return; }
  const players = [];
  const lines = rPlayers.value.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.match(/^(\d{1,2})\s+(.+)$/);
    players.push(parts ? { jersey: Number(parts[1]), name: parts[2] } : { name: line }); // jersey number is optional
  }
  try {
    const keepT = rTournament.value, keepTeam = rTeam.value;
    await api('PUT', '/api/tournaments/' + keepT + '/teams/' + keepTeam + '/players', { players: players });
    showMsg(out, 'success', 'Roster saved (' + players.length + ' players).');
    await loadTournaments();
    rTournament.value = keepT; fillRosterTeams(); rTeam.value = keepTeam; showRoster();
  } catch (err) { showMsg(out, 'error', err.message); }
});

async function loadMatches() {
  const box = document.getElementById('matches');
  try {
    const data = await api('GET', '/api/matches');
    const open = data.matches.filter(function (m) { return m.status !== 'finished'; });
    if (open.length === 0) {
      box.innerHTML = '<div class="empty">No scheduled or live matches.' + (user.role === 'admin' ? ' Create one above.' : '') + '</div>';
      return;
    }
    box.innerHTML = open.map(function (m) {
      return '<div class="card row between"><div class="teams"><strong>' + esc(m.teamA.name) + '</strong> vs <strong>' + esc(m.teamB.name) +
        '</strong><div class="muted">' + esc(m.sportLabel) + ' · ' + esc(m.tournamentName) + ' · ' + fmtDate(m.scheduledAt) + '</div></div>' +
        statusBadge(m.status) + '<a class="btn" href="/score.html?id=' + m.id + '">' + (m.status === 'live' ? 'Continue scoring' : 'Open') + '</a>' +
        (user.role === 'admin' && m.status === 'scheduled' ? '<button class="danger" data-delete="' + m.id + '">Delete</button>' : '') + '</div>';
    }).join('');
    box.querySelectorAll('[data-delete]').forEach(function (btn) {
      btn.onclick = async function () {
        if (!confirm('Delete this scheduled match?')) return;
        try { await api('DELETE', '/api/matches/' + btn.dataset.delete); loadMatches(); }
        catch (err) { showMsg(document.getElementById('global-msg'), 'error', err.message); }
      };
    });
  } catch (err) {
    box.innerHTML = '<div class="msg error">' + esc(err.message) + '</div>';
  }
}

async function init() {
  if (!user || user.role === 'fan') return;
  if (user.role === 'admin') {
    document.getElementById('admin-area').hidden = false;
    try {
      const sports = await api('GET', '/api/sports');
      const list = Object.keys(sports.sports).map(function (k) { return { key: k, label: sports.sports[k].label }; });
      fillSelect(document.getElementById('t-sport'), list, 'key', 'label');
      toggleOvers();
      await loadTournaments();
    } catch (err) {
      showMsg(document.getElementById('global-msg'), 'error', err.message);
    }
  }
  loadMatches();
}

matchSelect.addEventListener('change', fillTeamSelects);
// overs are only asked for cricket
function toggleOvers() { document.getElementById('t-overs-wrap').hidden = document.getElementById('t-sport').value !== 'cricket'; }
document.getElementById('t-sport').addEventListener('change', toggleOvers);

document.getElementById('tournament-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  showMsg(tMsg, '', '');
  const teams = document.getElementById('t-teams').value.split('\n');
  const sport = document.getElementById('t-sport').value;
  const body = { name: document.getElementById('t-name').value, sport: sport, teams: teams };
  if (sport === 'cricket') body.overs = Number(document.getElementById('t-overs').value);
  try {
    const data = await api('POST', '/api/tournaments', body);
    showMsg(tMsg, 'success', 'Tournament "' + data.tournament.name + '" created.');
    e.target.reset();
    toggleOvers();
    await loadTournaments();
  } catch (err) {
    showMsg(tMsg, 'error', err.message);
  }
});

document.getElementById('match-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  showMsg(mMsg, '', '');
  if (tournaments.length === 0) { showMsg(mMsg, 'error', 'Create a tournament first.'); return; }
  if (!whenInput.dataset.iso) { showMsg(mMsg, 'error', 'Pick a date and time first.'); return; }
  try {
    await api('POST', '/api/matches', {
      tournament: matchSelect.value,
      teamA: document.getElementById('m-a').value,
      teamB: document.getElementById('m-b').value,
      scheduledAt: new Date(whenInput.dataset.iso).toISOString(),
    });
    showMsg(mMsg, 'success', 'Match scheduled.');
    loadMatches();
  } catch (err) {
    showMsg(mMsg, 'error', err.message);
  }
});

init();

document.getElementById('user-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  const out = document.getElementById('u-msg');
  showMsg(out, '', '');
  try {
    const data = await api('POST', '/api/auth/users', {
      email: document.getElementById('u-email').value,
      password: document.getElementById('u-pass').value,
      role: document.getElementById('u-role').value,
    });
    showMsg(out, 'success', 'Created ' + data.user.role + ' account for ' + data.user.email);
    e.target.reset();
  } catch (err) { showMsg(out, 'error', err.message); }
});
