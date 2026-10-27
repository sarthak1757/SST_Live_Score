const express = require('express');
const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireRole } = require('../middleware/auth');
const { wrap, httpError } = require('../middleware/errors');
const { describe } = require('../services/audit');

const router = express.Router();

// GET /api/audit?match=<id>  or  ?tournament=<id>   (admin)
router.get(
  '/',
  requireAuth,
  requireRole('admin'),
  wrap(async (req, res) => {
    const filter = {};
    if (req.query.match) {
      if (!mongoose.isValidObjectId(req.query.match)) throw httpError(400, 'Invalid match id');
      filter.match = req.query.match;
    } else if (req.query.tournament) {
      if (!mongoose.isValidObjectId(req.query.tournament)) throw httpError(400, 'Invalid tournament id');
      filter.tournament = req.query.tournament;
    } else {
      throw httpError(400, 'Choose a match or a tournament');
    }
    const list = await AuditLog.find(filter).sort({ createdAt: -1, _id: -1 }).limit(300).populate('actor', 'email').lean();
    res.json({
      entries: list.map(function (e) {
        return {
          id: e._id,
          time: e.createdAt,
          who: e.actor ? e.actor.email : '(deleted user)',
          role: e.role,
          action: e.action,
          summary: describe(e),
        };
      }),
    });
  })
);

module.exports = router;
