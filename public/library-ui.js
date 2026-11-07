import { getLibrary, cleanTrack } from './library.js';

const $ = id => document.getElementById(id);
function elt(tag, text, klass) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (klass) n.className = klass;
  return n;
}
function btn(text, callback, klass = 'library-action') {
  const n = elt('button', text, klass);
  n.type = 'button';
  n.addEventListener('click', callback);
  return n;
}
function recentTracks() {
  try {
    return (JSON.parse(localStorage.getItem('shatsu.recentTracks.v1') || '[]') || [])
      .map(cleanTrack).filter(Boolean).slice(0, 30);
  } catch { return []; }
}

export function initLibraryUI({ act, isHost, getState, showToast }) {
  const library = getLibrary();
  const root = $('library-panel');
  const content = $('library-content');
  const note = $('library-status');
  const likeButton = $('like-current');
  if (!root || !content || !note || !likeButton) return;
  let activeView = 'liked';
  let activePlaylistId = null;
  const safely = fn => { try { fn(); } catch (e) { showToast(e.message); } };
  const current = () => cleanTrack(getState()?.playback);
  const status = message => { note.textContent = message; };
  async function batch(songs) {
    const selected = songs.slice(0, 30).map(cleanTrack).filter(Boolean);
    if (!selected.length) { status('Select or save a song first.'); return; }
    const result = await act(isHost() ? 'playPlaylist' : 'enqueueBatch', { tracks: selected });
    if (result) showToast('Added ' + selected.length + ' songs to your room.');
  }
  function choosePlaylist(song) {
    if (!library.data.playlists.length) return status('Create a playlist first.');
    const names = library.data.playlists.map((p, i) => (i + 1) + '. ' + p.name).join('\n');
    const choice = window.prompt('Add to which playlist?\n' + names, '1');
    if (choice === null) return;
    const index = Number(choice) - 1;
    const playlist = library.data.playlists[index];
    if (!Number.isInteger(index) || !playlist) return showToast('Choose a valid number.');
    safely(() => showToast(library.addToPlaylist(playlist.id, song)
      ? 'Saved to ' + playlist.name : 'Already in that playlist.'));
  }
  function songRow(song, onRemove) {
    const row = elt('div', undefined, 'library-song');
    const detail = elt('div', undefined, 'library-song-name');
    detail.append(elt('strong', song.title), elt('span', (song.artist ? song.artist + ' · ' : '') + song.provider));
    const buttons = elt('div', undefined, 'library-song-actions');
    buttons.append(btn(isHost() ? '▶' : '+ Queue', async () => {
      const result = await act(isHost() ? 'setTrack' : 'enqueue', song);
      if (result) showToast('Song added.');
    }));
    buttons.append(btn('＋', () => choosePlaylist(song), 'library-mini-action'));
    if (onRemove) buttons.append(btn('✕', () => safely(() => onRemove(song)), 'library-mini-action'));
    row.append(detail, buttons);
    return row;
  }
  function likeState() {
    const song = current();
    likeButton.disabled = !song;
    likeButton.textContent = song && library.isFavorite(song) ? '♥ Liked' : '♡ Like';
  }
  function render() {
    for (const tab of document.querySelectorAll('[data-library-view]')) {
      const selected = tab.dataset.libraryView === activeView;
      tab.classList.toggle('selected', selected);
      tab.setAttribute('aria-pressed', String(selected));
    }
    content.replaceChildren();
    likeState();
    if (activeView === 'liked' || activeView === 'recent') {
      const songs = activeView === 'liked' ? library.data.favorites : recentTracks();
      status(activeView === 'liked' ? songs.length + ' liked songs · saved on this phone' : 'Your recent selections');
      if (!songs.length) content.append(elt('p', activeView === 'liked' ? 'Tap ♡ on a song to save it.' : 'Play a song to build your history.', 'empty-list'));
      else {
        content.append(btn(isHost() ? '▶ Play all' : '+ Queue all', () => batch(songs)));
        for (const song of songs) content.append(songRow(song, activeView === 'liked'
          ? t => library.toggleFavorite(t) : null));
      }
      return;
    }
    const playlist = library.data.playlists.find(p => p.id === activePlaylistId);
    if (!playlist) {
      activePlaylistId = null;
      status(library.data.playlists.length + ' saved playlists · stored on this phone');
      if (!library.data.playlists.length) content.append(elt('p', 'Tap Create playlist to start.', 'empty-list'));
      for (const p of library.data.playlists) {
        const row = elt('div', undefined, 'library-playlist-row');
        row.append(elt('strong', p.name + ' · ' + p.songs.length + ' songs'));
        row.append(btn('Open', () => { activePlaylistId = p.id; render(); }));
        content.append(row);
      }
      return;
    }
    status(playlist.name + ' · ' + playlist.songs.length + ' songs');
    const commands = elt('div', undefined, 'library-group-actions');
    commands.append(
      btn('← Back', () => { activePlaylistId = null; render(); }),
      btn(isHost() ? '▶ Play all' : '+ Queue all', () => batch(playlist.songs)),
      btn('+ Current', () => {
        const song = current();
        if (!song) return status('Play or select a track first.');
        safely(() => library.addToPlaylist(playlist.id, song));
      }),
      btn('Rename', () => {
        const name = window.prompt('New playlist name', playlist.name);
        if (name !== null) safely(() => library.renamePlaylist(playlist.id, name));
      }),
      btn('Delete', () => {
        if (window.confirm('Delete the playlist ' + playlist.name + '?')) {
          safely(() => library.deletePlaylist(playlist.id));
          activePlaylistId = null;
          render();
        }
      })
    );
    content.append(commands);
    if (!playlist.songs.length) content.append(elt('p', 'Save a playing song or a song from search.', 'empty-list'));
    for (const song of playlist.songs) content.append(songRow(song,
      t => library.removeFromPlaylist(playlist.id, t)));
  }
  for (const tab of document.querySelectorAll('[data-library-view]')) {
    tab.addEventListener('click', () => {
      activeView = tab.dataset.libraryView;
      activePlaylistId = null;
      render();
    });
  }
  likeButton.addEventListener('click', () => {
    const song = current();
    if (!song) return;
    safely(() => showToast(library.toggleFavorite(song) ? 'Added to Liked Songs.' : 'Removed from Liked Songs.'));
  });
  $('library-create').addEventListener('click', () => {
    const name = window.prompt('Name your new playlist');
    if (name === null) return;
    safely(() => {
      activePlaylistId = library.createPlaylist(name);
      activeView = 'playlists';
      render();
    });
  });
  $('library-export').addEventListener('click', () => {
    const blob = new Blob([library.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'shatsu-library.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('library-import').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 500000) throw new Error('Backup must be under 500 KB.');
      const input = await file.text();
      if (window.confirm('Replace saved playlists and likes on this phone with the backup?')) {
        library.importJSON(input);
        showToast('Library restored.');
      }
    } catch (e) { showToast(e.message); }
    finally { event.target.value = ''; }
  });
  window.addEventListener('shatsu:librarychange', render);
  window.addEventListener('shatsu:recentchange', () => { if (activeView === 'recent') render(); });
  window.addEventListener('shatsu:roomstate', likeState);
  render();
}
