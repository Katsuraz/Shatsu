import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomStore, HttpError, youtubeVideoId } from '../lib/rooms.js';
import { spotifyTrackId, parseTrack } from '../lib/track.js';
import { createShatsuServer } from '../server.js';

const example = 'M7lc1UVf-VE';

test('accepts YouTube and YouTube Music URLs, rejects unrelated links', () => {
  const links = [example, `https://youtu.be/${example}?si=hello`, `https://www.youtube.com/watch?v=${example}`, `https://music.youtube.com/watch?v=${example}&list=abc`, `https://youtube.com/shorts/${example}`, `https://www.youtube.com/embed/${example}`];
  for (const link of links) assert.equal(youtubeVideoId(link), example);
  for (const link of ['https://notyoutube.com/watch?v=M7lc1UVf-VE', 'javascript:alert(1)', 'https://youtube.com/watch?v=bad', '']) assert.throws(() => youtubeVideoId(link), HttpError);
});

test('room creation, joining, host authority, queue, chat, playback timestamps', () => {
  let clock = 1_000_000;
  const store = new RoomStore({ now: () => clock });
  const host = store.create('DJ');
  assert.match(host.code, /^[A-Z2-9]{8}$/);
  const guest = store.join(host.code, 'Friend');
  assert.equal(guest.state.participants.length, 2);
  assert.throws(() => store.action(host.code, guest.token, { type: 'play' }), e => e.status === 403);
  assert.throws(() => store.action(host.code, guest.token, { type: 'setTrack', videoId: example }), e => e.status === 403);
  store.action(host.code, host.token, { type: 'setTrack', videoId: `https://youtu.be/${example}`, title: 'Song' });
  assert.equal(store.get(host.code).playback.playing, false);
  store.action(host.code, host.token, { type: 'play' });
  clock += 5000;
  store.action(host.code, host.token, { type: 'pause' });
  assert.equal(store.get(host.code).playback.position, 5);
  store.action(host.code, host.token, { type: 'seek', position: 23.345 });
  assert.equal(store.get(host.code).playback.position, 23.35);
  store.action(host.code, guest.token, { type: 'enqueue', videoId: example, title: 'Next song' });
  assert.equal(store.get(host.code).queue.length, 1);
  store.action(host.code, guest.token, { type: 'chat', text: '<img src=x onerror=alert(1)>' });
  assert.equal(store.get(host.code).messages[0].text, '<img src=x onerror=alert(1)>');
  store.action(host.code, host.token, { type: 'next' });
  assert.equal(store.get(host.code).queue.length, 0);
  assert.equal(store.get(host.code).playback.title, 'Next song');
  assert.equal(store.resume(host.code, guest.token).participantId, guest.participantId);
  assert.throws(() => store.resume(host.code, 'wrong-token'), e => e.status === 401);
  clock += 13 * 60 * 60 * 1000;
  store.cleanup();
  assert.throws(() => store.get(host.code), e => e.status === 404);
});

test('HTTP create/join/action/authorization and static frontend', async t => {
  const server = createShatsuServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, data) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  let response = await fetch(base + '/');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Better music/);
  response = await fetch(base + '/api/health');
  assert.equal((await response.json()).name, 'Shatsu');
  response = await post('/api/rooms', { name: 'Host' });
  assert.equal(response.status, 201);
  const host = await response.json();
  response = await post(`/api/rooms/${host.code}/join`, { name: 'Guest' });
  const guest = await response.json();
  response = await post(`/api/rooms/${host.code}/action`, { token: guest.token, type: 'seek', position: 30 });
  assert.equal(response.status, 403);
  response = await post(`/api/rooms/${host.code}/action`, { token: host.token, type: 'setTrack', videoId: example, title: 'Test track' });
  assert.equal(response.status, 200);
  response = await post(`/api/rooms/${host.code}/action`, { token: guest.token, type: 'chat', text: 'hello' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).state.messages[0].text, 'hello');
  response = await post(`/api/rooms/${host.code}/resume`, { token: guest.token });
  assert.equal((await response.json()).participantId, guest.participantId);
  response = await post(`/api/rooms/${host.code}/action`, { token: guest.token, type: 'enqueue', videoId: 'https://music.youtube.com/watch?v=M7lc1UVf-VE' });
  assert.equal((await response.json()).state.queue.length, 1);
  response = await fetch(base + '/api/rooms/AAAAAAAA/events');
  assert.equal(response.status, 404);
  const controller = new AbortController();
  const eventStream = await fetch(base + `/api/rooms/${host.code}/events`, { signal: controller.signal });
  assert.equal(eventStream.status, 200);
  assert.match(eventStream.headers.get('content-type'), /text\/event-stream/);
  const reader = eventStream.body.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.match(first, /event: state/);
  assert.match(first, /Test track/);
  await post(`/api/rooms/${host.code}/action`, { token: host.token, type: 'play' });
  const second = new TextDecoder().decode((await reader.read()).value);
  assert.match(second, /\"playing\":true/);
  controller.abort();
});


test('Spotify official track links, URI and provider-neutral room actions', () => {
  const id = '4iV5W9uYEdYUVa79Axb7Rh';
  const url = `https://open.spotify.com/track/${id}?si=demo`;
  assert.equal(spotifyTrackId(url), id);
  assert.equal(spotifyTrackId(`spotify:track:${id}`), id);
  assert.equal(parseTrack(url).provider, 'spotify');
  for (const invalid of ['https://evilspotify.com/track/' + id, 'https://open.spotify.com/playlist/' + id, 'https://open.spotify.com/track/bad'])
    assert.throws(() => spotifyTrackId(invalid), HttpError);
  const store = new RoomStore();
  const host = store.create('DJ');
  const friend = store.join(host.code, 'Friend');
  store.action(host.code, host.token, { type: 'setTrack', provider: 'spotify', trackId: url, title: 'Test Spotify track' });
  assert.equal(store.get(host.code).playback.trackId, id);
  assert.equal(store.get(host.code).playback.videoId, null);
  assert.equal(store.get(host.code).playback.provider, 'spotify');
  store.action(host.code, friend.token, { type: 'enqueue', provider: 'youtube', videoId: example, title: 'YouTube song' });
  store.action(host.code, host.token, { type: 'next' });
  assert.equal(store.get(host.code).playback.provider, 'youtube');
  store.action(host.code, friend.token, { type: 'enqueue', provider: 'spotify', trackId: id, title: 'Spotify song' });
  assert.equal(store.get(host.code).queue[0].trackId, id);
  assert.throws(() => store.action(host.code, friend.token, { type: 'setTrack', provider: 'spotify', trackId: id }), e => e.status === 403);
});

test('config endpoint exposes only public Spotify client ID and bundled web files', async t => {
  const previous = process.env.SHATSU_SPOTIFY_CLIENT_ID;
  process.env.SHATSU_SPOTIFY_CLIENT_ID = 'public-test-client-id';
  t.after(() => { if (previous === undefined) delete process.env.SHATSU_SPOTIFY_CLIENT_ID; else process.env.SHATSU_SPOTIFY_CLIENT_ID = previous; });
  const server = createShatsuServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const config = await fetch(base + '/api/config').then(r => r.json());
  assert.deepEqual(config, { spotifyClientId: 'public-test-client-id' });
  const module = await fetch(base + '/spotify.js');
  assert.equal(module.status, 200);
  assert.match(await module.text(), /SpotifyController/);
});
