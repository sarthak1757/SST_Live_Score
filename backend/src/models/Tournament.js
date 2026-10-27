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
        // email, rollNo and batch are PRIVATE: admins only, never sent in public responses (see publicPlayer in services/roster.js)
        players: [
          {
            name: { type: String, required: true, trim: true, maxlength: 40 },
            jersey: { type: Number, min: 0, max: 99, default: null }, // optional: can be assigned later
            email: { type: String, lowercase: true, trim: true, maxlength: 100, default: null },
            rollNo: { type: String, trim: true, maxlength: 30, default: null },
            batch: { type: String, trim: true, maxlength: 30, default: null },
          },
        ],
        house: { type: String, trim: true, maxlength: 40, default: null }, // "Kong" for a team called "Kong A"
      },
    ],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Tournament', tournamentSchema);
