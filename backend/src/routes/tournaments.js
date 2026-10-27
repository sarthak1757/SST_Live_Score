const express = require('express');
const mongoose = require('mongoose');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const { SPORTS } = require('../config/sports');
const { requireAuth, requireRole } = require('../middleware/auth');
const { wrap, httpError } = require('../middleware/errors');
const ScoreEvent = require('../models/ScoreEvent');
const { computeStandings, topPlayers } = require('../services/scoring');
const { validateRoster } = require('../services/roster');
const { listWithScores } = require('../services/snapshot');

const router = express.Router();

function publicTournament(t) {
  const teams = [];
  for (let i = 0; i < t.teams.length; i++) {
    const players = t.teams[i].players.map(function (p) { return { id: p._id, name: p.name, jersey: p.jersey }; });
    teams.push({ id: t.teams[i]._id, name: t.teams[i].name, players: players });
  }
  return { id: t._id, name: t.name, sport: t.sport, sportLabel: SPORTS[t.sport].label, teams: teams };
}

// GET /api/tournaments (public)
router.get(
  '/',
  wrap(async (req, res) => {
    const list = await Tournament.find().sort({ createdAt: -1 });
    res.json({ tournaments: list.map(publicTournament) });
  })
);

// GET /api/tournaments/:id (public) -> tournament, standings, matches
router.get(
  '/:id',
  wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw httpError(400, 'Invalid tournament id');
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) throw httpError(404, 'Tournament not found');

    const matches = await Match.find({ tournament: tournament._id }).sort({ scheduledAt: 1 });
    const standings = computeStandings(tournament.teams, matches);
    // Top players across all matches of this tournament
    const matchIds = matches.map(function (m) { return m._id; });
    const events = matchIds.length ? await ScoreEvent.find({ match: { $in: matchIds }, player: { $ne: null } }).lean() : [];
    const teamNames = {};
    tournament.teams.forEach(function (t) { teamNames[String(t._id)] = t.name; });
    const leaderboard = topPlayers(events).slice(0, 10).map(function (p) {
      p.teamName = teamNames[p.team] || '';
      return p;
    });
    res.json({
      tournament: publicTournament(tournament),
      leaderboard: leaderboard,
      standings: standings,
      matches: await listWithScores(matches),
    });
  })
);

// POST /api/tournaments (admin) { name, sport, teams: ["Red", "Blue", ...] }
router.post(
  '/',
  requireAuth,
  requireRole('admin'),
  wrap(async (req, res) => {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const sport = req.body.sport;
    const rawTeams = req.body.teams;

    if (!name || name.length > 80) throw httpError(400, 'Tournament name is required (max 80 characters)');
    if (typeof sport !== 'string' || !SPORTS[sport]) throw httpError(400, 'Choose a valid sport');
    if (!Array.isArray(rawTeams)) throw httpError(400, 'Teams must be a list');

    const teams = [];
    const seen = {};
    for (let i = 0; i < rawTeams.length; i++) {
      const teamName = typeof rawTeams[i] === 'string' ? rawTeams[i].trim() : '';
      if (!teamName) continue; // ignore blank entries
      if (teamName.length > 40) throw httpError(400, 'Team names can be at most 40 characters');
      if (seen[teamName.toLowerCase()]) throw httpError(400, 'Duplicate team name: ' + teamName);
      seen[teamName.toLowerCase()] = true;
      teams.push({ name: teamName });
    }
    if (teams.length < 2) throw httpError(400, 'Add at least 2 teams');
    if (teams.length > 16) throw httpError(400, 'At most 16 teams are allowed');

    const tournament = await Tournament.create({ name: name, sport: sport, teams: teams, createdBy: req.user.id });
    res.status(201).json({ tournament: publicTournament(tournament) });
  })
);

// PUT /api/tournaments/:id/teams/:teamId/players (admin) { players: [{ name, jersey }] } - replaces the roster
router.put(
  '/:id/teams/:teamId/players',
  requireAuth,
  requireRole('admin'),
  wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.teamId)) throw httpError(400, 'Invalid id');
    const players = validateRoster(req.body.players);
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) throw httpError(404, 'Tournament not found');
    const team = tournament.teams.id(req.params.teamId);
    if (!team) throw httpError(404, 'Team not found in this tournament');
    team.players = players;
    await tournament.save();
    res.json({ tournament: publicTournament(tournament) });
  })
);

module.exports = router;
