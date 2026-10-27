const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware/auth');
const { wrap, httpError } = require('../middleware/errors');

const { createLimiter } = require('../services/rateLimit');
const audit = require('../services/audit');

const router = express.Router();
const signupPerIp = createLimiter(5, 60 * 60 * 1000); // 5 sign-ups per hour per IP

function issueToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '12h' });
}

// Simple in-memory brute-force protection: 8 failed logins per IP+email per 10 minutes.
const failures = {};
const MAX_FAILS = 8;
const WINDOW_MS = 10 * 60 * 1000;
function failKey(req, email) { return req.ip + '|' + email; }
function isLocked(key) {
  const f = failures[key];
  if (!f) return false;
  if (Date.now() - f.first > WINDOW_MS) { delete failures[key]; return false; }
  return f.count >= MAX_FAILS;
}
function recordFail(key) {
  if (!failures[key]) failures[key] = { count: 0, first: Date.now() };
  failures[key].count++;
}

// POST /api/auth/login  { email, password } -> { token, user }
router.post(
  '/login',
  wrap(async (req, res) => {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!email || !password) throw httpError(400, 'Email and password are required');

    const key = failKey(req, email);
    if (isLocked(key)) throw httpError(429, 'Too many failed attempts. Try again in a few minutes.');
    const user = await User.findOne({ email: email });
    // Same message for unknown email and wrong password so we don't reveal which accounts exist
    const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!ok) {
      recordFail(key);
      throw httpError(401, 'Invalid email or password');
    }
    delete failures[key];

    const token = issueToken(user);
    res.json({ token: token, user: { email: user.email, role: user.role } });
  })
);

// POST /api/auth/signup { email, password } - public self sign-up, always creates a "fan"
router.post(
  '/signup',
  wrap(async (req, res) => {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 100) throw httpError(400, 'Enter a valid email');
    if (password.length < 8 || password.length > 100) throw httpError(400, 'Password must be 8-100 characters');
    if (!signupPerIp(req.ip)) throw httpError(429, 'Too many sign-ups from this network. Try again later.');
    if (await User.findOne({ email: email })) throw httpError(409, 'An account with this email already exists');
    const user = await User.create({ email: email, passwordHash: await bcrypt.hash(password, 10), role: 'fan' });
    res.status(201).json({ token: issueToken(user), user: { email: user.email, role: user.role } });
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

// POST /api/auth/users (admin) { email, password, role } - create a scorer/admin account
router.post(
  '/users',
  requireAuth,
  requireRole('admin'),
  wrap(async (req, res) => {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const role = req.body.role === 'admin' ? 'admin' : 'scorer';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw httpError(400, 'Enter a valid email');
    if (password.length < 8) throw httpError(400, 'Password must be at least 8 characters');
    if (await User.findOne({ email: email })) throw httpError(409, 'An account with this email already exists');
    const passwordHash = await bcrypt.hash(password, 10);
    await User.create({ email: email, passwordHash: passwordHash, role: role });
    await audit.record(req, 'user.create', {}, { summary: email + ' (' + role + ')' });
    res.status(201).json({ user: { email: email, role: role } });
  })
);

module.exports = router;
