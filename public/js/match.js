const matchId = new URLSearchParams(window.location.search).get('id');
const statusBox = document.getElementById('status');
const content = document.getElementById('content');
const connBadge = document.getElementById('conn');

function setConn(kind, text) {
  connBadge.className = 'badge ' + kind;
  connBadge.textContent = text;
}

function render(snap) {
  const m = snap.match;
  const s = snap.score;
  document.title = m.teamA.name + ' vs ' + m.teamB.name + ' - SST Live';
  document.getElementById('meta').innerHTML =
    '<a href="/tournament.html?id=' + m.tournament + '">' + esc(m.tournamentName) + '</a> · ' + esc(m.sportLabel) + ' · ' + fmtDate(m.scheduledAt);
  document.getElementById('state').innerHTML = statusBadge(m.status);

  const isSetSport = s.currentSet !== null;
  const aWon = m.status === 'finished' && m.winner === 'a';
  const bWon = m.status === 'finished' && m.winner === 'b';
  let board = '<div class="names"><div class="team-name ' + (aWon ? 'winner' : '') + '">' + esc(m.teamA.name) + '</div><div></div>' +
    '<div class="team-name ' + (bWon ? 'winner' : '') + '">' + esc(m.teamB.name) + '</div>' +
    '<div class="num">' + s.a + '</div><div class="muted">' + (isSetSport ? 'sets' : '') + '</div><div class="num">' + s.b + '</div></div>';
  if (m.status === 'finished') {
    board += '<p><strong>' + (m.winner === 'draw' ? 'Match drawn' : esc(m.winner === 'a' ? m.teamA.name : m.teamB.name) + ' won') + '</strong></p>';
  } else if (m.status === 'scheduled') {
    board += '<p class="muted">Not started yet</p>';
  }
  document.getElementById('scoreboard').innerHTML = board;

  // Set-by-set scores (volleyball / badminton)
  const setsBox = document.getElementById('sets');
  if (isSetSport && (s.sets.length > 0 || m.status === 'live')) {
    let rows = '';
    s.sets.forEach(function (set) {
      rows += '<tr><td>Set ' + set.number + '</td><td>' + set.a + '</td><td>' + set.b + '</td></tr>';
    });
    if (m.status === 'live' && !s.matchDecided) {
      rows += '<tr><td>Set ' + s.currentSet.number + ' (in play)</td><td>' + s.currentSet.a + '</td><td>' + s.currentSet.b + '</td></tr>';
    }
    setsBox.innerHTML = '<table><thead><tr><th>Set</th><th>' + esc(m.teamA.name) + '</th><th>' + esc(m.teamB.name) + '</th></tr></thead><tbody>' + rows + '</tbody></table>';
  } else {
    setsBox.innerHTML = '';
  }

  const feed = document.getElementById('feed');
  if (snap.events.length === 0) {
    feed.innerHTML = '<li class="muted">No scoring events yet.</li>';
  } else {
    feed.innerHTML = snap.events.map(function (ev) {
      const text = ev.teamName ? esc(ev.teamName) + ' - ' + esc(ev.label) + (ev.points ? ' (+' + ev.points + ')' : '') : esc(ev.label);
      return '<li><span>' + text + '</span><span class="muted">' + fmtTime(ev.time) + '</span></li>';
    }).join('');
  }
}

function openStream() {
  // EventSource reconnects by itself; the server sends a full snapshot on every (re)connect.
  const source = new EventSource('/api/matches/' + encodeURIComponent(matchId) + '/stream');
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
