const tournamentId = new URLSearchParams(window.location.search).get('id');
const statusBox = document.getElementById('status');
const content = document.getElementById('content');

async function load() {
  if (!tournamentId) {
    statusBox.innerHTML = '<div class="msg error">No tournament selected. <a href="/">Go home</a></div>';
    return;
  }
  try {
    const data = await api('GET', '/api/tournaments/' + encodeURIComponent(tournamentId));
    statusBox.innerHTML = '';
    content.hidden = false;
    document.title = data.tournament.name + ' - SST Live';
    document.getElementById('title').textContent = data.tournament.name;
    document.getElementById('subtitle').textContent = data.tournament.sportLabel;

    let rows = '';
    data.standings.forEach(function (r, i) {
      rows += '<tr><td>' + (i + 1) + '. ' + esc(r.name) + '</td><td>' + r.played + '</td><td>' + r.won + '</td><td>' +
        r.drawn + '</td><td>' + r.lost + '</td><td><strong>' + r.points + '</strong></td></tr>';
    });
    document.getElementById('standings').innerHTML =
      '<table><thead><tr><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>Pts</th></tr></thead><tbody>' + rows + '</tbody></table>';

    const matchesBox = document.getElementById('matches');
    if (data.matches.length === 0) {
      matchesBox.innerHTML = '<div class="empty">No matches scheduled yet.</div>';
    } else {
      matchesBox.innerHTML = data.matches.map(matchCardHtml).join('');
    }
  } catch (err) {
    statusBox.innerHTML = '<div class="msg error">' + esc(err.message) + ' <a href="/">Go home</a></div>';
  }
}
load();
