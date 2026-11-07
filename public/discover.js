// In-app music discovery. Search data comes only from official YouTube/Spotify APIs.
// All track selections still flow through the host-authoritative Shatsu room.
const $ = id => document.getElementById(id);
const HISTORY_KEY = 'shatsu.recentTracks.v1';
function node(tag, text, className) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function loadRecent() {
  try {
    const data = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(data) ? data.filter(t => t && ['youtube', 'spotify'].includes(t.provider) && typeof t.title === 'string').slice(0, 15) : [];
  } catch { return []; }
}
function saveRecent(track) {
  const history = loadRecent().filter(t => !(t.provider === track.provider && t.videoId === track.videoId && t.trackId === track.trackId));
  history.unshift(track);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 15))); } catch { /* Storage may be unavailable */ }
}

export function initDiscovery({ api, spotify, isHost, act, showToast, armPlayback }) {
  const form = $('discover-form'), results = $('discover-results'), query = $('discover-query');
  const providerSelect = $('discover-provider'), help = $('discover-help');
  if (!form || !results || !query || !providerSelect) return;
  let lastResults = [];
  let lastMode = 'recent';
  let busy = false;
  function render(items, mode = 'results') {
    lastResults = items;
    lastMode = mode;
    results.replaceChildren();
    if (!items.length) {
      results.append(node('p', mode === 'recent' ? 'Your recently played songs will show here.' : 'No songs found. Try another search.', 'empty-list'));
      return;
    }
    for (const track of items) {
      const row = node('div', undefined, 'discover-result');
      if (track.image && /^https:\/\/(?:i\.ytimg\.com|i\.scdn\.co)\//.test(track.image)) {
        const art = document.createElement('img');
        art.loading = 'lazy'; art.src = track.image; art.alt = ''; art.referrerPolicy = 'no-referrer';
        row.append(art);
      } else row.append(node('div', '♫', 'discover-art-fallback'));
      const info = node('div', undefined, 'discover-info');
      info.append(node('strong', track.title), node('span', [track.artist || 'Music', track.provider === 'spotify' ? 'Spotify' : 'YouTube'].join(' · ')));
      row.append(info);
      const btn = node('button', isHost() ? 'Play' : '+ Queue', 'discover-pick');
      btn.type = 'button';
      btn.setAttribute('aria-label', isHost() ? 'Play ' + track.title : 'Queue ' + track.title);
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const selected = { provider: track.provider, title: track.title,
          ...(track.provider === 'spotify' ? { trackId: track.trackId } : { videoId: track.videoId }) };
        if (isHost()) armPlayback();
        const action = isHost() ? 'setTrack' : 'enqueue';
        const saved = await act(action, selected);
        if (saved) { saveRecent(track); showToast(isHost() ? 'Song selected for the room!' : 'Added to queue!'); }
        btn.disabled = false;
      });
      row.append(btn);
      results.append(row);
    }
  }
  function showRecent() {
    if (lastMode !== 'results' || !query.value.trim()) {
      render(loadRecent(), 'recent');
      help.textContent = 'Choose a recent song or search a music catalog. Friends can also add songs to the queue.';
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const q = query.value.trim();
    if (q.length < 2 || q.length > 80) return showToast('Enter 2–80 characters to search.');
    busy = true;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    results.replaceChildren(node('p', 'Searching songs…', 'empty-list'));
    const provider = providerSelect.value;
    try {
      let tracks;
      if (provider === 'spotify') {
        if (!spotify.connected) throw new Error('Connect your Spotify account first, then search again.');
        tracks = await spotify.searchTracks(q);
      } else {
        const data = await api('/api/search?q=' + encodeURIComponent(q) + '&provider=youtube');
        tracks = data.tracks;
      }
      render(Array.isArray(tracks) ? tracks : []);
      help.textContent = provider === 'spotify'
        ? 'Spotify tracks require an eligible Premium player for playback.'
        : 'YouTube videos play through the official visible video player.';
    } catch (error) {
      results.replaceChildren(node('p', error.message || 'Search temporarily unavailable.', 'empty-list'));
      help.textContent = 'You can still select a recent song or paste a video link below.';
      showToast(error.message || 'Could not search.');
    } finally { submit.disabled = false; busy = false; }
  });
  providerSelect.addEventListener('change', () => {
    query.value = '';
    help.textContent = providerSelect.value === 'spotify'
      ? 'Connect Spotify below to search its catalog.'
      : 'Search YouTube by song or artist. The server owner must enable YouTube Data API search.';
    showRecent();
  });
  query.addEventListener('input', () => { if (!query.value.trim()) showRecent(); });
  window.addEventListener('shatsu:roomstate', () => {
    if (lastResults.length) render(lastResults, lastMode);
  });
  showRecent();
}
