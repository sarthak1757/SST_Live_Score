// Builds the JSON the UI needs for a match. The score is ALWAYS computed from events.
const ScoreEvent = require('../models/ScoreEvent');
const { SPORTS, END_SET, END_INNINGS } = require('../config/sports');
const { computeScore, sortEvents, topPlayers, inningsSummary } = require('./scoring');
const { publicClock } = require('./clock');
const { matchStats } = require('./matchStats');

function publicMatch(m) {
  return {
    id: m._id,
    tournament: m.tournament,
    tournamentName: m.tournamentName,
    stage: m.stage || 'group',
    overs: m.overs || null,
    sport: m.sport,
    sportLabel: SPORTS[m.sport].label,
    teamA: { id: m.teamA.id, name: m.teamA.name },
    teamB: { id: m.teamB.id, name: m.teamB.name },
    scheduledAt: m.scheduledAt,
    status: m.status,
    winner: m.winner,
    finalScore: m.finalScore,
    clock: publicClock(m.clock, SPORTS[m.sport].timed, Date.now()),
    reactions: { fire: (m.reactions && m.reactions.fire) || 0, clap: (m.reactions && m.reactions.clap) || 0, wow: (m.reactions && m.reactions.wow) || 0 },
    startedAt: m.startedAt,
    finishedAt: m.finishedAt,
  };
}

// Newest first, last 50 events, with readable labels.
function buildFeed(match, events) {
  const sorted = sortEvents(events).reverse().slice(0, 50);
  const feed = [];
  for (let i = 0; i < sorted.length; i++) {
    const ev = sorted[i];
    let side = null;
    let teamName = null;
    if (String(ev.team) === String(match.teamA.id)) {
      side = 'a';
      teamName = match.teamA.name;
    } else if (String(ev.team) === String(match.teamB.id)) {
      side = 'b';
      teamName = match.teamB.name;
    }
    let label = ev.type === END_INNINGS ? 'End of innings' : 'End set';
    if (ev.type !== END_SET && ev.type !== END_INNINGS) {
      const action = SPORTS[match.sport].actions[ev.type];
      label = action ? action.label : ev.type;
    }
    feed.push({ id: ev._id, type: ev.type, label: label, points: ev.points, side: side, teamName: teamName, playerName: ev.playerName || null, minute: ev.minute === undefined ? null : ev.minute, jersey: ev.jersey === undefined ? null : ev.jersey, time: ev.createdAt });
  }
  return feed;
}

async function buildSnapshot(match) {
  const events = await ScoreEvent.find({ match: match._id }).lean();
  const score = computeScore(events, match.sport, match.teamA.id, match.teamB.id, { overs: match.overs });
  const topScorers = topPlayers(events).slice(0, 5).map(function (p) {
    p.side = p.team === String(match.teamA.id) ? 'a' : 'b';
    p.teamName = p.side === 'a' ? match.teamA.name : match.teamB.name;
    return p;
  });
  const stats = matchStats(events, match.sport, match.teamA.id, match.teamB.id, score);
  return { match: publicMatch(match), score: score, events: buildFeed(match, events), topScorers: topScorers, stats: stats };
}

// For lists: attaches a main score to each match using ONE events query for all live matches.
async function listWithScores(matches) {
  const liveIds = [];
  for (let i = 0; i < matches.length; i++) {
    // live matches need their score computed; finished cricket matches also need wickets, which are not stored on the match
    const m = matches[i];
    if (m.status === 'live' || (m.status === 'finished' && SPORTS[m.sport].cricket)) liveIds.push(m._id);
  }
  const eventsByMatch = {};
  if (liveIds.length > 0) {
    const events = await ScoreEvent.find({ match: { $in: liveIds } }).lean();
    for (let i = 0; i < events.length; i++) {
      const key = String(events[i].match);
      if (!eventsByMatch[key]) eventsByMatch[key] = [];
      eventsByMatch[key].push(events[i]);
    }
  }

  const result = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const out = publicMatch(m);
    if (m.status === 'live' || (m.status === 'finished' && SPORTS[m.sport].cricket)) {
      const s = computeScore(eventsByMatch[String(m._id)] || [], m.sport, m.teamA.id, m.teamB.id, { overs: m.overs });
      out.score = { a: s.a, b: s.b };
      out.cricket = inningsSummary(s); // [{ runs, wickets, overs }, ...] or null
    } else if (m.status === 'finished' && m.finalScore) {
      out.score = { a: m.finalScore.a, b: m.finalScore.b };
    } else {
      out.score = { a: 0, b: 0 };
    }
    result.push(out);
  }
  return result;
}

module.exports = { publicMatch, buildSnapshot, listWithScores };
