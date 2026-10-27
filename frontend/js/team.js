const teamName = new URLSearchParams(window.location.search).get('name');
const statusBox = document.getElementById('status');

function matchList(list, empty) {
  if (list.length === 0) return '<div class="empty">' + empty + '</div>';
  return groupBy(list, function (m) { return fmtDay(m.scheduledAt); }).map(function (g) {
    return '<h3 class="group-head">' + esc(g.key) + '</h3>' + g.items.map(matchCardHtml).join('');
  }).join('');
}

const isAdmin = !!(getUser() && getUser().role === 'admin' && getToken());

// Admins can give a jersey number to a player who has none. The server keeps numbers unique per team.
document.getElementById('squad-box').addEventListener('click', async function (e) {
  const btn = e.target.closest('[data-set-jersey]');
  if (!btn) return;
  const input = btn.parentNode.querySelector('input');
  if (input.value === '') { toast('error', 'Type a jersey number first.'); return; }
  btn.disabled = true;
  try {
    await api('PUT', '/api/tournaments/' + input.dataset.tour + '/teams/' + input.dataset.team + '/players/' + input.dataset.player + '/jersey', { jersey: Number(input.value) });
    toast('success', 'Jersey #' + input.value + ' saved.');
    load();
  } catch (err) {
    toast('error', err.message);
    btn.disabled = false;
  }
});

async function load() {
  if (!teamName) {
    statusBox.innerHTML = '<div class="msg error">No house selected. <a href="/teams.html">See all houses</a></div>';
    return;
  }
  try {
    const data = await api('GET', '/api/teams/' + encodeURIComponent(teamName));
    const t = data.team;
    const r = data.record;
    statusBox.innerHTML = '';
    document.getElementById('content').hidden = false;
    document.title = t.name + ' - SST Live';
    setTitle(document.getElementById('title'), t.name);
    document.getElementById('subtitle').textContent = t.sports.join(' \u00B7 ') + ' \u00B7 ' + t.tournaments + (t.tournaments === 1 ? ' tournament' : ' tournaments');

    const live = data.fixtures.filter(function (m) { return m.status === 'live'; });
    document.getElementById('overview-box').innerHTML =
      '<div class="stat-cards">' +
      '<div class="stat-card"><b>' + r.played + '</b><span>Played</span></div>' +
      '<div class="stat-card"><b>' + r.won + '</b><span>Won</span></div>' +
      '<div class="stat-card"><b>' + r.drawn + '</b><span>Drawn</span></div>' +
      '<div class="stat-card"><b>' + r.lost + '</b><span>Lost</span></div>' +
      '<div class="stat-card"><b>' + r.winRate + '%</b><span>Win rate</span></div></div>' +
      '<div class="card row between"><strong>Recent form</strong>' + formDots(r.form) + '</div>' +
      '<div class="two-col"><div><h2>' + (live.length ? 'Live & next' : 'Next up') + '</h2>' +
      (data.fixtures.slice(0, 3).map(matchCardHtml).join('') || '<div class="empty small">No upcoming matches.</div>') +
      '</div><div><h2>Latest results</h2>' + (data.results.slice(0, 3).map(matchCardHtml).join('') || '<div class="empty small">No results yet.</div>') + '</div></div>';

    document.getElementById('squad-box').innerHTML = data.squads.length === 0 ? '<div class="empty">No squads yet.</div>' :
      data.squads.map(function (sq) {
        return '<div class="card"><h3><a href="/tournament.html?id=' + sq.tournamentId + '">' + sportIcon(sq.sport) + ' ' + esc(sq.tournamentName) + '</a></h3>' +
          (sq.players.length === 0 ? '<div class="empty small">No roster added for this tournament.</div>' :
            '<ul class="lineup">' + sq.players.map(function (p) {
              const needsNumber = isAdmin && p.jersey === null;
              return '<li><span class="jersey a">' + jerseyNum(p.jersey) + '</span><a href="' + playerUrl(p) + '">' + esc(p.name) + '</a>' +
                (needsNumber ? '<span class="jersey-set"><input type="number" min="0" max="99" step="1" placeholder="No." aria-label="Jersey number for ' + esc(p.name) + '" data-tour="' + sq.tournamentId + '" data-team="' + sq.teamId + '" data-player="' + p.id + '">' +
                  '<button type="button" class="secondary mini" data-set-jersey>Set</button></span>' : '') + '</li>';
            }).join('') + '</ul>') + '</div>';
      }).join('');

    document.getElementById('fixtures-box').innerHTML = matchList(data.fixtures, 'No upcoming fixtures.');
    document.getElementById('results-box').innerHTML = matchList(data.results, 'No results yet.');
    if (!window.tabsReady) { window.tabsReady = true; setupTabs(document.getElementById('tabs')); }
  } catch (err) {
    statusBox.innerHTML = '<div class="msg error">' + esc(err.message) + ' <a href="/teams.html">See all houses</a></div>';
  }
}
load();
