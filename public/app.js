import { SpotifyController } from './spotify.js';
// Shatsu 0.1.0: browser-side room client. No music files are proxied, downloaded or re-streamed.
const $ = id => document.getElementById(id);
const dom = {
  lobby: $('lobby'), room: $('room'), nickname: $('nickname'), codeRow: $('code-row'), code: $('room-code'),
  entry: $('entry-form'), submit: $('entry-submit'), createTab: $('tab-create'), joinTab: $('tab-join'),
  shareCode: $('share-code'), copy: $('copy-btn'), hostTag: $('host-tag'), count: $('listener-count'),
  participants: $('participants'), trackLabel: $('track-label'), title: $('current-title'), subtitle: $('track-subtitle'),
  placeholder: $('player-placeholder'), input: $('video-url'), addForm: $('add-form'), addBtn: $('add-btn'),
  toggle: $('toggle-btn'), next: $('next-btn'), sync: $('sync-btn'), start: $('enable-audio'),
  seek: $('seek'), position: $('position'), duration: $('duration'), syncText: $('sync-text'),
  queue: $('queue-list'), queueCount: $('queue-count'), chat: $('messages'), chatForm: $('chat-form'), chatText: $('chat-text'),
  leave: $('leave-btn'), toast: $('toast'), spotifyCard: $('spotify-card'), spotifyLink: $('spotify-open'), spotifyConnect: $('spotify-connect'), spotifyStatus: $('spotify-status'), providerLabel: $('provider-label')
};
let mode = 'create', credentials = null, state = null, events = null;
let player = null, playerReady = false, youtubeReady = false, playerVideo = null;
let userEnabledPlayback = false, suppressPlayerEventsUntil = 0;
let serverOffset = 0, updateInterval = null, presenceInterval = null, clockInterval = null;
let isDragging = false, toastTimeout = null, applying = false;
const YT_PLAYING = 1, YT_PAUSED = 2, YT_ENDED = 0;
const spotify = new SpotifyController(message => showToast(message));

function showToast(message) {
  dom.toast.textContent = message;
  dom.toast.classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => dom.toast.classList.remove('visible'), 3400);
}
function setMode(next) {
  mode = next;
  dom.createTab.classList.toggle('selected', mode === 'create');
  dom.joinTab.classList.toggle('selected', mode === 'join');
  dom.createTab.setAttribute('aria-selected', String(mode === 'create'));
  dom.joinTab.setAttribute('aria-selected', String(mode === 'join'));
  dom.codeRow.hidden = mode !== 'join';
  dom.code.required = mode === 'join';
  dom.submit.innerHTML = mode === 'create' ? 'Create room <span>↗</span>' : 'Join room <span>↗</span>';
}
async function api(path, method = 'GET', payload) {
  let response;
  try {
    response = await fetch(path, { method, headers: payload ? { 'Content-Type': 'application/json' } : undefined, body: payload ? JSON.stringify(payload) : undefined, cache: 'no-store' });
  } catch { throw new Error('Unable to reach Shatsu. Check your internet connection.'); }
  let data;
  try { data = await response.json(); } catch { throw new Error('Unexpected server response'); }
  if (!response.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}
function isHost() { return Boolean(credentials && state && credentials.participantId === state.hostId); }
function timeLabel(seconds) { seconds = Math.max(0, Math.floor(seconds) || 0); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }
function estimatedPosition() {
  if (!state) return 0;
  const pb = state.playback;
  return Math.max(0, pb.position + (pb.playing ? Math.max(0, (Date.now() + serverOffset - pb.updatedAt) / 1000) : 0));
}
function videoIdFromUrl(input) {
  const v = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
  try {
    const url = new URL(v), host = url.hostname.toLowerCase();
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    if (host === 'youtu.be') return url.pathname.slice(1).split('/')[0];
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
      return url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/)?.[1];
    }
  } catch { /* Invalid URL; server also validates. */ }
  return null;
}
function spotifyIdFromUrl(input) {
  const trimmed = input.trim();
  if (/^spotify:track:[A-Za-z0-9]{22}$/.test(trimmed)) return trimmed.slice(14);
  try {
    const url = new URL(trimmed);
    if (url.protocol === 'https:' && ['open.spotify.com', 'spotify.com'].includes(url.hostname.toLowerCase())) {
      return url.pathname.match(/^\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]{22})\/?$/i)?.[1] || null;
    }
  } catch { /* Not a Spotify link. */ }
  return null;
}
function hasTrack() { return Boolean(state?.playback.videoId || state?.playback.trackId); }
function titleForUrl(url, id) {
  return url.includes('music.youtube.com') ? 'YouTube Music track' : `YouTube · ${id}`;
}
function textNode(tag, content, className) { const el = document.createElement(tag); if (className) el.className = className; el.textContent = content; return el; }

async function enterRoom(data) {
  credentials = { code: data.code, token: data.token, participantId: data.participantId };
  sessionStorage.setItem(`shatsu.${data.code}`, JSON.stringify(credentials));
  localStorage.setItem('shatsu.name', dom.nickname.value.trim());
  window.history.replaceState(null, '', `/?room=${encodeURIComponent(data.code)}`);
  dom.lobby.hidden = true; dom.room.hidden = false;
  document.title = `Shatsu · ${data.code}`;
  receiveState(data.state);
  connectEvents();
  await measureServerTime();
  updateInterval = setInterval(() => { updateTimeline(); syncPlayer(false); }, 2000);
  presenceInterval = setInterval(() => api(`/api/rooms/${credentials.code}/presence`, 'POST', { token: credentials.token }).catch(() => {}), 15000);
  clockInterval = setInterval(() => measureServerTime(), 30000);
}
async function measureServerTime() {
  const before = Date.now();
  try {
    const result = await api('/api/time');
    const after = Date.now();
    serverOffset = result.serverNow - ((before + after) / 2);
  } catch { /* Estimated clock offset remains available. */ }
}
function connectEvents() {
  if (events) events.close();
  events = new EventSource(`/api/rooms/${credentials.code}/events`);
  events.addEventListener('state', event => {
    try {
      const next = JSON.parse(event.data);
      if (next.expired) { showToast('Room expired. Create a new room.'); leaveRoom(); }
      else receiveState(next);
    } catch (error) { console.warn('Unable to read room event', error); }
  });
  events.onerror = () => { dom.syncText.textContent = 'Reconnecting to room…'; };
}
function receiveState(next) {
  const oldPlayback = state?.playback;
  const lastMessageId = state?.messages.at(-1)?.id;
  state = next;
  const host = isHost();
  dom.shareCode.textContent = state.code;
  dom.hostTag.textContent = host ? 'HOST' : 'GUEST';
  dom.addBtn.textContent = host ? 'Play now' : 'Add to queue';
  dom.toggle.disabled = !host || !hasTrack();
  dom.next.disabled = !host || state.queue.length === 0;
  dom.seek.disabled = !host || !hasTrack();
  dom.trackLabel.textContent = hasTrack() ? 'CURRENTLY PLAYING' : 'NO TRACK SELECTED';
  dom.title.textContent = hasTrack() ? state.playback.title : 'Your shared soundtrack';
  dom.subtitle.textContent = host ? 'You’re the room DJ' : 'Following the host';
  dom.toggle.textContent = state.playback.playing ? 'Ⅱ' : '▶';
  dom.toggle.setAttribute('aria-label', state.playback.playing ? 'Pause for everyone' : 'Play for everyone');
  const isSpotify = state.playback.provider === 'spotify';
  dom.providerLabel.textContent = isSpotify ? 'Spotify' : 'YouTube';
  dom.spotifyCard.hidden = !isSpotify;
  const ytNode = $('youtube-player'); if (ytNode) ytNode.hidden = isSpotify;
  dom.spotifyLink.href = isSpotify && state.playback.trackId ? `https://open.spotify.com/track/${state.playback.trackId}` : 'https://open.spotify.com/';
  dom.spotifyConnect.textContent = spotify.connected ? 'Disconnect Spotify' : 'Connect Spotify';
  dom.spotifyStatus.textContent = spotify.connected ? 'Spotify connected — each listener needs Spotify Premium and an active device.' : spotify.clientId ? 'Connect your own Spotify Premium account to play Spotify tracks.' : 'Spotify requires a developer client ID configured on the server.';
  if (isSpotify) { dom.placeholder.hidden = true; dom.start.hidden = true; if (playerReady) { try { player.pauseVideo(); } catch {} } }
  const connected = state.participants.filter(p => p.online).length;
  dom.count.textContent = connected;
  dom.participants.replaceChildren();
  for (const participant of state.participants) {
    const row = document.createElement('div'); row.className = `participant ${participant.online ? '' : 'offline'}`;
    const avatar = textNode('span', participant.name.slice(0, 1).toUpperCase(), 'avatar');
    const name = textNode('span', `${participant.name}${participant.id === credentials.participantId ? ' (you)' : ''}`);
    const tag = textNode('small', participant.isHost ? 'DJ ✦' : participant.online ? '♪ listening' : 'offline');
    row.append(avatar, name, tag); dom.participants.append(row);
  }
  renderQueue();
  if (lastMessageId !== state.messages.at(-1)?.id) renderMessages();
  updateTimeline();
  if (hasTrack() && (oldPlayback?.videoId !== state.playback.videoId || oldPlayback?.trackId !== state.playback.trackId || oldPlayback?.provider !== state.playback.provider)) {
    userEnabledPlayback = false; playerVideo = null;
    dom.start.hidden = isSpotify;
    syncPlayer(true);
  } else if (oldPlayback?.revision !== state.playback.revision) syncPlayer(true);
  if (!hasTrack()) { dom.start.hidden = true; dom.placeholder.hidden = false; }
}
function renderQueue() {
  dom.queueCount.textContent = `${state.queue.length} song${state.queue.length === 1 ? '' : 's'}`;
  dom.queue.replaceChildren();
  if (!state.queue.length) { dom.queue.append(textNode('p', 'The queue’s wide open. Add a song!', 'empty-list')); return; }
  for (const track of state.queue) {
    const row = document.createElement('div'); row.className = 'queue-track';
    const art = textNode('span', '♫', 'queue-art');
    const copy = document.createElement('div'); copy.className = 'queue-copy';
    copy.append(textNode('strong', track.title), textNode('span', `${track.provider === 'spotify' ? 'Spotify' : 'YouTube'} · added by ${track.addedBy}`));
    row.append(art, copy);
    if (isHost()) {
      const play = textNode('button', '▶'); play.type = 'button'; play.setAttribute('aria-label', `Play ${track.title}`);
      play.addEventListener('click', () => act('playQueued', { id: track.id }));
      row.append(play);
    }
    dom.queue.append(row);
  }
}
function renderMessages() {
  const atEnd = dom.chat.scrollTop + dom.chat.clientHeight >= dom.chat.scrollHeight - 40;
  dom.chat.replaceChildren();
  if (!state.messages.length) dom.chat.append(textNode('p', 'Say hi to your friends 👋', 'empty-list'));
  for (const message of state.messages) {
    const row = document.createElement('div'); row.className = 'message';
    const when = new Date(message.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    row.append(textNode('strong', message.name), textNode('time', when), textNode('p', message.text));
    dom.chat.append(row);
  }
  if (atEnd) dom.chat.scrollTop = dom.chat.scrollHeight;
}
function updateTimeline() {
  if (!state) return;
  const pos = estimatedPosition();
  let duration = 0;
  try { if (state.playback.provider !== 'spotify' && playerReady) duration = Number(player.getDuration()) || 0; } catch { /* Not yet ready. */ }
  dom.position.textContent = timeLabel(pos);
  dom.duration.textContent = timeLabel(duration);
  if (!isDragging) { dom.seek.max = String(Math.max(duration || 1, pos, 1)); dom.seek.value = String(Math.min(pos, Number(dom.seek.max))); }
  if (!hasTrack()) dom.syncText.textContent = 'Waiting for a song';
  else if (state.playback.provider === 'spotify') dom.syncText.textContent = spotify.connected ? 'Spotify · syncing your own player' : 'Connect Spotify to listen';
  else if (!userEnabledPlayback) dom.syncText.textContent = 'Tap play on the video to enable audio';
  else if (state.playback.playing) dom.syncText.textContent = 'Following the room timeline';
  else dom.syncText.textContent = 'Paused for everyone';
}

function ytPlayerReady() {
  youtubeReady = true;
  if (state?.playback.videoId) syncPlayer(true);
}
window.onYouTubeIframeAPIReady = ytPlayerReady;
function loadYouTubeApi() {
  const script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api';
  script.onerror = () => showToast('Could not load YouTube. Check your browser connection.');
  document.head.append(script);
}
function createPlayer(videoId) {
  if (!youtubeReady || player) return;
  dom.placeholder.hidden = true;
  player = new window.YT.Player('youtube-player', {
    width: '100%', height: '100%', videoId,
    playerVars: { playsinline: 1, controls: 1, origin: window.location.origin, rel: 0 },
    events: {
      onReady: () => { playerReady = true; playerVideo = videoId; syncPlayer(true); },
      onStateChange: onYouTubeState,
      onAutoplayBlocked: () => { userEnabledPlayback = false; dom.start.hidden = false; showToast('Tap the video to allow playback on this device.'); },
      onError: () => showToast('This video may not allow embedding. Try another track.')
    }
  });
}
function syncPlayer(force) {
  if (state?.playback.provider === 'spotify') { spotify.syncPlayback(state.playback, estimatedPosition(), force); return; }
  if (!state?.playback.videoId || !youtubeReady) return;
  if (!player) return createPlayer(state.playback.videoId);
  if (!playerReady || applying) return;
  const pb = state.playback;
  try {
    if (playerVideo !== pb.videoId) {
      playerVideo = pb.videoId;
      suppressPlayerEventsUntil = Date.now() + 2600;
      player.cueVideoById({ videoId: pb.videoId, startSeconds: estimatedPosition() });
      dom.start.hidden = false;
      return;
    }
    if (!userEnabledPlayback) return;
    const pos = estimatedPosition();
    const actual = Number(player.getCurrentTime()) || 0;
    const videoState = player.getPlayerState();
    if (Math.abs(pos - actual) > (force ? 0.8 : 1.6)) {
      suppressPlayerEventsUntil = Date.now() + 1400;
      player.seekTo(pos, true);
    }
    if (pb.playing && videoState !== YT_PLAYING && videoState !== 3) {
      suppressPlayerEventsUntil = Date.now() + 1700;
      player.playVideo();
    } else if (!pb.playing && videoState === YT_PLAYING) {
      suppressPlayerEventsUntil = Date.now() + 1700;
      player.pauseVideo();
    }
  } catch (error) { console.debug('Sync pending', error); }
}
async function onYouTubeState(event) {
  if (Date.now() < suppressPlayerEventsUntil || !state || !isHost() || state.playback.provider === 'spotify') return;
  // Translate deliberate host interaction with official YouTube controls into room events.
  try {
    if (event.data === YT_PLAYING && !state.playback.playing) {
      userEnabledPlayback = true; dom.start.hidden = true;
      await act('seek', { position: player.getCurrentTime() });
      await act('play');
    } else if (event.data === YT_PAUSED && state.playback.playing) {
      await act('pause');
    } else if (event.data === YT_ENDED && state.queue.length) await act('next');
  } catch { /* act reports failure. */ }
}
async function act(type, extra = {}) {
  if (!credentials) return;
  try { return await api(`/api/rooms/${credentials.code}/action`, 'POST', { token: credentials.token, type, ...extra }); }
  catch (error) { showToast(error.message); return null; }
}
async function leaveRoom() {
  if (events) events.close(); events = null;
  clearInterval(updateInterval); clearInterval(presenceInterval); clearInterval(clockInterval);
  if (credentials) sessionStorage.removeItem(`shatsu.${credentials.code}`);
  if (player) { try { player.destroy(); } catch {} }
  credentials = null; state = null; player = null; playerReady = false; playerVideo = null; userEnabledPlayback = false;
  const node = document.getElementById('youtube-player'); if (!node) { const div = document.createElement('div'); div.id = 'youtube-player'; $('video-area').append(div); }
  dom.room.hidden = true; dom.lobby.hidden = false;
  window.history.replaceState(null, '', '/'); document.title = 'Shatsu — listen together';
}

dom.createTab.addEventListener('click', () => setMode('create'));
dom.joinTab.addEventListener('click', () => setMode('join'));
dom.entry.addEventListener('submit', async event => {
  event.preventDefault();
  dom.submit.disabled = true;
  try {
    const name = dom.nickname.value.trim();
    const data = mode === 'create'
      ? await api('/api/rooms', 'POST', { name })
      : await api(`/api/rooms/${dom.code.value.trim().toUpperCase()}/join`, 'POST', { name });
    await enterRoom(data);
  } catch (error) { showToast(error.message); }
  finally { dom.submit.disabled = false; }
});
const inviteLink = () => credentials ? `${window.location.origin}/?room=${encodeURIComponent(credentials.code)}` : '';
dom.copy.addEventListener('click', async () => {
  if (!credentials) return;
  try { await navigator.clipboard.writeText(inviteLink()); showToast('Invite link copied! ♡'); }
  catch { window.prompt('Copy this invite link:', inviteLink()); }
});
document.getElementById('share-btn').addEventListener('click', async () => {
  if (!credentials) return;
  const url = inviteLink();
  if (window.ShatsuAndroid?.shareInvite) { window.ShatsuAndroid.shareInvite(url); return; }
  if (navigator.share) {
    try { await navigator.share({ title: 'Listen with me on Shatsu 🎧', text: `Join my room ${credentials.code}`, url }); return; }
    catch (error) { if (error.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(url); showToast('Invite link copied — send it to a friend!'); }
  catch { window.prompt('Copy and share this invite link:', url); }
});
dom.addForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!credentials) return;
  const input = dom.input.value.trim();
  const trackId = spotifyIdFromUrl(input);
  const videoId = trackId ? null : videoIdFromUrl(input);
  if (!trackId && (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId))) return showToast('Paste an official Spotify track, YouTube or YouTube Music link.');
  const provider = trackId ? 'spotify' : 'youtube';
  const title = trackId ? 'Spotify track' : titleForUrl(input, videoId);
  const result = await act(isHost() ? 'setTrack' : 'enqueue', { provider, trackId, videoId, title });
  if (result) { dom.input.value = ''; showToast(isHost() ? 'Track loaded. Tap play to start!' : 'Added to room queue!'); }
});
dom.toggle.addEventListener('click', async () => {
  if (!isHost() || !hasTrack()) return;
  userEnabledPlayback = true;
  dom.start.hidden = true;
  if (playerReady && state.playback.provider !== 'spotify') {
    try { suppressPlayerEventsUntil = Date.now() + 1800; if (state.playback.playing) player.pauseVideo(); else player.playVideo(); } catch {}
  }
  await act(state.playback.playing ? 'pause' : 'play');
});
dom.next.addEventListener('click', () => { if (isHost()) act('next'); });
dom.sync.addEventListener('click', () => {
  if (!hasTrack()) return showToast('Add a song first.');
  userEnabledPlayback = true;
  dom.start.hidden = true;
  if (playerReady && state.playback.provider !== 'spotify') {
    try { suppressPlayerEventsUntil = Date.now() + 1300; player.seekTo(estimatedPosition(), true); if (state.playback.playing) player.playVideo(); } catch {}
  }
  syncPlayer(true); showToast(state.playback.provider === 'spotify' ? 'Refreshing Spotify sync…' : 'Caught up with the room.');
});
dom.start.addEventListener('click', () => {
  if (!state?.playback.videoId) return;
  userEnabledPlayback = true; dom.start.hidden = true;
  if (playerReady) { try { suppressPlayerEventsUntil = Date.now() + 1700; player.seekTo(estimatedPosition(), true); if (state.playback.playing) player.playVideo(); } catch {} }
  showToast('Player enabled on this device.');
});
dom.seek.addEventListener('pointerdown', () => { isDragging = true; });
dom.seek.addEventListener('input', () => { isDragging = true; dom.position.textContent = timeLabel(Number(dom.seek.value)); });
dom.seek.addEventListener('change', async () => {
  if (isHost()) await act('seek', { position: Number(dom.seek.value) });
  isDragging = false;
});
dom.chatForm.addEventListener('submit', async event => {
  event.preventDefault();
  const text = dom.chatText.value.trim(); if (!text) return;
  if (await act('chat', { text })) dom.chatText.value = '';
});
dom.leave.addEventListener('click', leaveRoom);
dom.spotifyConnect.addEventListener('click', async () => {
  if (spotify.connected) { spotify.disconnect(); dom.spotifyConnect.textContent = 'Connect Spotify'; dom.spotifyStatus.textContent = 'Spotify disconnected.'; return; }
  if (navigator.userAgent.includes('ShatsuAndroid/')) {
    showToast('For Spotify login, tap Brave ↗ in the Android app toolbar first.'); return;
  }
  try { await spotify.connect(credentials?.code); } catch (error) { showToast(error.message); }
});

const savedName = localStorage.getItem('shatsu.name'); if (savedName) dom.nickname.value = savedName;
spotify.init().catch(error => showToast(error.message)).then(() => {
const inviteCode = new URLSearchParams(location.search).get('room');
if (inviteCode && /^[A-Z2-9]{8}$/i.test(inviteCode)) {
  setMode('join'); dom.code.value = inviteCode.toUpperCase();
  const saved = sessionStorage.getItem(`shatsu.${inviteCode.toUpperCase()}`);
  if (saved) {
    try {
      const session = JSON.parse(saved);
      api(`/api/rooms/${session.code}/resume`, 'POST', { token: session.token })
        .then(enterRoom).catch(() => { sessionStorage.removeItem(`shatsu.${inviteCode.toUpperCase()}`); });
    } catch { sessionStorage.removeItem(`shatsu.${inviteCode.toUpperCase()}`); }
  }
}
});
loadYouTubeApi();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('/sw.js').catch(() => {});
