const jwt = require('jsonwebtoken');

// Checks the "Authorization: Bearer <token>" header and sets req.user.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Login required' });
  }
  try {
    const payload = jwt.verify(parts[1], process.env.JWT_SECRET);
    req.user = { id: payload.id, role: payload.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }
}

// Usage: requireRole('admin') or requireRole('admin', 'scorer')
function requireRole() {
  const roles = Array.prototype.slice.call(arguments);
  return function (req, res, next) {
    if (!req.user || roles.indexOf(req.user.role) === -1) {
      return res.status(403).json({ error: 'You do not have permission to do this' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
