import { randomBytes, randomUUID } from 'node:crypto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_POSITION = 24 * 60 * 60;

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function limitedText(value, max, label) {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `${label} is required`);
  const text = value.trim();
  if ([...text].length > max) throw new HttpError(400, `${label} is too long`);
  return text;
}

function numericPosition(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > MAX_POSITION) throw new HttpError(400, 'Invalid playback position');
  return Math.round(number * 100) / 100;
}

export function youtubeVideoId(input) {
  if (typeof input !== 'string' || input.length > 2048) throw new HttpError(400, 'Paste a YouTube video link');
  const trimmed = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  let url;
  try { url = new URL(trimmed); } catch { throw new HttpError(400, 'Invalid YouTube URL'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new HttpError(400, 'HTTPS YouTube links only');
  const host = url.hostname.toLowerCase();
  const isYoutube = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host);
  let candidate;
  if (host === 'youtu.be') candidate = url.pathname.slice(1).split('/')[0];
  else if (isYoutube) {
    if (url.pathname === '/watch') candidate = url.searchParams.get('v');
    else if (url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/embed/') || url.pathname.startsWith('/live/')) candidate = url.pathname.split('/')[2];
  }
  if (!candidate || !/^[A-Za-z0-9_-]{11}$/.test(candidate)) throw new HttpError(400, 'Use a valid YouTube or YouTube Music video URL');
  return candidate;
}

export class RoomStore {
  constructor({ now = () => Date.now() } = {}) {
    this.rooms = new Map();
    this.now = now;
    this.listeners = new Map();
  }

  newCode() {
    for (let n = 0; n < 20; n++) {
      const bytes = randomBytes(8);
      const code = Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
      if (!this.rooms.has(code)) return code;
    }
    throw new HttpError(503, 'Could not generate room code');
  }

  create(name) {
    name = limitedText(name, 26, 'Nickname');
    const code = this.newCode();
    const participant = this.participant(name);
    const room = {
      code, hostId: participant.id, createdAt: this.now(), lastActivity: this.now(),
      participants: new Map([[participant.id, participant]]),
      playback: { videoId: null, title: '', playing: false, position: 0, updatedAt: this.now(), revision: 0 },
      queue: [], messages: []
    };
    this.rooms.set(code, room);
    return this.credentials(room, participant);
  }

  participant(name) { return { id: randomUUID(), token: randomBytes(24).toString('hex'), name, lastSeen: this.now() }; }

  get(code) {
    const room = this.rooms.get(String(code || '').toUpperCase());
    if (!room) throw new HttpError(404, 'Room not found (or expired)');
    return room;
  }

  credentials(room, p) { return { code: room.code, token: p.token, participantId: p.id, state: this.snapshot(room) }; }

  join(code, name) {
    const room = this.get(code);
    if (room.participants.size >= 16) throw new HttpError(409, 'Room is full (16 listeners maximum)');
    name = limitedText(name, 26, 'Nickname');
    const p = this.participant(name);
    room.participants.set(p.id, p);
    room.lastActivity = this.now();
    this.emit(room);
    return this.credentials(room, p);
  }

  authorize(room, token) {
    const p = [...room.participants.values()].find(p => p.token === token);
    if (!p) throw new HttpError(401, 'Session expired. Rejoin the room.');
    p.lastSeen = this.now();
    return p;
  }

  resume(code, token) {
    const room = this.get(code);
    const p = this.authorize(room, token);
    return this.credentials(room, p);
  }

  snapshot(room) {
    return {
      code: room.code, hostId: room.hostId, serverNow: this.now(),
      participants: [...room.participants.values()].map(p => ({ id: p.id, name: p.name, online: this.now() - p.lastSeen < 46000, isHost: p.id === room.hostId })),
      playback: { ...room.playback }, queue: room.queue.map(({ id, videoId, title, addedBy }) => ({ id, videoId, title, addedBy })),
      messages: room.messages.map(({ id, name, text, at }) => ({ id, name, text, at }))
    };
  }

  subscribe(code, callback) {
    const room = this.get(code);
    if (!this.listeners.has(room.code)) this.listeners.set(room.code, new Set());
    const set = this.listeners.get(room.code);
    set.add(callback);
    callback(this.snapshot(room));
    return () => { set.delete(callback); if (!set.size) this.listeners.delete(room.code); };
  }

  emit(room) {
    const clients = this.listeners.get(room.code);
    if (clients) { const snap = this.snapshot(room); for (const callback of clients) callback(snap); }
  }

  touch(code, token) {
    const room = this.get(code);
    this.authorize(room, token);
    room.lastActivity = this.now();
    this.emit(room); // Let other listeners see updated online presence.
    return { ok: true };
  }

  action(code, token, action) {
    const room = this.get(code);
    const participant = this.authorize(room, token);
    if (!action || typeof action !== 'object') throw new HttpError(400, 'Invalid action');
    const hostOnly = ['setTrack', 'play', 'pause', 'seek', 'next', 'playQueued', 'removeQueued'];
    if (hostOnly.includes(action.type) && room.hostId !== participant.id) throw new HttpError(403, 'Only the host can control playback');
    const pb = room.playback;
    const currentPosition = () => pb.playing ? Math.max(0, pb.position + (this.now() - pb.updatedAt) / 1000) : pb.position;
    const setTimeline = (position, playing) => {
      pb.position = numericPosition(position); pb.playing = Boolean(playing); pb.updatedAt = this.now(); pb.revision += 1;
    };
    const takeTrack = ({ videoId, title }) => {
      pb.videoId = youtubeVideoId(videoId);
      pb.title = title ? limitedText(title, 100, 'Title') : 'YouTube video';
      setTimeline(0, false); // Never auto-play on joining; users must opt in.
    };
    switch (action.type) {
      case 'setTrack': takeTrack(action); break;
      case 'enqueue': {
        if (room.queue.length >= 60) throw new HttpError(409, 'Queue is full');
        const videoId = youtubeVideoId(action.videoId);
        const title = action.title ? limitedText(action.title, 100, 'Title') : 'YouTube video';
        room.queue.push({ id: randomUUID(), videoId, title, addedBy: participant.name });
        break;
      }
      case 'play':
        if (!pb.videoId) throw new HttpError(409, 'Choose a song first');
        setTimeline(currentPosition(), true); break;
      case 'pause': setTimeline(currentPosition(), false); break;
      case 'seek':
        if (!pb.videoId) throw new HttpError(409, 'Choose a song first');
        setTimeline(action.position, pb.playing); break;
      case 'next': {
        const track = room.queue.shift();
        if (track) takeTrack(track);
        else { setTimeline(0, false); }
        break;
      }
      case 'playQueued': {
        const index = room.queue.findIndex(t => t.id === action.id);
        if (index < 0) throw new HttpError(404, 'Queued song not found');
        const [track] = room.queue.splice(index, 1); takeTrack(track);
        break;
      }
      case 'removeQueued': {
        const index = room.queue.findIndex(t => t.id === action.id);
        if (index < 0) throw new HttpError(404, 'Queued song not found');
        room.queue.splice(index, 1); break;
      }
      case 'chat': {
        const text = limitedText(action.text, 280, 'Message');
        room.messages.push({ id: randomUUID(), name: participant.name, text, at: this.now() });
        if (room.messages.length > 80) room.messages.splice(0, room.messages.length - 80);
        break;
      }
      default: throw new HttpError(400, 'Unknown action');
    }
    room.lastActivity = this.now();
    this.emit(room);
    return { ok: true, state: this.snapshot(room) };
  }

  cleanup() {
    for (const [code, room] of this.rooms) {
      if (this.now() - room.lastActivity > 12 * 60 * 60 * 1000) {
        this.rooms.delete(code);
        const listeners = this.listeners.get(code);
        if (listeners) { for (const cb of listeners) cb({ expired: true, code }); this.listeners.delete(code); }
      }
    }
  }
}
