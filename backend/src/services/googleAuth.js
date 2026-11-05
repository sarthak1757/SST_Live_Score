// Google sign-in rules. checkClaims / roleFor / signIn are pure-ish (unit tested); verifyCredential talks to Google.
const { OAuth2Client } = require('google-auth-library');
const { httpError } = require('../middleware/errors');

const DENIED = 'Only Scaler / SST accounts can sign in';

function list(value) {
  return String(value || '').split(',').map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean);
}

// Verifies the ID token Google gave the browser and returns its payload (audience = our client id).
async function verifyCredential(credential) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw httpError(503, 'Google sign-in is not configured');
  if (typeof credential !== 'string' || !credential) throw httpError(400, 'Missing Google credential');
  try {
    const ticket = await new OAuth2Client(clientId).verifyIdToken({ idToken: credential, audience: clientId });
    return ticket.getPayload();
  } catch (err) {
    throw httpError(401, 'Google sign-in failed. Please try again.');
  }
}

// The email must be verified, on an allowed domain (exact match) and belong to a Google Workspace of that domain (hd).
function checkClaims(payload, allowedDomains) {
  const domains = list(allowedDomains);
  const email = payload && typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const domain = email.split('@')[1];
  const hd = payload && typeof payload.hd === 'string' ? payload.hd.toLowerCase() : '';
  const ok = payload && payload.email_verified === true && email.split('@').length === 2 &&
    domains.indexOf(domain) !== -1 && domains.indexOf(hd) !== -1;
  if (!ok) throw httpError(403, DENIED);
  return email;
}

function roleFor(email, adminEmails) {
  return list(adminEmails).indexOf(email) !== -1 ? 'admin' : 'fan';
}

// Finds or creates the user. Existing users keep their role; name and picture are refreshed.
async function signIn(payload, env, User) {
  const email = checkClaims(payload, env.ALLOWED_EMAIL_DOMAINS);
  const name = typeof payload.name === 'string' ? payload.name.slice(0, 100) : '';
  const picture = typeof payload.picture === 'string' && /^https:\/\//.test(payload.picture) ? payload.picture : '';
  let user = await User.findOne({ email: email });
  if (!user) {
    user = await User.create({ email: email, name: name, picture: picture, role: roleFor(email, env.ADMIN_EMAILS) });
  } else {
    user.name = name || user.name;
    user.picture = picture || user.picture;
    await user.save();
  }
  return user;
}

module.exports = { verifyCredential, checkClaims, roleFor, signIn, DENIED };
