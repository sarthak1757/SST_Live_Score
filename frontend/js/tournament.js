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
    document.getElementById('subtitle').textContent = sportIcon(data.tournament.sport) + ' ' + data.tournament.sportLabel + ' · ' + data.tournament.teams.length + ' teams';

    let rows = '';
    const anyPlayed = data.standings.some(function (r) { return r.played > 0; });
    data.standings.forEach(function (r, i) {
      const leader = anyPlayed && i === 0;
      rows += '<tr class="' + (leader ? 'leader' : '') + '"><td class="rank">' + (leader ? '\uD83D\uDC51' : i + 1) + '</td><td class="tname">' +
        teamChip(r.name) + esc(r.name) + '</td><td>' + r.played + '</td><td>' + r.won + '</td><td>' + r.drawn + '</td><td>' + r.lost +
        '</td><td class="pts-cell">' + r.points + '</td></tr>';
    });
    document.getElementById('standings').innerHTML =
      '<table class="standings"><thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>Pts</th></tr></thead><tbody>' + rows + '</tbody></table>';

    const lb = document.getElementById('leaderboard');
    if (data.leaderboard.length > 0) {
      lb.innerHTML = '<h2>Top players</h2><table><thead><tr><th>Player</th><th>Team</th><th>Pts</th></tr></thead><tbody>' +
        data.leaderboard.map(function (p, i) {
          return '<tr class="' + (i === 0 ? 'leader' : '') + '"><td><strong>' + (i + 1) + '.</strong> #' + p.jersey + ' ' + esc(p.name) + '</td><td>' + esc(p.teamName) + '</td><td class="win-cell">' + p.points + '</td></tr>';
        }).join('') + '</tbody></table>';
    } else {
      lb.innerHTML = '<h2>Top players</h2><div class="empty small">No player stats yet. Scorers can pick a player for each action.</div>';
    }

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
