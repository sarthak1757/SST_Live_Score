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
  document.getElementById('bracket-box').innerHTML = champion + '<div class="bracket"><div class="round">' +
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

let tabsReady = false;

function standingsTable(rows, opts) {
  const anyPlayed = rows.some(function (r) { return r.played > 0; });
  const compact = opts && opts.compact;
  const body = rows.map(function (r, i) {
    const leader = anyPlayed && i === 0;
    const cls = (leader ? 'leader ' : '') + (!compact && anyPlayed && i < 4 && rows.length >= 4 ? 'qualify' : '');
    return '<tr class="' + cls + '"><td class="rank">' + (leader ? '\uD83D\uDC51' : i + 1) + '</td><td class="tname"><a href="' + teamUrl(r.name) + '">' + teamChip(r.name) + esc(r.name) + '</a></td>' +
      '<td>' + r.played + '</td>' +
      (compact ? '' : '<td>' + r.won + '</td><td>' + r.drawn + '</td><td>' + r.lost + '</td><td class="hide-sm">' + r.gf + '</td><td class="hide-sm">' + r.ga + '</td>') +
      '<td>' + (r.gd > 0 ? '+' : '') + r.gd + '</td><td class="pts-cell">' + r.points + '</td>' +
      (compact ? '' : '<td class="hide-sm">' + formDots(r.form) + '</td>') + '</tr>';
  }).join('');
  const head = compact ? '<th>#</th><th>Team</th><th>P</th><th>GD</th><th>Pts</th>'
    : '<th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th class="hide-sm">GF</th><th class="hide-sm">GA</th><th>GD</th><th>Pts</th><th class="hide-sm">Form</th>';
  return '<table class="standings"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table>';
}

// Fixtures/results grouped by knockout round, otherwise by day.
function groupedMatches(list, empty) {
  if (list.length === 0) return '<div class="empty">' + empty + '</div>';
  return groupBy(list, function (m) { return m.stage !== 'group' ? stageLabel(m.stage) : fmtDay(m.scheduledAt); }).map(function (g) {
    return '<h3 class="group-head">' + esc(g.key) + '</h3>' + g.items.map(matchCardHtml).join('');
  }).join('');
}

function leaderboardHtml(rows, limit) {
  if (rows.length === 0) return '<div class="empty small">No player stats yet. Scorers can pick a player for each action.</div>';
  return '<table><thead><tr><th>Player</th><th>House</th><th>Pts</th></tr></thead><tbody>' +
    rows.slice(0, limit || rows.length).map(function (p, i) {
      return '<tr class="' + (i === 0 ? 'leader' : '') + '"><td><strong>' + (i + 1) + '.</strong> <a class="plain" href="' + playerUrl(p) + '">#' + p.jersey + ' ' + esc(p.name) + '</a></td><td>' + esc(p.teamName) + '</td><td class="win-cell">' + p.points + '</td></tr>';
    }).join('') + '</tbody></table>';
}

function renderOverview(data, fixtures, results) {
  const played = results.length;
  const total = data.matches.length;
  const live = data.matches.filter(function (m) { return m.status === 'live'; });
  const fin = data.matches.find(function (m) { return m.stage === 'final' && m.status === 'finished' && (m.winner === 'a' || m.winner === 'b'); });
  let html = '';
  if (fin) html += '<div class="champion">\uD83C\uDFC6 Champions: ' + esc(fin.winner === 'a' ? fin.teamA.name : fin.teamB.name) + '</div>';
  html += '<div class="stat-cards">' +
    '<div class="stat-card"><b>' + data.tournament.teams.length + '</b><span>Houses</span></div>' +
    '<div class="stat-card"><b>' + played + '/' + total + '</b><span>Matches played</span></div>' +
    '<div class="stat-card' + (live.length ? ' hot' : '') + '"><b>' + live.length + '</b><span>Live now</span></div>' +
    '<div class="stat-card"><b>' + (data.leaderboard[0] ? data.leaderboard[0].points : '-') + '</b><span>' + (data.leaderboard[0] ? 'Top: ' + esc(data.leaderboard[0].name) : 'Top player') + '</span></div></div>';
  html += '<div class="two-col"><div><h2>Table</h2>' + standingsTable(data.standings.slice(0, 5), { compact: true }) +
    '<p><a href="#standings" data-goto="standings">Full standings &rarr;</a></p></div><div>';
  html += '<h2>' + (live.length ? 'Live & next' : 'Next up') + '</h2>' + (live.concat(fixtures.filter(function (m) { return m.status !== 'live'; })).slice(0, 3).map(matchCardHtml).join('') || '<div class="empty small">No upcoming fixtures.</div>');
  html += '<h2>Latest results</h2>' + (results.slice(0, 3).map(matchCardHtml).join('') || '<div class="empty small">No results yet.</div>') + '</div></div>';
  document.getElementById('overview-box').innerHTML = html;
}

async function load() {
  if (!tournamentId) {
    statusBox.innerHTML = '<div class="msg error">No tournament selected. <a href="/tournaments.html">See all tournaments</a></div>';
    return;
  }
  try {
    const data = await api('GET', '/api/tournaments/' + encodeURIComponent(tournamentId));
    statusBox.innerHTML = '';
    content.hidden = false;
    const t = data.tournament;
    document.title = t.name + ' - SST Live';
    document.getElementById('title').textContent = t.name;
    document.getElementById('head-icon').textContent = sportIcon(t.sport);
    document.getElementById('subtitle').textContent = t.sportLabel + ' \u00B7 ' + t.teams.length + ' houses' + (t.overs ? ' \u00B7 ' + t.overs + ' overs per innings' : '');

    const byTime = function (a, b) { return new Date(a.scheduledAt) - new Date(b.scheduledAt); };
    const fixtures = data.matches.filter(function (m) { return m.status !== 'finished'; }).sort(byTime);
    const results = data.matches.filter(function (m) { return m.status === 'finished'; }).sort(function (a, b) { return byTime(b, a); });

    renderOverview(data, fixtures, results);
    document.getElementById('fixtures-box').innerHTML = groupedMatches(fixtures, 'No upcoming fixtures.');
    document.getElementById('results-box').innerHTML = groupedMatches(results, 'No results yet.');
    document.getElementById('standings-box').innerHTML = standingsTable(data.standings);
    renderBracket(data);
    document.getElementById('leaderboard').innerHTML = leaderboardHtml(data.leaderboard);

    if (!tabsReady) {
      tabsReady = true;
      const show = setupTabs(document.getElementById('tabs'));
      document.getElementById('overview-box').addEventListener('click', function (e) {
        const go = e.target.closest('[data-goto]');
        if (go) { e.preventDefault(); show(go.dataset.goto, true); window.scrollTo(0, 0); }
      });
    }
  } catch (err) {
    statusBox.innerHTML = '<div class="msg error">' + esc(err.message) + ' <a href="/tournaments.html">See all tournaments</a></div>';
  }
}
load();
setInterval(function () { if (!document.hidden) load(); }, 20000); // keep scores fresh
