/* Spotify Web API / PKCE provider. No Spotify credentials or tracks leave this browser for Shatsu's server. */
const AUTH_KEY = 'shatsu.spotify.oauth';
const TOKEN_KEY = 'shatsu.spotify.tokens';
const API = 'https://api.spotify.com/v1';
const AUTH = 'https://accounts.spotify.com';

function base64url(bytes) {
  let result = '';
  for (const byte of bytes) result += String.fromCharCode(byte);
  return btoa(result).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export class SpotifyController {
  constructor(report) {
    this.report = report;
    this.clientId = '';
    this.tokens = null;
    this.lastSyncAt = 0;
    this.controlledTrack = null;
    this.busy = false;
  }

  get connected() { return Boolean(this.tokens?.refresh_token || (this.tokens?.access_token && this.tokens.expires_at > Date.now())); }

  async init() {
    try {
      const response = await fetch('/api/config', { cache: 'no-store' });
      if (response.ok) this.clientId = (await response.json()).spotifyClientId || '';
    } catch { /* Connectivity handled by room UI. */ }
    try { this.tokens = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null'); } catch { this.tokens = null; }
    const params = new URLSearchParams(location.search);
    if (params.has('code') || params.has('error')) {
      const pending = JSON.parse(sessionStorage.getItem(AUTH_KEY) || 'null');
      sessionStorage.removeItem(AUTH_KEY);
      const room = pending?.room;
      history.replaceState(null, '', room ? `/?room=${encodeURIComponent(room)}` : '/');
      if (params.has('error')) throw new Error(`Spotify sign-in: ${params.get('error')}`);
      if (!pending || params.get('state') !== pending.state || Date.now() - pending.created > 600000) throw new Error('Spotify login expired. Try again.');
      const data = new URLSearchParams({ grant_type: 'authorization_code', code: params.get('code'), redirect_uri: `${location.origin}/`, client_id: this.clientId, code_verifier: pending.verifier });
      await this.exchangeToken(data);
      this.report('Spotify connected. Start a song in your Spotify app to activate a device.');
    }
    return this.connected;
  }

  async connect(room) {
    if (!this.clientId) throw new Error('Spotify is not configured. The server owner must set SHATSU_SPOTIFY_CLIENT_ID.');
    if (!isSecureContext) throw new Error('Spotify login requires HTTPS (or localhost).');
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(64)));
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const state = base64url(crypto.getRandomValues(new Uint8Array(24)));
    sessionStorage.setItem(AUTH_KEY, JSON.stringify({ verifier, state, room, created: Date.now() }));
    const query = new URLSearchParams({ response_type: 'code', client_id: this.clientId,
      redirect_uri: `${location.origin}/`, scope: 'user-read-playback-state user-modify-playback-state',
      code_challenge_method: 'S256', code_challenge: base64url(hash), state });
    location.assign(`${AUTH}/authorize?${query}`);
  }

  disconnect() {
    this.tokens = null;
    this.controlledTrack = null;
    sessionStorage.removeItem(TOKEN_KEY);
  }

  async exchangeToken(params) {
    const response = await fetch(`${AUTH}/api/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString()
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) throw new Error(data.error_description || 'Spotify login failed. Check the redirect URI.');
    this.tokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || this.tokens?.refresh_token,
      expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000
    };
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify(this.tokens));
  }

  async accessToken() {
    if (!this.tokens) throw new Error('Connect your Spotify account first.');
    if (this.tokens.expires_at > Date.now() + 60000) return this.tokens.access_token;
    if (!this.tokens.refresh_token) throw new Error('Your Spotify login expired. Reconnect your account.');
    await this.exchangeToken(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: this.tokens.refresh_token, client_id: this.clientId }));
    return this.tokens.access_token;
  }

  async request(method, path, body) {
    const token = await this.accessToken();
    const response = await fetch(`${API}${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    if (response.status === 204) return null;
    if (!response.ok) {
      if (response.status === 401) throw new Error('Spotify authorization expired. Disconnect and reconnect.');
      if (response.status === 403) throw new Error('Spotify Premium or playback permission is required.');
      if (response.status === 404) throw new Error('Open Spotify and start a song to activate a playback device.');
      if (response.status === 429) throw new Error('Spotify rate limit reached. Try again shortly.');
      throw new Error(`Spotify playback error (${response.status}).`);
    }
    return response.json().catch(() => null);
  }

  async syncPlayback(pb, estimatedPosition, force = false) {
    if (!this.connected || pb?.provider !== 'spotify' || !pb.trackId || this.busy) return;
    if (Date.now() - this.lastSyncAt < (force ? 1500 : 8000)) return;
    this.lastSyncAt = Date.now();
    this.busy = true;
    try {
      const current = await this.request('GET', '/me/player');
      const sameTrack = current?.item?.id === pb.trackId;
      const seconds = Math.max(0, Math.round(estimatedPosition));
      const positionMs = seconds * 1000;
      // Never start an unrelated Spotify track on a paused room.
      if (pb.playing && (!sameTrack || !current?.is_playing)) {
        await this.request('PUT', '/me/player/play', { uris: [`spotify:track:${pb.trackId}`], position_ms: positionMs });
        this.controlledTrack = pb.trackId;
      } else if (sameTrack && !pb.playing && current?.is_playing) {
        await this.request('PUT', '/me/player/pause');
      } else if (sameTrack && Math.abs((current?.progress_ms || 0) - positionMs) > (force ? 1600 : 3500)) {
        await this.request('PUT', `/me/player/seek?position_ms=${positionMs}`);
      }
    } catch (error) {
      // Missing active devices and insufficient Premium access must remain visible to listeners.
      if (Date.now() - (this.lastReportedAt || 0) > 20000) { this.lastReportedAt = Date.now(); this.report(error.message); }
    } finally { this.busy = false; }
  }
}
