const express = require('express');
const mongoose = require('mongoose');
const Match = require('../models/Match');
const Tournament = require('../models/Tournament');
const ScoreEvent = require('../models/ScoreEvent');
const { SPORTS, END_SET } = require('../config/sports');
const { requireAuth, requireRole } = require('../middleware/auth');
const { wrap, httpError } = require('../middleware/errors');
const { computeScore, getWinner, undoLast, canTransition } = require('../services/scoring');
const { buildSnapshot, listWithScores } = require('../services/snapshot');
const sse = require('../services/sse');

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
      teamA: { id: teamA._id, name: teamA.name },
      teamB: { id: teamB._id, name: teamB.name },
      scheduledAt: when,
    });
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
    const score = computeScore(events, match.sport, match.teamA.id, match.teamB.id);
    const updated = await Match.findOneAndUpdate(
      { _id: match._id, status: 'live' },
      { status: 'finished', finishedAt: new Date(), winner: getWinner(score), finalScore: { a: score.a, b: score.b } },
      { returnDocument: 'after' }
    );
    if (!updated) throw httpError(409, 'Match was already finished');
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
    const score = computeScore(events, match.sport, match.teamA.id, match.teamB.id);

    let eventData;
    if (type === END_SET) {
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
      eventData = { match: match._id, type: type, points: action.points, team: teamId };
    }

    eventData.scorer = req.user.id;
    await ScoreEvent.create(eventData);
    await respondAndBroadcast(res, match, 201);
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
    await respondAndBroadcast(res, match);
  })
);

module.exports = router;
