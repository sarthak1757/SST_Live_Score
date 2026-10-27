const { computeStandings, recentForm } = require('../src/services/scoring');

const teams = [{ _id: 'r', name: 'Phoenix' }, { _id: 'b', name: 'Leo' }, { _id: 'g', name: 'Kong' }];
let day = 0;
function played(a, b, goalsA, goalsB) {
  day++;
  const winner = goalsA > goalsB ? 'a' : goalsB > goalsA ? 'b' : 'draw';
  return { status: 'finished', teamA: { id: a, name: a }, teamB: { id: b, name: b }, winner: winner, finalScore: { a: goalsA, b: goalsB }, finishedAt: new Date(2026, 0, day) };
}

describe('standings: goals and goal difference', () => {
  test('GF, GA and GD are summed from final scores', () => {
    const table = computeStandings(teams, [played('r', 'b', 3, 1), played('g', 'r', 2, 2)]);
    const phoenix = table.find((t) => t.name === 'Phoenix');
    expect(phoenix).toMatchObject({ played: 2, gf: 5, ga: 3, gd: 2, points: 4 });
    expect(table.find((t) => t.name === 'Leo')).toMatchObject({ gf: 1, ga: 3, gd: -2 });
  });

  test('teams level on points are separated by goal difference, then goals for', () => {
    // Phoenix and Leo both win once and lose once (3 pts); Leo has the better GD.
    const table = computeStandings(teams, [played('r', 'g', 1, 0), played('b', 'g', 4, 0), played('r', 'b', 0, 1), played('g', 'r', 0, 0)]);
    expect(table.map((t) => t.name)).toEqual(['Leo', 'Phoenix', 'Kong']);
    // same points and GD -> more goals scored wins the place
    const t2 = computeStandings(teams, [played('r', 'g', 3, 2), played('b', 'g', 1, 0)]);
    expect(t2.map((t) => t.name).slice(0, 2)).toEqual(['Phoenix', 'Leo']);
  });
});

describe('form', () => {
  test('standings form lists the last five results, oldest first', () => {
    const matches = [played('r', 'b', 1, 0), played('r', 'g', 0, 0), played('b', 'r', 2, 0), played('r', 'b', 1, 0), played('g', 'r', 0, 3), played('r', 'b', 0, 1)];
    const phoenix = computeStandings(teams, matches).find((t) => t.name === 'Phoenix');
    expect(phoenix.played).toBe(6);
    expect(phoenix.form).toEqual(['D', 'L', 'W', 'W', 'L']);
  });

  test('recentForm works across any list of matches with a side picker', () => {
    const matches = [played('r', 'b', 2, 1), played('b', 'r', 1, 1), { status: 'live', teamA: { id: 'r' }, teamB: { id: 'b' } }];
    const sideOfPhoenix = (m) => (m.teamA.id === 'r' ? 'a' : m.teamB.id === 'r' ? 'b' : null);
    expect(recentForm(matches, sideOfPhoenix)).toEqual(['W', 'D']);
    expect(recentForm([], sideOfPhoenix)).toEqual([]);
  });
});
