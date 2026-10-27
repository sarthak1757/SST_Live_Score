// Per-sport match statistics and head-to-head records - pure functions.
const { SPORTS } = require('../config/sports');

function norm(name) {
  return String(name || '').trim().toLowerCase();
}

// Rows of { label, a, b } for the Stats tab.
// Cricket: runs, wickets, overs, boundaries, extras. Other sports: one row per scoring action
// (count of actions, or points for sports with statMode 'points' such as kabaddi), plus totals.
function matchStats(events, sport, teamAId, teamBId, score) {
  const config = SPORTS[sport];
  const idA = String(teamAId);
  const idB = String(teamBId);
  function sideOf(ev) {
    if (String(ev.team) === idA) return 'a';
    if (String(ev.team) === idB) return 'b';
    return null;
  }
  function count(types, usePoints) {
    const out = { a: 0, b: 0 };
    events.forEach(function (ev) {
      const side = sideOf(ev);
      if (side && types.indexOf(ev.type) !== -1) out[side] += usePoints ? Number(ev.points) || 0 : 1;
    });
    return out;
  }

  const rows = [];
  if (config.cricket && score && score.cricket) {
    const ia = score.cricket.innings[0];
    const ib = score.cricket.innings[1];
    function runRate(inn) { return inn.balls ? (inn.runs / (inn.balls / 6)).toFixed(2) : '0.00'; }
    rows.push({ label: 'Runs', a: ia.runs, b: ib.runs });
    rows.push({ label: 'Wickets lost', a: ia.wickets, b: ib.wickets });
    rows.push({ label: 'Overs', a: ia.overs, b: ib.overs });
    rows.push({ label: 'Run rate', a: runRate(ia), b: runRate(ib) });
    const fours = count(['four']);
    const sixes = count(['six']);
    const extras = count(['wide', 'noball'], true);
    const dots = count(['dot']);
    rows.push({ label: 'Fours', a: fours.a, b: fours.b });
    rows.push({ label: 'Sixes', a: sixes.a, b: sixes.b });
    rows.push({ label: 'Extras', a: extras.a, b: extras.b });
    rows.push({ label: 'Dot balls', a: dots.a, b: dots.b });
    return rows;
  }

  const usePoints = config.statMode === 'points';
  Object.keys(config.actions).forEach(function (key) {
    const action = config.actions[key];
    const c = count([key], usePoints && action.points > 0);
    rows.push({ label: action.stat || action.label, a: c.a, b: c.b });
  });
  if (sport !== 'football') { // football's "Goals" row already is the total
    const total = count(Object.keys(config.actions), true);
    rows.push({ label: 'Total points', a: total.a, b: total.b });
  }
  if (config.sets && score) rows.push({ label: 'Sets won', a: score.a, b: score.b });
  return rows;
}

// Finished matches between two houses (by name, any tournament/sport), newest first,
// with a win/draw/loss summary from the point of view of nameA.
function headToHead(matches, nameA, nameB, excludeId) {
  const a = norm(nameA);
  const b = norm(nameB);
  const list = matches.filter(function (m) {
    if (m.status !== 'finished') return false;
    if (excludeId && String(m._id || m.id) === String(excludeId)) return false;
    const x = norm(m.teamA.name);
    const y = norm(m.teamB.name);
    return (x === a && y === b) || (x === b && y === a);
  });
  list.sort(function (p, q) { return new Date(q.finishedAt || q.scheduledAt) - new Date(p.finishedAt || p.scheduledAt); });

  const summary = { played: list.length, aWins: 0, bWins: 0, draws: 0 };
  list.forEach(function (m) {
    if (m.winner !== 'a' && m.winner !== 'b') { summary.draws++; return; }
    const winnerName = norm(m.winner === 'a' ? m.teamA.name : m.teamB.name);
    if (winnerName === a) summary.aWins++;
    else summary.bWins++;
  });
  return { summary: summary, matches: list };
}

module.exports = { matchStats, headToHead };
