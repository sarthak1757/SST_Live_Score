const XLSX = require('xlsx');
const { parseWorkbook, planImport, applyPlan, cleanName, houseOf, checkUpload } = require('../src/services/rosterImport');
const { publicPlayer, adminPlayer, jerseyOwner } = require('../src/services/roster');

const HEADER = ['Name', 'SST mail', 'Roll No.', 'Batch', 'Jersey'];

// builds an .xlsx buffer: { "Kong A": [[header], [row], ...], "Leo B": [...] }
function workbook(tabs) {
  const wb = XLSX.utils.book_new();
  Object.keys(tabs).forEach((name) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tabs[name]), name));
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
const parse = (tabs) => parseWorkbook(workbook(tabs), 'roster.xlsx');

describe('parsing tabs', () => {
  test('each tab is a team; columns are found by name; houses come from "Kong A" / "Leo B"', () => {
    const sheets = parse({
      'Kong A': [HEADER, ['aman rao', 'Aman@SST.edu', '2501', '2025', '7'], ['Ravi Das', 'ravi@sst.edu', '2502', '2025', '']],
      'Leo B': [['SST Mail', 'Name', 'Batch'], ['leo1@sst.edu', 'Karan', '2024']], // different column order, no roll no. / jersey
      Tusker: [HEADER, ['Neel', 'neel@sst.edu', '1', '2025', '']],
    });
    expect(sheets.map((s) => s.sheet)).toEqual(['Kong A', 'Leo B', 'Tusker']);
    expect(sheets[0].rows[0]).toMatchObject({ name: 'aman rao', email: 'aman@sst.edu', rollNo: '2501', batch: '2025', jersey: '7' });
    expect(sheets[1].rows[0]).toMatchObject({ name: 'Karan', email: 'leo1@sst.edu', batch: '2024', rollNo: '' });
    expect([houseOf('Kong A'), houseOf('Leo B'), houseOf('Tusker'), houseOf('Kong   a')]).toEqual(['Kong', 'Leo', 'Tusker', 'Kong']);
    expect(planImport(sheets, []).teams.map((t) => t.house)).toEqual(['Kong', 'Leo', 'Tusker']);
  });

  test('a tab without Name and SST mail columns is reported, not guessed', () => {
    const sheets = parse({ Oops: [['Foo', 'Bar'], ['1', '2']] });
    expect(sheets[0].error).toMatch(/Name.*SST mail/);
    expect(planImport(sheets, []).teams[0].error).toBeTruthy();
  });
});

describe('cleaning and skipping rows', () => {
  test('ALL CAPS names become Title Case; mixed-case names are left alone; empty rows are ignored', () => {
    expect(cleanName('  AMAN   RAO ')).toBe('Aman Rao');
    expect(cleanName("RAVI O'BRIEN-SMITH")).toBe("Ravi O'Brien-Smith");
    expect(cleanName('Aman McDonald')).toBe('Aman McDonald');
    const plan = planImport(parse({ 'Kong A': [HEADER, ['AMAN RAO', 'a@sst.edu', '1', '', ''], ['', '', '', '', ''], [], ['Ravi', '', '', '', '']] }), []);
    const rows = plan.teams[0].players;
    expect(rows.map((r) => [r.name, r.action, r.reason])).toEqual([['Aman Rao', 'add', ''], ['Ravi', 'skip', 'Missing SST mail']]);
  });
});

describe('upsert by SST mail', () => {
  const existing = [{ name: 'Kong A', house: 'Kong', players: [
    { name: 'Aman Rao', email: 'aman@sst.edu', rollNo: '2501', batch: '2025', jersey: 7 },
    { name: 'Ravi Das', email: 'ravi@sst.edu', rollNo: '2502', batch: '2025', jersey: null },
  ] }];

  test('known mail -> update, unknown -> add, identical -> skip "No changes"; matching is case-insensitive', () => {
    const sheets = parse({ 'kong a': [HEADER,
      ['AMAN RAO', 'AMAN@sst.edu', '2501', '2025', ''],        // identical after cleaning -> no changes
      ['Ravi Das', 'ravi@sst.edu', '9999', '2026', '10'],      // roll no., batch and jersey change
      ['Karan', 'karan@sst.edu', '2503', '2025', '11']] });    // new
    const plan = planImport(sheets, existing);
    const [aman, ravi, karan] = plan.teams[0].players;
    expect([aman.action, aman.reason]).toEqual(['skip', 'No changes']);
    expect([ravi.action, ravi.changes]).toEqual(['update', ['roll no.', 'batch', 'jersey']]);
    expect([karan.action, karan.jersey]).toEqual(['add', 11]);
    expect(plan.teams[0].isNew).toBe(false);
    expect(plan.totals).toMatchObject({ add: 1, update: 1, skip: 1, newTeams: 0 });
  });

  test('apply creates a missing team (with its house), adds new players and updates existing ones in place', () => {
    const tournament = { teams: JSON.parse(JSON.stringify(existing)) };
    const sheets = parse({
      'Kong A': [HEADER, ['Ravi Das', 'ravi@sst.edu', '', '', '10'], ['Karan', 'karan@sst.edu', '2503', '2025', '']],
      'Leo B': [HEADER, ['Neel', 'neel@sst.edu', '7', '2024', '5']],
    });
    applyPlan(tournament, planImport(sheets, tournament.teams));
    expect(tournament.teams.map((t) => [t.name, t.house, t.players.length])).toEqual([['Kong A', 'Kong', 3], ['Leo B', 'Leo', 1]]);
    const ravi = tournament.teams[0].players.find((p) => p.email === 'ravi@sst.edu');
    expect([ravi.jersey, ravi.rollNo]).toEqual([10, '2502']); // blank roll no. in the file keeps the old value
    expect(tournament.teams[1].players[0]).toMatchObject({ name: 'Neel', email: 'neel@sst.edu', rollNo: '7', jersey: 5 });
  });
});

describe('duplicate detection', () => {
  test('a mail repeated in the file (even on another tab) or already on another team is skipped with a reason', () => {
    const existing = [{ name: 'Leo B', house: 'Leo', players: [{ name: 'Old', email: 'taken@sst.edu', jersey: null }] }];
    const sheets = parse({
      'Kong A': [HEADER, ['Aman', 'dup@sst.edu', '', '', ''], ['Aman Again', 'DUP@sst.edu', '', '', ''], ['Taken', 'taken@sst.edu', '', '', '']],
      'Kong B': [HEADER, ['Aman Elsewhere', 'dup@sst.edu', '', '', '']],
    });
    const plan = planImport(sheets, existing);
    const kongA = plan.teams[0].players;
    expect(kongA.map((p) => p.action)).toEqual(['add', 'skip', 'skip']);
    expect(kongA[1].reason).toMatch(/Duplicate SST mail.*Kong A row 2/);
    expect(kongA[2].reason).toMatch(/Already on team "Leo B"/);
    expect(plan.teams[1].players[0].reason).toMatch(/Duplicate SST mail/);
  });

  test('a repeated jersey inside a team keeps the player but leaves the jersey blank, with a warning', () => {
    const plan = planImport(parse({ 'Kong A': [HEADER, ['A', 'a@sst.edu', '', '', '7'], ['B', 'b@sst.edu', '', '', '7'], ['C', 'c@sst.edu', '', '', 'x'], ['D', 'd@sst.edu', '', '', '100']] }), []);
    const rows = plan.teams[0].players;
    expect(rows.map((r) => [r.action, r.jersey])).toEqual([['add', 7], ['add', null], ['add', null], ['add', null]]);
    expect(rows[1].warnings[0]).toMatch(/Jersey 7 is already used/);
    expect(rows[2].warnings[0]).toMatch(/not a number/);
    expect(plan.totals.warnings).toBe(3);
  });

  test('odd tab names like "__proto__" and "constructor" cannot pollute anything', () => {
    const tabs = { constructor: [HEADER, ['B', 'b@sst.edu', '', '', '']] };
    Object.defineProperty(tabs, '__proto__', { value: [HEADER, ['A', 'a@sst.edu', '', '', '']], enumerable: true }); // a real key, not the prototype
    const plan = planImport(parse(tabs), []);
    expect(plan.teams.map((t) => t.team).sort()).toEqual(['__proto__', 'constructor']);
    expect({}.polluted).toBeUndefined();
    expect(plan.totals.add).toBe(2);
  });
});

describe('upload checks', () => {
  test('only .xlsx/.csv, max 2 MB, and the content must match the extension', () => {
    const good = workbook({ T: [HEADER] });
    expect(checkUpload('a.xlsx', good)).toBe('xlsx');
    expect(checkUpload('A.CSV', Buffer.from('Name,SST mail\nA,a@sst.edu'))).toBe('csv');
    expect(() => checkUpload('a.pdf', good)).toThrow(/Only .xlsx or .csv/);
    expect(() => checkUpload('a.xlsx', Buffer.from('just text'))).toThrow(/not a valid .xlsx/);
    expect(() => checkUpload('a.csv', Buffer.from([0x50, 0x4b, 0, 0]))).toThrow(/not a valid .csv/);
    expect(() => checkUpload('a.xlsx', Buffer.alloc(2 * 1024 * 1024 + 1, 0x50))).toThrow(/too large/);
    expect(() => checkUpload('a.xlsx', Buffer.alloc(0))).toThrow(/No file/);
  });

  test('a .csv is one team named after the file', () => {
    const sheets = parseWorkbook(Buffer.from('Name,SST mail,Roll No.,Batch\nAman,a@sst.edu,1,2025\n'), 'Kong_A.csv');
    expect(sheets).toHaveLength(1);
    expect(sheets[0].sheet).toBe('Kong A');
    expect(sheets[0].rows[0].email).toBe('a@sst.edu');
  });
});

describe('privacy: private fields never reach public responses', () => {
  const player = { _id: 'p1', name: 'Aman Rao', jersey: 7, email: 'aman@sst.edu', rollNo: '2501', batch: '2025' };

  test('publicPlayer keeps only id, name and jersey; adminPlayer adds the private details', () => {
    expect(publicPlayer(player)).toEqual({ id: 'p1', name: 'Aman Rao', jersey: 7 });
    expect(Object.keys(publicPlayer(player))).not.toEqual(expect.arrayContaining(['email']));
    expect(JSON.stringify(publicPlayer(player))).not.toMatch(/sst\.edu|2501|2025/);
    expect(adminPlayer(player)).toMatchObject({ email: 'aman@sst.edu', rollNo: '2501', batch: '2025' });
    expect(publicPlayer({ _id: 'p2', name: 'No Jersey' }).jersey).toBeNull();
  });

  test('jerseyOwner finds who wears a number in a team, ignoring the player being edited', () => {
    const team = { players: [{ _id: 'a', name: 'A', jersey: 7 }, { _id: 'b', name: 'B', jersey: null }] };
    expect(jerseyOwner(team, 7, 'b').name).toBe('A');
    expect(jerseyOwner(team, 7, 'a')).toBeNull();
    expect(jerseyOwner(team, 8, 'a')).toBeNull();
  });
});
