// Creates (or updates) a login account.
//   npm run seed                                  -> admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD in .env
//   node seed.js scorer@sst.edu SomePass123 scorer -> extra scorer account
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./src/models/User');

async function main() {
  const email = (process.argv[2] || process.env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.argv[3] || process.env.SEED_ADMIN_PASSWORD || '';
  const role = process.argv[4] || 'admin';

  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  if (!email || !password) throw new Error('Provide SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env (or pass email and password as arguments)');
  if (password.length < 8) throw new Error('Password must be at least 8 characters');
  if (role !== 'admin' && role !== 'scorer') throw new Error('Role must be admin or scorer');

  await mongoose.connect(process.env.MONGODB_URI);
  const passwordHash = await bcrypt.hash(password, 10);
  await User.findOneAndUpdate({ email: email }, { email: email, passwordHash: passwordHash, role: role }, { upsert: true });
  console.log('Saved ' + role + ' account: ' + email);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
