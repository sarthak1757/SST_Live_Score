// Pure helpers for browsing and search across tournaments (houses, players, tournaments).
const { SPORTS } = require('../config/sports');
const { httpError } = require('../middleware/errors');

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

module.exports = { houseSummaries, playerList, validateQuery, search, norm };
