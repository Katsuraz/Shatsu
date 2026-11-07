// Uses the artist-enabled Audius streaming endpoint directly.
// No audio is fetched, copied or re-streamed through Shatsu's room server.
const ENDPOINT = 'https://api.audius.co/v1/tracks/';

export class AudiusRoomPlayer {
  constructor(audioElement, { onEnd, onBlocked, onError } = {}) {
    this.audio = audioElement;
    this.onEnd = onEnd;
    this.onBlocked = onBlocked;
    this.onError = onError;
    this.trackId = null;
    this.lastErrorAt = 0;
    this.blockedAt = 0;
    this.endReportedTrack = null;
    this.endReportedRevision = null;
    this.audio.addEventListener('ended', () => {
      if (!this.trackId || this.endReportedTrack === this.trackId && this.endReportedRevision !== null) return;
      this.endReportedTrack = this.trackId;
      this.endReportedRevision = Date.now();
      this.onEnd?.(this.trackId);
    });
    this.audio.addEventListener('error', () => {
      if (Date.now() - this.lastErrorAt < 10000) return;
      this.lastErrorAt = Date.now();
      this.onError?.('This Audius track could not play. It may be restricted or temporarily unavailable.');
    });
  }

  setVolume(value) {
    this.audio.volume = Math.max(0, Math.min(1, Number(value) / 100 || 0));
  }

  reset() {
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.trackId = null;
    this.endReportedTrack = null;
    this.endReportedRevision = null;
  }

  sync(pb, position, { canPlay = false, force = false } = {}) {
    if (pb?.provider !== 'audius' || !/^[a-z0-9]{2,32}$/i.test(pb.trackId || '')) {
      if (this.trackId) this.reset();
      return;
    }
    const changed = this.trackId !== pb.trackId;
    if (changed) {
      this.audio.pause();
      this.trackId = pb.trackId;
      this.endReportedTrack = null;
      this.endReportedRevision = null;
      // The audio element follows the official public stream redirect.
      this.audio.src = ENDPOINT + encodeURIComponent(pb.trackId) + '/stream?app_name=Shatsu';
      this.audio.load();
    }
    if (!canPlay) { this.audio.pause(); return; }
    if (this.audio.readyState >= 1 && Number.isFinite(this.audio.duration) && this.audio.duration > 0) {
      const target = Math.min(Math.max(0, position), Math.max(0, this.audio.duration - 0.25));
      if (Math.abs((this.audio.currentTime || 0) - target) > (force ? 0.9 : 2.0)) {
        try { this.audio.currentTime = target; } catch { /* Wait for metadata */ }
      }
    }
    if (!pb.playing) {
      if (!this.audio.paused) this.audio.pause();
    } else if (this.audio.paused && !this.audio.ended) {
      this.audio.play().catch(() => {
        if (Date.now() - this.blockedAt < 10000) return;
        this.blockedAt = Date.now();
        this.onBlocked?.();
      });
    }
  }

  playByGesture() {
    return this.audio.play();
  }

  pause() { this.audio.pause(); }
}
