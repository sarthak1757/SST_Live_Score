// Unknown URLs: JSON 404 under /api, the friendly HTML page everywhere else. No database needed.
const app = require('../server');

let server, base;
beforeAll((done) => { server = app.listen(0, () => { base = 'http://localhost:' + server.address().port; done(); }); });
afterAll((done) => { server.closeAllConnections(); server.close(done); });

test('unknown /api path returns a JSON 404', async () => {
  const r = await fetch(base + '/api/nope');
  expect(r.status).toBe(404);
  expect((await r.json()).error).toBe('Not found');
});

test('unknown page returns the HTML 404 page', async () => {
  const r = await fetch(base + '/no-such-page.html');
  expect(r.status).toBe(404);
  expect(r.headers.get('content-type')).toMatch(/text\/html/);
  expect(await r.text()).toMatch(/Page <em>not found/);
});

test('real pages still load', async () => {
  expect((await fetch(base + '/')).status).toBe(200);
});
