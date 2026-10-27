const { httpError } = require('../middleware/errors');

const REACTIONS = ['fire', 'clap', 'wow'];
const MAX_COMMENT = 200;

function validateReaction(type) {
  if (REACTIONS.indexOf(type) === -1) throw httpError(400, 'Unknown reaction');
  return type;
}

// A random id the browser keeps in localStorage, used to rate-limit reactions per browser.
function validateClientId(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(id)) throw httpError(400, 'Invalid client id');
  return id;
}

function validateComment(text) {
  const clean = typeof text === 'string' ? text.trim() : '';
  if (!clean) throw httpError(400, 'Comment cannot be empty');
  if (clean.length > MAX_COMMENT) throw httpError(400, 'Comments can be at most ' + MAX_COMMENT + ' characters');
  return clean;
}

// Public display name: the part of the email before "@" (full emails are never shown).
function displayName(email) {
  return String(email || '').split('@')[0] || 'user';
}

module.exports = { REACTIONS, validateReaction, validateClientId, validateComment, displayName };
