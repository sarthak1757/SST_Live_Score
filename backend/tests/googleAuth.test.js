const { checkClaims, roleFor, signIn } = require('../src/services/googleAuth');

const DOMAINS = 'sst.scaler.com,scaler.com';
const good = { email: 'Asha@sst.scaler.com', email_verified: true, hd: 'sst.scaler.com', name: 'Asha', picture: 'https://lh3.example/a.png' };

// A tiny stand-in for the User model: same findOne / create / save shape.
function fakeUsers(existing) {
  const rows = existing ? [existing] : [];
  return {
    rows: rows,
    findOne: async (q) => rows.find((r) => r.email === q.email) || null,
    create: async (data) => { const row = { ...data, save: async () => {} }; rows.push(row); return row; },
  };
}
const env = { ALLOWED_EMAIL_DOMAINS: DOMAINS, ADMIN_EMAILS: 'boss@sst.scaler.com' };

describe('Google claims', () => {
  test('sst.scaler.com is allowed (email is lower-cased)', () => {
    expect(checkClaims(good, DOMAINS)).toBe('asha@sst.scaler.com');
  });
  test('scaler.com is allowed', () => {
    expect(checkClaims({ ...good, email: 'x@scaler.com', hd: 'scaler.com' }, DOMAINS)).toBe('x@scaler.com');
  });
  test('gmail.com is rejected', () => {
    expect(() => checkClaims({ ...good, email: 'x@gmail.com', hd: undefined }, DOMAINS)).toThrow(/Only Scaler/);
  });
  test('evilscaler.com and sub-domain tricks are rejected', () => {
    expect(() => checkClaims({ ...good, email: 'x@evilscaler.com', hd: 'evilscaler.com' }, DOMAINS)).toThrow(/Only Scaler/);
    expect(() => checkClaims({ ...good, email: 'x@scaler.com.evil.io', hd: 'scaler.com' }, DOMAINS)).toThrow(/Only Scaler/);
    expect(() => checkClaims({ ...good, email: 'a@b@scaler.com' }, DOMAINS)).toThrow(/Only Scaler/);
  });
  test('an unverified email is rejected', () => {
    expect(() => checkClaims({ ...good, email_verified: false }, DOMAINS)).toThrow(/Only Scaler/);
    expect(() => checkClaims({ ...good, email_verified: 'true' }, DOMAINS)).toThrow(/Only Scaler/);
  });
  test('a missing or wrong hd is rejected', () => {
    expect(() => checkClaims({ ...good, hd: undefined }, DOMAINS)).toThrow(/Only Scaler/);
    expect(() => checkClaims({ ...good, hd: 'gmail.com' }, DOMAINS)).toThrow(/Only Scaler/);
  });
  test('rejection is a 403, and nothing is allowed if no domains are configured', () => {
    try { checkClaims({ ...good, email_verified: false }, DOMAINS); } catch (e) { expect(e.status).toBe(403); }
    expect(() => checkClaims(good, '')).toThrow(/Only Scaler/);
    expect(() => checkClaims(null, DOMAINS)).toThrow(/Only Scaler/);
  });
});

describe('Google sign-in roles', () => {
  test('roleFor: only ADMIN_EMAILS become admin', () => {
    expect(roleFor('boss@sst.scaler.com', ' Boss@sst.scaler.com , other@scaler.com')).toBe('admin');
    expect(roleFor('asha@sst.scaler.com', 'boss@sst.scaler.com')).toBe('fan');
    expect(roleFor('asha@sst.scaler.com', '')).toBe('fan');
  });
  test('a new user in ADMIN_EMAILS becomes admin, others become fan', async () => {
    const User = fakeUsers();
    const admin = await signIn({ ...good, email: 'boss@sst.scaler.com' }, env, User);
    const fan = await signIn(good, env, User);
    expect([admin.role, fan.role]).toEqual(['admin', 'fan']);
    expect(fan.name).toBe('Asha');
  });
  test('an existing user keeps their role', async () => {
    const User = fakeUsers({ email: 'asha@sst.scaler.com', role: 'scorer', save: async () => {} });
    const user = await signIn(good, env, User);
    expect(user.role).toBe('scorer');
    expect(User.rows.length).toBe(1);
    const User2 = fakeUsers({ email: 'boss@sst.scaler.com', role: 'fan', save: async () => {} });
    expect((await signIn({ ...good, email: 'boss@sst.scaler.com' }, env, User2)).role).toBe('fan'); // ADMIN_EMAILS only applies on first sign-in
  });
  test('a rejected account is never created', async () => {
    const User = fakeUsers();
    await expect(signIn({ ...good, email: 'x@gmail.com', hd: undefined }, env, User)).rejects.toThrow(/Only Scaler/);
    expect(User.rows.length).toBe(0);
  });
  test('only https pictures are kept', async () => {
    const User = fakeUsers();
    const user = await signIn({ ...good, picture: 'javascript:alert(1)' }, env, User);
    expect(user.picture).toBe('');
  });
});
