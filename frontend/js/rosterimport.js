// Admin: import a roster from .xlsx/.csv. Step 1 uploads the file for a PREVIEW (nothing is saved);
// step 2 ("Confirm import") uploads the same file again with confirm=1 and the server saves it.
(function () {
  const user = getUser();
  if (!user || user.role !== 'admin' || !getToken()) return;

  const form = document.getElementById('import-form');
  const select = document.getElementById('i-tournament');
  const fileInput = document.getElementById('i-file');
  const msg = document.getElementById('i-msg');
  const resultBox = document.getElementById('i-result');
  const privateBox = document.getElementById('i-private');
  const privateBtn = document.getElementById('i-private-btn');
  let privateVisible = false;

  const MAX = 2 * 1024 * 1024;
  const BADGE = { add: 'ok', update: 'scheduled', skip: 'finished' };

  async function loadTournaments() {
    try {
      const data = await api('GET', '/api/tournaments');
      select.innerHTML = data.tournaments.map(function (t) { return '<option value="' + t.id + '">' + esc(t.name) + '</option>'; }).join('');
      if (data.tournaments.length === 0) select.innerHTML = '<option value="">Create a tournament first</option>';
    } catch (err) { showMsg(msg, 'error', err.message); }
  }

  // ---- checks done in the browser first (the server checks everything again)
  function checkFile(file) {
    if (!file) return 'Choose a file first.';
    if (!/\.(xlsx|csv)$/i.test(file.name)) return 'Only .xlsx or .csv files are allowed.';
    if (file.size === 0) return 'This file is empty.';
    if (file.size > MAX) return 'This file is larger than 2 MB.';
    return '';
  }

  function url(confirm) {
    return '/api/tournaments/' + select.value + '/roster/import?filename=' + encodeURIComponent(fileInput.files[0].name) + (confirm ? '&confirm=1' : '');
  }

  function playerRow(p) {
    const detail = p.action === 'skip' ? p.reason : p.action === 'update' ? 'Changes: ' + p.changes.join(', ') : 'New player';
    return '<tr class="' + (p.action === 'skip' ? 'row-skip' : '') + '"><td>' + p.row + '</td><td>' + esc(p.name) + '</td><td class="hide-sm">' + esc(p.email) + '</td>' +
      '<td class="hide-sm">' + esc(p.rollNo || '-') + '</td><td class="hide-sm">' + esc(p.batch || '-') + '</td><td>' + (p.jersey === null ? '-' : p.jersey) + '</td>' +
      '<td><span class="badge ' + BADGE[p.action] + '">' + p.action + '</span> <span class="muted">' + esc(detail) + '</span>' +
      p.warnings.map(function (w) { return '<div class="warn-line">\u26A0 ' + esc(w) + '</div>'; }).join('') + '</td></tr>';
  }

  function renderPlan(plan) {
    const t = plan.totals;
    const canConfirm = t.add + t.update + t.newTeams > 0;
    let html = '<h2>Preview</h2><div class="stat-cards">' +
      '<div class="stat-card"><b>' + t.add + '</b><span>To add</span></div><div class="stat-card"><b>' + t.update + '</b><span>To update</span></div>' +
      '<div class="stat-card"><b>' + t.skip + '</b><span>Skipped</span></div><div class="stat-card' + (t.warnings ? ' hot' : '') + '"><b>' + t.warnings + '</b><span>Warnings</span></div>' +
      '<div class="stat-card"><b>' + t.newTeams + '</b><span>New teams</span></div></div>';
    plan.teams.forEach(function (tp) {
      html += '<div class="card"><div class="row between"><h3 style="margin:0">' + esc(tp.team || '(unnamed tab)') + '</h3><span class="muted">House: ' + esc(tp.house) + ' \u00B7 ' +
        (tp.error ? '' : (tp.isNew ? '<span class="badge ok">new team</span>' : '<span class="badge finished">existing team</span>') + ' \u00B7 ' + tp.counts.add + ' add, ' + tp.counts.update + ' update, ' + tp.counts.skip + ' skip') + '</span></div>';
      if (tp.error) html += '<div class="msg error">' + esc(tp.error) + ' - this tab will be ignored.</div>';
      else if (tp.players.length === 0) html += '<div class="empty small">No player rows in this tab.</div>';
      else html += '<table class="import-table"><thead><tr><th>Row</th><th>Name</th><th class="hide-sm">SST mail</th><th class="hide-sm">Roll no.</th><th class="hide-sm">Batch</th><th>Jersey</th><th>Result</th></tr></thead><tbody>' + tp.players.map(playerRow).join('') + '</tbody></table>';
      html += '</div>';
    });
    html += '<div class="row"><button type="button" id="i-confirm"' + (canConfirm ? '' : ' disabled') + '>Confirm import</button><button type="button" class="secondary" id="i-cancel">Cancel</button>' +
      (canConfirm ? '' : '<span class="muted">Nothing new to save.</span>') + '</div>';
    resultBox.innerHTML = html;
    document.getElementById('i-cancel').onclick = function () { resultBox.innerHTML = ''; showMsg(msg, '', ''); };
    document.getElementById('i-confirm').onclick = confirmImport;
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    showMsg(msg, '', '');
    resultBox.innerHTML = '';
    const file = fileInput.files[0];
    const problem = checkFile(file);
    if (problem) { showMsg(msg, 'error', problem); return; }
    if (!select.value) { showMsg(msg, 'error', 'Choose a tournament first.'); return; }
    const btn = document.getElementById('i-preview');
    btn.disabled = true;
    btn.textContent = 'Reading file...';
    try {
      const data = await api('POST', url(false), null, file);
      renderPlan(data.plan);
    } catch (err) { showMsg(msg, 'error', err.message); }
    btn.disabled = false;
    btn.textContent = 'Preview';
  });

  async function confirmImport() {
    const btn = document.getElementById('i-confirm');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
      const data = await api('POST', url(true), null, fileInput.files[0]);
      const t = data.plan.totals;
      toast('success', 'Imported: ' + t.add + ' added, ' + t.update + ' updated, ' + t.skip + ' skipped.');
      resultBox.innerHTML = '<div class="msg success">Import saved: ' + t.add + ' added, ' + t.update + ' updated, ' + t.skip + ' skipped' + (t.newTeams ? ', ' + t.newTeams + ' new team(s)' : '') +
        '. Players without a jersey number can get one on their team page.</div>';
      fileInput.value = '';
      if (privateVisible) loadPrivate();
      if (typeof window.loadTournaments === 'function') { try { await window.loadTournaments(); } catch (e2) { /* dashboard lists refresh on reload */ } }
    } catch (err) {
      toast('error', err.message);
      btn.disabled = false;
      btn.textContent = 'Confirm import';
    }
  }

  // ---- private details: admin only, hidden until asked for
  async function loadPrivate() {
    if (!select.value) return;
    privateBox.innerHTML = '<div class="empty small">Loading...</div>';
    try {
      const data = await api('GET', '/api/tournaments/' + select.value + '/roster');
      privateBox.innerHTML = data.teams.map(function (team) {
        return '<div class="card"><h3 style="margin:0 0 8px">' + esc(team.name) + (team.house ? ' <span class="muted">House ' + esc(team.house) + '</span>' : '') + '</h3>' +
          (team.players.length === 0 ? '<div class="empty small">No players.</div>' :
            '<table class="import-table"><thead><tr><th>Name</th><th>Jersey</th><th>SST mail</th><th class="hide-sm">Roll no.</th><th class="hide-sm">Batch</th></tr></thead><tbody>' +
            team.players.map(function (p) { return '<tr><td>' + esc(p.name) + '</td><td>' + (p.jersey === null ? '-' : p.jersey) + '</td><td>' + esc(p.email || '-') + '</td><td class="hide-sm">' + esc(p.rollNo || '-') + '</td><td class="hide-sm">' + esc(p.batch || '-') + '</td></tr>'; }).join('') +
            '</tbody></table>') + '</div>';
      }).join('') || '<div class="empty small">No teams yet.</div>';
    } catch (err) { privateBox.innerHTML = '<div class="msg error">' + esc(err.message) + '</div>'; }
  }

  privateBtn.addEventListener('click', function () {
    privateVisible = !privateVisible;
    privateBtn.textContent = privateVisible ? 'Hide private details' : 'Show private details';
    if (privateVisible) loadPrivate(); else privateBox.innerHTML = '';
  });
  select.addEventListener('change', function () { resultBox.innerHTML = ''; if (privateVisible) loadPrivate(); });

  loadTournaments();
})();
