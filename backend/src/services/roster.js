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
    const jersey = Number(item.jersey);
    if (!name || name.length > 40) throw httpError(400, 'Each player needs a name (max 40 characters)');
    if (!Number.isInteger(jersey) || jersey < 0 || jersey > 99) throw httpError(400, 'Jersey number must be 0-99 (' + name + ')');
    if (usedJerseys[jersey]) throw httpError(400, 'Jersey number ' + jersey + ' is used twice');
    usedJerseys[jersey] = true;
    cleaned.push({ name: name, jersey: jersey });
  }
  return cleaned;
}

module.exports = { validateRoster };
