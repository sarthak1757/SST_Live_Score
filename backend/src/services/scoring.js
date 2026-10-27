// Pure scoring functions - no database, no Express. Easy to unit test.
const { SPORTS, END_SET, END_INNINGS } = require('../config/sports');

const WIN_POINTS = 3;
const DRAW_POINTS = 1;

// Allowed status changes: scheduled -> live -> finished
const TRANSITIONS = {
  scheduled: ['live'],
  live: ['finished'],
  finished: [],
};

function canTransition(from, to) {
  const allowed = TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

// Sort events oldest -> newest (by time, then by _id/insertion order as a tie-break).
function sortEvents(events) {
  const copy = events.slice();
  copy.sort(function (x, y) {
    const diff = new Date(x.createdAt).getTime() - new Date(y.createdAt).getTime();
    if (diff !== 0) return diff;
    return String(x._id || '').localeCompare(String(y._id || ''));
  });
  return copy;
}

// Returns the event that Undo would remove (the newest one) and the events left.
function undoLast(events) {
  const sorted = sortEvents(events);
  if (sorted.length === 0) return { removed: null, remaining: [] };
  const removed = sorted[sorted.length - 1];
  return { removed: removed, remaining: sorted.slice(0, sorted.length - 1) };
}

// Number of sets a team needs to win the match (best of 3 -> 2).
function setsToWin(sport) {
  const config = SPORTS[sport];
  if (!config || !config.sets) return null;
  return Math.ceil(config.sets.bestOf / 2);
}

// Compute the full score of a match from its events.
//   a, b           -> the main score shown on screen
//                     (total points, or sets won for set sports)
//   currentSet     -> points in the set being played (set sports only)
//   sets           -> finished sets [{ number, a, b, winner }]
//   matchDecided   -> true when a team already won the match on sets
function computeScore(events, sport, teamAId, teamBId, options) {
  const idA = String(teamAId);
  const idB = String(teamBId);
  const config = SPORTS[sport];
  if (config && config.cricket) return computeCricket(events, config, (options && options.overs) || config.cricket.overs);
  const isSetSport = !!(config && config.sets);

  const score = { a: 0, b: 0, sets: [], currentSet: null, matchDecided: false };

  let totalA = 0;
  let totalB = 0;
  let setA = 0;
  let setB = 0;
  let setsWonA = 0;
  let setsWonB = 0;

  const sorted = sortEvents(events);
  for (let i = 0; i < sorted.length; i++) {
    const ev = sorted[i];
    if (ev.type === END_SET) {
      if (setA === setB) continue; // a tied set can't be closed (also blocked by the API)
      const winner = setA > setB ? 'a' : 'b';
      if (winner === 'a') setsWonA++;
      else setsWonB++;
      score.sets.push({ number: score.sets.length + 1, a: setA, b: setB, winner: winner });
      setA = 0;
      setB = 0;
      continue;
    }
    const points = Number(ev.points) || 0;
    if (String(ev.team) === idA) {
      totalA += points;
      setA += points;
    } else if (String(ev.team) === idB) {
      totalB += points;
      setB += points;
    }
  }

  if (isSetSport) {
    score.a = setsWonA;
    score.b = setsWonB;
    score.currentSet = { number: score.sets.length + 1, a: setA, b: setB };
    const needed = setsToWin(sport);
    score.matchDecided = setsWonA >= needed || setsWonB >= needed;
  } else {
    score.a = totalA;
    score.b = totalB;
  }
  return score;
}

function oversText(balls) {
  return Math.floor(balls / 6) + '.' + (balls % 6);
}

// Cricket: Team A bats first, then Team B chases. An innings ends when the batting side
// is all out, the overs run out, the chase passes the target, or the scorer ends it.
// Main score (a, b) = runs, so getWinner() and standings work exactly like other sports.
function computeCricket(events, config, overs) {
  const maxBalls = overs * 6;
  const maxWickets = config.cricket.wickets;
  const innings = [
    { side: 'a', runs: 0, wickets: 0, balls: 0 },
    { side: 'b', runs: 0, wickets: 0, balls: 0 },
  ];
  let current = 0; // 0 = first innings, 1 = chase, 2 = match over

  const sorted = sortEvents(events);
  for (let i = 0; i < sorted.length && current < 2; i++) {
    const ev = sorted[i];
    if (ev.type === END_INNINGS) {
      current++;
      continue;
    }
    const action = config.actions[ev.type];
    if (!action) continue;
    const inn = innings[current];
    inn.runs += Number(ev.points) || 0;
    if (action.ball) inn.balls++;
    if (action.wicket) inn.wickets++;
    const chased = current === 1 && inn.runs > innings[0].runs;
    if (inn.wickets >= maxWickets || inn.balls >= maxBalls || chased) current++;
  }

  innings.forEach(function (inn) { inn.overs = oversText(inn.balls); });
  let result = null;
  if (current === 2) {
    const a = innings[0].runs;
    const b = innings[1].runs;
    if (b > a) {
      const left = maxWickets - innings[1].wickets;
      result = { winner: 'b', text: 'won by ' + left + (left === 1 ? ' wicket' : ' wickets') };
    } else if (a > b) {
      result = { winner: 'a', text: 'won by ' + (a - b) + (a - b === 1 ? ' run' : ' runs') };
    } else {
      result = { winner: 'draw', text: 'Match tied' };
    }
  }

  return {
    a: innings[0].runs,
    b: innings[1].runs,
    sets: [],
    currentSet: null,
    matchDecided: current === 2,
    cricket: {
      innings: innings,
      current: current,
      battingSide: current === 0 ? 'a' : current === 1 ? 'b' : null,
      target: current >= 1 ? innings[0].runs + 1 : null,
      ballsLeft: current === 1 ? maxBalls - innings[1].balls : null,
      maxOvers: overs,
      maxWickets: maxWickets,
      result: result,
    },
  };
}

// 'a', 'b' or 'draw' based on the main score.
function getWinner(score) {
  if (score.a > score.b) return 'a';
  if (score.b > score.a) return 'b';
  return 'draw';
}

// 'W', 'D' or 'L' for one side ('a' or 'b') of a finished match.
function resultFor(match, side) {
  if (match.winner === 'draw' || !match.winner) return 'D';
  return match.winner === side ? 'W' : 'L';
}

// Time used to order results (oldest first).
function matchTime(m) {
  return new Date(m.finishedAt || m.scheduledAt || 0).getTime();
}

// Last `count` results (oldest -> newest) for a team from a list of finished matches.
// isSide(match) returns 'a', 'b' or null for that team.
function recentForm(matches, isSide, count) {
  const played = matches.filter(function (m) { return m.status === 'finished' && isSide(m); });
  played.sort(function (x, y) { return matchTime(x) - matchTime(y); });
  return played.slice(-(count || 5)).map(function (m) { return resultFor(m, isSide(m)); });
}

// Build the standings table from the teams of a tournament and its matches.
// Only matches with status "finished" are counted. "Goals" are the main score
// (goals, points, sets won or runs - whatever the sport uses).
// Sorted by points, then goal difference, then goals for, then wins, then name.
function computeStandings(teams, matches) {
  const table = {};
  for (let i = 0; i < teams.length; i++) {
    const id = String(teams[i]._id);
    table[id] = { teamId: id, name: teams[i].name, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0, form: [] };
  }

  const finished = matches.filter(function (m) { return m.status === 'finished'; });
  finished.sort(function (x, y) { return matchTime(x) - matchTime(y); });

  for (let i = 0; i < finished.length; i++) {
    const m = finished[i];
    const rowA = table[String(m.teamA.id)];
    const rowB = table[String(m.teamB.id)];
    if (!rowA || !rowB) continue;

    const scoreA = m.finalScore && typeof m.finalScore.a === 'number' ? m.finalScore.a : 0;
    const scoreB = m.finalScore && typeof m.finalScore.b === 'number' ? m.finalScore.b : 0;
    rowA.played++;
    rowB.played++;
    rowA.gf += scoreA;
    rowA.ga += scoreB;
    rowB.gf += scoreB;
    rowB.ga += scoreA;
    rowA.form.push(resultFor(m, 'a'));
    rowB.form.push(resultFor(m, 'b'));

    if (m.winner === 'a') {
      rowA.won++;
      rowA.points += WIN_POINTS;
      rowB.lost++;
    } else if (m.winner === 'b') {
      rowB.won++;
      rowB.points += WIN_POINTS;
      rowA.lost++;
    } else {
      rowA.drawn++;
      rowB.drawn++;
      rowA.points += DRAW_POINTS;
      rowB.points += DRAW_POINTS;
    }
  }

  const rows = Object.keys(table).map(function (id) {
    const row = table[id];
    row.gd = row.gf - row.ga;
    row.form = row.form.slice(-5); // last five, oldest first
    return row;
  });
  rows.sort(function (x, y) {
    if (y.points !== x.points) return y.points - x.points;
    if (y.gd !== x.gd) return y.gd - x.gd;
    if (y.gf !== x.gf) return y.gf - x.gf;
    if (y.won !== x.won) return y.won - x.won;
    return x.name.localeCompare(y.name);
  });
  return rows;
}

// Points per player from events (events without a player are ignored).
// Used for "top scorers" in one match and the leaderboard across a tournament.
function topPlayers(events) {
  const map = {};
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (!ev.player || ev.type === END_SET) continue;
    const key = String(ev.player);
    if (!map[key]) map[key] = { playerId: key, name: ev.playerName, jersey: ev.jersey, team: String(ev.team), points: 0, actions: 0 };
    map[key].points += Number(ev.points) || 0;
    map[key].actions++;
  }
  const rows = Object.keys(map).map(function (k) { return map[k]; });
  rows.sort(function (x, y) {
    if (y.points !== x.points) return y.points - x.points;
    if (y.actions !== x.actions) return y.actions - x.actions;
    return String(x.name).localeCompare(String(y.name));
  });
  return rows;
}

module.exports = {
  topPlayers,
  oversText,
  canTransition,
  sortEvents,
  undoLast,
  setsToWin,
  computeScore,
  getWinner,
  computeStandings,
  resultFor,
  recentForm,
  WIN_POINTS,
  DRAW_POINTS,
};
