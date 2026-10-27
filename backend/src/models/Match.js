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
    teamA: teamRef,
    teamB: teamRef,
    scheduledAt: { type: Date, required: true },
    status: { type: String, enum: ['scheduled', 'live', 'finished'], default: 'scheduled', index: true },
    // set when finished: 'a', 'b' or 'draw'
    winner: { type: String, enum: ['a', 'b', 'draw', null], default: null },
    finalScore: { a: Number, b: Number },
    startedAt: Date,
    finishedAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Match', matchSchema);
