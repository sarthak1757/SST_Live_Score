// Audit log helpers. buildEntry/describe are pure (unit tested); record() writes to MongoDB.
const ACTIONS = {
  'tournament.create': 'Created tournament',
  'roster.update': 'Updated roster',
  'bracket.semifinals': 'Generated semifinals',
  'bracket.final': 'Generated final',
  'match.create': 'Scheduled match',
  'match.delete': 'Deleted match',
  'match.start': 'Started match',
  'match.finish': 'Finished match',
  'score.add': 'Scored',
  'set.end': 'Ended set',
  'score.undo': 'Undid last action',
  'comment.delete': 'Deleted comment',
  'user.create': 'Created account',
};

function buildEntry(user, action, refs, details) {
  if (!ACTIONS[action]) throw new Error('Unknown audit action: ' + action);
  if (!user || !user.id) throw new Error('Audit entry needs a user');
  refs = refs || {};
  return {
    actor: user.id,
    role: user.role,
    action: action,
    match: refs.match || null,
    tournament: refs.tournament || null,
    details: details || {},
  };
}

// Human-readable one-liner, e.g. "Scored: Red +2 Raid point (#7 Aman)"
function describe(entry) {
  const d = entry.details || {};
  let text = ACTIONS[entry.action] || entry.action;
  if (entry.action === 'score.add') {
    text += ': ' + d.team + ' +' + d.points + ' ' + d.label + (d.player ? ' (' + d.player + ')' : '');
  } else if (entry.action === 'score.undo' && d.removed) {
    text += ': ' + (d.removed.team ? d.removed.team + ' ' : '') + d.removed.label + (d.removed.points ? ' (+' + d.removed.points + ')' : '');
  } else if (entry.action === 'match.finish') {
    text += ': ' + d.score + (d.winner ? ' - ' + d.winner : '');
  } else if (d.summary) {
    text += ': ' + d.summary;
  }
  return text;
}

// Writes an entry. A logging failure is reported but never breaks the user's action.
async function record(req, action, refs, details) {
  const AuditLog = require('../models/AuditLog');
  try {
    await AuditLog.create(buildEntry(req.user, action, refs, details));
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}

module.exports = { ACTIONS, buildEntry, describe, record };
