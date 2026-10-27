const clock = require('../src/services/clock');
const { isSentOff, topPlayers } = require('../src/services/scoring');

const football = { periods: 2, periodMinutes: 30, periodName: 'half' };
const basketball = { periods: 4, periodMinutes: 10, periodName: 'quarter' };
const MIN = 60000;

describe('match clock', () => {
  test('start, pause, resume and half-time keep the right elapsed time and minute', () => {
    let c = clock.applyClock(null, 'start', football, 0);
    expect(c).toMatchObject({ state: 'running', period: 1 });
    expect(clock.matchMinute(c, football, 12 * MIN + 5000)).toBe(13);
    c = clock.applyClock(c, 'pause', football, 20 * MIN);
    expect(clock.elapsed(c, 99 * MIN)).toBe(20 * MIN); // frozen while paused
    c = clock.applyClock(c, 'resume', football, 25 * MIN);
    expect(clock.elapsed(c, 35 * MIN)).toBe(30 * MIN);
    c = clock.applyClock(c, 'end_period', football, 35 * MIN);
    expect(c.state).toBe('break');
    expect(clock.clockLabel(c, football)).toBe('Half-time');
    c = clock.applyClock(c, 'start', football, 50 * MIN);
    expect(clock.clockLabel(c, football)).toBe('2nd half');
    expect(clock.matchMinute(c, football, 54 * MIN)).toBe(35); // 30 + 4 + 1
    c = clock.applyClock(c, 'end_period', football, 80 * MIN);
    expect([c.state, clock.clockLabel(c, football)]).toEqual(['ended', 'Full time']);
  });

  test('invalid clock changes are rejected', () => {
    expect(() => clock.applyClock(null, 'pause', football, 0)).toThrow(/not running/);
    const running = clock.applyClock(null, 'start', football, 0);
    expect(() => clock.applyClock(running, 'start', football, 1)).toThrow(/already started/);
    expect(() => clock.applyClock(running, 'resume', football, 1)).toThrow(/not paused/);
    expect(() => clock.applyClock(running, 'explode', football, 1)).toThrow(/Unknown/);
    const ended = { state: 'ended', period: 2, elapsedMs: 0 };
    expect(() => clock.applyClock(ended, 'start', football, 1)).toThrow(/ended/);
  });

  test('quarters are labelled Q1..Q4 and minutes carry over between periods', () => {
    let c = clock.applyClock(null, 'start', basketball, 0);
    c = clock.applyClock(c, 'end_period', basketball, 10 * MIN);
    expect(clock.clockLabel(c, basketball)).toBe('End of Q1');
    c = clock.applyClock(c, 'start', basketball, 12 * MIN);
    expect(clock.clockLabel(c, basketball)).toBe('Q2');
    expect(clock.matchMinute(c, basketball, 15 * MIN)).toBe(14);
    expect(clock.matchMinute(clock.initialClock(), basketball, 0)).toBeNull();
  });
});

describe('cards', () => {
  const events = [
    { type: 'goal', team: 'A', points: 1, player: 'p7', playerName: 'Aman', jersey: 7 },
    { type: 'yellow', team: 'A', points: 0, player: 'p7', playerName: 'Aman', jersey: 7 },
    { type: 'red', team: 'B', points: 0, player: 'p9', playerName: 'Ravi', jersey: 9 },
  ];
  test('a red card sends the player off; a yellow does not', () => {
    expect(isSentOff(events, 'p9')).toBe(true);
    expect(isSentOff(events, 'p7')).toBe(false);
  });
  test('cards do not count as scoring in top players', () => {
    const rows = topPlayers(events);
    expect(rows.map((r) => [r.name, r.points, r.actions])).toEqual([['Aman', 1, 1]]);
  });
});
