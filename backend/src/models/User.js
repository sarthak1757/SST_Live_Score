const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: '' }, // empty for Google-only accounts
    name: { type: String, default: '' },
    picture: { type: String, default: '' },
    role: { type: String, enum: ['admin', 'scorer', 'fan'], default: 'scorer' },
    // houses this user follows (team names, matched case-insensitively across tournaments)
    follows: { type: [String], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
