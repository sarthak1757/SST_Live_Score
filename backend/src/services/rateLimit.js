// Tiny in-memory sliding-window limiter: allows `max` hits per `windowMs` for each key.
// Usage: const limit = createLimiter(1, 1500); if (!limit(key)) -> too many requests
function createLimiter(max, windowMs) {
  let hits = {};
  let calls = 0;
  return function hit(key, now) {
    now = now || Date.now();
    calls++;
    if (calls % 1000 === 0) {
      // occasionally forget old keys so memory does not grow forever
      const fresh = {};
      Object.keys(hits).forEach(function (k) {
        if (hits[k].length && now - hits[k][hits[k].length - 1] < windowMs) fresh[k] = hits[k];
      });
      hits = fresh;
    }
    const recent = (hits[key] || []).filter(function (t) { return now - t < windowMs; });
    if (recent.length >= max) {
      hits[key] = recent;
      return false;
    }
    recent.push(now);
    hits[key] = recent;
    return true;
  };
}

module.exports = { createLimiter };
