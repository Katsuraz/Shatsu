import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSongLink, looksLikeLink } from '../public/song-input.js';

test('recognize YouTube video and YouTube Music links directly without search API', () => {
  for (const url of [
    'https://youtu.be/s75Ak1itmLM?si=p5',
    'https://www.youtube.com/watch?v=s75Ak1itmLM',
    'https://music.youtube.com/watch?v=s75Ak1itmLM&list=RDAMVM',
    'https://youtube.com/shorts/s75Ak1itmLM'
  ]) {
    assert.equal(detectSongLink(url)?.provider, 'youtube');
    assert.equal(detectSongLink(url)?.videoId, 's75Ak1itmLM');
  }
});

test('recognize Spotify track links and reject unsupported or malicious lookalikes', () => {
  const id = '4iV5W9uYEdYUVa79Axb7Rh';
  const spotify = detectSongLink('https://open.spotify.com/track/' + id + '?si=abc');
  assert.equal(spotify?.provider, 'spotify');
  assert.equal(spotify?.trackId, id);
  for (const invalid of [
    'https://notyoutube.com/watch?v=s75Ak1itmLM',
    'https://youtu.be.evil.example/s75Ak1itmLM',
    'https://youtube.com/watch?v=too-short',
    'https://open.spotify.com/playlist/' + id,
    'javascript:alert(1)',
    'https://open.spotify.com.evil.example/track/' + id,
    'Taylor Swift',
    ''
  ]) assert.equal(detectSongLink(invalid), null);
  assert.equal(looksLikeLink('https://youtube.com/watch?v=bad'), true);
  assert.equal(looksLikeLink('A song title'), false);
});
