const user = requireLogin();
const params = new URLSearchParams(window.location.search);
const tSelect = document.getElementById('a-tournament');
const mSelect = document.getElementById('a-match');
const logBox = document.getElementById('log');

function option(value, text) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = text;
  return o;
}

async function loadMatches(preselect) {
  mSelect.innerHTML = '';
  mSelect.appendChild(option('', 'Whole tournament (admin changes + all matches)'));
  try {
    const data = await api('GET', '/api/matches?tournament=' + tSelect.value);
    data.matches.forEach(function (m) {
      const stage = stageLabel(m.stage) ? stageLabel(m.stage) + ': ' : '';
      mSelect.appendChild(option(m.id, stage + m.teamA.name + ' vs ' + m.teamB.name + ' (' + m.status + ', ' + fmtDate(m.scheduledAt) + ')'));
    });
    if (preselect) mSelect.value = preselect;
  } catch (err) { toast('error', err.message); }
  loadLog();
}

async function loadLog() {
  if (!tSelect.value) { logBox.innerHTML = '<div class="empty">No tournaments yet.</div>'; return; }
  logBox.innerHTML = '<div class="empty">Loading audit log...</div>';
  const query = mSelect.value ? 'match=' + mSelect.value : 'tournament=' + tSelect.value;
  try {
    const data = await api('GET', '/api/audit?' + query);
    if (data.entries.length === 0) { logBox.innerHTML = '<div class="empty">Nothing recorded yet.</div>'; return; }
    logBox.innerHTML = '<table class="audit"><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody>' +
      data.entries.map(function (e) {
        return '<tr><td class="muted">' + fmtDate(e.time) + '<br>' + fmtTime(e.time) + '</td><td>' + esc(e.who) + '<br><span class="badge finished">' + esc(e.role) +
          '</span></td><td class="act-' + esc(e.action.split('.')[1]) + '">' + esc(e.summary) + '</td></tr>';
      }).join('') + '</tbody></table>';
  } catch (err) {
    logBox.innerHTML = '<div class="msg error">' + esc(err.message) + '</div>';
  }
}

async function init() {
  if (!user) return;
  if (user.role !== 'admin') {
    document.getElementById('denied').innerHTML = '<div class="msg error">Only admins can view the audit log.</div>';
    return;
  }
  document.getElementById('picker').hidden = false;
  try {
    const data = await api('GET', '/api/tournaments');
    data.tournaments.forEach(function (t) { tSelect.appendChild(option(t.id, t.name + ' (' + t.sportLabel + ')')); });
    let wantMatch = params.get('match');
    if (wantMatch) {
      // open straight on one match (link from the scorer page)
      const snap = await api('GET', '/api/matches/' + encodeURIComponent(wantMatch));
      tSelect.value = snap.match.tournament;
    }
    await loadMatches(wantMatch);
  } catch (err) {
    logBox.innerHTML = '<div class="msg error">' + esc(err.message) + '</div>';
  }
}

tSelect.addEventListener('change', function () { loadMatches(); });
mSelect.addEventListener('change', loadLog);
init();
