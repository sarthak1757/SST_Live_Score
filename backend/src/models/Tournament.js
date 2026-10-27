const mongoose = require('mongoose');
const { SPORTS } = require('../config/sports');

const tournamentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    sport: { type: String, required: true, enum: Object.keys(SPORTS) },
    // houses / teams. Each team gets its own _id automatically.
    teams: [{ name: { type: String, required: true, trim: true, maxlength: 40 } }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Tournament', tournamentSchema);
