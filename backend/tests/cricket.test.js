const { computeScore, undoLast, getWinner } = require('../src/services/scoring');

const A = 'A';
const B = 'B';
const POINTS = { dot: 0, run1: 1, run2: 2, run3: 3, four: 4, six: 6, wide: 1, noball: 1, wicket: 0, end_innings: 0 };
let clock = 0;
// balls('A', 'four', 3) -> three "four" events for team A
function balls(team, type, n) {
  const list = [];
  for (let i = 0; i < (n || 1); i++) {
    clock += 1000;
    list.push({ _id: 'c' + clock, team: type === 'end_innings' ? null : team, type: type, points: POINTS[type], createdAt: new Date(clock) });
  }
  return list;
}
const score = (events, overs) => computeScore(events, 'cricket', A, B, { overs: overs || 2 });

describe('cricket', () => {
  test('runs, wickets and overs; wides and no-balls add a run but are not legal balls', () => {
    const s = score([].concat(balls(A, 'four'), balls(A, 'wide'), balls(A, 'noball'), balls(A, 'run1'), balls(A, 'wicket'), balls(A, 'six')));
    const inn = s.cricket.innings[0];
    expect([inn.runs, inn.wickets, inn.balls, inn.overs]).toEqual([13, 1, 4, '0.4']);
    expect(s.a).toBe(13);
    expect(s.cricket.battingSide).toBe('a');
    expect(s.matchDecided).toBe(false);
  });

  test('innings ends automatically when the overs run out, then the target is set', () => {
    // 2 overs = 12 legal balls
    const s = score([].concat(balls(A, 'run2', 12), balls(B, 'run1')));
    expect(s.cricket.innings[0]).toMatchObject({ runs: 24, overs: '2.0' });
    expect(s.cricket.battingSide).toBe('b');
    expect(s.cricket.target).toBe(25);
    expect(s.cricket.ballsLeft).toBe(11);
  });

  test('all out ends the innings; the chasing side wins by wickets once it passes the target', () => {
    const events = [].concat(balls(A, 'four'), balls(A, 'wicket', 10), balls(B, 'six'));
    const s = computeScore(events, 'cricket', A, B, { overs: 20 });
    expect(s.cricket.innings[0]).toMatchObject({ runs: 4, wickets: 10 });
    expect(s.matchDecided).toBe(true);
    expect(s.cricket.result).toEqual({ winner: 'b', text: 'won by 10 wickets' });
    expect(getWinner(s)).toBe('b');
  });

  test('defending side wins by runs; ending the innings early is allowed', () => {
    const events = [].concat(balls(A, 'six', 3), balls(A, 'end_innings'), balls(B, 'run1', 5), balls(B, 'end_innings'));
    const s = score(events);
    expect(s.cricket.result).toEqual({ winner: 'a', text: 'won by 13 runs' });
    expect([s.a, s.b]).toEqual([18, 5]);
  });

  test('undoing the ball that ended the innings puts the first team back in to bat', () => {
    const events = [].concat(balls(A, 'run1', 11), balls(A, 'four'));
    expect(score(events).cricket.battingSide).toBe('b');
    const s = score(undoLast(events).remaining);
    expect(s.cricket.battingSide).toBe('a');
    expect(s.cricket.innings[0]).toMatchObject({ runs: 11, overs: '1.5' });
  });
});
