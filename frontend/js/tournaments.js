async function load() {
  const box = document.getElementById('list');
  try {
    const data = await api('GET', '/api/tournaments');
    if (data.tournaments.length === 0) { box.innerHTML = '<div class="empty">No tournaments yet.</div>'; return; }
    box.innerHTML = data.tournaments.map(function (t) {
      return '<a class="card link tile" href="/tournament.html?id=' + t.id + '"><div class="tile-icon">' + sportIcon(t.sport) + '</div>' +
        '<div><strong>' + esc(t.name) + '</strong><div class="muted">' + esc(t.sportLabel) + ' \u00B7 ' + t.teams.length + ' houses' +
        (t.overs ? ' \u00B7 ' + t.overs + ' overs' : '') + '</div></div></a>';
    }).join('');
  } catch (err) {
    box.innerHTML = '<div class="msg error">' + esc(err.message) + '</div>';
  }
}
load();
