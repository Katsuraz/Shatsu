import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomStore } from '../lib/rooms.js';
import { searchYoutube } from '../lib/catalog.js';
import { createShatsuServer } from '../server.js';

const A = 'M7lc1UVf-VE';
const B = 'jfKfPfyJRdk';
const C = 'dQw4w9WgXcQ';

test('autoplay, auto next, host settings and previous track share one room state', () => {
  let now = 100000;
  const store = new RoomStore({ now: () => now });
  const host = store.create('DJ');
  const guest = store.join(host.code, 'Listener');
  assert.deepEqual(host.state.settings, { autoPlay: true, autoNext: true, shuffle: false, repeat: 'off' });
  assert.throws(() => store.action(host.code, guest.token, { type: 'setSettings', key: 'autoNext', value: false }), /host/);
  assert.throws(() => store.action(host.code, host.token, { type: 'setSettings', key: 'repeat', value: 'everything' }), /repeat/);
  store.action(host.code, host.token, { type: 'setTrack', videoId: A, title: 'Track A' });
  assert.equal(store.get(host.code).playback.playing, true);
  store.action(host.code, guest.token, { type: 'enqueue', videoId: B, title: 'Track B' });
  const expectedRevision = store.get(host.code).playback.revision;
  store.action(host.code, host.token, { type: 'next', automatic: true, expectedRevision });
  assert.equal(store.get(host.code).playback.videoId, B);
  assert.equal(store.get(host.code).playback.playing, true);
  store.action(host.code, host.token, { type: 'next', automatic: true, expectedRevision });
  assert.equal(store.get(host.code).playback.videoId, B, 'stale events cannot skip again');
  store.action(host.code, host.token, { type: 'previous' });
  assert.equal(store.get(host.code).playback.videoId, A);
  assert.equal(store.get(host.code).queue[0].videoId, B);
  store.action(host.code, host.token, { type: 'setSettings', key: 'autoPlay', value: false });
  store.action(host.code, host.token, { type: 'next' });
  assert.equal(store.get(host.code).playback.videoId, B);
  assert.equal(store.get(host.code).playback.playing, false);
  store.action(host.code, host.token, { type: 'setSettings', key: 'autoNext', value: false });
  store.action(host.code, host.token, { type: 'play' });
  const revision = store.get(host.code).playback.revision;
  now += 1000;
  store.action(host.code, host.token, { type: 'next', automatic: true, expectedRevision: revision });
  assert.equal(store.get(host.code).playback.playing, false);
  assert.equal(store.get(host.code).playback.videoId, B);
});

test('repeat one and repeat all remain host-authoritative', () => {
  const store = new RoomStore();
  const host = store.create('DJ');
  store.action(host.code, host.token, { type: 'setTrack', videoId: A, title: 'A' });
  store.action(host.code, host.token, { type: 'enqueue', videoId: B, title: 'B' });
  store.action(host.code, host.token, { type: 'setSettings', key: 'repeat', value: 'one' });
  let rev = store.get(host.code).playback.revision;
  store.action(host.code, host.token, { type: 'next', automatic: true, expectedRevision: rev });
  assert.equal(store.get(host.code).playback.videoId, A);
  assert.equal(store.get(host.code).queue.length, 1);
  store.action(host.code, host.token, { type: 'setSettings', key: 'repeat', value: 'all' });
  rev = store.get(host.code).playback.revision;
  store.action(host.code, host.token, { type: 'next', automatic: true, expectedRevision: rev });
  assert.equal(store.get(host.code).playback.videoId, B);
  assert.equal(store.get(host.code).queue[0].videoId, A);
  store.action(host.code, host.token, { type: 'setSettings', key: 'shuffle', value: true });
  assert.equal(store.snapshot(store.get(host.code)).settings.shuffle, true);
  assert.throws(() => store.action(host.code, host.token, { type: 'next', automatic: true }), /revision/);
});

test('official YouTube catalog search validates, normalizes and caches results', async () => {
  let calls = 0;
  const fakeFetch = async url => {
    calls++;
    assert.match(String(url), /youtube\/v3\/search/);
    assert.equal(new URL(url).searchParams.get('q'), 'soft music');
    return { ok: true, json: async () => ({ items: [
      { id: { videoId: A }, snippet: { title: 'Calm &amp; Soft', channelTitle: 'Artist' } },
      { id: { videoId: 'invalid' }, snippet: { title: 'Bad' } }
    ] }) };
  };
  const first = await searchYoutube('soft music', { apiKey: 'test-not-real', fetchImpl: fakeFetch, now: 100000 });
  const second = await searchYoutube('  SOFT   MUSIC ', { apiKey: 'test-not-real', fetchImpl: fakeFetch, now: 100200 });
  assert.equal(calls, 1);
  assert.deepEqual(second, first);
  assert.equal(first[0].videoId, A);
  assert.equal(first[0].title, 'Calm & Soft');
  assert.equal(first.length, 1);
  await assert.rejects(searchYoutube('x', { apiKey: 'test' }), /2–80/);
  await assert.rejects(searchYoutube('music', { apiKey: '' }), /not configured/);
});

test('search API serves normalized catalog hits and rejects unsupported providers', async t => {
  const server = createShatsuServer({ searchCatalog: async q => [{ provider: 'youtube', videoId: C, title: q, artist: 'Shatsu' }] });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  let response = await fetch(base + '/api/search?q=hello%20music');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).tracks[0].title, 'hello music');
  response = await fetch(base + '/api/search?q=test&provider=spotify');
  assert.equal(response.status, 400);
});
