// Server-Sent Events: keeps a list of open connections per match and pushes updates.
const subscribers = {}; // matchId -> array of response objects

function subscribe(matchId, req, res, firstSnapshot) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // stop proxies from buffering the stream
  });
  res.write('retry: 3000\n\n'); // browser reconnects after 3s if the connection drops
  send(res, firstSnapshot); // a fresh connection (or reconnect) always starts with the full state

  const key = String(matchId);
  if (!subscribers[key]) subscribers[key] = [];
  subscribers[key].push(res);

  req.on('close', function () {
    const list = subscribers[key] || [];
    const index = list.indexOf(res);
    if (index !== -1) list.splice(index, 1);
    if (list.length === 0) delete subscribers[key];
  });
}

// eventName: 'snapshot' (score + feed), 'reactions' (counts) or 'comments' (latest comments)
function send(res, data, eventName) {
  res.write('event: ' + (eventName || 'snapshot') + '\ndata: ' + JSON.stringify(data) + '\n\n');
}

function broadcast(matchId, data, eventName) {
  const list = subscribers[String(matchId)] || [];
  for (let i = 0; i < list.length; i++) {
    send(list[i], data, eventName);
  }
}

// Comment line every 25s so idle connections are not closed by the host.
setInterval(function () {
  const keys = Object.keys(subscribers);
  for (let i = 0; i < keys.length; i++) {
    const list = subscribers[keys[i]];
    for (let j = 0; j < list.length; j++) list[j].write(': ping\n\n');
  }
}, 25000).unref();

module.exports = { subscribe, broadcast };
