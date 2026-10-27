const mongoose = require('mongoose');

// Every scoring action is stored as an event. The score is always computed from these.
const scoreEventSchema = new mongoose.Schema(
  {
    match: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', required: true, index: true },
    team: { type: mongoose.Schema.Types.ObjectId, default: null }, // null for end_set
    type: { type: String, required: true }, // key from the sports config, or "end_set"
    points: { type: Number, required: true, default: 0 },
    // optional: who scored. Name and jersey are copied so stats survive roster edits.
    player: { type: mongoose.Schema.Types.ObjectId, default: null },
    playerName: { type: String, default: null },
    jersey: { type: Number, default: null },
    minute: { type: Number, default: null }, // match minute from the clock (timed sports)
    scorer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model('ScoreEvent', scoreEventSchema);
