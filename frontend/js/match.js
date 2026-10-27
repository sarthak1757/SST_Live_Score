const matchId = new URLSearchParams(window.location.search).get('id');
const statusBox = document.getElementById('status');
const content = document.getElementById('content');
const connBadge = document.getElementById('conn');

let last = null; // previous score, used to flash only the side that changed

function setConn(kind, text) {
  connBadge.className = 'badge ' + kind;
  connBadge.textContent = text;
}

function teamBlock(team, score, side, won) {
  return '<div class="sb-team ' + (won ? 'won' : '') + '" style="--team:' + (side === 'a' ? 'var(--pink)' : 'var(--lime)') + '">' +
    '<div class="sb-bar"></div><div class="sb-name">' + esc(team.name) + (won ? ' \uD83C\uDFC6' : '') + '</div>' +
    '<div class="sb-num" id="num-' + side + '">' + score + '</div></div>';
}

function render(snap) {
  const m = snap.match;
  const s = snap.score;
  document.title = (m.status === 'scheduled' ? '' : s.a + '-' + s.b + ' ') + m.teamA.name + ' vs ' + m.teamB.name + ' - SST Live';
  document.getElementById('meta').innerHTML = sportIcon(m.sport) + ' ' + esc(m.sportLabel) + ' · <a href="/tournament.html?id=' + m.tournament + '">' +
    esc(m.tournamentName) + '</a> · ' + fmtDate(m.scheduledAt);
  document.getElementById('state').innerHTML = statusBadge(m.status);

  const isSetSport = s.currentSet !== null;
  const aWon = m.status === 'finished' && m.winner === 'a';
  const bWon = m.status === 'finished' && m.winner === 'b';
  let footer = '';
  if (m.status === 'finished') footer = m.winner === 'draw' ? 'Full time - match drawn' : 'Full time - ' + esc(m.winner === 'a' ? m.teamA.name : m.teamB.name) + ' win';
  else if (m.status === 'scheduled') footer = 'Kick-off ' + fmtDate(m.scheduledAt);
  else if (isSetSport) footer = 'Sets won · Set ' + s.currentSet.number + ' in play: ' + s.currentSet.a + ' - ' + s.currentSet.b;

  document.getElementById('scoreboard').innerHTML =
    '<div class="sb-grid">' + teamBlock(m.teamA, s.a, 'a', aWon) + '<div class="sb-dash">-</div>' + teamBlock(m.teamB, s.b, 'b', bWon) + '</div>' +
    (footer ? '<div class="sb-footer">' + footer + '</div>' : '');

  // flash the number that changed
  if (last) {
    if (last.a !== s.a) document.getElementById('num-a').classList.add('flash');
    if (last.b !== s.b) document.getElementById('num-b').classList.add('flash');
  }
  last = { a: s.a, b: s.b };

  // Set-by-set scores (volleyball / badminton)
  const setsBox = document.getElementById('sets');
  if (isSetSport && (s.sets.length > 0 || m.status === 'live')) {
    let rows = '';
    s.sets.forEach(function (set) {
      rows += '<tr><td>Set ' + set.number + '</td><td class="' + (set.winner === 'a' ? 'win-cell' : '') + '">' + set.a +
        '</td><td class="' + (set.winner === 'b' ? 'win-cell' : '') + '">' + set.b + '</td></tr>';
    });
    if (m.status === 'live' && !s.matchDecided) {
      rows += '<tr class="inplay"><td>Set ' + s.currentSet.number + ' <span class="badge live"><span class="dot"></span>in play</span></td><td>' +
        s.currentSet.a + '</td><td>' + s.currentSet.b + '</td></tr>';
    }
    setsBox.innerHTML = '<h2>Set scores</h2><table><thead><tr><th>Set</th><th>' + teamChip(m.teamA.name, 'a') + esc(m.teamA.name) +
      '</th><th>' + teamChip(m.teamB.name, 'b') + esc(m.teamB.name) + '</th></tr></thead><tbody>' + rows + '</tbody></table>';
  } else {
    setsBox.innerHTML = '';
  }

  // Top scorers (only when the scorer picked players)
  const topBox = document.getElementById('top-scorers');
  if (snap.topScorers && snap.topScorers.length > 0) {
    topBox.innerHTML = '<h2>Top scorers</h2><table><thead><tr><th>Player</th><th>Team</th><th>Pts</th></tr></thead><tbody>' +
      snap.topScorers.map(function (p) {
        return '<tr><td><strong>#' + p.jersey + '</strong> ' + esc(p.name) + '</td><td>' + teamChip(p.teamName, p.side) + esc(p.teamName) + '</td><td class="win-cell">' + p.points + '</td></tr>';
      }).join('') + '</tbody></table>';
  } else {
    topBox.innerHTML = '';
  }

  // Event feed: "Red House +2 Raid point  12:03:44"
  const feed = document.getElementById('feed');
  if (snap.events.length === 0) {
    feed.innerHTML = '<li class="muted">No scoring events yet. Updates will appear here instantly.</li>';
  } else {
    feed.innerHTML = snap.events.map(function (ev) {
      let text;
      if (ev.teamName) {
        text = teamChip(ev.teamName, ev.side) + '<strong>' + esc(ev.teamName) + '</strong> ' + (ev.playerName ? '<span class="muted">#' + ev.jersey + ' ' + esc(ev.playerName) + '</span> ' : '') +
          (ev.points ? '<span class="pts">+' + ev.points + '</span> ' : '') + esc(ev.label);
      } else {
        text = '\u23F1 ' + esc(ev.label);
      }
      return '<li><span>' + text + '</span><span class="muted">' + fmtTime(ev.time) + '</span></li>';
    }).join('');
  }
}

function openStream() {
  // EventSource reconnects by itself; the server sends a full snapshot on every (re)connect.
  const source = new EventSource(apiUrl('/api/matches/' + encodeURIComponent(matchId) + '/stream'));
  source.addEventListener('open', function () { setConn('ok', 'Live'); });
  source.addEventListener('snapshot', function (e) {
    setConn('ok', 'Live');
    render(JSON.parse(e.data));
  });
  source.addEventListener('error', function () {
    if (source.readyState === EventSource.CLOSED) setConn('warn', 'Disconnected - refresh the page');
    else setConn('warn', 'Reconnecting...');
  });
}

async function start() {
  if (!matchId) {
    statusBox.innerHTML = '<div class="msg error">No match selected. <a href="/">Go home</a></div>';
    return;
  }
  try {
    const snap = await api('GET', '/api/matches/' + encodeURIComponent(matchId));
    statusBox.innerHTML = '';
    content.hidden = false;
    render(snap);
    openStream();
  } catch (err) {
    statusBox.innerHTML = '<div class="msg error">' + esc(err.message) + ' <a href="/">Go home</a></div>';
  }
}
start();
