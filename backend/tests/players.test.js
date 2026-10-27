const { topPlayers, computeScore, undoLast } = require('../src/services/scoring');
const { validateRoster } = require('../src/services/roster');

let clock = 0;
function ev(team, type, points, player, name, jersey) {
  clock += 1000;
  return { _id: 'p' + clock, team: team, type: type, points: points, player: player || null, playerName: name || null, jersey: jersey === undefined ? null : jersey, createdAt: new Date(clock) };
}

describe('topPlayers', () => {
  test('sums points per player, sorts by points, ignores events without a player', () => {
    const events = [
      ev('A', 'raid', 1, 'p7', 'Aman', 7),
      ev('A', 'allout', 2, 'p7', 'Aman', 7),
      ev('B', 'raid', 1, 'p9', 'Ravi', 9),
      ev('B', 'tackle', 1, null),
      ev('A', 'bonus', 1, 'p10', 'Karan', 10),
    ];
    const rows = topPlayers(events);
    expect(rows.map((r) => r.name)).toEqual(['Aman', 'Karan', 'Ravi']);
    expect(rows[0]).toMatchObject({ jersey: 7, points: 3, actions: 2, team: 'A' });
  });

  test('undo removes the points from the player stats and the team score', () => {
    const events = [ev('A', 'raid', 1, 'p7', 'Aman', 7), ev('A', 'allout', 2, 'p7', 'Aman', 7)];
    const remaining = undoLast(events).remaining;
    expect(topPlayers(remaining)[0].points).toBe(1);
    expect(computeScore(remaining, 'kabaddi', 'A', 'B').a).toBe(1);
  });
});

describe('validateRoster', () => {
  test('cleans a valid roster', () => {
    expect(validateRoster([{ name: '  Aman ', jersey: '7' }, { name: 'Ravi', jersey: 9 }])).toEqual([
      { name: 'Aman', jersey: 7 },
      { name: 'Ravi', jersey: 9 },
    ]);
  });

  test('rejects duplicate jerseys, bad numbers, empty names and non-lists', () => {
    expect(() => validateRoster([{ name: 'A', jersey: 7 }, { name: 'B', jersey: 7 }])).toThrow(/twice/);
    expect(() => validateRoster([{ name: 'A', jersey: 100 }])).toThrow(/Jersey/);
    expect(() => validateRoster([{ name: '', jersey: 5 }])).toThrow(/name/);
    expect(() => validateRoster('nope')).toThrow(/list/);
  });
});
