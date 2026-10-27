const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { wrap, httpError } = require('../middleware/errors');

const router = express.Router();

// POST /api/auth/login  { email, password } -> { token, user }
router.post(
  '/login',
  wrap(async (req, res) => {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!email || !password) throw httpError(400, 'Email and password are required');

    const user = await User.findOne({ email: email });
    // Same message for unknown email and wrong password so we don't reveal which accounts exist
    const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!ok) throw httpError(401, 'Invalid email or password');

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '12h' });
    res.json({ token: token, user: { email: user.email, role: user.role } });
  })
);

// GET /api/auth/me -> the logged-in user (used by the UI to check the saved token)
router.get(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) throw httpError(401, 'Account no longer exists');
    res.json({ user: { email: user.email, role: user.role } });
  })
);

module.exports = router;
