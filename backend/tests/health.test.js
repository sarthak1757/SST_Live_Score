const app = require('../server');

let server, base;
beforeAll((done) => { server = app.listen(0, () => { base = 'http://localhost:' + server.address().port; done(); }); });
afterAll((done) => { server.closeAllConnections(); server.close(done); });

test('health answers 200 and reports the database as down when not connected', async () => {
  const r = await fetch(base + '/api/health');
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ ok: true, db: 'down' });
});
