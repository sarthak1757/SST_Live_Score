const { httpError } = require('../middleware/errors');

// Validates a roster: [{ name, jersey }]. Returns a cleaned list or throws a 400 error.
function validateRoster(list) {
  if (!Array.isArray(list)) throw httpError(400, 'Players must be a list');
  if (list.length > 30) throw httpError(400, 'A roster can have at most 30 players');
  const cleaned = [];
  const usedJerseys = {};
  for (let i = 0; i < list.length; i++) {
    const item = list[i] || {};
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const blank = item.jersey === undefined || item.jersey === null || item.jersey === '';
    const jersey = blank ? null : Number(item.jersey);
    if (!name || name.length > 40) throw httpError(400, 'Each player needs a name (max 40 characters)');
    if (!blank && (!Number.isInteger(jersey) || jersey < 0 || jersey > 99)) throw httpError(400, 'Jersey number must be 0-99 (' + name + ')');
    if (!blank) {
      if (usedJerseys[jersey]) throw httpError(400, 'Jersey number ' + jersey + ' is used twice');
      usedJerseys[jersey] = true;
    }
    cleaned.push({ name: name, jersey: jersey });
  }
  return cleaned;
}

// What the PUBLIC may see about a player: name, team-side jersey, id. Nothing else.
// Every public response builds players through this function so email, roll no. and batch cannot leak.
function publicPlayer(p) {
  return { id: p._id || p.id, name: p.name, jersey: p.jersey === undefined ? null : p.jersey };
}

// Admin-only view: also includes the private fields.
function adminPlayer(p) {
  return { id: p._id || p.id, name: p.name, jersey: p.jersey === undefined ? null : p.jersey, email: p.email || null, rollNo: p.rollNo || null, batch: p.batch || null };
}

// Is this jersey already worn by another player of the team? Returns that player or null.
function jerseyOwner(team, jersey, exceptPlayerId) {
  const players = (team && team.players) || [];
  for (let i = 0; i < players.length; i++) {
    if (players[i].jersey === jersey && String(players[i]._id || players[i].id) !== String(exceptPlayerId)) return players[i];
  }
  return null;
}

module.exports = { validateRoster, publicPlayer, adminPlayer, jerseyOwner };
