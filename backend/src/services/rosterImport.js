// Roster import from .xlsx / .csv. Each sheet (tab) is one team: the tab name is the team name.
// Pure functions: parse -> plan (preview) -> apply (mutates the tournament object you give it).
// Lookups use Map, never plain objects, so a tab or mail called "__proto__" or "constructor" is harmless.
const XLSX = require('xlsx');
const { httpError } = require('../middleware/errors');

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_SHEETS = 20;
const MAX_ROWS = 600;
const MAX_TEAMS = 16; // same limit as creating a tournament
const MAX_PLAYERS = 30; // same limit as a roster
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// ---------- upload checks ----------
function checkUpload(filename, buffer) {
  const name = String(filename || '').toLowerCase();
  const isXlsx = /\.xlsx$/.test(name);
  const isCsv = /\.csv$/.test(name);
  if (!isXlsx && !isCsv) throw httpError(400, 'Only .xlsx or .csv files are allowed');
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw httpError(400, 'No file received');
  if (buffer.length > MAX_BYTES) throw httpError(413, 'File is too large (max 2 MB)');
  if (isXlsx && !(buffer[0] === 0x50 && buffer[1] === 0x4b)) throw httpError(400, 'This is not a valid .xlsx file'); // xlsx is a zip: "PK"
  if (isCsv && buffer.indexOf(0) !== -1) throw httpError(400, 'This is not a valid .csv file');
  return isCsv ? 'csv' : 'xlsx';
}

// ---------- cleaning ----------
function squash(text) {
  return String(text === undefined || text === null ? '' : text).replace(/\s+/g, ' ').trim();
}

// ALL CAPS names become Title Case; names that already have lower-case letters are left alone.
function cleanName(raw) {
  const n = squash(raw);
  const letters = n.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 2 && n === n.toUpperCase()) {
    return n.toLowerCase().replace(/(^|[\s'\-.])([a-z])/g, function (m, before, ch) { return before + ch.toUpperCase(); });
  }
  return n;
}

// "Kong A" -> "Kong", "Leo B" -> "Leo", "Tusker" -> "Tusker"
function houseOf(teamName) {
  const m = squash(teamName).match(/^(.+?)\s+[AB]$/i);
  return m ? m[1].trim() : squash(teamName);
}

function key(text) {
  return squash(text).toLowerCase();
}

// ---------- parsing ----------
// Column names are matched ignoring case, spaces and punctuation ("SST mail", "Roll No." ...).
const COLUMNS = {
  name: ['name', 'playername', 'studentname', 'fullname'],
  email: ['sstmail', 'sstemail', 'email', 'mail', 'emailid'],
  rollNo: ['rollno', 'rollnumber', 'roll'],
  batch: ['batch'],
  jersey: ['jersey', 'jerseyno', 'jerseynumber'],
};

function headerKey(cell) {
  return squash(cell).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findColumns(rows) {
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const found = new Map();
    rows[r].forEach(function (cell, c) {
      const k = headerKey(cell);
      Object.keys(COLUMNS).forEach(function (field) {
        if (!found.has(field) && COLUMNS[field].indexOf(k) !== -1) found.set(field, c);
      });
    });
    if (found.has('name') && found.has('email')) return { headerRow: r, cols: found };
  }
  return null;
}

// Returns [{ sheet, rows: [{ rowNumber, name, email, rollNo, batch, jersey }], error? }]
function parseWorkbook(buffer, filename) {
  const kind = checkUpload(filename, buffer);
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', sheetRows: MAX_ROWS + 12, cellFormula: false, cellHTML: false, cellStyles: false, cellNF: false });
  } catch (err) {
    throw httpError(400, 'Could not read this file. Is it a valid spreadsheet?');
  }
  const names = workbook.SheetNames || [];
  if (names.length === 0) throw httpError(400, 'The file has no sheets');
  if (names.length > MAX_SHEETS) throw httpError(400, 'Too many sheets (max ' + MAX_SHEETS + ' teams per file)');

  const sheets = [];
  names.forEach(function (sheetName, index) {
    // a .csv has one anonymous sheet: use the file name as the team name
    const team = kind === 'csv' ? squash(String(filename).replace(/\.csv$/i, '').replace(/[_]+/g, ' ')) : squash(sheetName);
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: '', blankrows: false });
    const out = { sheet: team, rows: [] };
    const layout = findColumns(rows);
    if (!layout) {
      out.error = 'Could not find the "Name" and "SST mail" columns';
    } else {
      for (let r = layout.headerRow + 1; r < rows.length && out.rows.length < MAX_ROWS; r++) {
        const cell = function (field) { return layout.cols.has(field) ? squash(rows[r][layout.cols.get(field)]) : ''; };
        out.rows.push({ rowNumber: r + 1, name: cell('name'), email: cell('email').toLowerCase(), rollNo: cell('rollNo'), batch: cell('batch'), jersey: cell('jersey') });
      }
    }
    sheets.push(out);
  });
  return sheets;
}

// ---------- planning (the preview) ----------
function emptyRow(row) {
  return !row.name && !row.email && !row.rollNo && !row.batch && !row.jersey;
}

// teams: the tournament's current teams [{ name, house, players: [{ name, email, rollNo, batch, jersey }] }]
function planImport(sheets, teams) {
  const existing = new Map();
  const emailOwner = new Map(); // email -> team name, for the whole tournament
  teams.forEach(function (t) {
    existing.set(key(t.name), t);
    (t.players || []).forEach(function (p) { if (p.email) emailOwner.set(p.email, t.name); });
  });
  const seenInFile = new Map(); // email -> "Team (row n)"
  let teamCount = teams.length;

  const plan = { teams: [], totals: { add: 0, update: 0, skip: 0, warnings: 0, newTeams: 0 } };

  sheets.forEach(function (sheet) {
    const teamName = sheet.sheet;
    const tp = { team: teamName, house: houseOf(teamName), isNew: !existing.has(key(teamName)), players: [], counts: { add: 0, update: 0, skip: 0 } };
    plan.teams.push(tp);

    if (!teamName || teamName.length > 40) tp.error = 'Team (tab) name must be 1-40 characters';
    else if (sheet.error) tp.error = sheet.error;
    else if (tp.isNew && teamCount >= MAX_TEAMS) tp.error = 'A tournament can have at most ' + MAX_TEAMS + ' teams';
    if (tp.error) return;

    if (tp.isNew) { teamCount++; plan.totals.newTeams++; }
    const current = existing.get(key(teamName));
    const players = current ? current.players || [] : [];
    const jerseys = new Map(); // jersey -> email of the player wearing it
    players.forEach(function (p) { if (p.jersey !== null && p.jersey !== undefined) jerseys.set(p.jersey, p.email); });
    let rosterSize = players.length;

    sheet.rows.forEach(function (row) {
      if (emptyRow(row)) return;
      const entry = { row: row.rowNumber, name: cleanName(row.name), email: row.email, rollNo: row.rollNo || null, batch: row.batch || null, jersey: null, action: 'add', reason: '', warnings: [], changes: [] };
      tp.players.push(entry);
      function skip(reason) { entry.action = 'skip'; entry.reason = reason; }

      if (!entry.email) return skip('Missing SST mail');
      if (!EMAIL.test(entry.email)) return skip('Invalid SST mail');
      if (!entry.name) return skip('Missing name');
      if (entry.name.length > 40) return skip('Name is longer than 40 characters');
      if (entry.rollNo && entry.rollNo.length > 30) return skip('Roll no. is too long');
      if (entry.batch && entry.batch.length > 30) return skip('Batch is too long');
      if (seenInFile.has(entry.email)) return skip('Duplicate SST mail (also ' + seenInFile.get(entry.email) + ')');
      seenInFile.set(entry.email, teamName + ' row ' + row.rowNumber);
      const owner = emailOwner.get(entry.email);
      if (owner && key(owner) !== key(teamName)) return skip('Already on team "' + owner + '" in this tournament');

      const mine = players.find(function (p) { return p.email === entry.email; });

      // jersey: optional; must be 0-99 and not worn by someone else in this team
      let wanted = null;
      if (row.jersey !== '') {
        const n = Number(row.jersey);
        if (!Number.isInteger(n) || n < 0 || n > 99) entry.warnings.push('Jersey "' + row.jersey + '" is not a number from 0 to 99 - left blank');
        else if (jerseys.has(n) && jerseys.get(n) !== entry.email) entry.warnings.push('Jersey ' + n + ' is already used in this team - left blank');
        else wanted = n;
      }

      if (mine) {
        entry.action = 'update';
        if (entry.name !== mine.name) entry.changes.push('name');
        if ((entry.rollNo || null) !== (mine.rollNo || null) && entry.rollNo) entry.changes.push('roll no.');
        if ((entry.batch || null) !== (mine.batch || null) && entry.batch) entry.changes.push('batch');
        if (wanted !== null && wanted !== mine.jersey) { entry.changes.push('jersey'); entry.jersey = wanted; jerseys.set(wanted, entry.email); }
        else entry.jersey = mine.jersey === undefined ? null : mine.jersey;
        if (entry.changes.length === 0) skip('No changes');
      } else {
        if (rosterSize >= MAX_PLAYERS) return skip('Team already has ' + MAX_PLAYERS + ' players');
        rosterSize++;
        entry.jersey = wanted;
        if (wanted !== null) jerseys.set(wanted, entry.email);
      }
    });

    tp.players.forEach(function (e) {
      tp.counts[e.action]++;
      plan.totals[e.action]++;
      plan.totals.warnings += e.warnings.length;
    });
  });
  return plan;
}

// ---------- applying ----------
// Mutates tournament.teams (a mongoose document or a plain object). The caller saves it.
function applyPlan(tournament, plan) {
  plan.teams.forEach(function (tp) {
    if (tp.error) return;
    let team = tournament.teams.find(function (t) { return key(t.name) === key(tp.team); });
    if (!team) {
      tournament.teams.push({ name: tp.team, house: tp.house, players: [] });
      team = tournament.teams[tournament.teams.length - 1];
    }
    if (!team.house) team.house = tp.house;
    tp.players.forEach(function (e) {
      if (e.action === 'add') {
        team.players.push({ name: e.name, email: e.email, rollNo: e.rollNo, batch: e.batch, jersey: e.jersey });
      } else if (e.action === 'update') {
        const p = team.players.find(function (x) { return x.email === e.email; });
        if (!p) return;
        p.name = e.name;
        if (e.rollNo) p.rollNo = e.rollNo;
        if (e.batch) p.batch = e.batch;
        if (e.jersey !== null && e.jersey !== undefined) p.jersey = e.jersey;
      }
    });
  });
  return tournament;
}

module.exports = { MAX_BYTES, checkUpload, cleanName, houseOf, parseWorkbook, planImport, applyPlan };
