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
  return '<div class="sb-team ' + (won ? 'won' : '') + '" style="--team:' + (side === 'a' ? 'var(--blue)' : 'var(--lime)') + '">' +
    '<div class="sb-bar"></div><div class="sb-name">' + esc(team.name) + (won ? ' \uD83C\uDFC6' : '') + '</div>' +
    '<div class="sb-num" id="num-' + side + '">' + score + '</div>' + (extra || '') + '</div>';
}

let lastSnap = null;

function render(snap) {
  lastSnap = snap;
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
        return '<tr><td><a class="plain" href="' + playerUrl(p) + '">' + (p.jersey === null ? '' : '<strong>#' + p.jersey + '</strong> ') + esc(p.name) + '</a></td><td>' + teamChip(p.teamName, p.side) + esc(p.teamName) + '</td><td class="win-cell">' + p.points + '</td></tr>';
      }).join('') + '</tbody></table>';
  } else {
    topBox.innerHTML = '';
  }

  // Event feed: "Red House +2 Raid point  12:03:44"
  // Timeline: Team A events on the left, Team B on the right, set/innings ends in the middle.
  const feed = document.getElementById('feed');
  if (snap.events.length === 0) {
    feed.innerHTML = '<li class="tl tl-n"><span class="tl-body muted">No events yet. Updates appear here instantly.</span></li>';
  } else {
    feed.innerHTML = snap.events.map(function (ev) {
      const side = ev.side || 'n';
      const when = ev.minute ? ev.minute + "'" : fmtTime(ev.time).slice(0, 5);
      let body;
      if (ev.teamName) {
        body = cardIcon(ev.type) + (ev.playerName ? '<strong>' + jerseyTag(ev.jersey) + esc(ev.playerName) + '</strong> ' : '<strong>' + esc(ev.teamName) + '</strong> ') +
          (ev.points ? '<span class="pts">+' + ev.points + '</span> ' : '') + esc(ev.label) +
          (ev.playerName ? ' <span class="muted">' + esc(ev.teamName) + '</span>' : '');
      } else {
        body = '\u23F1 ' + esc(ev.label);
      }
      return '<li class="tl tl-' + side + '"><span class="tl-min">' + when + '</span><span class="tl-body">' + body + '</span></li>';
    }).join('');
  }

  // Stats tab
  document.getElementById('stats-box').innerHTML = statsHtml(m, snap.stats || []);
  if (currentTab === 'lineups') loadLineups();
}

function statsHtml(m, rows) {
  if (rows.length === 0) return '<div class="empty">No stats yet.</div>';
  return '<div class="card stats-card"><div class="stats-head"><span>' + teamChip(m.teamA.name, 'a') + esc(m.teamA.name) + '</span><span>' +
    teamChip(m.teamB.name, 'b') + esc(m.teamB.name) + '</span></div>' + rows.map(function (r) {
      const na = parseFloat(r.a) || 0;
      const nb = parseFloat(r.b) || 0;
      const total = na + nb;
      const pa = total ? Math.round((na / total) * 100) : 50;
      return '<div class="stat-row"><div class="stat-vals"><b class="' + (na > nb ? 'lead' : '') + '">' + esc(r.a) + '</b><span>' + esc(r.label) +
        '</span><b class="' + (nb > na ? 'lead' : '') + '">' + esc(r.b) + '</b></div><div class="stat-bar' + (total ? '' : ' empty') + '"><i class="bar-a" style="width:' + pa + '%"></i><i class="bar-b" style="width:' + (100 - pa) + '%"></i></div></div>';
    }).join('') + '</div>';
}

// ---- Lineups and head-to-head are loaded when their tab is opened
let currentTab = 'summary';
let lineupsLoading = false;

async function loadLineups() {
  if (lineupsLoading) return;
  lineupsLoading = true;
  const box = document.getElementById('lineups-box');
  try {
    const data = await api('GET', '/api/matches/' + encodeURIComponent(matchId) + '/lineups');
    function col(side, l) {
      const rows = l.players.length === 0 ? '<div class="empty small">No roster added for ' + esc(l.team) + '.</div>' :
        '<ul class="lineup">' + l.players.map(function (p) {
          return '<li><span class="jersey ' + side + '">' + jerseyNum(p.jersey) + '</span><a href="' + playerUrl(p) + '">' + esc(p.name) + '</a>' +
            '<span class="contrib">' + (p.yellow ? '\uD83D\uDFE8'.repeat(p.yellow) : '') + (p.red ? '\uD83D\uDFE5' : '') + (p.points ? ' <span class="pts">' + p.points + '</span>' : '') + '</span></li>';
        }).join('') + '</ul>';
      return '<div class="card"><h3>' + teamChip(l.team, side) + esc(l.team) + '</h3>' + rows + '</div>';
    }
    box.innerHTML = '<div class="two-col">' + col('a', data.a) + col('b', data.b) + '</div><p class="muted">Numbers next to a player are their points in this match.</p>';
  } catch (err) {
    box.innerHTML = '<div class="msg error">' + esc(err.message) + '</div>';
  }
  lineupsLoading = false;
}

async function loadH2H() {
  const box = document.getElementById('h2h-box');
  try {
    const data = await api('GET', '/api/matches/' + encodeURIComponent(matchId) + '/h2h');
    const s = data.summary;
    const m = lastSnap.match;
    if (s.played === 0) { box.innerHTML = '<div class="empty">' + esc(m.teamA.name) + ' and ' + esc(m.teamB.name) + ' have not met before.</div>'; return; }
    box.innerHTML = '<div class="h2h-summary"><div><b class="a">' + s.aWins + '</b><span>' + esc(m.teamA.name) + ' wins</span></div><div><b>' + s.draws +
      '</b><span>Draws</span></div><div><b class="b">' + s.bWins + '</b><span>' + esc(m.teamB.name) + ' wins</span></div></div>' +
      '<p class="muted">' + s.played + ' previous ' + (s.played === 1 ? 'meeting' : 'meetings') + ' across all tournaments and sports.</p>' + data.matches.map(matchCardHtml).join('');
  } catch (err) {
    box.innerHTML = '<div class="msg error">' + esc(err.message) + '</div>';
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
    setupTabs(document.getElementById('tabs'), function (name) {
      currentTab = name;
      if (name === 'lineups') loadLineups();
      if (name === 'h2h') loadH2H();
    });
    renderCommentForm();
    loadComments();
    openStream();
  } catch (err) {
    statusBox.innerHTML = '<div class="msg error">' + esc(err.message) + ' <a href="/">Go home</a></div>';
  }
}
start();
