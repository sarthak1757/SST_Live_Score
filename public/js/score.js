const user = requireLogin();
const matchId = new URLSearchParams(window.location.search).get('id');
const statusBox = document.getElementById('status');
const content = document.getElementById('content');
const msg = document.getElementById('msg');

let sports = null;
let snap = null;
let busy = false;

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

  // Start / Undo / End set / Finish
  let controls = '';
  controls += '<button class="success" id="btn-start"' + (m.status === 'scheduled' && !busy ? '' : ' disabled') + '>\u25B6 Start match</button>';
  controls += '<button class="secondary" id="btn-undo"' + (live && snap.events.length > 0 && !busy ? '' : ' disabled') + '>\u21B6 Undo last</button>';
  if (config.sets) controls += '<button class="secondary" id="btn-endset"' + (open ? '' : ' disabled') + '>End set</button>';
  controls += '<button class="danger" id="btn-finish"' + (live && !busy ? '' : ' disabled') + '>\u23F9 Finish match</button>';
  document.getElementById('controls').innerHTML = controls;

  // One column per team, buttons come from the sports config
  let pad = '';
  ['a', 'b'].forEach(function (side) {
    const team = side === 'a' ? m.teamA : m.teamB;
    const actionButtons = Object.keys(config.actions).map(function (key) {
      return '<button data-team="' + team.id + '" data-type="' + key + '"' + (open ? '' : ' disabled') + '>' + esc(config.actions[key].label) + '</button>';
    }).join('');
    pad += '<div class="team" style="--team:' + (side === 'a' ? 'var(--pink)' : 'var(--lime)') + '"><div class="bar"></div><h3>' + esc(team.name) + '</h3><div class="num">' + s[side] + '</div>' + actionButtons + '</div>';
  });
  document.getElementById('pad').innerHTML = pad;

  const setsBox = document.getElementById('sets');
  if (s.currentSet) {
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
    return '<li><span>' + (ev.teamName ? esc(ev.teamName) + ' - ' : '') + esc(ev.label) + '</span><span class="muted">' + fmtTime(ev.time) + '</span></li>';
  }).join('');

  // wire up buttons
  document.getElementById('btn-start').onclick = function () { call('POST', '/start', null, 'Match started.'); };
  document.getElementById('btn-undo').onclick = function () { call('DELETE', '/events/last', null, 'Last action undone.'); };
  document.getElementById('btn-finish').onclick = async function () {
    const text = 'Final score: ' + m.teamA.name + ' ' + s.a + ' - ' + s.b + ' ' + m.teamB.name + '. Scoring will be closed and the result added to the standings.';
    if (await confirmDialog('Finish this match?', text, 'Yes, finish')) call('POST', '/finish', null, 'Match finished.');
  };
  const endSet = document.getElementById('btn-endset');
  if (endSet) endSet.onclick = function () { call('POST', '/events', { type: 'end_set' }, 'Set ended.'); };
  document.querySelectorAll('#pad button').forEach(function (btn) {
    btn.onclick = function () {
      call('POST', '/events', { team: btn.dataset.team, type: btn.dataset.type }, 'Recorded.');
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
    statusBox.innerHTML = '';
    content.hidden = false;
    render();
  } catch (err) {
    statusBox.innerHTML = '<div class="msg error">' + esc(err.message) + ' <a href="/dashboard.html">Back to dashboard</a></div>';
  }
}
init();
