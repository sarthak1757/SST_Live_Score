const { httpError } = require('../middleware/errors');

const MAX_FOLLOWS = 20;

function normalize(name) {
  return String(name || '').trim().toLowerCase();
}

// Unique house names across all tournaments (first spelling wins), sorted.
function houseNames(tournaments) {
  const seen = {};
  const list = [];
  for (let i = 0; i < tournaments.length; i++) {
    const teams = tournaments[i].teams || [];
    for (let j = 0; j < teams.length; j++) {
      const key = normalize(teams[j].name);
      if (key && !seen[key]) { seen[key] = true; list.push(teams[j].name); }
    }
  }
  list.sort(function (a, b) { return a.localeCompare(b); });
  return list;
}

// Validates a follow list against the existing houses. Returns canonical names, no duplicates.
function validateFollows(list, existing) {
  if (!Array.isArray(list)) throw httpError(400, 'Houses must be a list');
  const byKey = {};
  existing.forEach(function (n) { byKey[normalize(n)] = n; });
  const out = [];
  const seen = {};
  for (let i = 0; i < list.length; i++) {
    const key = normalize(list[i]);
    if (!byKey[key]) throw httpError(400, 'Unknown house: ' + String(list[i]).slice(0, 40));
    if (!seen[key]) { seen[key] = true; out.push(byKey[key]); }
  }
  if (out.length > MAX_FOLLOWS) throw httpError(400, 'You can follow at most ' + MAX_FOLLOWS + ' houses');
  return out;
}

// Matches where either team is a followed house.
function matchesForHouses(matches, follows) {
  const wanted = {};
  follows.forEach(function (n) { wanted[normalize(n)] = true; });
  return matches.filter(function (m) {
    return wanted[normalize(m.teamA.name)] || wanted[normalize(m.teamB.name)];
  });
}

module.exports = { houseNames, validateFollows, matchesForHouses, normalize };
