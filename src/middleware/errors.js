// Wraps async route handlers so thrown errors reach the error handler.
function wrap(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Small helper for expected errors: throw httpError(404, 'Match not found')
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

// Last middleware: turns any error into a JSON response.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid id' });
  }
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }
  if (err.code === 11000) {
    return res.status(409).json({ error: 'Already exists' });
  }
  // Database connection problems
  if (/Mongo|buffering timed out|ECONNREFUSED|ENOTFOUND/i.test(err.name + ' ' + err.message)) {
    console.error('Database error:', err.message);
    return res.status(503).json({ error: 'Database is unavailable. Please try again shortly.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
}

module.exports = { wrap, httpError, notFound, errorHandler };
