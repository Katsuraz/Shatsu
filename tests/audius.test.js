import test from 'node:test';
import assert from 'node:assert/strict';
import { searchAudius, audiusStreamUrl } from '../lib/audius.js';
import { audiusTrackId, parseTrack } from '../lib/track.js';
import { RoomStore } from '../lib/rooms.js';
import { createShatsuServer } from '../server.js';

const ID = 'D7KyD';
const OTHER = 'xj9Kp5';

test('Audius public search returns playable songs without any API credentials', async () => {
  let requests = 0;
  const tracks = await searchAudius('lofi chill', {
    now: 30000000,
    fetchImpl: async url => {
      requests++;
      const parsed = new URL(url);
      assert.equal(parsed.origin, 'https://api.audius.co');
      assert.equal(parsed.pathname, '/v1/tracks/search');
      assert.equal(parsed.searchParams.get('query'), 'lofi chill');
      assert.equal(parsed.searchParams.get('app_name'), 'Shatsu');
      assert.equal(parsed.searchParams.has('api_key'), false);
      return { ok: true, json: async () => ({
        data: [
          { id: ID, title: 'LoFi Chill Track', user: { name: 'Independent Artist' }, is_streamable: true },
          { id: 'invalid!id', title: 'Broken' },
          { id: 'abc123', title: 'Locked', is_stream_gated: true },
          { id: 'abc456', title: 'Not streamable', is_streamable: false },
          { id: 'abc789', title: 'Private', is_private: true }
        ]
      }) };
    }
  });
  assert.equal(requests, 1);
  assert.deepEqual(tracks, [{
    provider: 'audius', trackId: ID, title: 'LoFi Chill Track',
    artist: 'Independent Artist', duration: 0
  }]);
  assert.equal(audiusStreamUrl(ID), 'https://api.audius.co/v1/tracks/D7KyD/stream?app_name=Shatsu');
  await assert.rejects(searchAudius('x'), /2–80/);
  assert.throws(() => audiusStreamUrl('../bad'), /Invalid Audius/);
});

test('Shatsu room can queue and synchronize a full Audius track', () => {
  const store = new RoomStore();
  const host = store.create('Host');
  const friend = store.join(host.code, 'Friend');
  assert.equal(audiusTrackId(ID), ID);
  assert.equal(parseTrack(ID, 'audius').trackId, ID);
  const added = store.action(host.code, friend.token,
    { type: 'enqueue', provider: 'audius', trackId: ID, title: 'LoFi Chill Track' });
  assert.equal(added.state.queue[0].provider, 'audius');
  const selected = store.action(host.code, host.token, { type: 'next' });
  assert.equal(selected.state.playback.trackId, ID);
  assert.equal(selected.state.playback.videoId, null);
  assert.equal(selected.state.playback.playing, true);
  assert.throws(() => store.action(host.code, friend.token,
    { type: 'setTrack', provider: 'audius', trackId: OTHER }), /host/);
});

test('a real Shatsu search endpoint can provide Audius results without a YouTube API key', async t => {
  const server = createShatsuServer({
    searchOpenMusic: async query => [{ provider: 'audius', trackId: ID, title: query, artist: 'Artist' }],
    searchCatalog: async () => { throw new Error('YouTube key should not be needed'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = 'http://127.0.0.1:' + server.address().port;
  const res = await fetch(url + '/api/search?provider=audius&q=chill');
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.tracks[0].trackId, ID);
  assert.equal(data.tracks[0].title, 'chill');
  const audioModule = await fetch(url + '/audius.js');
  assert.equal(audioModule.status, 200);
  assert.match(await audioModule.text(), /AudiusRoomPlayer/);
});
