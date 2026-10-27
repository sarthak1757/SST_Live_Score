const mongoose = require('mongoose');

// Who did what, when. Written for every scoring action, undo and admin change.
const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, required: true },
    action: { type: String, required: true },
    match: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', default: null, index: true },
    tournament: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament', default: null, index: true },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
