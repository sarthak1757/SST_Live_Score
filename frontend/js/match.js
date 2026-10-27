const matchId = new URLSearchParams(window.location.search).get('id');
const statusBox = document.getElementById('status');
const content = document.getElementById('content');
const connBadge = document.getElementById('conn');

let last = null;
let matchStatus = null;
let reactionCounts = { fire: 0, clap: 0, wow: 0 };
const REACTIONS = [{ key: 'fire', emoji: '\uD83D\uDD25' }, { key: 'clap', emoji: '\uD83D\uDC4F' }, { key: 'wow', emoji: '\uD83D\uDE2E' }];

// Random id kept in this browser, used by the server to rate-limit reactions.
function clientId() {
  let id = localStorage.getItem('sst_client');
  if (!id) {
    id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2, 12);
    localStorage.setItem('sst_client', id);
  }
  return id;
}

function renderReactions(bump) {
  const live = matchStatus === 'live';
  document.getElementById('reactions').innerHTML = REACTIONS.map(function (r) {
    return '<button class="react' + (bump === r.key ? ' bump' : '') + '" data-r="' + r.key + '"' + (live ? '' : ' disabled title="Reactions open while the match is live"') + '>' +
      r.emoji + ' <span>' + reactionCounts[r.key] + '</span></button>';
  }).join('');
}

document.getElementById('reactions').addEventListener('click', async function (e) {
  const btn = e.target.closest('button[data-r]');
  if (!btn || btn.disabled) return;
  try {
    const data = await api('POST', '/api/matches/' + matchId + '/reactions', { type: btn.dataset.r, clientId: clientId() });
    reactionCounts = data.reactions;
    renderReactions(btn.dataset.r);
  } catch (err) { toast('error', err.message); }
});

// ---- comments
function renderComments(list) {
  const user = getUser();
  const isAdmin = user && user.role === 'admin' && getToken();
  const box = document.getElementById('comments');
  if (list.length === 0) { box.innerHTML = '<li class="muted">No comments yet. Be the first!</li>'; return; }
  box.innerHTML = list.map(function (c) {
    return '<li><span><strong>' + esc(c.author) + '</strong> ' + esc(c.text) + '</span><span class="muted">' + fmtTime(c.time) +
      (isAdmin ? ' <button class="secondary mini" data-del="' + c.id + '">Delete</button>' : '') + '</span></li>';
  }).join('');
}

function renderCommentForm() {
  const box = document.getElementById('comment-form');
  if (!getUser() || !getToken()) {
    box.innerHTML = '<p class="muted"><a href="/login.html">Log in</a> to join the chat.</p>';
    return;
  }
  box.innerHTML = '<form class="comment-row" id="c-form"><input id="c-text" maxlength="200" placeholder="Say something (max 200 characters)" required><button type="submit" id="c-send">Send</button></form>';
  document.getElementById('c-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const input = document.getElementById('c-text');
    const send = document.getElementById('c-send');
    send.disabled = true;
    try {
      const data = await api('POST', '/api/matches/' + matchId + '/comments', { text: input.value });
      input.value = '';
      renderComments(data.comments);
    } catch (err) { toast('error', err.message); }
    send.disabled = false;
  });
}

document.getElementById('comments').addEventListener('click', async function (e) {
  const btn = e.target.closest('button[data-del]');
  if (!btn) return;
  if (!(await confirmDialog('Delete comment?', 'It will be removed for everyone.', 'Delete'))) return;
  try {
    const data = await api('DELETE', '/api/matches/' + matchId + '/comments/' + btn.dataset.del);
    renderComments(data.comments);
    toast('success', 'Comment deleted.');
  } catch (err) { toast('error', err.message); }
});

async function loadComments() {
  try {
    const data = await api('GET', '/api/matches/' + encodeURIComponent(matchId) + '/comments');
    renderComments(data.comments);
  } catch (err) {
    document.getElementById('comments').innerHTML = '<li class="msg error">' + esc(err.message) + '</li>';
  }
} // previous score, used to flash only the side that changed

function setConn(kind, text) {
  connBadge.className = 'badge ' + kind;
  connBadge.textContent = text;
}

function teamBlock(team, score, side, won, extra) {
  return '<div class="sb-team ' + (won ? 'won' : '') + '" style="--team:' + (side === 'a' ? 'var(--pink)' : 'var(--lime)') + '">' +
    '<div class="sb-bar"></div><div class="sb-name">' + esc(team.name) + (won ? ' \uD83C\uDFC6' : '') + '</div>' +
    '<div class="sb-num" id="num-' + side + '">' + score + '</div>' + (extra || '') + '</div>';
}

function render(snap) {
  const m = snap.match;
  const s = snap.score;
  document.title = (m.status === 'scheduled' ? '' : s.a + '-' + s.b + ' ') + m.teamA.name + ' vs ' + m.teamB.name + ' - SST Live';
  document.getElementById('meta').innerHTML = sportIcon(m.sport) + ' ' + esc(m.sportLabel) + ' · <a href="/tournament.html?id=' + m.tournament + '">' +
    esc(m.tournamentName) + '</a> · ' + fmtDate(m.scheduledAt);
  document.getElementById('state').innerHTML = statusBadge(m.status);

  matchStatus = m.status;
  reactionCounts = m.reactions || reactionCounts;
  renderReactions();

  const isSetSport = s.currentSet !== null;
  const aWon = m.status === 'finished' && m.winner === 'a';
  const bWon = m.status === 'finished' && m.winner === 'b';
  // Cricket shows runs/wickets and overs, e.g. "142/6 (18.3 ov)"
  let showA = s.a, showB = s.b, extraA = '', extraB = '';
  if (s.cricket) {
    const ia = s.cricket.innings[0], ib = s.cricket.innings[1];
    showA = ia.runs + '<small>/' + ia.wickets + '</small>';
    showB = ib.runs + '<small>/' + ib.wickets + '</small>';
    const bat = m.status === 'live' ? s.cricket.battingSide : null;
    extraA = '<div class="sb-overs">' + ia.overs + ' ov' + (bat === 'a' ? ' · <span class="batting">batting</span>' : '') + '</div>';
    extraB = '<div class="sb-overs">' + (s.cricket.current >= 1 ? ib.overs + ' ov' : 'yet to bat') + (bat === 'b' ? ' · <span class="batting">batting</span>' : '') + '</div>';
  }

  let footer = '';
  if (s.cricket) footer = cricketSummary(m, s);
  else if (m.status === 'finished') footer = m.winner === 'draw' ? 'Full time - match drawn' : 'Full time - ' + esc(m.winner === 'a' ? m.teamA.name : m.teamB.name) + ' win';
  else if (m.status === 'scheduled') footer = 'Kick-off ' + fmtDate(m.scheduledAt);
  else if (isSetSport) footer = 'Sets won · Set ' + s.currentSet.number + ' in play: ' + s.currentSet.a + ' - ' + s.currentSet.b;

  if (m.clock && m.status === 'live') footer = '<div data-clock></div>' + footer;
  document.getElementById('scoreboard').innerHTML =
    '<div class="sb-grid">' + teamBlock(m.teamA, showA, 'a', aWon, extraA) + '<div class="sb-dash">-</div>' + teamBlock(m.teamB, showB, 'b', bWon, extraB) + '</div>' +
    (footer ? '<div class="sb-footer">' + footer + '</div>' : '');

  setClock(m.status === 'live' ? m.clock : null);

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
        text = minuteTag(ev) + cardIcon(ev.type) + teamChip(ev.teamName, ev.side) + '<strong>' + esc(ev.teamName) + '</strong> ' + (ev.playerName ? '<span class="muted">#' + ev.jersey + ' ' + esc(ev.playerName) + '</span> ' : '') +
          (ev.points ? '<span class="pts">+' + ev.points + '</span> ' : '') + esc(ev.label);
      } else {
        text = minuteTag(ev) + '\u23F1 ' + esc(ev.label);
      }
      return '<li><span>' + text + '</span><span class="muted">' + fmtTime(ev.time) + '</span></li>';
    }).join('');
  }
}

function openStream() {
  // EventSource reconnects by itself; the server sends a full snapshot on every (re)connect.
  const source = new EventSource(apiUrl('/api/matches/' + encodeURIComponent(matchId) + '/stream'));
  source.addEventListener('open', function () { setConn('ok', 'Connected'); });
  source.addEventListener('snapshot', function (e) {
    setConn('ok', 'Connected');
    render(JSON.parse(e.data));
  });
  source.addEventListener('reactions', function (e) {
    reactionCounts = JSON.parse(e.data);
    renderReactions();
  });
  source.addEventListener('comments', function (e) { renderComments(JSON.parse(e.data)); });
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
    renderCommentForm();
    loadComments();
    openStream();
  } catch (err) {
    statusBox.innerHTML = '<div class="msg error">' + esc(err.message) + ' <a href="/">Go home</a></div>';
  }
}
start();
