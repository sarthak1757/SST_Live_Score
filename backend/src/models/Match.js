const mongoose = require('mongoose');
const { SPORTS } = require('../config/sports');

// Team names are copied into the match so lists don't need extra lookups.
const teamRef = {
  _id: false,
  id: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, required: true },
};

const matchSchema = new mongoose.Schema(
  {
    tournament: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament', required: true, index: true },
    tournamentName: { type: String, required: true },
    sport: { type: String, required: true, enum: Object.keys(SPORTS) },
    overs: { type: Number, default: null }, // cricket only, copied from the tournament
    teamA: teamRef,
    teamB: teamRef,
    // 'group' = league match; sf1/sf2/final = knockout bracket
    stage: { type: String, enum: ['group', 'sf1', 'sf2', 'final'], default: 'group' },
    scheduledAt: { type: Date, required: true },
    status: { type: String, enum: ['scheduled', 'live', 'finished'], default: 'scheduled', index: true },
    // set when finished: 'a', 'b' or 'draw'
    winner: { type: String, enum: ['a', 'b', 'draw', null], default: null },
    finalScore: { a: Number, b: Number },
    // live fan reaction counts
    reactions: {
      fire: { type: Number, default: 0 },
      clap: { type: Number, default: 0 },
      wow: { type: Number, default: 0 },
    },
    // match clock (timed sports) - see services/clock.js
    clock: {
      state: { type: String, enum: ['not_started', 'running', 'paused', 'break', 'ended'], default: 'not_started' },
      period: { type: Number, default: 0 },
      elapsedMs: { type: Number, default: 0 },
      runningSince: { type: Date, default: null },
    },
    startedAt: Date,
    finishedAt: Date,
  },
  { timestamps: true }
);

// Each knockout stage can exist only once per tournament (stops double-click duplicates).
matchSchema.index({ tournament: 1, stage: 1 }, { unique: true, partialFilterExpression: { stage: { $in: ['sf1', 'sf2', 'final'] } } });

module.exports = mongoose.model('Match', matchSchema);
