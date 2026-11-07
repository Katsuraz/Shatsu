import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTrack, MusicLibrary, normalizeLibrary, trackKey } from '../public/library.js';
import { RoomStore } from '../lib/rooms.js';

const youtube = { provider: 'youtube', videoId: 'M7lc1UVf-VE', title: 'Example video', artist: 'Example' };
const spotify = { provider: 'spotify', trackId: '4iV5W9uYEdYUVa79Axb7Rh', title: 'Song' };
const audius = { provider: 'audius', trackId: 'D7KyD', title: 'Independent song' };
const store = () => {
  const data = new Map();
  return {
    getItem(key) { return data.get(key) || null; },
    setItem(key, value) { data.set(key, value); }
  };
};

test('like and unlike a track persists local music collection without credentials', () => {
  const storage = store();
  const library = new MusicLibrary(storage);
  assert.equal(library.isFavorite(youtube), false);
  assert.equal(library.toggleFavorite(youtube), true);
  assert.equal(library.toggleFavorite(youtube), false);
  assert.equal(library.toggleFavorite(youtube), true);
  assert.equal(library.isFavorite(youtube), true);
  assert.equal(new MusicLibrary(storage).data.favorites.length, 1);
  assert.deepEqual(cleanTrack({ ...youtube, extra: 'secret' }), youtube);
  assert.equal(trackKey(youtube), 'youtube:M7lc1UVf-VE');
  assert.equal(cleanTrack({ provider: 'youtube', videoId: '../unauthorized', title: 'Bad' }), null);
});

test('create, rename, save, deduplicate, remove and export playlists', () => {
  const library = new MusicLibrary(store());
  const id = library.createPlaylist('Friends mix');
  assert.equal(library.addToPlaylist(id, youtube), true);
  assert.equal(library.addToPlaylist(id, youtube), false);
  library.addToPlaylist(id, audius);
  library.renamePlaylist(id, 'Road trip');
  assert.equal(library.data.playlists[0].name, 'Road trip');
  assert.equal(library.data.playlists[0].songs.length, 2);
  const backup = library.exportJSON();
  const restored = new MusicLibrary(store());
  restored.importJSON(backup);
  assert.equal(restored.data.playlists[0].songs.length, 2);
  restored.removeFromPlaylist(id, youtube);
  assert.equal(restored.data.playlists[0].songs.length, 1);
  restored.deletePlaylist(id);
  assert.equal(restored.data.playlists.length, 0);
  assert.throws(() => restored.createPlaylist(''), /name/);
  assert.throws(() => restored.importJSON('{'), /valid/);
  assert.deepEqual(normalizeLibrary({ favorites: [youtube, youtube], playlists: [] }).favorites, [youtube]);
});

test('host can start saved playlist; guest can queue a batch; guests cannot reorder', () => {
  const rooms = new RoomStore();
  const host = rooms.create('Host');
  const guest = rooms.join(host.code, 'Friend');
  const songs = [youtube, spotify, audius];
  const result = rooms.action(host.code, host.token, { type: 'playPlaylist', tracks: songs });
  assert.equal(result.state.playback.provider, 'youtube');
  assert.equal(result.state.queue.length, 2);
  assert.equal(result.state.playback.playing, true);
  assert.throws(() => rooms.action(host.code, guest.token,
    { type: 'playPlaylist', tracks: songs }), /host/);
  rooms.action(host.code, guest.token, { type: 'enqueueBatch', tracks: [youtube] });
  assert.equal(rooms.get(host.code).queue.length, 3);
  const id = rooms.get(host.code).queue[2].id;
  const moved = rooms.action(host.code, host.token, { type: 'moveQueued', id, toIndex: 0 });
  assert.equal(moved.state.queue[0].id, id);
  assert.throws(() => rooms.action(host.code, guest.token,
    { type: 'moveQueued', id, toIndex: 1 }), /host/);
  assert.throws(() => rooms.action(host.code, host.token,
    { type: 'enqueueBatch', tracks: Array(31).fill(youtube) }), /1–30/);
  assert.throws(() => rooms.action(host.code, guest.token,
    { type: 'enqueueBatch', tracks: [{ provider: 'bad', trackId: 'ok' }] }), /provider|Invalid|Unsupported/i);
});
