const express = require('express');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { wrap, httpError } = require('../middleware/errors');
const { houseNames, validateFollows, matchesForHouses } = require('../services/follows');
const { listWithScores } = require('../services/snapshot');

const router = express.Router();

async function allHouses() {
  const tournaments = await Tournament.find({}, { 'teams.name': 1 }).lean();
  return houseNames(tournaments);
}

async function currentUser(req) {
  const user = await User.findById(req.user.id);
  if (!user) throw httpError(401, 'Account no longer exists');
  return user;
}

// GET /api/houses (public) - every house name across tournaments
router.get(
  '/houses',
  wrap(async (req, res) => {
    res.json({ houses: await allHouses() });
  })
);

// GET /api/me/follows (signed in)
router.get(
  '/me/follows',
  requireAuth,
  wrap(async (req, res) => {
    const user = await currentUser(req);
    res.json({ follows: user.follows });
  })
);

// PUT /api/me/follows (signed in) { houses: ["Red", "Blue"] } - replaces the list
router.put(
  '/me/follows',
  requireAuth,
  wrap(async (req, res) => {
    const follows = validateFollows(req.body.houses, await allHouses());
    const user = await currentUser(req);
    user.follows = follows;
    await user.save();
    res.json({ follows: follows });
  })
);

// GET /api/me/feed (signed in) - live, upcoming and recent results for followed houses
router.get(
  '/me/feed',
  requireAuth,
  wrap(async (req, res) => {
    const user = await currentUser(req);
    if (user.follows.length === 0) return res.json({ follows: [], live: [], upcoming: [], results: [] });
    const recent = await Match.find().sort({ scheduledAt: -1 }).limit(500);
    const mine = await listWithScores(matchesForHouses(recent, user.follows));
    const byTime = function (a, b) { return new Date(a.scheduledAt) - new Date(b.scheduledAt); };
    res.json({
      follows: user.follows,
      live: mine.filter(function (m) { return m.status === 'live'; }).sort(byTime),
      upcoming: mine.filter(function (m) { return m.status === 'scheduled'; }).sort(byTime),
      results: mine.filter(function (m) { return m.status === 'finished'; }).slice(0, 20),
    });
  })
);

module.exports = router;
