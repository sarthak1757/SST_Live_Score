const path = require('path');
// One .env at the repo root, no matter which folder the server is started from.
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const express = require('express');
const mongoose = require('mongoose');
const { notFound, errorHandler } = require('./src/middleware/errors');

const app = express();
app.disable('x-powered-by');
// Render runs behind one proxy: use the real client IP for rate limits.
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/tournaments', require('./src/routes/tournaments'));
app.use('/api/matches', require('./src/routes/matches'));
app.use('/api/audit', require('./src/routes/audit'));
app.use('/api', require('./src/routes/fans'));
app.use('/api', require('./src/routes/browse'));
app.get('/api/sports', (req, res) => res.json({ sports: require('./src/config/sports').SPORTS }));

app.use('/api', notFound);
app.use(errorHandler);

async function start() {
  if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) {
    console.error('Missing MONGODB_URI or JWT_SECRET. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  console.log('MongoDB connected');
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log('SST Live running on port ' + port));
}

if (require.main === module) {
  start().catch((err) => {
    console.error('Failed to start:', err.message);
    process.exit(1);
  });
}

module.exports = app;
