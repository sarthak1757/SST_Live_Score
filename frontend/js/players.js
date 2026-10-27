const filterInput = document.getElementById('filter');
let players = [];

function render() {
  const box = document.getElementById('list');
  const q = filterInput.value.trim().toLowerCase();
  if (players.length === 0) { box.innerHTML = '<div class="empty">No players yet. Admins add rosters on the Dashboard.</div>'; return; }
  const shown = players.filter(function (p) {
    return !q || p.name.toLowerCase().indexOf(q) !== -1 || p.team.toLowerCase().indexOf(q) !== -1 || ('#' + p.jersey) === q;
  });
  if (shown.length === 0) { box.innerHTML = '<div class="empty">No player matches "' + esc(q) + '".</div>'; return; }
  box.innerHTML = '<table><thead><tr><th>Player</th><th>House</th><th class="hide-sm">Tournament</th></tr></thead><tbody>' + shown.map(function (p) {
    return '<tr><td><a href="' + playerUrl(p) + '"><strong>#' + p.jersey + '</strong> ' + esc(p.name) + '</a></td><td>' + esc(p.team) +
      '</td><td class="hide-sm">' + sportIcon(p.sport) + ' ' + esc(p.tournamentName) + '</td></tr>';
  }).join('') + '</tbody></table>';
}

async function load() {
  filterInput.value = new URLSearchParams(window.location.search).get('q') || '';
  try {
    players = (await api('GET', '/api/players')).players;
    render();
  } catch (err) {
    document.getElementById('list').innerHTML = '<div class="msg error">' + esc(err.message) + '</div>';
  }
}
filterInput.addEventListener('input', render);
load();
