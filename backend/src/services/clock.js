// Match clock for timed sports - pure functions (the route saves the result on the match).
// States: not_started -> running <-> paused -> break (between periods) -> running ... -> ended
const { httpError } = require('../middleware/errors');

const ACTIONS = ['start', 'pause', 'resume', 'end_period'];

function initialClock() {
  return { state: 'not_started', period: 0, elapsedMs: 0, runningSince: null };
}

// Milliseconds played in the current period at time `now`.
function elapsed(clock, now) {
  if (!clock) return 0;
  let ms = clock.elapsedMs || 0;
  if (clock.state === 'running' && clock.runningSince) ms += now - new Date(clock.runningSince).getTime();
  return Math.max(0, ms);
}

function applyClock(clock, action, timed, now) {
  const c = clock && clock.state ? clock : initialClock();
  const next = { state: c.state, period: c.period, elapsedMs: c.elapsedMs || 0, runningSince: c.runningSince || null };

  if (action === 'start') {
    if (c.state === 'not_started') { next.period = 1; }
    else if (c.state === 'break') { next.period = c.period + 1; }
    else throw httpError(409, c.state === 'ended' ? 'The clock has ended' : 'The clock is already started');
    next.state = 'running';
    next.elapsedMs = 0;
    next.runningSince = new Date(now);
  } else if (action === 'pause') {
    if (c.state !== 'running') throw httpError(409, 'The clock is not running');
    next.state = 'paused';
    next.elapsedMs = elapsed(c, now);
    next.runningSince = null;
  } else if (action === 'resume') {
    if (c.state !== 'paused') throw httpError(409, 'The clock is not paused');
    next.state = 'running';
    next.runningSince = new Date(now);
  } else if (action === 'end_period') {
    if (c.state !== 'running' && c.state !== 'paused') throw httpError(409, 'No period is being played');
    next.elapsedMs = elapsed(c, now);
    next.runningSince = null;
    next.state = c.period >= timed.periods ? 'ended' : 'break';
  } else {
    throw httpError(400, 'Unknown clock action');
  }
  return next;
}

function ordinal(n) {
  return n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
}

// "1st half", "Q3"
function periodLabel(period, timed) {
  if (timed.periodName === 'quarter') return 'Q' + period;
  return ordinal(period) + ' ' + timed.periodName;
}

// Text for the scoreboard, e.g. "1st half", "Half-time", "End of Q2", "Full time".
function clockLabel(clock, timed) {
  if (!clock || clock.state === 'not_started') return 'Not started';
  if (clock.state === 'ended') return 'Full time';
  if (clock.state === 'break') return timed.periods === 2 && clock.period === 1 ? 'Half-time' : 'End of ' + periodLabel(clock.period, timed);
  return periodLabel(clock.period, timed) + (clock.state === 'paused' ? ' (paused)' : '');
}

// Match minute for an event, e.g. 34 in the 2nd half of a 30-minute-half game. null before kick-off.
function matchMinute(clock, timed, now) {
  if (!clock || clock.state === 'not_started' || !clock.period) return null;
  return (clock.period - 1) * timed.periodMinutes + Math.floor(elapsed(clock, now) / 60000) + 1;
}

// What the browser needs to show and tick the clock (no server-time skew: elapsed is computed here).
function publicClock(clock, timed, now) {
  if (!timed) return null;
  const c = clock && clock.state ? clock : initialClock();
  return {
    state: c.state,
    period: c.period,
    periods: timed.periods,
    periodMinutes: timed.periodMinutes,
    label: clockLabel(c, timed),
    elapsedMs: elapsed(c, now),
    running: c.state === 'running',
    offsetMinutes: c.period ? (c.period - 1) * timed.periodMinutes : 0,
  };
}

module.exports = { ACTIONS, initialClock, elapsed, applyClock, clockLabel, matchMinute, publicClock };
