const tournamentId = new URLSearchParams(window.location.search).get('id');
const statusBox = document.getElementById('status');
const content = document.getElementById('content');

function slotHtml(m, label, placeholder) {
  if (!m) return '<div class="slot tbd"><div class="slot-label">' + label + '</div><div class="muted">' + placeholder + '</div></div>';
  const done = m.status === 'finished';
  function line(team, side, score) {
    const won = done && m.winner === side;
    return '<div class="slot-team' + (won ? ' won' : '') + '">' + teamChip(team.name, side) + '<span>' + esc(team.name) + '</span><b>' + (m.status === 'scheduled' ? '' : score) + '</b></div>';
  }
  return '<a class="slot" href="/match.html?id=' + m.id + '"><div class="slot-label">' + label + ' ' + statusBadge(m.status) + '</div>' +
    line(m.teamA, 'a', m.score.a) + line(m.teamB, 'b', m.score.b) + '</a>';
}

function renderBracket(data) {
  const byStage = {};
  data.matches.forEach(function (m) { if (m.stage !== 'group') byStage[m.stage] = m; });
  const fin = byStage.final;
  let champion = '';
  if (fin && fin.status === 'finished' && (fin.winner === 'a' || fin.winner === 'b')) {
    champion = '<div class="champion">\uD83C\uDFC6 Champions: ' + esc(fin.winner === 'a' ? fin.teamA.name : fin.teamB.name) + '</div>';
  }
  document.getElementById('bracket').innerHTML = champion + '<div class="bracket"><div class="round">' +
    slotHtml(byStage.sf1, 'Semifinal 1', '1st vs 4th') + slotHtml(byStage.sf2, 'Semifinal 2', '2nd vs 3rd') +
    '</div><div class="round final">' + slotHtml(fin, 'Final', 'Winner SF1 vs Winner SF2') + '</div></div>';

  // Admin controls - the server re-checks every rule, these are just shortcuts.
  const box = document.getElementById('bracket-admin');
  const user = getUser();
  box.innerHTML = '';
  if (!user || user.role !== 'admin' || !getToken()) return;
  let html = '';
  if (!byStage.sf1) html = '<button id="gen-sf">Generate semifinals from standings</button>';
  else if (!fin) html = '<button id="gen-final"' + (byStage.sf1.status === 'finished' && byStage.sf2.status === 'finished' ? '' : ' disabled') + '>Generate final</button>' +
    (byStage.sf1.status === 'finished' && byStage.sf2.status === 'finished' ? '' : ' <span class="muted">Available when both semifinals are finished.</span>');
  box.innerHTML = html ? '<div class="controls" style="position:static">' + html + '</div>' : '';
  function wire(id, path, ok) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.onclick = async function () {
      btn.disabled = true;
      try { await api('POST', '/api/tournaments/' + tournamentId + path, {}); toast('success', ok); load(); }
      catch (err) { toast('error', err.message); btn.disabled = false; }
    };
  }
  wire('gen-sf', '/bracket', 'Semifinals scheduled.');
  wire('gen-final', '/bracket/final', 'Final scheduled.');
}

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
        '</td><td class="hide-sm">' + r.gf + '</td><td class="hide-sm">' + r.ga + '</td><td>' + (r.gd > 0 ? '+' : '') + r.gd +
        '</td><td class="pts-cell">' + r.points + '</td><td class="hide-sm">' + formDots(r.form) + '</td></tr>';
    });
    document.getElementById('standings').innerHTML =
      '<table class="standings"><thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th class="hide-sm">GF</th><th class="hide-sm">GA</th><th>GD</th><th>Pts</th><th class="hide-sm">Form</th></tr></thead><tbody>' + rows + '</tbody></table>';

    renderBracket(data);

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
