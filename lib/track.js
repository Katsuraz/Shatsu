import { HttpError } from './validation.js';

export function youtubeVideoId(input) {
  if (typeof input !== 'string' || input.length > 2048) throw new HttpError(400, 'Paste a YouTube video link');
  const trimmed = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  let url;
  try { url = new URL(trimmed); } catch { throw new HttpError(400, 'Invalid YouTube URL'); }
  if (!['https:', 'http:'].includes(url.protocol)) throw new HttpError(400, 'Use a YouTube HTTPS link');
  const host = url.hostname.toLowerCase();
  const youtube = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host);
  let candidate;
  if (host === 'youtu.be') candidate = url.pathname.slice(1).split('/')[0];
  else if (youtube) {
    if (url.pathname === '/watch') candidate = url.searchParams.get('v');
    else if (/^\/(shorts|embed|live)\//.test(url.pathname)) candidate = url.pathname.split('/')[2];
  }
  if (!candidate || !/^[A-Za-z0-9_-]{11}$/.test(candidate)) throw new HttpError(400, 'Use a valid YouTube or YouTube Music video URL');
  return candidate;
}

export function spotifyTrackId(input) {
  if (typeof input !== 'string' || input.length > 2048) throw new HttpError(400, 'Paste a Spotify track link');
  const trimmed = input.trim();
  if (/^[A-Za-z0-9]{22}$/.test(trimmed)) return trimmed;
  if (/^spotify:track:[A-Za-z0-9]{22}$/.test(trimmed)) return trimmed.slice(14);
  let url;
  try { url = new URL(trimmed); } catch { throw new HttpError(400, 'Invalid Spotify track URL'); }
  if (url.protocol !== 'https:' || !['open.spotify.com', 'spotify.com'].includes(url.hostname.toLowerCase())) throw new HttpError(400, 'Use an official Spotify track URL');
  const match = url.pathname.match(/^\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]{22})\/?$/i);
  if (!match) throw new HttpError(400, 'Use a Spotify track URL, not a playlist or album');
  return match[1];
}

export function audiusTrackId(input) {
  if (typeof input !== 'string' || !/^[A-Za-z0-9]{2,32}$/.test(input.trim()))
    throw new HttpError(400, 'Invalid Audius track ID');
  return input.trim();
}

export function parseTrack(value, explicitProvider) {
  const provider = explicitProvider || (typeof value === 'string' && (/^spotify:track:/.test(value.trim()) || /^https:\/\/(?:open\.)?spotify\.com\//i.test(value.trim())) ? 'spotify' : 'youtube');
  if (provider === 'spotify') return { provider, trackId: spotifyTrackId(value), videoId: null };
  if (provider === 'youtube') return { provider, trackId: null, videoId: youtubeVideoId(value) };
  if (provider === 'audius') return { provider, trackId: audiusTrackId(value), videoId: null };
  throw new HttpError(400, 'Unsupported music provider');
}
