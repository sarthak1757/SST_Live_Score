require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const { notFound, errorHandler } = require('./src/middleware/errors');

const app = express();
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/tournaments', require('./src/routes/tournaments'));
app.use('/api/matches', require('./src/routes/matches'));
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
