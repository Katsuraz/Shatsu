import { randomBytes, randomUUID } from 'node:crypto';
import { HttpError } from './validation.js';
import { parseTrack, youtubeVideoId } from './track.js';
export { HttpError, youtubeVideoId };

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_POSITION = 24 * 60 * 60;

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
      playback: { provider: 'youtube', trackId: null, videoId: null, title: '', playing: false, position: 0, updatedAt: this.now(), revision: 0 },
      settings: { autoPlay: true, autoNext: true, shuffle: false, repeat: 'off' },
      history: [], queue: [], messages: []
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
      playback: { ...room.playback }, settings: { ...room.settings }, canGoBack: room.history.length > 0,
      queue: room.queue.map(({ id, provider, trackId, videoId, title, addedBy }) => ({ id, provider, trackId, videoId, title, addedBy })),
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
    const hostOnly = ['setTrack', 'play', 'pause', 'seek', 'next', 'previous', 'playQueued', 'removeQueued', 'setSettings'];
    if (hostOnly.includes(action.type) && room.hostId !== participant.id) throw new HttpError(403, 'Only the host can control playback');
    const pb = room.playback;
    const currentPosition = () => pb.playing ? Math.max(0, pb.position + (this.now() - pb.updatedAt) / 1000) : pb.position;
    const setTimeline = (position, playing) => {
      pb.position = numericPosition(position); pb.playing = Boolean(playing); pb.updatedAt = this.now(); pb.revision += 1;
    };
    const currentTrack = () => (pb.videoId || pb.trackId)
      ? { provider: pb.provider, videoId: pb.videoId, trackId: pb.trackId, title: pb.title }
      : null;
    const takeTrack = ({ videoId, trackId, provider, title }, { play = room.settings.autoPlay } = {}) => {
      const parsed = parseTrack(trackId || videoId, provider);
      pb.provider = parsed.provider; pb.trackId = parsed.trackId; pb.videoId = parsed.videoId;
      pb.title = title ? limitedText(title, 100, 'Title') : (parsed.provider === 'spotify' ? 'Spotify track' : 'YouTube video');
      setTimeline(0, play);
    };
    const advance = (automatic = false) => {
      // Two delayed ENDED events must never skip two songs.
      if (automatic && action.expectedRevision !== pb.revision) return;
      if (automatic && !room.settings.autoNext) { setTimeline(currentPosition(), false); return; }
      const current = currentTrack();
      if (automatic && room.settings.repeat === 'one' && current) {
        takeTrack(current); return;
      }
      if (room.settings.repeat === 'all' && current) {
        room.queue.push({ id: randomUUID(), ...current, addedBy: 'Repeat' });
      }
      const nextIndex = room.settings.shuffle && room.queue.length > 1
        ? Math.floor(Math.random() * room.queue.length) : 0;
      const track = room.queue.splice(nextIndex, 1)[0];
      if (track) {
        if (current) {
          room.history.push(current);
          if (room.history.length > 40) room.history.shift();
        }
        takeTrack(track);
      } else {
        setTimeline(0, false);
      }
    };
    switch (action.type) {
      case 'setTrack': {
        const previous = currentTrack();
        if (previous) { room.history.push(previous); if (room.history.length > 40) room.history.shift(); }
        takeTrack(action); break;
      }
      case 'setSettings': {
        const allowed = ['autoPlay', 'autoNext', 'shuffle', 'repeat'];
        if (!action.key || !allowed.includes(action.key)) throw new HttpError(400, 'Invalid setting');
        if (action.key === 'repeat') {
          if (!['off', 'one', 'all'].includes(action.value)) throw new HttpError(400, 'Invalid repeat mode');
        } else if (typeof action.value !== 'boolean') throw new HttpError(400, 'Setting must be on or off');
        room.settings[action.key] = action.value;
        break;
      }
      case 'enqueue': {
        if (room.queue.length >= 60) throw new HttpError(409, 'Queue is full');
        const parsed = parseTrack(action.trackId || action.videoId, action.provider);
        const title = action.title ? limitedText(action.title, 100, 'Title') : (parsed.provider === 'spotify' ? 'Spotify track' : 'YouTube video');
        room.queue.push({ id: randomUUID(), ...parsed, title, addedBy: participant.name });
        break;
      }
      case 'play':
        if (!pb.videoId && !pb.trackId) throw new HttpError(409, 'Choose a song first');
        setTimeline(currentPosition(), true); break;
      case 'pause': setTimeline(currentPosition(), false); break;
      case 'seek':
        if (!pb.videoId && !pb.trackId) throw new HttpError(409, 'Choose a song first');
        setTimeline(action.position, pb.playing); break;
      case 'next': {
        if (action.automatic && !Number.isSafeInteger(action.expectedRevision)) throw new HttpError(400, 'Playback revision required');
        advance(action.automatic === true);
        break;
      }
      case 'previous': {
        const track = room.history.pop();
        if (!track) throw new HttpError(409, 'No previous song yet');
        const current = currentTrack();
        if (current) room.queue.unshift({ id: randomUUID(), ...current, addedBy: 'History' });
        takeTrack(track);
        break;
      }
      case 'playQueued': {
        const index = room.queue.findIndex(t => t.id === action.id);
        if (index < 0) throw new HttpError(404, 'Queued song not found');
        const [track] = room.queue.splice(index, 1);
        const current = currentTrack();
        if (current) room.history.push(current);
        takeTrack(track);
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
