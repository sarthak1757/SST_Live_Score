const express = require('express');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const { wrap, httpError } = require('../middleware/errors');
const { listWithScores } = require('../services/snapshot');
const mongoose = require('mongoose');
const ScoreEvent = require('../models/ScoreEvent');
const { SPORTS } = require('../config/sports');
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
          players: browse.rosterOf(team).map(function (p) { return { id: p._id, name: p.name, jersey: p.jersey }; }).sort(function (a, b) { return a.jersey - b.jersey; }),
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

// GET /api/players/:id - a player with stats per tournament (same name + house counts as one player)
router.get(
  '/players/:id',
  wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw httpError(400, 'Invalid player id');
    const all = browse.playerList(await allTournaments());
    const player = all.find(function (p) { return p.id === String(req.params.id); });
    if (!player) throw httpError(404, 'Player not found');

    const entries = browse.samePlayer(all, player).sort(function (a, b) { return a.tournamentName.localeCompare(b.tournamentName); });
    const events = await ScoreEvent.find({ player: { $in: entries.map(function (e) { return e.id; }) } }).sort({ createdAt: -1 }).lean();
    const tournaments = entries.map(function (e) {
      const mine = events.filter(function (ev) { return String(ev.player) === e.id; });
      return {
        tournamentId: e.tournamentId, tournamentName: e.tournamentName, sport: e.sport, sportLabel: SPORTS[e.sport].label,
        jersey: e.jersey, playerId: e.id, stats: browse.playerStats(mine, e.sport),
      };
    });
    const totals = browse.playerStats(events, player.sport);
    const recent = events.slice(0, 10).map(function (ev) {
      const entry = entries.find(function (e) { return e.id === String(ev.player); });
      const action = SPORTS[entry.sport].actions[ev.type];
      return { match: ev.match, label: action ? action.label : ev.type, points: ev.points, minute: ev.minute, type: ev.type, time: ev.createdAt, tournamentName: entry.tournamentName, sport: entry.sport };
    });
    res.json({
      player: { id: player.id, name: player.name, jersey: player.jersey, team: player.team },
      totals: { tournaments: entries.length, matches: totals.matches, points: totals.points, actions: totals.actions, yellow: totals.yellow, red: totals.red },
      tournaments: tournaments,
      recent: recent,
    });
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
