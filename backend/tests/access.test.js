// Access rules: viewing is public, interacting needs a login. No database needed.
const app = require('../server');

let server, base;
beforeAll((done) => { server = app.listen(0, () => { base = 'http://localhost:' + server.address().port; done(); }); });
afterAll((done) => { server.closeAllConnections(); server.close(done); });

const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
const ID = '64b64b64b64b64b64b64b64b';

describe('interacting needs a login (401 without a token)', () => {
  test.each([
    ['POST', '/api/matches/' + ID + '/comments'],
    ['POST', '/api/matches/' + ID + '/reactions'],
    ['PUT', '/api/me/follows'],
    ['GET', '/api/me/feed'],
    ['POST', '/api/matches/' + ID + '/start'],
    ['POST', '/api/matches/' + ID + '/events'],
    ['POST', '/api/tournaments'],
    ['GET', '/api/auth/users'],
    ['PUT', '/api/auth/users/' + ID + '/role'],
    ['GET', '/api/audit'],
  ])('%s %s', async (method, path) => {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : '{}' });
    expect(r.status).toBe(401);
  });
});

describe('viewing stays public', () => {
  test('/api/health and /api/config answer without login', async () => {
    expect((await fetch(base + '/api/health')).status).toBe(200);
    const cfg = await (await fetch(base + '/api/config')).json();
    expect(Object.keys(cfg)).toEqual(['googleClientId']); // nothing but the (public) client id
  });
  test('static pages are public, including the privacy page', async () => {
    for (const page of ['/', '/login.html', '/privacy.html', '/tournaments.html']) {
      expect((await fetch(base + page)).status).toBe(200);
    }
  });
  test('the old password sign-up is gone', async () => {
    expect((await post('/api/auth/signup', { email: 'x@scaler.com', password: 'password123' })).status).toBe(404);
  });
});
