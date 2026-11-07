import { detectSongLink, looksLikeLink } from './song-input.js';
// In-app music discovery using official Audius, YouTube and Spotify APIs.
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
    return Array.isArray(data) ? data.filter(t => t && ['youtube', 'spotify', 'audius'].includes(t.provider) && typeof t.title === 'string').slice(0, 15) : [];
  } catch { return []; }
}
function saveRecent(track) {
  const history = loadRecent().filter(t => !(t.provider === track.provider && t.videoId === track.videoId && t.trackId === track.trackId));
  history.unshift(track);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 15))); } catch { /* Storage may be unavailable */ }
}

export function rememberRecent(track) {
  saveRecent(track);
  window.dispatchEvent(new Event('shatsu:recentchange'));
}

export function initDiscovery({ api, spotify, isHost, act, showToast, armPlayback }) {
  const form = $('discover-form'), results = $('discover-results'), query = $('discover-query');
  const providerSelect = $('discover-provider'), help = $('discover-help');
  if (!form || !results || !query || !providerSelect) return;
  let lastResults = [];
  let lastMode = 'recent';
  let busy = false;
  const submit = form.querySelector('[type="submit"]');
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
      info.append(node('strong', track.title), node('span', [track.artist || 'Music', track.provider === 'spotify' ? 'Spotify' : track.provider === 'audius' ? 'Audius' : 'YouTube'].join(' · ')));
      row.append(info);
      const btn = node('button', isHost() ? 'Play' : '+ Queue', 'discover-pick');
      btn.type = 'button';
      btn.setAttribute('aria-label', isHost() ? 'Play ' + track.title : 'Queue ' + track.title);
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const selected = { provider: track.provider, title: track.title,
          ...(track.provider === 'youtube' ? { videoId: track.videoId } : { trackId: track.trackId }) };
        if (isHost()) armPlayback();
        const action = isHost() ? 'setTrack' : 'enqueue';
        const saved = await act(action, selected);
        if (saved) { rememberRecent(track); showToast(isHost() ? 'Song selected for the room!' : 'Added to queue!'); }
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
  function searchFallback(q) {
    lastMode = 'fallback';
    lastResults = [];
    results.replaceChildren();
    const panel = node('div', undefined, 'discover-fallback');
    panel.append(
      node('strong', 'YouTube search needs Google API access.'),
      node('p', 'Choose Audius (free, no account) above to search songs inside Shatsu now. You can also paste a YouTube video link directly.')
    );
    const open = node('a', 'Find song on YouTube ↗', 'discover-find-external');
    open.href = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);
    open.rel = 'noopener noreferrer';
    panel.append(open);
    const useAudius = node('button', 'Search Audius instead ♫', 'discover-find-external');
    useAudius.type = 'button';
    useAudius.addEventListener('click', () => {
      providerSelect.value = 'audius';
      form.requestSubmit();
    });
    panel.prepend(useAudius);
    results.append(panel);
    help.textContent = 'Song links do not need a YouTube Data API key.';
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const q = query.value.trim();
    const link = detectSongLink(q);
    if (link) {
      busy = true;
      submit.disabled = true;
      try {
        const host = isHost();
        const saved = await act(host ? 'setTrack' : 'enqueue', {
          provider: link.provider, trackId: link.trackId, videoId: link.videoId, title: link.title
        });
        if (saved) {
          rememberRecent(link);
          query.value = '';
          submit.textContent = 'Search';
          render(loadRecent(), 'recent');
          help.textContent = 'Link added directly — no catalog search needed.';
          showToast(host ? 'Song loaded into the room!' : 'Song added to the queue!');
        }
      } finally { busy = false; submit.disabled = false; }
      return;
    }
    if (looksLikeLink(q)) {
      results.replaceChildren(node('p', 'This is not a supported song link. Use a YouTube video or Spotify track URL.', 'discover-inline-error'));
      help.textContent = 'You can also search for a song by name.';
      return;
    }
    if (q.length < 2 || q.length > 80) {
      help.textContent = 'Enter a song or artist name (2–80 characters), or paste a song link.';
      return;
    }
    busy = true;
    submit.disabled = true;
    results.replaceChildren(node('p', 'Searching songs…', 'empty-list'));
    const provider = providerSelect.value;
    try {
      let tracks;
      if (provider === 'spotify') {
        if (!spotify.connected) throw new Error('Connect your Spotify account first, then search again.');
        tracks = await spotify.searchTracks(q);
      } else {
        const data = await api('/api/search?q=' + encodeURIComponent(q) + '&provider=' + encodeURIComponent(provider));
        tracks = data.tracks;
      }
      render(Array.isArray(tracks) ? tracks : []);
      help.textContent = provider === 'spotify'
        ? 'Spotify tracks require an eligible Premium player for playback.'
        : provider === 'audius'
          ? 'Audius streams independently released tracks without an account or Premium. Mainstream songs may be missing.'
          : 'YouTube videos play through the official visible video player.';
    } catch (error) {
      if (provider === 'youtube' && /not configured|quota|API access/i.test(error.message || '')) {
        searchFallback(q);
      } else {
        results.replaceChildren(node('p', error.message || 'Search temporarily unavailable.', 'discover-inline-error'));
        help.textContent = 'Try a song link above or select a recent track.';
      }
    } finally { submit.disabled = false; busy = false; }
  });
  providerSelect.addEventListener('change', () => {
    query.value = '';
    help.textContent = providerSelect.value === 'spotify'
      ? 'Connect Spotify below to search its catalog.'
      : providerSelect.value === 'audius'
        ? 'Search independent music for free. No sign-in, API key or Premium required.'
        : 'YouTube catalog search needs a Google API key; pasting a video link works for free.';
    showRecent();
  });
  query.addEventListener('input', () => {
    const value = query.value.trim();
    const link = detectSongLink(value);
    submit.textContent = link ? (isHost() ? 'Play link' : '+ Queue') : 'Search';
    if (link) {
      providerSelect.value = link.provider;
      render([link], 'link');
      help.textContent = 'Recognized song link — tap Play or + Queue. No search key needed.';
    } else if (!value) {
      showRecent();
    } else if (looksLikeLink(value)) {
      results.replaceChildren(node('p', 'Checking the link…', 'empty-list'));
      help.textContent = 'Use an official YouTube video or Spotify track URL.';
    }
  });
  function acceptSharedLink(raw) {
    const value = String(raw || '').trim();
    if (!detectSongLink(value)) return;
    query.value = value;
    query.dispatchEvent(new Event('input', { bubbles: true }));
    help.textContent = 'Song received from another app — tap Play link or + Queue.';
    if (!document.getElementById('room').hidden) {
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
  window.addEventListener('shatsu:sharedsong', event => acceptSharedLink(event.detail?.url));
  const initialShare = new URLSearchParams(window.location.search).get('share');
  if (initialShare) acceptSharedLink(initialShare);
  window.addEventListener('shatsu:recentchange', () => { if (lastMode === 'recent') render(loadRecent(), 'recent'); });
  window.addEventListener('shatsu:roomstate', () => {
    if (lastResults.length) render(lastResults, lastMode);
  });
  showRecent();
  help.textContent = 'Search independent Audius tracks for free (no account needed). YouTube links still work.';
}
