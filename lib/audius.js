import { HttpError } from './validation.js';

// Audius documents public read-only API access without credentials.
// Keep all catalog calls server-side and never proxy audio files.
const API = 'https://api.audius.co/v1';
const CACHE_MS = 8 * 60 * 1000;
const cache = new Map();
const APP = 'Shatsu';

export function audiusStreamUrl(trackId) {
  if (typeof trackId !== 'string' || !/^[a-zA-Z0-9]{2,32}$/.test(trackId))
    throw new HttpError(400, 'Invalid Audius track');
  return API + '/tracks/' + encodeURIComponent(trackId) + '/stream?app_name=' + APP;
}

export async function searchAudius(input, { fetchImpl = fetch, now = Date.now() } = {}) {
  if (typeof input !== 'string' || input.trim().length < 2 || [...input.trim()].length > 80)
    throw new HttpError(400, 'Search for 2–80 characters');
  const q = input.trim().replace(/\s+/g, ' ');
  const cacheKey = q.toLowerCase();
  const prev = cache.get(cacheKey);
  if (prev?.expires > now) return prev.results;
  const url = API + '/tracks/search?' + new URLSearchParams({
    query: q, limit: '20', app_name: APP
  });
  let response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(8500), headers: { Accept: 'application/json' } });
  } catch {
    throw new HttpError(502, 'Audius is unreachable right now. Try again or use a YouTube link.');
  }
  if (!response.ok) {
    throw new HttpError(response.status === 429 ? 503 : 502,
      response.status === 429 ? 'Audius is busy. Please try again shortly.' : 'Audius search is temporarily unavailable.');
  }
  const data = await response.json().catch(() => ({}));
  const source = Array.isArray(data.data) ? data.data : (Array.isArray(data.results) ? data.results : []);
  const results = source
    .filter(track => {
      const id = track?.id;
      return typeof id === 'string' && /^[A-Za-z0-9]{2,32}$/.test(id)
        && !track.is_private && !track.is_delete
        && track.is_streamable !== false && track.is_stream_gated !== true
        && !track.is_scheduled_release;
    })
    .slice(0, 12)
    .map(track => ({
      provider: 'audius',
      trackId: track.id,
      title: String(track.title || 'Audius track').slice(0, 100),
      artist: String(track.user?.name || track.user?.handle || 'Audius artist').slice(0, 80),
      duration: Number(track.duration) || 0
    }));
  if (cache.size >= 150) cache.delete(cache.keys().next().value);
  cache.set(cacheKey, { expires: now + CACHE_MS, results });
  return results;
}
