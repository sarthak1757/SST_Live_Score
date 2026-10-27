const express = require('express');
const mongoose = require('mongoose');
const Match = require('../models/Match');
const Tournament = require('../models/Tournament');
const ScoreEvent = require('../models/ScoreEvent');
const { SPORTS, END_SET, END_INNINGS } = require('../config/sports');
const { requireAuth, requireRole } = require('../middleware/auth');
const { wrap, httpError } = require('../middleware/errors');
const { computeScore, getWinner, undoLast, canTransition, isSentOff } = require('../services/scoring');
const clock = require('../services/clock');
const { headToHead } = require('../services/matchStats');
const { buildSnapshot, listWithScores } = require('../services/snapshot');
const sse = require('../services/sse');
const Comment = require('../models/Comment');
const User = require('../models/User');
const { createLimiter } = require('../services/rateLimit');
const engagement = require('../services/engagement');
const audit = require('../services/audit');

// Reactions: 1 per 1.5s per browser, and 60 per minute per IP (so a script can't fake many browsers).
const reactPerBrowser = createLimiter(1, 1500);
const reactPerIp = createLimiter(60, 60 * 1000);
// Comments: 3 per 30s per user.
const commentPerUser = createLimiter(3, 30 * 1000);

const router = express.Router();
const STATUSES = ['scheduled', 'live', 'finished'];
const canScore = [requireAuth, requireRole('admin', 'scorer')];

async function findMatchOr404(id) {
  if (!mongoose.isValidObjectId(id)) throw httpError(400, 'Invalid match id');
  const match = await Match.findById(id);
  if (!match) throw httpError(404, 'Match not found');
  return match;
}

// Sends the new state to everyone watching this match and replies to the scorer too.
async function respondAndBroadcast(res, match, status) {
  const snapshot = await buildSnapshot(match);
  sse.broadcast(match._id, snapshot);
  res.status(status || 200).json(snapshot);
}

// GET /api/matches?status=&sport=&tournament=   (public)
router.get(
  '/',
  wrap(async (req, res) => {
    const filter = {};
    if (req.query.status) {
      if (STATUSES.indexOf(req.query.status) === -1) throw httpError(400, 'Invalid status filter');
      filter.status = req.query.status;
    }
    if (req.query.sport) {
      if (!SPORTS[req.query.sport]) throw httpError(400, 'Invalid sport filter');
      filter.sport = req.query.sport;
    }
    if (req.query.tournament) {
      if (!mongoose.isValidObjectId(req.query.tournament)) throw httpError(400, 'Invalid tournament filter');
      filter.tournament = req.query.tournament;
    }
    const matches = await Match.find(filter).sort({ scheduledAt: 1 }).limit(300);
    res.json({ matches: await listWithScores(matches) });
  })
);

// POST /api/matches (admin) { tournament, teamA, teamB, scheduledAt }
router.post(
  '/',
  requireAuth,
  requireRole('admin'),
  wrap(async (req, res) => {
    const body = req.body;
    if (!mongoose.isValidObjectId(body.tournament)) throw httpError(400, 'Choose a tournament');
    if (!mongoose.isValidObjectId(body.teamA) || !mongoose.isValidObjectId(body.teamB)) {
      throw httpError(400, 'Choose both teams');
    }
    if (String(body.teamA) === String(body.teamB)) throw httpError(400, 'A team cannot play itself');
    const when = new Date(body.scheduledAt);
    if (!body.scheduledAt || isNaN(when.getTime())) throw httpError(400, 'Enter a valid date and time');

    const tournament = await Tournament.findById(body.tournament);
    if (!tournament) throw httpError(404, 'Tournament not found');
    const teamA = tournament.teams.id(body.teamA);
    const teamB = tournament.teams.id(body.teamB);
    if (!teamA || !teamB) throw httpError(400, 'Both teams must belong to the selected tournament');

    const match = await Match.create({
      tournament: tournament._id,
      tournamentName: tournament.name,
      sport: tournament.sport,
      overs: tournament.overs,
      teamA: { id: teamA._id, name: teamA.name },
      teamB: { id: teamB._id, name: teamB.name },
      scheduledAt: when,
    });
    await audit.record(req, 'match.create', { match: match._id, tournament: tournament._id }, { summary: teamA.name + ' vs ' + teamB.name });
    res.status(201).json(await buildSnapshot(match));
  })
);

// GET /api/matches/:id (public) -> match, score, event feed
router.get(
  '/:id',
  wrap(async (req, res) => {
    const match = await findMatchOr404(req.params.id);
    res.json(await buildSnapshot(match));
  })
);

// GET /api/matches/:id/stream (public) - Server-Sent Events
router.get(
  '/:id/stream',
  wrap(async (req, res) => {
    const match = await findMatchOr404(req.params.id);
    sse.subscribe(match._id, req, res, await buildSnapshot(match));
  })
);

// POST /api/matches/:id/start (scorer/admin)
router.post(
  '/:id/start',
  canScore,
  wrap(async (req, res) => {
    const match = await findMatchOr404(req.params.id);
    if (!canTransition(match.status, 'live')) {
      throw httpError(409, 'Cannot start a match that is ' + match.status);
    }
    // Conditional update: if two scorers click at once, only one succeeds.
    const updated = await Match.findOneAndUpdate(
      { _id: match._id, status: 'scheduled' },
      { status: 'live', startedAt: new Date() },
      { returnDocument: 'after' }
    );
    if (!updated) throw httpError(409, 'Match was already started');
    await audit.record(req, 'match.start', { match: updated._id, tournament: updated.tournament });
    await respondAndBroadcast(res, updated);
  })
);

// POST /api/matches/:id/finish (scorer/admin)
router.post(
  '/:id/finish',
  canScore,
  wrap(async (req, res) => {
    const match = await findMatchOr404(req.params.id);
    if (!canTransition(match.status, 'finished')) {
      throw httpError(409, match.status === 'finished' ? 'Match is already finished' : 'Start the match before finishing it');
    }
    const events = await ScoreEvent.find({ match: match._id }).lean();
    const score = computeScore(events, match.sport, match.teamA.id, match.teamB.id, { overs: match.overs });
    const winner = getWinner(score);
    if (match.stage !== 'group' && winner === 'draw') {
      throw httpError(409, 'Knockout matches cannot end in a draw - keep scoring until there is a winner');
    }
    const updated = await Match.findOneAndUpdate(
      { _id: match._id, status: 'live' },
      { status: 'finished', finishedAt: new Date(), winner: winner, finalScore: { a: score.a, b: score.b } },
      { returnDocument: 'after' }
    );
    if (!updated) throw httpError(409, 'Match was already finished');
    const winnerName = winner === 'a' ? updated.teamA.name + ' won' : winner === 'b' ? updated.teamB.name + ' won' : 'draw';
    await audit.record(req, 'match.finish', { match: updated._id, tournament: updated.tournament }, { score: score.a + '-' + score.b, winner: winnerName });
    await respondAndBroadcast(res, updated);
  })
);

// POST /api/matches/:id/events (scorer/admin) { team, type }   or { type: "end_set" }
router.post(
  '/:id/events',
  canScore,
  wrap(async (req, res) => {
    const match = await findMatchOr404(req.params.id);
    if (match.status === 'finished') throw httpError(409, 'This match is finished - scoring is closed');
    if (match.status !== 'live') throw httpError(409, 'Start the match before scoring');

    const type = req.body.type;
    if (typeof type !== 'string') throw httpError(400, 'Action type is required');
    const config = SPORTS[match.sport];

    const events = await ScoreEvent.find({ match: match._id }).lean();
    const score = computeScore(events, match.sport, match.teamA.id, match.teamB.id, { overs: match.overs });

    let eventData;
    if (type === END_INNINGS) {
      if (!config.cricket) throw httpError(400, 'Only cricket has innings');
      if (score.matchDecided) throw httpError(409, 'Match is already decided - click Finish');
      eventData = { match: match._id, type: END_INNINGS, points: 0, team: null };
    } else if (type === END_SET) {
      if (!config.sets) throw httpError(400, 'This sport does not have sets');
      if (score.matchDecided) throw httpError(409, 'Match is already decided - click Finish');
      if (score.currentSet.a === 0 && score.currentSet.b === 0) throw httpError(400, 'No points in this set yet');
      if (score.currentSet.a === score.currentSet.b) throw httpError(400, 'Set is tied - someone must lead to end the set');
      eventData = { match: match._id, type: END_SET, points: 0, team: null };
    } else {
      const action = config.actions[type];
      if (!action) throw httpError(400, 'Unknown action for ' + config.label);
      if (!mongoose.isValidObjectId(req.body.team)) throw httpError(400, 'Choose a team');
      const teamId = String(req.body.team);
      if (teamId !== String(match.teamA.id) && teamId !== String(match.teamB.id)) {
        throw httpError(400, 'That team is not playing in this match');
      }
      if (score.matchDecided) throw httpError(409, 'Match is already decided - click Finish');
      if (config.cricket) {
        const battingId = score.cricket.battingSide === 'a' ? String(match.teamA.id) : String(match.teamB.id);
        if (teamId !== battingId) {
          throw httpError(400, (teamId === String(match.teamA.id) ? match.teamA.name : match.teamB.name) + ' is not batting right now');
        }
      }
      eventData = { match: match._id, type: type, points: action.points, team: teamId };
      // Optional: who scored. Must be on that team's roster.
      if (!action.extra && req.body.player !== undefined && req.body.player !== null && req.body.player !== '') { // extras are not a batter's runs
        if (!mongoose.isValidObjectId(req.body.player)) throw httpError(400, 'Invalid player');
        const tournament = await Tournament.findById(match.tournament);
        const team = tournament ? tournament.teams.id(teamId) : null;
        const player = team ? team.players.id(req.body.player) : null;
        if (!player) throw httpError(400, "That player is not on this team's roster");
        if (isSentOff(events, player._id)) throw httpError(400, '#' + player.jersey + ' ' + player.name + ' has been sent off');
        eventData.player = player._id;
        eventData.playerName = player.name;
        eventData.jersey = player.jersey;
      }
    }

    eventData.scorer = req.user.id;
    if (config.timed) eventData.minute = clock.matchMinute(match.clock, config.timed, Date.now());
    await ScoreEvent.create(eventData);
    if (type === END_INNINGS) {
      await audit.record(req, 'innings.end', { match: match._id, tournament: match.tournament }, { summary: 'Innings ' + (score.cricket.current + 1) });
    } else if (type === END_SET) {
      await audit.record(req, 'set.end', { match: match._id, tournament: match.tournament }, { summary: 'Set ' + score.currentSet.number + ' ' + score.currentSet.a + '-' + score.currentSet.b });
    } else {
      await audit.record(req, 'score.add', { match: match._id, tournament: match.tournament }, {
        team: String(eventData.team) === String(match.teamA.id) ? match.teamA.name : match.teamB.name,
        points: eventData.points,
        label: config.actions[type].label,
        player: eventData.playerName ? '#' + eventData.jersey + ' ' + eventData.playerName : null,
      });
    }
    await respondAndBroadcast(res, match, 201);
  })
);

// POST /api/matches/:id/clock (scorer/admin) { action: start | pause | resume | end_period }
router.post(
  '/:id/clock',
  canScore,
  wrap(async (req, res) => {
    const action = req.body.action;
    if (clock.ACTIONS.indexOf(action) === -1) throw httpError(400, 'Clock action must be start, pause, resume or end_period');
    const match = await findMatchOr404(req.params.id);
    const timed = SPORTS[match.sport].timed;
    if (!timed) throw httpError(400, SPORTS[match.sport].label + ' does not use a match clock');
    if (match.status !== 'live') throw httpError(409, 'The clock can only be used while the match is live');
    const saved = match.clock || {};
    const before = saved.state
      ? { state: saved.state, period: saved.period || 0, elapsedMs: saved.elapsedMs || 0, runningSince: saved.runningSince || null }
      : clock.initialClock();
    const next = clock.applyClock(before, action, timed, Date.now());
    // Conditional update: two scorers pressing at once cannot both apply.
    // Matches created before the clock existed have no clock field, so "not started" also matches a missing value.
    const stateFilter = before.state === 'not_started' ? { $in: ['not_started', null] } : before.state;
    const periodFilter = before.period === 0 ? { $in: [0, null] } : before.period;
    const updated = await Match.findOneAndUpdate(
      { _id: match._id, status: 'live', 'clock.state': stateFilter, 'clock.period': periodFilter },
      { clock: next },
      { returnDocument: 'after' }
    );
    if (!updated) throw httpError(409, 'The clock just changed - refresh and try again');
    await audit.record(req, 'clock.change', { match: match._id, tournament: match.tournament }, { summary: action.replace('_', ' ') + ' -> ' + clock.clockLabel(next, timed) });
    await respondAndBroadcast(res, updated);
  })
);

// DELETE /api/matches/:id/events/last (scorer/admin) - Undo
router.delete(
  '/:id/events/last',
  canScore,
  wrap(async (req, res) => {
    const match = await findMatchOr404(req.params.id);
    if (match.status === 'finished') throw httpError(409, 'This match is finished - scoring is closed');
    if (match.status !== 'live') throw httpError(409, 'Match has not started');

    const events = await ScoreEvent.find({ match: match._id }).lean();
    const result = undoLast(events);
    if (!result.removed) throw httpError(400, 'Nothing to undo');
    await ScoreEvent.deleteOne({ _id: result.removed._id });
    const ev = result.removed;
    const teamName = String(ev.team) === String(match.teamA.id) ? match.teamA.name : String(ev.team) === String(match.teamB.id) ? match.teamB.name : null;
    const action = SPORTS[match.sport].actions[ev.type];
    await audit.record(req, 'score.undo', { match: match._id, tournament: match.tournament }, {
      removed: { team: teamName, label: ev.type === END_SET ? 'End set' : ev.type === END_INNINGS ? 'End of innings' : action ? action.label : ev.type, points: ev.points },
    });
    await respondAndBroadcast(res, match);
  })
);

// DELETE /api/matches/:id (admin) - cancel a match that has not started
router.delete(
  '/:id',
  requireAuth,
  requireRole('admin'),
  wrap(async (req, res) => {
    const match = await findMatchOr404(req.params.id);
    if (match.status !== 'scheduled') throw httpError(409, 'Only scheduled matches can be deleted');
    const removed = await Match.findOneAndDelete({ _id: match._id, status: 'scheduled' });
    if (!removed) throw httpError(409, 'Match has just been started and cannot be deleted');
    await audit.record(req, 'match.delete', { match: removed._id, tournament: removed.tournament }, { summary: removed.teamA.name + ' vs ' + removed.teamB.name });
    res.json({ ok: true });
  })
);

// GET /api/matches/:id/lineups (public) - both rosters with each player's contribution in this match
router.get(
  '/:id/lineups',
  wrap(async (req, res) => {
    const match = await findMatchOr404(req.params.id);
    const tournament = await Tournament.findById(match.tournament).lean();
    const events = await ScoreEvent.find({ match: match._id, player: { $ne: null } }).lean();
    const perPlayer = {};
    events.forEach(function (ev) {
      const key = String(ev.player);
      if (!perPlayer[key]) perPlayer[key] = { points: 0, actions: 0, yellow: 0, red: 0 };
      if (ev.type === 'yellow') perPlayer[key].yellow++;
      else if (ev.type === 'red') perPlayer[key].red++;
      else { perPlayer[key].points += Number(ev.points) || 0; perPlayer[key].actions++; }
    });
    function lineup(teamRef) {
      const team = tournament ? tournament.teams.find(function (t) { return String(t._id) === String(teamRef.id); }) : null;
      const players = (team ? team.players : []).map(function (p) {
        const st = perPlayer[String(p._id)] || { points: 0, actions: 0, yellow: 0, red: 0 };
        return { id: p._id, name: p.name, jersey: p.jersey, points: st.points, actions: st.actions, yellow: st.yellow, red: st.red };
      });
      players.sort(function (x, y) { return x.jersey - y.jersey; });
      return { team: teamRef.name, players: players };
    }
    res.json({ a: lineup(match.teamA), b: lineup(match.teamB) });
  })
);

// GET /api/matches/:id/h2h (public) - past results between these two houses, any tournament or sport
router.get(
  '/:id/h2h',
  wrap(async (req, res) => {
    const match = await findMatchOr404(req.params.id);
    const finished = await Match.find({ status: 'finished' }).sort({ finishedAt: -1 }).limit(1000);
    const h = headToHead(finished, match.teamA.name, match.teamB.name, match._id);
    res.json({ summary: h.summary, matches: await listWithScores(h.matches.slice(0, 20)) });
  })
);

// ---------- Fan engagement ----------

// POST /api/matches/:id/reactions (public) { type: fire|clap|wow, clientId }
router.post(
  '/:id/reactions',
  wrap(async (req, res) => {
    const type = engagement.validateReaction(req.body.type);
    const clientId = engagement.validateClientId(req.body.clientId);
    const match = await findMatchOr404(req.params.id);
    if (match.status !== 'live') throw httpError(409, 'Reactions are open only while the match is live');
    if (!reactPerBrowser(match._id + '|' + clientId) || !reactPerIp(req.ip)) {
      throw httpError(429, 'Slow down - one reaction every couple of seconds');
    }
    const inc = {};
    inc['reactions.' + type] = 1;
    const updated = await Match.findByIdAndUpdate(match._id, { $inc: inc }, { returnDocument: 'after' });
    const counts = { fire: updated.reactions.fire, clap: updated.reactions.clap, wow: updated.reactions.wow };
    sse.broadcast(match._id, counts, 'reactions');
    res.json({ reactions: counts });
  })
);

async function latestComments(matchId) {
  const list = await Comment.find({ match: matchId }).sort({ createdAt: -1 }).limit(50).lean();
  return list.map(function (c) { return { id: c._id, author: c.author, text: c.text, time: c.createdAt }; });
}

// GET /api/matches/:id/comments (public)
router.get(
  '/:id/comments',
  wrap(async (req, res) => {
    const match = await findMatchOr404(req.params.id);
    res.json({ comments: await latestComments(match._id) });
  })
);

// POST /api/matches/:id/comments (any signed-in user) { text }
router.post(
  '/:id/comments',
  requireAuth,
  wrap(async (req, res) => {
    const text = engagement.validateComment(req.body.text);
    const match = await findMatchOr404(req.params.id);
    if (!commentPerUser(String(req.user.id))) throw httpError(429, 'You are commenting too fast. Wait a few seconds.');
    const user = await User.findById(req.user.id);
    if (!user) throw httpError(401, 'Account no longer exists');
    await Comment.create({ match: match._id, user: user._id, author: engagement.displayName(user.email), text: text });
    const comments = await latestComments(match._id);
    sse.broadcast(match._id, comments, 'comments');
    res.status(201).json({ comments: comments });
  })
);

// DELETE /api/matches/:id/comments/:commentId (admin)
router.delete(
  '/:id/comments/:commentId',
  requireAuth,
  requireRole('admin'),
  wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.commentId)) throw httpError(400, 'Invalid comment id');
    const match = await findMatchOr404(req.params.id);
    const removed = await Comment.findOneAndDelete({ _id: req.params.commentId, match: match._id });
    if (!removed) throw httpError(404, 'Comment not found');
    await audit.record(req, 'comment.delete', { match: match._id, tournament: match.tournament }, { summary: removed.author + ': ' + removed.text.slice(0, 60) });
    const comments = await latestComments(match._id);
    sse.broadcast(match._id, comments, 'comments');
    res.json({ comments: comments });
  })
);

module.exports = router;
