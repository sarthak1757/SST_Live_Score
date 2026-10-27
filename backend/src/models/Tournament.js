const mongoose = require('mongoose');
const { SPORTS } = require('../config/sports');

const tournamentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    sport: { type: String, required: true, enum: Object.keys(SPORTS) },
    overs: { type: Number, min: 1, max: 50, default: null }, // cricket only
    // houses / teams. Each team gets its own _id automatically.
    teams: [
      {
        name: { type: String, required: true, trim: true, maxlength: 40 },
        // roster: players get their own _id automatically
        players: [{ name: { type: String, required: true, trim: true, maxlength: 40 }, jersey: { type: Number, required: true, min: 0, max: 99 } }],
      },
    ],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Tournament', tournamentSchema);
