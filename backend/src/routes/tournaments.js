const express = require('express');
const mongoose = require('mongoose');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const { SPORTS } = require('../config/sports');
const { requireAuth, requireRole } = require('../middleware/auth');
const { wrap, httpError } = require('../middleware/errors');
const ScoreEvent = require('../models/ScoreEvent');
const { computeStandings, topPlayers } = require('../services/scoring');
const { validateRoster, publicPlayer, adminPlayer, jerseyOwner } = require('../services/roster');
const rosterImport = require('../services/rosterImport');
const { seedSemifinals, finalists } = require('../services/bracket');
const audit = require('../services/audit');
const { listWithScores } = require('../services/snapshot');

const router = express.Router();

function publicTournament(t) {
  const teams = [];
  for (let i = 0; i < t.teams.length; i++) {
    const players = t.teams[i].players.map(publicPlayer);
    teams.push({ id: t.teams[i]._id, name: t.teams[i].name, players: players });
  }
  return { id: t._id, name: t.name, sport: t.sport, sportLabel: SPORTS[t.sport].label, overs: t.overs || null, teams: teams };
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
    // League table only counts group matches - knockouts do not change it
    const standings = computeStandings(tournament.teams, matches.filter(function (m) { return m.stage === 'group'; }));
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

    let overs = null;
    if (SPORTS[sport].cricket) {
      overs = req.body.overs === undefined || req.body.overs === null || req.body.overs === '' ? SPORTS[sport].cricket.overs : Number(req.body.overs);
      if (!Number.isInteger(overs) || overs < 1 || overs > 50) throw httpError(400, 'Overs per innings must be a whole number from 1 to 50');
    }
    const tournament = await Tournament.create({ name: name, sport: sport, overs: overs, teams: teams, createdBy: req.user.id });
    await audit.record(req, 'tournament.create', { tournament: tournament._id }, { summary: name + ' (' + SPORTS[sport].label + ', ' + teams.length + ' teams)' });
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
    // keep existing players (same name) so their ids and private details survive; others are added or removed
    const old = team.players || [];
    team.players = players.map(function (p) {
      const hit = old.find(function (o) { return o.name.toLowerCase() === p.name.toLowerCase(); });
      if (hit) { hit.jersey = p.jersey; return hit; }
      return { name: p.name, jersey: p.jersey };
    });
    await tournament.save();
    await audit.record(req, 'roster.update', { tournament: tournament._id }, { summary: team.name + ': ' + players.length + ' players' });
    res.json({ tournament: publicTournament(tournament) });
  })
);

function createFixture(tournament, stage, teamA, teamB, when) {
  return Match.create({
    tournament: tournament._id,
    tournamentName: tournament.name,
    sport: tournament.sport,
    overs: tournament.overs,
    stage: stage,
    teamA: { id: teamA.id, name: teamA.name },
    teamB: { id: teamB.id, name: teamB.name },
    scheduledAt: when,
  });
}

function parseWhen(value) {
  if (value === undefined || value === null || value === '') return new Date();
  const when = new Date(value);
  if (isNaN(when.getTime())) throw httpError(400, 'Enter a valid date and time');
  return when;
}

async function loadTournament(id) {
  if (!mongoose.isValidObjectId(id)) throw httpError(400, 'Invalid tournament id');
  const tournament = await Tournament.findById(id);
  if (!tournament) throw httpError(404, 'Tournament not found');
  return tournament;
}

// POST /api/tournaments/:id/bracket (admin) { scheduledAt? } - semifinals from the top 4 of the standings
router.post(
  '/:id/bracket',
  requireAuth,
  requireRole('admin'),
  wrap(async (req, res) => {
    const tournament = await loadTournament(req.params.id);
    const when = parseWhen(req.body.scheduledAt);
    const matches = await Match.find({ tournament: tournament._id });
    if (matches.some(function (m) { return m.stage !== 'group'; })) throw httpError(409, 'The bracket has already been generated');
    const group = matches.filter(function (m) { return m.stage === 'group'; });
    if (group.length === 0 || group.some(function (m) { return m.status !== 'finished'; })) {
      throw httpError(409, 'Finish all group matches before generating the bracket');
    }
    const fixtures = seedSemifinals(computeStandings(tournament.teams, group));
    for (let i = 0; i < fixtures.length; i++) {
      const f = fixtures[i];
      await createFixture(tournament, f.stage, { id: f.a.teamId, name: f.a.name }, { id: f.b.teamId, name: f.b.name }, when);
    }
    await audit.record(req, 'bracket.semifinals', { tournament: tournament._id }, {
      summary: fixtures.map(function (f) { return f.a.name + ' v ' + f.b.name; }).join(', '),
    });
    res.status(201).json({ ok: true });
  })
);

// POST /api/tournaments/:id/bracket/final (admin) { scheduledAt? } - winners of the two semifinals
router.post(
  '/:id/bracket/final',
  requireAuth,
  requireRole('admin'),
  wrap(async (req, res) => {
    const tournament = await loadTournament(req.params.id);
    const when = parseWhen(req.body.scheduledAt);
    const matches = await Match.find({ tournament: tournament._id, stage: { $in: ['sf1', 'sf2', 'final'] } });
    if (matches.some(function (m) { return m.stage === 'final'; })) throw httpError(409, 'The final has already been generated');
    const sf1 = matches.find(function (m) { return m.stage === 'sf1'; });
    const sf2 = matches.find(function (m) { return m.stage === 'sf2'; });
    const teams = finalists(sf1, sf2);
    await createFixture(tournament, 'final', teams.a, teams.b, when);
    await audit.record(req, 'bracket.final', { tournament: tournament._id }, { summary: teams.a.name + ' v ' + teams.b.name });
    res.status(201).json({ ok: true });
  })
);

// ---------- Roster import (admin only) ----------

// POST /api/tournaments/:id/roster/import?filename=roster.xlsx[&confirm=1]   body: the raw file (application/octet-stream)
// Without confirm=1 it only returns the preview. With confirm=1 it re-reads the same file and saves it.
router.post(
  '/:id/roster/import',
  requireAuth,
  requireRole('admin'),
  express.raw({ type: 'application/octet-stream', limit: rosterImport.MAX_BYTES }),
  wrap(async (req, res) => {
    const tournament = await loadTournament(req.params.id);
    const filename = typeof req.query.filename === 'string' ? req.query.filename.slice(0, 120) : '';
    const sheets = rosterImport.parseWorkbook(req.body, filename); // validates type, size and content
    const plan = rosterImport.planImport(sheets, tournament.teams);
    const t = plan.totals;

    if (req.query.confirm !== '1') return res.json({ plan: plan, applied: false });

    if (t.add + t.update === 0 && t.newTeams === 0) throw httpError(400, 'Nothing to import - every row was skipped');
    rosterImport.applyPlan(tournament, plan);
    await tournament.save();
    await audit.record(req, 'roster.import', { tournament: tournament._id }, {
      summary: t.add + ' added, ' + t.update + ' updated, ' + t.skip + ' skipped, ' + t.newTeams + ' new teams (' + filename + ')',
    });
    res.json({ plan: plan, applied: true });
  })
);

// GET /api/tournaments/:id/roster (admin) - full roster INCLUDING private details (mail, roll no., batch)
router.get(
  '/:id/roster',
  requireAuth,
  requireRole('admin'),
  wrap(async (req, res) => {
    const tournament = await loadTournament(req.params.id);
    res.json({
      teams: tournament.teams.map(function (team) {
        return { id: team._id, name: team.name, house: team.house || null, players: team.players.map(adminPlayer) };
      }),
    });
  })
);

// PUT /api/tournaments/:id/teams/:teamId/players/:playerId/jersey (admin) { jersey: 0-99 | null } - jersey numbers are unique per team
router.put(
  '/:id/teams/:teamId/players/:playerId/jersey',
  requireAuth,
  requireRole('admin'),
  wrap(async (req, res) => {
    const ids = [req.params.id, req.params.teamId, req.params.playerId];
    if (!ids.every(function (id) { return mongoose.isValidObjectId(id); })) throw httpError(400, 'Invalid id');
    const blank = req.body.jersey === null || req.body.jersey === '';
    const jersey = blank ? null : Number(req.body.jersey);
    if (!blank && (!Number.isInteger(jersey) || jersey < 0 || jersey > 99)) throw httpError(400, 'Jersey number must be a whole number from 0 to 99');

    const tournament = await loadTournament(req.params.id);
    const team = tournament.teams.id(req.params.teamId);
    if (!team) throw httpError(404, 'Team not found in this tournament');
    const player = team.players.id(req.params.playerId);
    if (!player) throw httpError(404, 'Player not found');
    if (jersey !== null) {
      const owner = jerseyOwner(team, jersey, player._id);
      if (owner) throw httpError(409, 'Jersey ' + jersey + ' is already used by ' + owner.name);
    }
    player.jersey = jersey;
    await tournament.save();
    await audit.record(req, 'roster.update', { tournament: tournament._id }, { summary: team.name + ': ' + player.name + ' -> ' + (jersey === null ? 'no jersey' : '#' + jersey) });
    res.json({ player: publicPlayer(player) });
  })
);

module.exports = router;
