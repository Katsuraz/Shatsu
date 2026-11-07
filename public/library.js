// Shatsu's original local music library; no third-party application source reused.
const STORAGE_KEY = 'shatsu.library.v1';
const MAX_FAVORITES = 250;
const MAX_PLAYLISTS = 20;
const MAX_SONGS = 200;

export function cleanTrack(input) {
  if (!input || typeof input !== 'object') return null;
  const provider = input.provider;
  const id = provider === 'youtube' ? input.videoId : input.trackId;
  if (typeof id !== 'string') return null;
  if (provider === 'youtube' && !/^[a-zA-Z0-9_-]{11}$/.test(id)) return null;
  if (provider === 'spotify' && !/^[a-zA-Z0-9]{22}$/.test(id)) return null;
  if (provider === 'audius' && !/^[a-zA-Z0-9]{2,32}$/.test(id)) return null;
  if (!['youtube', 'spotify', 'audius'].includes(provider)) return null;
  return {
    provider,
    ...(provider === 'youtube' ? { videoId: id } : { trackId: id }),
    title: String(input.title || 'Untitled song').trim().slice(0, 100) || 'Untitled song',
    artist: String(input.artist || '').trim().slice(0, 80)
  };
}
export function trackKey(track) {
  const t = cleanTrack(track);
  return t ? t.provider + ':' + (t.videoId || t.trackId) : '';
}
function dedupe(input, max = MAX_SONGS) {
  const seen = new Set();
  return (Array.isArray(input) ? input : []).map(cleanTrack).filter(track => {
    const key = trackKey(track);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, max);
}
export function normalizeLibrary(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const usedIds = new Set();
  return {
    version: 1,
    favorites: dedupe(raw.favorites, MAX_FAVORITES),
    playlists: (Array.isArray(raw.playlists) ? raw.playlists : []).slice(0, MAX_PLAYLISTS)
      .map((p, i) => {
        const id = typeof p?.id === 'string' && /^[a-z0-9-]{1,50}$/i.test(p.id) && !usedIds.has(p.id)
          ? p.id : 'import-' + (i + 1);
        usedIds.add(id);
        return { id, name: String(p?.name || 'Playlist').trim().slice(0, 40) || 'Playlist',
          songs: dedupe(p?.songs, MAX_SONGS) };
      })
  };
}
export class MusicLibrary {
  constructor(storage) {
    this.storage = storage;
    try { this.data = normalizeLibrary(JSON.parse(storage?.getItem(STORAGE_KEY) || '{}')); }
    catch { this.data = normalizeLibrary({}); }
  }
  persist() {
    try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.data)); }
    catch { throw new Error('Your device could not save your library. Check available storage.'); }
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('shatsu:librarychange'));
  }
  isFavorite(track) { return this.data.favorites.some(t => trackKey(t) === trackKey(track)); }
  toggleFavorite(input) {
    const t = cleanTrack(input);
    if (!t) throw new Error('Select a valid track first.');
    const i = this.data.favorites.findIndex(x => trackKey(x) === trackKey(t));
    if (i >= 0) { this.data.favorites.splice(i, 1); this.persist(); return false; }
    if (this.data.favorites.length >= MAX_FAVORITES) throw new Error('Liked Songs limit reached (250).');
    this.data.favorites.unshift(t);
    this.persist();
    return true;
  }
  createPlaylist(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed || trimmed.length > 40) throw new Error('Playlist name must be 1–40 characters.');
    if (this.data.playlists.length >= MAX_PLAYLISTS) throw new Error('Playlist limit reached (20).');
    const id = 'pl-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    this.data.playlists.push({ id, name: trimmed, songs: [] });
    this.persist();
    return id;
  }
  deletePlaylist(id) {
    const index = this.data.playlists.findIndex(p => p.id === id);
    if (index < 0) throw new Error('Playlist not found.');
    this.data.playlists.splice(index, 1);
    this.persist();
  }
  renamePlaylist(id, name) {
    const p = this.data.playlists.find(p => p.id === id);
    const trimmed = String(name || '').trim();
    if (!p || !trimmed || trimmed.length > 40) throw new Error('Enter a playlist name (1–40 characters).');
    p.name = trimmed;
    this.persist();
  }
  addToPlaylist(id, input) {
    const playlist = this.data.playlists.find(p => p.id === id);
    const track = cleanTrack(input);
    if (!playlist || !track) throw new Error('Playlist or track not found.');
    if (playlist.songs.some(t => trackKey(t) === trackKey(track))) return false;
    if (playlist.songs.length >= MAX_SONGS) throw new Error('Playlist limit reached (200 songs).');
    playlist.songs.push(track);
    this.persist();
    return true;
  }
  removeFromPlaylist(id, track) {
    const playlist = this.data.playlists.find(p => p.id === id);
    if (!playlist) throw new Error('Playlist not found.');
    playlist.songs = playlist.songs.filter(t => trackKey(t) !== trackKey(track));
    this.persist();
  }
  exportJSON() { return JSON.stringify(this.data, null, 2); }
  importJSON(raw) {
    if (typeof raw !== 'string' || raw.length > 500000) throw new Error('Invalid library backup.');
    let decoded;
    try { decoded = JSON.parse(raw); } catch { throw new Error('Not a valid Shatsu library file.'); }
    if (!decoded || decoded.version !== 1) throw new Error('Unsupported library backup version.');
    this.data = normalizeLibrary(decoded);
    this.persist();
  }
}

let singleton;
export function getLibrary() {
  if (!singleton) singleton = new MusicLibrary(typeof window !== 'undefined' ? window.localStorage : null);
  return singleton;
}
