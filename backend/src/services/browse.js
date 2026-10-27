// Pure helpers for browsing and search across tournaments (houses, players, tournaments).
const { SPORTS } = require('../config/sports');
const { httpError } = require('../middleware/errors');
const { recentForm, resultFor } = require('./scoring');

function norm(text) {
  return String(text || '').trim().toLowerCase();
}

// One entry per house name (case-insensitive) across all tournaments.
function houseSummaries(tournaments) {
  const map = {};
  const order = [];
  tournaments.forEach(function (t) {
    (t.teams || []).forEach(function (team) {
      const key = norm(team.name);
      if (!map[key]) {
        map[key] = { name: team.name, tournaments: 0, sports: [], players: 0 };
        order.push(key);
      }
      const h = map[key];
      h.tournaments++;
      h.players += (team.players || []).length;
      const label = SPORTS[t.sport] ? SPORTS[t.sport].label : t.sport;
      if (h.sports.indexOf(label) === -1) h.sports.push(label);
    });
  });
  return order.map(function (k) { return map[k]; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
}

// Every roster entry as a flat list.
function playerList(tournaments) {
  const list = [];
  tournaments.forEach(function (t) {
    (t.teams || []).forEach(function (team) {
      (team.players || []).forEach(function (p) {
        list.push({
          id: String(p._id), name: p.name, jersey: p.jersey,
          team: team.name, teamId: String(team._id),
          tournamentId: String(t._id), tournamentName: t.name, sport: t.sport,
        });
      });
    });
  });
  list.sort(function (a, b) { return a.name.localeCompare(b.name) || a.tournamentName.localeCompare(b.tournamentName); });
  return list;
}

function validateQuery(q) {
  const clean = typeof q === 'string' ? q.trim() : '';
  if (clean.length < 2) throw httpError(400, 'Type at least 2 characters');
  if (clean.length > 50) throw httpError(400, 'Search is limited to 50 characters');
  return clean;
}

// Case-insensitive "contains" search. Players also match on house name or "#7".
function search(tournaments, q, limit) {
  const needle = norm(q);
  const max = limit || 6;
  const tours = tournaments
    .filter(function (t) { return norm(t.name).indexOf(needle) !== -1 || norm(SPORTS[t.sport] && SPORTS[t.sport].label).indexOf(needle) !== -1; })
    .slice(0, max)
    .map(function (t) { return { id: String(t._id), name: t.name, sport: t.sport }; });
  const teams = houseSummaries(tournaments).filter(function (h) { return norm(h.name).indexOf(needle) !== -1; }).slice(0, max);
  const players = playerList(tournaments).filter(function (p) {
    return norm(p.name).indexOf(needle) !== -1 || norm(p.team) === needle || '#' + p.jersey === needle;
  }).slice(0, max);
  return { tournaments: tours, teams: teams, players: players };
}

// Which side ('a'/'b') a house played in a match, by name (case-insensitive), or null.
function sideOfHouse(match, name) {
  const n = norm(name);
  if (norm(match.teamA.name) === n) return 'a';
  if (norm(match.teamB.name) === n) return 'b';
  return null;
}

// A house's record across every tournament and sport.
function teamRecord(matches, name) {
  const mine = matches.filter(function (m) { return sideOfHouse(m, name); });
  const record = { played: 0, won: 0, drawn: 0, lost: 0 };
  mine.forEach(function (m) {
    if (m.status !== 'finished') return;
    record.played++;
    const r = resultFor(m, sideOfHouse(m, name));
    if (r === 'W') record.won++;
    else if (r === 'L') record.lost++;
    else record.drawn++;
  });
  record.winRate = record.played ? Math.round((record.won / record.played) * 100) : 0;
  record.form = recentForm(mine, function (m) { return sideOfHouse(m, name); }, 5);
  return record;
}

// One player's numbers in one tournament, from their score events.
// breakdown: one row per action type with how many times and how many points.
function playerStats(events, sport) {
  const config = SPORTS[sport] || { actions: {} };
  const stats = { matches: 0, points: 0, actions: 0, yellow: 0, red: 0, breakdown: [] };
  const matches = {};
  const byType = {};
  events.forEach(function (ev) {
    matches[String(ev.match)] = true;
    if (ev.type === 'yellow') { stats.yellow++; return; }
    if (ev.type === 'red') { stats.red++; return; }
    stats.points += Number(ev.points) || 0;
    stats.actions++;
    if (!byType[ev.type]) byType[ev.type] = { label: config.actions[ev.type] ? config.actions[ev.type].label : ev.type, count: 0, points: 0 };
    byType[ev.type].count++;
    byType[ev.type].points += Number(ev.points) || 0;
  });
  stats.matches = Object.keys(matches).length;
  stats.breakdown = Object.keys(byType).map(function (k) { return byType[k]; }).sort(function (a, b) { return b.points - a.points || b.count - a.count; });
  return stats;
}

// Roster entries that are the same person: same name in the same house (any tournament).
function samePlayer(list, player) {
  return list.filter(function (p) { return norm(p.name) === norm(player.name) && norm(p.team) === norm(player.team); });
}

module.exports = { houseSummaries, playerList, validateQuery, search, norm, sideOfHouse, teamRecord, playerStats, samePlayer };
