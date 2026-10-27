const { seedSemifinals, finalists } = require('../src/services/bracket');

const rows = ['Red', 'Blue', 'Green', 'Yellow', 'Pink'].map((n, i) => ({ teamId: 't' + i, name: n }));
function sf(status, winner) {
  return { status: status, winner: winner, teamA: { id: 'x', name: 'XA' }, teamB: { id: 'y', name: 'YB' } };
}

describe('knockout bracket', () => {
  test('semifinals are seeded 1v4 and 2v3 from the top four', () => {
    const f = seedSemifinals(rows);
    expect(f).toHaveLength(2);
    expect([f[0].stage, f[0].a.name, f[0].b.name]).toEqual(['sf1', 'Red', 'Yellow']);
    expect([f[1].stage, f[1].a.name, f[1].b.name]).toEqual(['sf2', 'Blue', 'Green']);
  });

  test('needs at least 4 teams', () => {
    expect(() => seedSemifinals(rows.slice(0, 3))).toThrow(/4 teams/);
  });

  test('final is the winner of SF1 vs the winner of SF2', () => {
    const result = finalists(sf('finished', 'a'), sf('finished', 'b'));
    expect(result.a.name).toBe('XA');
    expect(result.b.name).toBe('YB');
  });

  test('final cannot be built from unfinished, missing or drawn semifinals', () => {
    expect(() => finalists(sf('live', null), sf('finished', 'a'))).toThrow(/finished/);
    expect(() => finalists(null, sf('finished', 'a'))).toThrow(/semifinals first/);
    expect(() => finalists(sf('finished', 'draw'), sf('finished', 'a'))).toThrow(/draw/);
  });
});
