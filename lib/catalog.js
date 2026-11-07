import { HttpError } from './validation.js';

const CACHE_TTL = 10 * 60 * 1000;
const MAX_CACHE = 150;
const cache = new Map();

function decodeEntities(text) {
  return String(text || '').replace(/&(?:amp|lt|gt|quot|#39|#x([0-9a-f]+)|#([0-9]+));/gi, (match, hex, decimal) => {
    if (hex || decimal) {
      const code = parseInt(hex || decimal, hex ? 16 : 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }
    return ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[match.toLowerCase()] || match;
  });
}

/**
 * Search YouTube's official catalog. The Google API key stays on the server:
 * never send it to the browser or Android APK.
 */
export async function searchYoutube(input, {
  apiKey = process.env.SHATSU_YOUTUBE_API_KEY || '',
  fetchImpl = fetch,
  now = Date.now()
} = {}) {
  if (typeof input !== 'string' || input.trim().length < 2 || [...input.trim()].length > 80)
    throw new HttpError(400, 'Search for 2–80 characters');
  if (!apiKey) throw new HttpError(503, 'YouTube search is not configured yet. The owner must add a YouTube Data API key; Spotify search and song links can still work.');
  const query = input.trim().replace(/\s+/g, ' ');
  const key = query.toLowerCase();
  const cached = cache.get(key);
  if (cached && cached.expires > now) return cached.results;
  const params = new URLSearchParams({
    part: 'snippet', type: 'video', videoEmbeddable: 'true',
    maxResults: '10', safeSearch: 'moderate', q: query, key: apiKey
  });
  let response;
  try { response = await fetchImpl('https://www.googleapis.com/youtube/v3/search?' + params, { signal: AbortSignal.timeout(6500) }); }
  catch { throw new HttpError(502, 'YouTube search could not connect. Please try again.'); }
  if (!response.ok) {
    if (response.status === 403 || response.status === 429) throw new HttpError(503, 'YouTube search is unavailable (API access or quota). Try again later.');
    throw new HttpError(502, 'YouTube search is temporarily unavailable.');
  }
  const data = await response.json().catch(() => ({}));
  const results = (Array.isArray(data.items) ? data.items : []).filter(item =>
    /^[A-Za-z0-9_-]{11}$/.test(item?.id?.videoId || '')).slice(0, 10).map(item => {
    const videoId = item.id.videoId;
    return {
      provider: 'youtube', videoId, title: decodeEntities(item.snippet?.title).slice(0, 100) || 'YouTube video',
      artist: decodeEntities(item.snippet?.channelTitle).slice(0, 90) || 'YouTube',
      image: 'https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg'
    };
  });
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(key, { results, expires: now + CACHE_TTL });
  return results;
}
