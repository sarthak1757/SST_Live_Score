const user = requireLogin();
if (user && user.role === 'fan') window.location.href = '/feed.html'; // scoring is for staff only
const matchId = new URLSearchParams(window.location.search).get('id');
const statusBox = document.getElementById('status');
const content = document.getElementById('content');
const msg = document.getElementById('msg');

let sports = null;
let snap = null;
let busy = false;
let rosters = { a: [], b: [] };
const chosen = { a: '', b: '' }; // selected player id per side (kept between taps)

async function call(method, path, body, okText) {
  if (busy) return;
  busy = true;
  render();
  try {
    snap = await api(method, '/api/matches/' + matchId + path, body);
    toast('success', okText);
  } catch (err) {
    toast('error', err.message);
    // state may have changed under us (e.g. another scorer finished the match) - re-sync
    try { snap = await api('GET', '/api/matches/' + matchId); } catch (e2) { /* keep old state */ }
  }
  busy = false;
  render();
}

function render() {
  const m = snap.match;
  const s = snap.score;
  const config = sports[m.sport];
  const live = m.status === 'live';
  const open = live && !s.matchDecided && !busy;

  document.getElementById('meta').textContent = sportIcon(m.sport) + ' ' + m.tournamentName + ' · ' + m.sportLabel;
  document.getElementById('state').innerHTML = statusBadge(m.status);
  document.getElementById('public-link').href = '/match.html?id=' + m.id;
  const auditLink = document.getElementById('audit-link');
  if (user.role === 'admin') { auditLink.hidden = false; auditLink.href = '/audit.html?match=' + m.id; }

  // Start / Undo / End set / Finish
  let controls = '';
  controls += '<button class="success" id="btn-start"' + (m.status === 'scheduled' && !busy ? '' : ' disabled') + '>\u25B6 Start match</button>';
  controls += '<button class="secondary" id="btn-undo"' + (live && snap.events.length > 0 && !busy ? '' : ' disabled') + '>\u21B6 Undo last</button>';
  if (config.sets) controls += '<button class="secondary" id="btn-endset"' + (open ? '' : ' disabled') + '>End set</button>';
  if (config.cricket) controls += '<button class="secondary" id="btn-endinnings"' + (open ? '' : ' disabled') + '>End innings</button>';
  controls += '<button class="danger" id="btn-finish"' + (live && !busy ? '' : ' disabled') + '>\u23F9 Finish match</button>';
  document.getElementById('controls').innerHTML = controls;

  // Match clock (football, basketball, kabaddi)
  const clockBox = document.getElementById('clock-bar');
  const c = m.clock;
  if (c && live) {
    const lastPeriod = c.period >= c.periods;
    const endLabel = c.periods === 2 ? (c.period === 1 ? 'Half-time' : 'End 2nd half') : 'End Q' + c.period;
    let btns = '';
    if (c.state === 'not_started') btns = '<button class="success" data-clock-action="start">\u25B6 Start clock</button>';
    else if (c.state === 'break') btns = '<button class="success" data-clock-action="start">\u25B6 Start ' + (c.periods === 2 ? '2nd half' : 'Q' + (c.period + 1)) + '</button>';
    else if (c.state === 'running') btns = '<button class="secondary" data-clock-action="pause">\u23F8 Pause</button><button class="secondary" data-clock-action="end_period">' + (lastPeriod ? 'Stop clock (full time)' : endLabel) + '</button>';
    else if (c.state === 'paused') btns = '<button class="success" data-clock-action="resume">\u25B6 Resume</button><button class="secondary" data-clock-action="end_period">' + (lastPeriod ? 'Stop clock (full time)' : endLabel) + '</button>';
    clockBox.innerHTML = '<div class="clock-bar"><div data-clock class="clock-big">' + (c.state === 'not_started' ? '<span class="clock-label">Clock not started</span>' : '') + '</div><div class="clock-btns">' + btns + '</div></div>';
    clockBox.querySelectorAll('[data-clock-action]').forEach(function (b) {
      b.disabled = busy;
      b.onclick = function () { call('POST', '/clock', { action: b.dataset.clockAction }, 'Clock: ' + b.textContent.replace(/^\W+/, '')); };
    });
    setClock(c.state === 'not_started' ? null : c);
  } else {
    clockBox.innerHTML = '';
    setClock(null);
  }

  // One column per team, buttons come from the sports config
  let pad = '';
  ['a', 'b'].forEach(function (side) {
    const team = side === 'a' ? m.teamA : m.teamB;
    const roster = rosters[side];
    // Cricket: only the batting team gets buttons
    const batting = !config.cricket || (s.cricket.battingSide === side);
    const canTap = open && batting;
    const picker = roster.length === 0 || !batting ? '' : '<select class="player-pick" data-side="' + side + '"' + (canTap ? '' : ' disabled') + '><option value="">Player (optional)</option>' +
      roster.map(function (p) { return '<option value="' + p.id + '"' + (chosen[side] === p.id ? ' selected' : '') + '>' + jerseyTag(p.jersey) + esc(p.name) + '</option>'; }).join('') + '</select>';
    let actionButtons = Object.keys(config.actions).map(function (key) {
      const card = config.actions[key].card;
      return '<button' + (card ? ' class="card-' + card + '"' : '') + ' data-team="' + team.id + '" data-type="' + key + '"' + (canTap ? '' : ' disabled') + '>' + cardIcon(key) + esc(config.actions[key].label) + '</button>';
    }).join('');
    let numText = s[side];
    if (config.sets && s.currentSet && !s.matchDecided) {
      // set sports: the big number is the current set's points, sets won sit underneath
      numText = s.currentSet[side] + '<div class="muted">Sets: ' + s[side] + '</div>';
    }
    if (config.cricket) {
      const inn = s.cricket.innings[side === 'a' ? 0 : 1];
      numText = cricketTotal(inn) + '<div class="muted">' + inn.overs + ' ov</div>';
      if (!batting) actionButtons = '<div class="empty small">' + (s.cricket.battingSide ? 'Bowling' : 'Innings complete') + '</div>';
      else actionButtons = '<div class="cricket-pad">' + actionButtons + '</div>';
    }
    pad += '<div class="team" style="--team:' + (side === 'a' ? 'var(--blue);--on-team:var(--on-blue)' : 'var(--lime);--on-team:var(--on-lime)') + '"><div class="bar"></div><h3>' + esc(team.name) + '</h3><div class="num">' + numText + '</div>' + picker + actionButtons + '</div>';
  });
  document.getElementById('pad').innerHTML = pad;

  const setsBox = document.getElementById('sets');
  if (s.cricket) {
    setsBox.innerHTML = '<div class="card">' + cricketSummary(m, s) + (s.matchDecided && live ? ' · <strong>click Finish</strong>' : '') + '</div>';
  } else if (s.currentSet) {
    let text = 'Sets won: ' + s.a + ' - ' + s.b;
    if (!s.matchDecided && live) text += ' · Current set ' + s.currentSet.number + ': ' + s.currentSet.a + ' - ' + s.currentSet.b;
    if (s.matchDecided && live) text += ' · Match decided - click Finish';
    setsBox.innerHTML = '<div class="card">' + esc(text) + (s.sets.length ? '<br><span class="muted">' +
      s.sets.map(function (x) { return 'Set ' + x.number + ': ' + x.a + '-' + x.b; }).join(' · ') + '</span>' : '') + '</div>';
  } else {
    setsBox.innerHTML = '';
  }

  if (m.status === 'finished') {
    setsBox.innerHTML += '<div class="msg info">Match finished. Scoring is closed.</div>';
  }

  const feed = document.getElementById('feed');
  feed.innerHTML = snap.events.length === 0 ? '<li class="muted">No actions yet.</li>' : snap.events.slice(0, 10).map(function (ev) {
    return '<li><span>' + minuteTag(ev) + cardIcon(ev.type) + (ev.teamName ? esc(ev.teamName) + ' - ' : '') + (ev.playerName ? jerseyTag(ev.jersey) + esc(ev.playerName) + ' · ' : '') + esc(ev.label) + '</span><span class="muted">' + fmtTime(ev.time) + '</span></li>';
  }).join('');

  // wire up buttons
  document.getElementById('btn-start').onclick = function () { call('POST', '/start', null, 'Match started.'); };
  document.getElementById('btn-undo').onclick = function () { call('DELETE', '/events/last', null, 'Last action undone.'); };
  document.getElementById('btn-finish').onclick = async function () {
    const text = 'Final score: ' + m.teamA.name + ' ' + s.a + ' - ' + s.b + ' ' + m.teamB.name + '. Scoring will be closed and the result added to the standings.';
    if (await confirmDialog('Finish this match?', text, 'Yes, finish')) call('POST', '/finish', null, 'Match finished.');
  };
  const endInnings = document.getElementById('btn-endinnings');
  if (endInnings) endInnings.onclick = async function () {
    if (await confirmDialog('End this innings?', 'Use this only if the innings ends early. All out, overs completed and a successful chase end it automatically.', 'End innings')) {
      call('POST', '/events', { type: 'end_innings' }, 'Innings ended.');
    }
  };
  const endSet = document.getElementById('btn-endset');
  if (endSet) endSet.onclick = function () { call('POST', '/events', { type: 'end_set' }, 'Set ended.'); };
  document.querySelectorAll('.player-pick').forEach(function (sel) {
    sel.onchange = function () { chosen[sel.dataset.side] = sel.value; };
  });
  document.querySelectorAll('#pad button').forEach(function (btn) {
    btn.onclick = function () {
      const side = btn.dataset.team === m.teamA.id ? 'a' : 'b';
      call('POST', '/events', { team: btn.dataset.team, type: btn.dataset.type, player: chosen[side] || undefined }, 'Recorded.');
    };
  });
}

async function init() {
  if (!user) return;
  if (!matchId) {
    statusBox.innerHTML = '<div class="msg error">No match selected. <a href="/dashboard.html">Back to dashboard</a></div>';
    return;
  }
  try {
    const data = await api('GET', '/api/sports');
    sports = data.sports;
    snap = await api('GET', '/api/matches/' + encodeURIComponent(matchId));
    try { // rosters are optional - the page works without them
      const all = await api('GET', '/api/tournaments');
      const t = all.tournaments.find(function (x) { return x.id === snap.match.tournament; });
      if (t) {
        const ta = t.teams.find(function (x) { return x.id === snap.match.teamA.id; });
        const tb = t.teams.find(function (x) { return x.id === snap.match.teamB.id; });
        rosters = { a: ta ? ta.players : [], b: tb ? tb.players : [] };
      }
    } catch (e) { /* no roster picker */ }
    statusBox.innerHTML = '';
    content.hidden = false;
    render();
  } catch (err) {
    statusBox.innerHTML = '<div class="msg error">' + esc(err.message) + ' <a href="/dashboard.html">Back to dashboard</a></div>';
  }
}
init();
