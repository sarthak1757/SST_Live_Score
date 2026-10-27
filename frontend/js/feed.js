const user = requireLogin();
const housesBox = document.getElementById('houses');
const feedBox = document.getElementById('feed');
let houses = [];
let follows = [];
let saving = false;

function isFollowed(name) {
  return follows.some(function (f) { return f.toLowerCase() === name.toLowerCase(); });
}

function renderHouses() {
  if (houses.length === 0) {
    housesBox.innerHTML = '<div class="empty small">No houses yet - they appear once a tournament is created.</div>';
    return;
  }
  housesBox.innerHTML = houses.map(function (h) {
    return '<button class="tab' + (isFollowed(h) ? ' active' : '') + '" data-house="' + esc(h) + '"' + (saving ? ' disabled' : '') + '>' +
      (isFollowed(h) ? '\u2713 ' : '+ ') + esc(h) + '</button>';
  }).join('');
}

housesBox.addEventListener('click', async function (e) {
  const btn = e.target.closest('button[data-house]');
  if (!btn || saving) return;
  const name = btn.dataset.house;
  const next = isFollowed(name) ? follows.filter(function (f) { return f.toLowerCase() !== name.toLowerCase(); }) : follows.concat([name]);
  saving = true;
  renderHouses();
  try {
    const data = await api('PUT', '/api/me/follows', { houses: next });
    follows = data.follows;
    toast('success', (isFollowed(name) ? 'Following ' : 'Unfollowed ') + name);
    loadFeed();
  } catch (err) { toast('error', err.message); }
  saving = false;
  renderHouses();
});

function section(title, list, empty) {
  return '<h2>' + title + (list.length ? ' <span class="count">' + list.length + '</span>' : '') + '</h2>' +
    (list.length ? list.map(matchCardHtml).join('') : '<div class="empty small">' + empty + '</div>');
}

async function loadFeed() {
  try {
    const data = await api('GET', '/api/me/feed');
    if (data.follows.length === 0) {
      feedBox.innerHTML = '<div class="empty" style="margin-top:20px">Follow a house above to build your feed.</div>';
      return;
    }
    feedBox.innerHTML =
      section('<span class="badge live"><span class="dot"></span>LIVE</span> Live now', data.live, 'None of your houses are playing right now.') +
      section('Upcoming', data.upcoming, 'No upcoming matches for your houses.') +
      section('Results', data.results, 'No results yet.');
  } catch (err) {
    feedBox.innerHTML = '<div class="msg error">' + esc(err.message) + ' <button class="secondary" id="retry">Retry</button></div>';
    document.getElementById('retry').onclick = loadFeed;
  }
}

async function init() {
  if (!user) return;
  try {
    const both = await Promise.all([api('GET', '/api/houses'), api('GET', '/api/me/follows')]);
    houses = both[0].houses;
    follows = both[1].follows;
    renderHouses();
  } catch (err) {
    housesBox.innerHTML = '<div class="msg error">' + esc(err.message) + '</div>';
  }
  loadFeed();
  setInterval(loadFeed, 15000); // keep live scores fresh
}
init();
