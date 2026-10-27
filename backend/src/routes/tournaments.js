const express = require('express');
const mongoose = require('mongoose');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const { SPORTS } = require('../config/sports');
const { requireAuth, requireRole } = require('../middleware/auth');
const { wrap, httpError } = require('../middleware/errors');
const { computeStandings } = require('../services/scoring');
const { listWithScores } = require('../services/snapshot');

const router = express.Router();

function publicTournament(t) {
  const teams = [];
  for (let i = 0; i < t.teams.length; i++) teams.push({ id: t.teams[i]._id, name: t.teams[i].name });
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
    res.json({
      tournament: publicTournament(tournament),
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

module.exports = router;
