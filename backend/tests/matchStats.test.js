const { matchStats, headToHead } = require('../src/services/matchStats');
const { computeScore } = require('../src/services/scoring');

function ev(team, type, points) { return { team: team, type: type, points: points }; }
function row(rows, label) { const r = rows.find((x) => x.label === label); return r ? [r.a, r.b] : null; }

describe('match stats per sport', () => {
  test('football counts goals and cards', () => {
    const events = [ev('A', 'goal', 1), ev('A', 'goal', 1), ev('B', 'yellow', 0), ev('B', 'red', 0), ev('B', 'goal', 1)];
    const rows = matchStats(events, 'football', 'A', 'B');
    expect(row(rows, 'Goals')).toEqual([2, 1]);
    expect(row(rows, 'Yellow cards')).toEqual([0, 1]);
    expect(row(rows, 'Red cards')).toEqual([0, 1]);
  });

  test('kabaddi shows points per action type', () => {
    const events = [ev('A', 'raid', 1), ev('A', 'raid', 1), ev('A', 'allout', 2), ev('B', 'tackle', 1), ev('B', 'bonus', 1)];
    const rows = matchStats(events, 'kabaddi', 'A', 'B');
    expect(row(rows, 'Raid points')).toEqual([2, 0]);
    expect(row(rows, 'All-out points')).toEqual([2, 0]);
    expect(row(rows, 'Tackle points')).toEqual([0, 1]);
    expect(row(rows, 'Total points')).toEqual([4, 2]);
  });

  test('cricket shows runs, wickets, overs, boundaries and extras', () => {
    let t = 0;
    const balls = ['four', 'six', 'wide', 'wicket', 'dot', 'run1'].map((type) => ({ team: 'A', type, points: { four: 4, six: 6, wide: 1, wicket: 0, dot: 0, run1: 1 }[type], createdAt: new Date(++t) }));
    const score = computeScore(balls, 'cricket', 'A', 'B', { overs: 5 });
    const rows = matchStats(balls, 'cricket', 'A', 'B', score);
    expect(row(rows, 'Runs')).toEqual([12, 0]);
    expect(row(rows, 'Wickets lost')).toEqual([1, 0]);
    expect(row(rows, 'Overs')).toEqual(['0.5', '0.0']);
    expect(row(rows, 'Fours')).toEqual([1, 0]);
    expect(row(rows, 'Extras')).toEqual([1, 0]);
    expect(row(rows, 'Run rate')).toEqual(['14.40', '0.00']);
  });
});

describe('head-to-head', () => {
  const m = (id, a, b, winner, day) => ({ _id: id, status: 'finished', teamA: { name: a }, teamB: { name: b }, winner, finishedAt: new Date(2026, 0, day) });
  const matches = [
    m(1, 'Phoenix', 'Leo', 'a', 1),
    m(2, 'leo', 'PHOENIX', 'a', 2), // Leo won (home side), names differ in case
    m(3, 'Phoenix', 'Leo', 'draw', 3),
    m(4, 'Phoenix', 'Kong', 'a', 4), // other opponent
    { _id: 5, status: 'live', teamA: { name: 'Phoenix' }, teamB: { name: 'Leo' } },
    m(6, 'Leo', 'Phoenix', 'b', 5), // this match - excluded
  ];

  test('summary is from the first team point of view, newest first, case-insensitive', () => {
    const h = headToHead(matches, 'Phoenix', 'Leo', 6);
    expect(h.summary).toEqual({ played: 3, aWins: 1, bWins: 1, draws: 1 });
    expect(h.matches.map((x) => x._id)).toEqual([3, 2, 1]);
  });

  test('flipping the teams flips the wins; no meetings gives zeros', () => {
    // including match 6 (Phoenix won as the away side): Phoenix 2 wins, Leo 1, 1 draw
    expect(headToHead(matches, 'Phoenix', 'Leo').summary).toEqual({ played: 4, aWins: 2, bWins: 1, draws: 1 });
    expect(headToHead(matches, 'Leo', 'Phoenix').summary).toEqual({ played: 4, aWins: 1, bWins: 2, draws: 1 });
    expect(headToHead(matches, 'Kong', 'Tusker').summary).toEqual({ played: 0, aWins: 0, bWins: 0, draws: 0 });
  });
});
