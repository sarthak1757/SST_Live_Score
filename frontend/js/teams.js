const filterInput = document.getElementById('filter');
let teams = [];

function render() {
  const box = document.getElementById('list');
  const q = filterInput.value.trim().toLowerCase();
  const shown = teams.filter(function (t) { return t.name.toLowerCase().indexOf(q) !== -1; });
  if (teams.length === 0) { box.innerHTML = '<div class="empty">No houses yet - they appear once a tournament is created.</div>'; return; }
  if (shown.length === 0) { box.innerHTML = '<div class="empty">No house matches "' + esc(q) + '".</div>'; return; }
  box.innerHTML = shown.map(function (t) {
    return '<a class="card link tile" href="' + teamUrl(t.name) + '"><div class="tile-icon">\uD83D\uDEE1</div><div><strong>' + esc(t.name) + '</strong><div class="muted">' +
      esc(t.sports.join(', ')) + ' \u00B7 ' + t.tournaments + (t.tournaments === 1 ? ' tournament' : ' tournaments') + ' \u00B7 ' + t.players + ' players</div></div></a>';
  }).join('');
}

async function load() {
  filterInput.value = new URLSearchParams(window.location.search).get('q') || '';
  try {
    teams = (await api('GET', '/api/teams')).teams;
    render();
  } catch (err) {
    document.getElementById('list').innerHTML = '<div class="msg error">' + esc(err.message) + '</div>';
  }
}
filterInput.addEventListener('input', render);
load();
