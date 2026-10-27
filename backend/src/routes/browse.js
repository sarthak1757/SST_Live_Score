const express = require('express');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const { wrap } = require('../middleware/errors');
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
