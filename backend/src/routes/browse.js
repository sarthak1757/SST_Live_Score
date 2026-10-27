const express = require('express');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const { wrap, httpError } = require('../middleware/errors');
const { listWithScores } = require('../services/snapshot');
const browse = require('../services/browse');

const router = express.Router();

function allTournaments() {
  return Tournament.find({}, { name: 1, sport: 1, teams: 1 }).sort({ createdAt: 1 }).lean(); // oldest first: the first spelling of a house name wins
}

// GET /api/stats - numbers for the stat cards
router.get(
  '/stats',
  wrap(async (req, res) => {
    const results = await Promise.all([
      Match.countDocuments({ status: 'live' }),
      Match.countDocuments({ status: 'scheduled' }),
      Match.countDocuments({ status: 'finished' }),
      allTournaments(),
    ]);
    const tournaments = results[3];
    res.json({
      live: results[0],
      upcoming: results[1],
      finished: results[2],
      tournaments: tournaments.length,
      teams: browse.houseSummaries(tournaments).length,
      players: browse.playerList(tournaments).length,
    });
  })
);

// GET /api/teams - every house across tournaments
router.get(
  '/teams',
  wrap(async (req, res) => {
    res.json({ teams: browse.houseSummaries(await allTournaments()) });
  })
);

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/teams/:name - one house across all tournaments: record, form, squad, fixtures, results
router.get(
  '/teams/:name',
  wrap(async (req, res) => {
    const name = String(req.params.name || '').trim();
    if (!name || name.length > 40) throw httpError(400, 'Invalid house name');
    const tournaments = await allTournaments();
    const house = browse.houseSummaries(tournaments).find(function (h) { return browse.norm(h.name) === browse.norm(name); });
    if (!house) throw httpError(404, 'House not found');

    const exact = new RegExp('^' + escapeRegex(house.name) + '$', 'i');
    const matches = await Match.find({ $or: [{ 'teamA.name': exact }, { 'teamB.name': exact }] }).sort({ scheduledAt: 1 }).limit(500);
    const squads = [];
    tournaments.forEach(function (t) {
      t.teams.forEach(function (team) {
        if (browse.norm(team.name) !== browse.norm(house.name)) return;
        squads.push({
          tournamentId: t._id, tournamentName: t.name, sport: t.sport,
          players: team.players.map(function (p) { return { id: p._id, name: p.name, jersey: p.jersey }; }).sort(function (a, b) { return a.jersey - b.jersey; }),
        });
      });
    });
    const withScores = await listWithScores(matches);
    res.json({
      team: house,
      record: browse.teamRecord(matches, house.name),
      squads: squads,
      fixtures: withScores.filter(function (m) { return m.status !== 'finished'; }),
      results: withScores.filter(function (m) { return m.status === 'finished'; }).reverse().slice(0, 30),
    });
  })
);

// GET /api/players - every rostered player
router.get(
  '/players',
  wrap(async (req, res) => {
    res.json({ players: browse.playerList(await allTournaments()) });
  })
);

// GET /api/search?q=   (at least 2 characters)
router.get(
  '/search',
  wrap(async (req, res) => {
    const q = browse.validateQuery(req.query.q);
    res.json(browse.search(await allTournaments(), q));
  })
);

module.exports = router;
