const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    match: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    author: { type: String, required: true }, // display name, not the email
    text: { type: String, required: true, maxlength: 200 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model('Comment', commentSchema);
