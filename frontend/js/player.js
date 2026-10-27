const playerId = new URLSearchParams(window.location.search).get('id');
const statusBox = document.getElementById('status');

async function load() {
  if (!playerId) {
    statusBox.innerHTML = '<div class="msg error">No player selected. <a href="/players.html">See all players</a></div>';
    return;
  }
  try {
    const data = await api('GET', '/api/players/' + encodeURIComponent(playerId));
    const p = data.player;
    const t = data.totals;
    statusBox.innerHTML = '';
    document.getElementById('content').hidden = false;
    document.title = p.name + ' - SST Live';
    document.getElementById('jersey').textContent = jerseyNum(p.jersey);
    setTitle(document.getElementById('title'), p.name);
    document.getElementById('subtitle').innerHTML = '<a href="' + teamUrl(p.team) + '">' + esc(p.team) + '</a> \u00B7 ' + t.tournaments + (t.tournaments === 1 ? ' tournament' : ' tournaments');

    document.getElementById('totals').innerHTML =
      '<div class="stat-card"><b>' + t.matches + '</b><span>Matches</span></div>' +
      '<div class="stat-card"><b>' + t.points + '</b><span>Points / goals / runs</span></div>' +
      '<div class="stat-card"><b>' + t.actions + '</b><span>Scoring actions</span></div>' +
      '<div class="stat-card"><b>' + (t.yellow + t.red) + '</b><span>Cards</span></div>';

    document.getElementById('per-tournament').innerHTML = data.tournaments.map(function (row) {
      const st = row.stats;
      const breakdown = st.breakdown.length === 0 ? '<div class="empty small">No recorded actions in this tournament yet.</div>' :
        '<table><thead><tr><th>Action</th><th>Times</th><th>Points</th></tr></thead><tbody>' + st.breakdown.map(function (b) {
          return '<tr><td>' + esc(b.label) + '</td><td>' + b.count + '</td><td class="win-cell">' + b.points + '</td></tr>';
        }).join('') + '</tbody></table>';
      return '<div class="card"><div class="row between"><h3 style="margin:0"><a href="/tournament.html?id=' + row.tournamentId + '#players">' + sportIcon(row.sport) + ' ' + esc(row.tournamentName) + '</a></h3>' +
        '<span class="muted">' + (row.jersey === null ? 'No number' : '#' + row.jersey) + ' \u00B7 ' + st.matches + (st.matches === 1 ? ' match' : ' matches') + ' \u00B7 <strong class="win-cell">' + st.points + '</strong> pts' +
        (st.yellow ? ' \u00B7 ' + '\uD83D\uDFE8'.repeat(st.yellow) : '') + (st.red ? ' \uD83D\uDFE5' : '') + '</span></div><div style="margin-top:12px">' + breakdown + '</div></div>';
    }).join('');

    document.getElementById('recent').innerHTML = data.recent.length === 0 ? '<li class="muted">No actions recorded yet.</li>' :
      data.recent.map(function (ev) {
        return '<li><span>' + minuteTag(ev) + cardIcon(ev.type) + '<a href="/match.html?id=' + ev.match + '">' + esc(ev.label) + '</a>' + (ev.points ? ' <span class="pts">+' + ev.points + '</span>' : '') +
          ' <span class="muted">' + sportIcon(ev.sport) + ' ' + esc(ev.tournamentName) + '</span></span><span class="muted">' + fmtDay(ev.time) + '</span></li>';
      }).join('');
  } catch (err) {
    statusBox.innerHTML = '<div class="msg error">' + esc(err.message) + ' <a href="/players.html">See all players</a></div>';
  }
}
load();
