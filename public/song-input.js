// Pure, dependency-free link detection shared by the Shatsu music browser.
// Reject lookalike domains and unsafe schemes. Song-name queries return null.
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtube-nocookie.com', 'youtube-nocookie.com']);
const SPOTIFY_HOSTS = new Set(['open.spotify.com', 'spotify.com']);

export function looksLikeLink(input) {
  return /^(?:https?:\/\/|spotify:)/i.test(String(input || '').trim());
}

export function detectSongLink(input) {
  if (typeof input !== 'string' || input.length > 2048) return null;
  const text = input.trim();
  const spotifyUri = /^spotify:track:([a-z0-9]{22})$/i.exec(text);
  if (spotifyUri) return {
    provider: 'spotify', trackId: spotifyUri[1], videoId: null,
    title: 'Spotify track', artist: 'Spotify', image: ''
  };
  let url;
  try { url = new URL(text); } catch { return null; }
  if (!['https:', 'http:'].includes(url.protocol)) return null;
  const host = url.hostname.toLowerCase();
  if (SPOTIFY_HOSTS.has(host) && url.protocol === 'https:') {
    const match = /^\/(?:intl-[a-z]{2}\/)?track\/([a-z0-9]{22})\/?$/i.exec(url.pathname);
    if (!match) return null;
    return { provider: 'spotify', trackId: match[1], videoId: null,
      title: 'Spotify track', artist: 'Spotify', image: '' };
  }
  if (!YOUTUBE_HOSTS.has(host)) return null;
  let videoId = null;
  if (host === 'youtu.be') videoId = url.pathname.slice(1).split('/')[0];
  else if (url.pathname === '/watch') videoId = url.searchParams.get('v');
  else {
    const match = /^\/(?:shorts|embed|live)\/([^/]+)\/?$/.exec(url.pathname);
    videoId = match?.[1] || null;
  }
  if (!/^[a-z0-9_-]{11}$/i.test(videoId || '')) return null;
  return {
    provider: 'youtube', trackId: null, videoId,
    title: 'YouTube video', artist: 'YouTube',
    image: 'https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg'
  };
}
