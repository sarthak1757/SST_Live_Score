const {
  computeScore,
  undoLast,
  computeStandings,
  canTransition,
  getWinner,
} = require('../src/services/scoring');

const A = 'teamA';
const B = 'teamB';
let clock = 0;
// helper: builds an event with an increasing timestamp
function ev(team, type, points) {
  clock += 1000;
  return { _id: 'e' + clock, team: team, type: type, points: points, createdAt: new Date(clock) };
}

describe('computeScore', () => {
  test('football: counts goals per team', () => {
    const events = [ev(A, 'goal', 1), ev(B, 'goal', 1), ev(A, 'goal', 1)];
    const s = computeScore(events, 'football', A, B);
    expect(s.a).toBe(2);
    expect(s.b).toBe(1);
  });

  test('basketball and kabaddi: sums different point values', () => {
    const bball = [ev(A, 'point3', 3), ev(A, 'point2', 2), ev(B, 'point1', 1)];
    const s1 = computeScore(bball, 'basketball', A, B);
    expect([s1.a, s1.b]).toEqual([5, 1]);

    const kabaddi = [ev(B, 'raid', 1), ev(B, 'bonus', 1), ev(A, 'allout', 2), ev(A, 'tackle', 1)];
    const s2 = computeScore(kabaddi, 'kabaddi', A, B);
    expect([s2.a, s2.b]).toEqual([3, 2]);
  });

  test('score is 0-0 with no events', () => {
    const s = computeScore([], 'football', A, B);
    expect([s.a, s.b]).toEqual([0, 0]);
  });
});

describe('undoLast', () => {
  test('removes only the newest event and the score drops accordingly', () => {
    const events = [ev(A, 'point3', 3), ev(B, 'point2', 2), ev(A, 'point2', 2)];
    const result = undoLast(events);
    expect(result.removed.type).toBe('point2');
    expect(result.removed.team).toBe(A);
    const s = computeScore(result.remaining, 'basketball', A, B);
    expect([s.a, s.b]).toEqual([3, 2]);
  });

  test('undo on an empty list removes nothing', () => {
    expect(undoLast([]).removed).toBeNull();
  });
});

describe('set-based sports (best of 3)', () => {
  function points(team, n) {
    const list = [];
    for (let i = 0; i < n; i++) list.push(ev(team, 'point', 1));
    return list;
  }

  test('end set records the set winner and resets set points', () => {
    const events = [].concat(points(A, 3), points(B, 1), [ev(null, 'end_set', 0)], points(B, 2));
    const s = computeScore(events, 'volleyball', A, B);
    expect([s.a, s.b]).toEqual([1, 0]); // sets won
    expect(s.sets).toHaveLength(1);
    expect(s.sets[0]).toMatchObject({ a: 3, b: 1, winner: 'a' });
    expect(s.currentSet).toMatchObject({ number: 2, a: 0, b: 2 });
    expect(s.matchDecided).toBe(false);
  });

  test('match is decided once a team wins 2 sets', () => {
    const events = [].concat(
      points(A, 2), [ev(null, 'end_set', 0)],
      points(B, 2), [ev(null, 'end_set', 0)],
      points(B, 1), [ev(null, 'end_set', 0)]
    );
    const s = computeScore(events, 'badminton', A, B);
    expect([s.a, s.b]).toEqual([1, 2]);
    expect(s.matchDecided).toBe(true);
    expect(getWinner(s)).toBe('b');
  });

  test('undoing an end_set re-opens the set', () => {
    const events = [].concat(points(A, 2), [ev(null, 'end_set', 0)]);
    const after = undoLast(events).remaining;
    const s = computeScore(after, 'volleyball', A, B);
    expect(s.sets).toHaveLength(0);
    expect(s.currentSet).toMatchObject({ number: 1, a: 2, b: 0 });
  });
});

describe('standings', () => {
  const teams = [
    { _id: 't1', name: 'Red' },
    { _id: 't2', name: 'Blue' },
    { _id: 't3', name: 'Green' },
  ];
  function match(a, b, winner, status) {
    return { teamA: { id: a }, teamB: { id: b }, winner: winner, status: status || 'finished' };
  }

  test('win = 3, draw = 1, loss = 0, sorted by points', () => {
    const matches = [match('t1', 't2', 'a'), match('t2', 't3', 'draw'), match('t1', 't3', 'b')];
    const table = computeStandings(teams, matches);
    // Green: 1 win + 1 draw = 4, Red: 1 win + 1 loss = 3, Blue: 1 draw + 1 loss = 1
    expect(table.map((r) => r.name)).toEqual(['Green', 'Red', 'Blue']);
    expect(table[0]).toMatchObject({ played: 2, won: 1, drawn: 1, lost: 0, points: 4 });
    expect(table[1]).toMatchObject({ played: 2, won: 1, drawn: 0, lost: 1, points: 3 });
    expect(table[2]).toMatchObject({ played: 2, won: 0, drawn: 1, lost: 1, points: 1 });
  });

  test('ignores matches that are not finished', () => {
    const matches = [match('t1', 't2', null, 'live'), match('t1', 't3', null, 'scheduled')];
    const table = computeStandings(teams, matches);
    expect(table.every((r) => r.played === 0 && r.points === 0)).toBe(true);
  });
});

describe('status transitions', () => {
  test('only scheduled -> live -> finished is allowed', () => {
    expect(canTransition('scheduled', 'live')).toBe(true);
    expect(canTransition('live', 'finished')).toBe(true);
    expect(canTransition('scheduled', 'finished')).toBe(false);
    expect(canTransition('finished', 'live')).toBe(false);
    expect(canTransition('finished', 'finished')).toBe(false);
  });
});
