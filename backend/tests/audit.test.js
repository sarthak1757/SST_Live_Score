const { buildEntry, describe: describeEntry, ACTIONS } = require('../src/services/audit');

const admin = { id: 'u1', role: 'admin' };

describe('audit log', () => {
  test('buildEntry records who, what and which match; rejects unknown actions and missing users', () => {
    const e = buildEntry(admin, 'match.start', { match: 'm1', tournament: 't1' });
    expect(e).toEqual({ actor: 'u1', role: 'admin', action: 'match.start', match: 'm1', tournament: 't1', details: {} });
    expect(() => buildEntry(admin, 'match.explode')).toThrow(/Unknown audit action/);
    expect(() => buildEntry(null, 'match.start')).toThrow(/user/);
  });

  test('describe turns entries into readable lines', () => {
    expect(describeEntry({ action: 'score.add', details: { team: 'Red', points: 2, label: 'All-out', player: '#7 Aman' } }))
      .toBe('Scored: Red +2 All-out (#7 Aman)');
    expect(describeEntry({ action: 'score.undo', details: { removed: { team: 'Blue', label: 'Goal', points: 1 } } }))
      .toBe('Undid last action: Blue Goal (+1)');
    expect(describeEntry({ action: 'match.finish', details: { score: '2-1', winner: 'Red won' } })).toBe('Finished match: 2-1 - Red won');
    expect(describeEntry({ action: 'match.start', details: {} })).toBe(ACTIONS['match.start']);
  });
});
