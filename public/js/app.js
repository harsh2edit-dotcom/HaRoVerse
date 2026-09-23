(function () {
  'use strict';

  let currentView = 'home';
  let searchDebounceTimer = null;
  let currentSearchResults = [];
  let currentQueueSource = [];

  const MOODS = [
    { label: 'Bollywood', query: 'bollywood hits' },
    { label: 'Punjabi', query: 'punjabi' },
    { label: 'Romantic', query: 'romantic hindi' },
    { label: 'Party', query: 'party songs' },
    { label: 'Sad', query: 'sad hindi' },
    { label: 'Retro', query: 'old is gold hindi' },
    { label: 'Tamil', query: 'tamil hits' },
    { label: 'Telugu', query: 'telugu hits' },
    { label: 'Arijit', query: 'arijit singh' },
    { label: 'Lo-Fi', query: 'lofi hindi' }
  ];

  const $ = function (s) { return document.querySelector(s); };
  const $$ = function (s) { return document.querySelectorAll(s); };

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function toast(message, type) {
    type = type || 'info';
    const container = $('#toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle';
    else if (type === 'error') iconName = 'alert-circle';
    el.innerHTML = '<i data-lucide="' + iconName + '"></i><span>' + escapeHtml(message) + '</span>';
    container.appendChild(el);
    refreshIcons();
    setTimeout(function () {
      el.classList.add('leaving');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
    }, 2600);
  }

  function formatTime(seconds) {
    if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function switchView(view) {
    currentView = view;
    $$('.view').forEach(function (el) { el.classList.remove('active'); });
    const target = $('#view-' + view);
    if (target) target.classList.add('active');
    $$('.nav-item').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-view') === view);
    });
    $$('.bottom-nav-item').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-view') === view);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (view === 'favorites') renderFavorites();
    if (view === 'recent') renderRecent();
    if (view === 'discover') renderDiscover();
  }

  function skeletonCards(n) {
    let h = '';
    for (let i = 0; i < n; i++) h += '<div class="track-card skeleton-card"></div>';
    return h;
  }

  function skeletonRows(n) {
    let h = '';
    for (let i = 0; i < n; i++) {
      h += '<div class="track-row skeleton">' +
        '<div class="track-row-artwork"></div>' +
        '<div class="track-row-info"><div class="track-row-title"></div><div class="track-row-artist"></div></div>' +
        '<div class="track-row-duration">0:00</div></div>';
    }
    return h;
  }

  const trackCache = {};
  function cacheTracks(list) {
    if (!Array.isArray(list)) return;
    list.forEach(function (t) { if (t && t.id) trackCache[t.id] = t; });
  }

  function trackCardHTML(track) {
    if (track && track.id) trackCache[track.id] = track;
    const fav = HaRoStorage.isFavorite(track.id);
    const art = track.artwork
      ? '<img src="' + escapeHtml(track.artwork) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'" />'
      : '<i data-lucide="music"></i>';
    return '<div class="track-card" data-track-id="' + escapeHtml(track.id) + '">' +
      '<div class="card-artwork">' + art +
        '<button class="card-play" data-action="play"><i data-lucide="play"></i></button>' +
      '</div>' +
      '<div class="card-title">' + escapeHtml(track.title) + '</div>' +
      '<div class="card-artist">' + escapeHtml(track.artist) + '</div>' +
      '<div class="card-meta">' +
        '<span class="card-duration">' + formatTime(track.duration) + '</span>' +
        '<button class="card-fav' + (fav ? ' active' : '') + '" data-action="fav">' +
          '<i data-lucide="heart"></i></button>' +
      '</div></div>';
  }

  function trackRowHTML(track) {
    if (track && track.id) trackCache[track.id] = track;
    const fav = HaRoStorage.isFavorite(track.id);
    const art = track.artwork
      ? '<img src="' + escapeHtml(track.artwork) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'" />'
      : '<i data-lucide="music"></i>';
    return '<div class="track-row" data-track-id="' + escapeHtml(track.id) + '">' +
      '<div class="track-row-artwork">' + art + '</div>' +
      '<div class="track-row-info">' +
        '<div class="track-row-title">' + escapeHtml(track.title) + '</div>' +
        '<div class="track-row-artist">' + escapeHtml(track.artist) + '</div>' +
      '</div>' +
      '<button class="track-row-play" data-action="play"><i data-lucide="play"></i></button>' +
      '<span class="track-row-duration">' + formatTime(track.duration) + '</span>' +
      '<button class="track-row-fav' + (fav ? ' active' : '') + '" data-action="fav">' +
        '<i data-lucide="heart"></i></button>' +
    '</div>';
  }

  function syncFavIcons() {
    $$('[data-track-id]').forEach(function (row) {
      const id = row.getAttribute('data-track-id');
      const fav = HaRoStorage.isFavorite(id);
      const btn = row.querySelector('[data-action="fav"]');
      if (btn) btn.classList.toggle('active', fav);
    });
    updatePlayerFavButton();
  }

  function playTrack(track, sourceList) {
    if (!track) return;
    currentQueueSource = Array.isArray(sourceList) ? sourceList.slice() : [];
    HaRoPlayer.playTrack(track, sourceList);
    HaRoStorage.addRecent(track);
    renderHomeRecent();
    syncFavIcons();
  }

  async function loadHome() {
    try {
      const trending = await HaRoAPI.browseTracks(12, 0);
      const row = $('#trendingRow');
      const tracks = trending.tracks || [];
      cacheTracks(tracks);
      if (row) {
        row.innerHTML = tracks.length > 0
          ? tracks.map(trackCardHTML).join('')
          : '<p style="color:var(--text-3);font-size:14px;padding:12px;">No tracks available.</p>';
      }
    } catch (err) {
      const row = $('#trendingRow');
      if (row) row.innerHTML = '<p style="color:var(--text-3);font-size:14px;padding:12px;">' + escapeHtml(err.message) + '</p>';
    }

    try {
      const rec = await HaRoAPI.searchTracks('bollywood hits', 12, 0);
      const row = $('#recommendRow');
      const tracks = rec.tracks || [];
      cacheTracks(tracks);
      if (row) {
        row.innerHTML = tracks.length > 0
          ? tracks.map(trackCardHTML).join('')
          : '<p style="color:var(--text-3);font-size:14px;padding:12px;">No recommendations yet.</p>';
      }
    } catch (err) {
      const row = $('#recommendRow');
      if (row) row.innerHTML = '<p style="color:var(--text-3);font-size:14px;padding:12px;">' + escapeHtml(err.message) + '</p>';
    }

    renderHomeRecent();
    refreshIcons();
  }

  function renderHomeRecent() {
    const recent = HaRoStorage.getRecent();
    const section = $('#recentHomeSection');
    const row = $('#recentHomeRow');
    if (!section || !row) return;
    if (recent.length === 0) { section.style.display = 'none'; return; }
    section.style.display = '';
    cacheTracks(recent);
    row.innerHTML = recent.slice(0, 12).map(trackCardHTML).join('');
    refreshIcons();
  }

  function renderMoodChips() {
    const c = $('#moodChips');
    if (!c) return;
    c.innerHTML = MOODS.map(function (m) {
      return '<button class="mood-chip" data-query="' + escapeHtml(m.query) + '">' + escapeHtml(m.label) + '</button>';
    }).join('');
  }

  function bindMoodChips() {
    const c = $('#moodChips');
    if (!c) return;
    c.addEventListener('click', function (e) {
      const chip = e.target.closest('.mood-chip');
      if (!chip) return;
      const q = chip.getAttribute('data-query');
      $$('.mood-chip').forEach(function (x) { x.classList.remove('active'); });
      chip.classList.add('active');
      const si = $('#searchInput');
      if (si) si.value = q;
      switchView('search');
      runSearch(q);
    });
  }

  async function runSearch(term) {
    term = (term || '').trim();
    if (!term) return;
    HaRoStorage.addHistory(term);
    renderSearchHistory();

    const results = $('#searchResults');
    const empty = $('#searchEmpty');
    const historySection = $('#searchHistorySection');
    if (historySection) historySection.classList.add('hidden');
    if (empty) empty.classList.add('hidden');
    results.innerHTML = skeletonRows(6);

    try {
      const data = await HaRoAPI.searchTracks(term, 30, 0);
      currentSearchResults = data.tracks || [];
      cacheTracks(currentSearchResults);
      if (currentSearchResults.length === 0) {
        results.innerHTML = '';
        if (empty) {
          empty.querySelector('h3').textContent = 'No sounds found';
          empty.querySelector('p').textContent = 'Try another search.';
          empty.classList.remove('hidden');
        }
        refreshIcons();
        return;
      }
      results.innerHTML = currentSearchResults.map(trackRowHTML).join('');
      refreshIcons();
    } catch (err) {
      results.innerHTML = '';
      if (empty) {
        empty.querySelector('h3').textContent = err.message;
        empty.querySelector('p').textContent = 'Please try again.';
        empty.classList.remove('hidden');
        refreshIcons();
      }
      toast('Music service unavailable', 'error');
    }
  }

  function renderSearchHistory() {
    const history = HaRoStorage.getHistory();
    const section = $('#searchHistorySection');
    const chips = $('#historyChips');
    if (!section || !chips) return;
    if (history.length === 0) { section.classList.add('hidden'); return; }
    const results = $('#searchResults');
    const hasResults = results && results.children.length > 0;
    section.classList.toggle('hidden', hasResults);
    chips.innerHTML = history.map(function (h) {
      return '<button class="history-chip" data-term="' + escapeHtml(h) + '">' + escapeHtml(h) + '</button>';
    }).join('');
  }

  function bindSearchHistory() {
    const chips = $('#historyChips');
    if (chips) {
      chips.addEventListener('click', function (e) {
        const chip = e.target.closest('.history-chip');
        if (!chip) return;
        const t = chip.getAttribute('data-term');
        const si = $('#searchInput');
        if (si) si.value = t;
        runSearch(t);
      });
    }
    const clearBtn = $('#clearHistoryBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        HaRoStorage.clearHistory();
        renderSearchHistory();
        toast('Search history cleared', 'info');
      });
    }
  }

  function bindSearchInputs() {
    const si = $('#searchInput');
    const hi = $('#homeSearchInput');
    const cb = $('#clearSearchBtn');

    function onInput(e) {
      const v = e.target.value;
      if (cb) cb.classList.toggle('visible', v.length > 0);
      clearTimeout(searchDebounceTimer);
      if (!v.trim()) {
        if ($('#searchResults')) $('#searchResults').innerHTML = '';
        if ($('#searchEmpty')) $('#searchEmpty').classList.add('hidden');
        renderSearchHistory();
        return;
      }
      searchDebounceTimer = setTimeout(function () { runSearch(v); }, 400);
    }

    if (si) {
      si.addEventListener('input', onInput);
      si.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { clearTimeout(searchDebounceTimer); runSearch(si.value); }
      });
    }
    if (hi) {
      hi.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          const t = hi.value.trim();
          if (!t) return;
          if (si) si.value = t;
          switchView('search');
          runSearch(t);
        }
      });
    }
    if (cb) {
      cb.addEventListener('click', function () {
        if (si) si.value = '';
        cb.classList.remove('visible');
        if ($('#searchResults')) $('#searchResults').innerHTML = '';
        if ($('#searchEmpty')) $('#searchEmpty').classList.add('hidden');
        renderSearchHistory();
      });
    }
  }

  function renderFavorites() {
    const list = $('#favoritesList');
    const empty = $('#favoritesEmpty');
    if (!list || !empty) return;
    const favs = HaRoStorage.getFavorites();
    if (favs.length === 0) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
      refreshIcons();
      return;
    }
    empty.classList.add('hidden');
    cacheTracks(favs);
    list.innerHTML = favs.map(trackRowHTML).join('');
    refreshIcons();
  }

  function renderRecent() {
    const list = $('#recentList');
    const empty = $('#recentEmpty');
    if (!list || !empty) return;
    const recent = HaRoStorage.getRecent();
    if (recent.length === 0) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
      refreshIcons();
      return;
    }
    empty.classList.add('hidden');
    cacheTracks(recent);
    list.innerHTML = recent.map(trackRowHTML).join('');
    refreshIcons();
  }

  async function renderDiscover() {
    const list = $('#discoverList');
    if (!list || list.dataset.loaded === '1') return;
    list.innerHTML = skeletonRows(8);
    try {
      const data = await HaRoAPI.browseTracks(30, 0);
      const tracks = data.tracks || [];
      cacheTracks(tracks);
      if (tracks.length === 0) {
        list.innerHTML = '<div class="empty-state"><h3>No tracks found</h3></div>';
        refreshIcons();
        return;
      }
      list.innerHTML = tracks.map(trackRowHTML).join('');
      refreshIcons();
      list.dataset.loaded = '1';
    } catch (err) {
      list.innerHTML = '<div class="empty-state"><h3>' + escapeHtml(err.message) + '</h3></div>';
      refreshIcons();
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    HaRoStorage.setTheme(theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0d0805' : '#fff8f0');
    $$('.theme-toggle').forEach(function (btn) {
      btn.innerHTML = '<i data-lucide="' + (theme === 'dark' ? 'sun' : 'moon') + '"></i><span>Theme</span>';
    });
    refreshIcons();
  }

  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  }

  function bindTheme() {
    $$('.theme-toggle').forEach(function (btn) {
      btn.addEventListener('click', toggleTheme);
    });
  }

  function bindPlayerUI() {
    const playBtn = $('#playPauseBtn');
    const miniBtn = $('#miniPlayBtn');
    const prevBtn = $('#prevBtn');
    const nextBtn = $('#nextBtn');
    const shuffleBtn = $('#shuffleBtn');
    const repeatBtn = $('#repeatBtn');
    const progBar = $('#progressBar');
    const volBar = $('#volumeBar');
    const favBtn = $('#playerFavBtn');
    const queueBtn = $('#queueBtn');

    const npPlay = $('#npPlayPauseBtn');
    const npPrev = $('#npPrevBtn');
    const npNext = $('#npNextBtn');
    const npShuffle = $('#npShuffleBtn');
    const npRepeat = $('#npRepeatBtn');
    const npProg = $('#npProgressBar');
    const npFav = $('#npFavBtn');
    const npClose = $('#npCloseBtn');
    const mini = $('#miniPlayer');

    if (playBtn) playBtn.addEventListener('click', function () { HaRoPlayer.togglePlay(); });
    if (miniBtn) miniBtn.addEventListener('click', function (e) { e.stopPropagation(); HaRoPlayer.togglePlay(); });
    if (prevBtn) prevBtn.addEventListener('click', function () { HaRoPlayer.prev(); });
    if (nextBtn) nextBtn.addEventListener('click', function () { HaRoPlayer.next(); });
    if (shuffleBtn) shuffleBtn.addEventListener('click', function () {
      const on = HaRoPlayer.toggleShuffle();
      shuffleBtn.classList.toggle('active', on);
      if (npShuffle) npShuffle.classList.toggle('active', on);
      toast(on ? 'Shuffle on' : 'Shuffle off', 'info');
    });
    if (repeatBtn) repeatBtn.addEventListener('click', function () {
      const m = HaRoPlayer.toggleRepeat();
      repeatBtn.classList.toggle('active', m !== 'off');
      if (npRepeat) npRepeat.classList.toggle('active', m !== 'off');
      toast('Repeat: ' + m, 'info');
    });
    if (progBar) progBar.addEventListener('input', function () { HaRoPlayer.seek(parseFloat(progBar.value)); });
    if (npProg) npProg.addEventListener('input', function () { HaRoPlayer.seek(parseFloat(npProg.value)); });
    if (volBar) volBar.addEventListener('input', function () { HaRoPlayer.setVolume(parseFloat(volBar.value)); });

    function handleFav() {
      const t = HaRoPlayer.getCurrent();
      if (!t) return;
      const f = HaRoStorage.toggleFavorite(t);
      toast(f ? 'Added to favorites' : 'Removed from favorites', 'success');
      syncFavIcons();
    }
    if (favBtn) favBtn.addEventListener('click', handleFav);
    if (npFav) npFav.addEventListener('click', handleFav);

    if (queueBtn) queueBtn.addEventListener('click', openQueue);
    if (npPlay) npPlay.addEventListener('click', function () { HaRoPlayer.togglePlay(); });
    if (npPrev) npPrev.addEventListener('click', function () { HaRoPlayer.prev(); });
    if (npNext) npNext.addEventListener('click', function () { HaRoPlayer.next(); });
    if (npShuffle) npShuffle.addEventListener('click', function () {
      const on = HaRoPlayer.toggleShuffle();
      npShuffle.classList.toggle('active', on);
      if (shuffleBtn) shuffleBtn.classList.toggle('active', on);
    });
    if (npRepeat) npRepeat.addEventListener('click', function () {
      const m = HaRoPlayer.toggleRepeat();
      npRepeat.classList.toggle('active', m !== 'off');
      if (repeatBtn) repeatBtn.classList.toggle('active', m !== 'off');
    });
    if (npClose) npClose.addEventListener('click', function () {
      $('#nowPlaying').classList.remove('open');
    });
    if (mini) mini.addEventListener('click', function () {
      $('#nowPlaying').classList.add('open');
    });

    const closeQueue = $('#closeQueueBtn');
    if (closeQueue) closeQueue.addEventListener('click', closeQueuePanel);

    HaRoPlayer.setCallbacks({
      onTrackChange: updatePlayerTrack,
      onStateChange: updatePlayerState
    });
  }

  function updatePlayerTrack(track) {
    if (!track) return;
    const art = track.artwork
      ? '<img src="' + escapeHtml(track.artwork) + '" alt="" onerror="this.style.display=\'none\'" />'
      : '<i data-lucide="music"></i>';

    ['#playerArtwork', '#miniArtwork', '#npArtwork'].forEach(function (s) {
      const el = $(s);
      if (el) el.innerHTML = art;
    });
    ['#playerTitle', '#miniTitle', '#npTitle'].forEach(function (s) {
      const el = $(s);
      if (el) el.textContent = track.title;
    });
    ['#playerArtist', '#miniArtist', '#npArtist'].forEach(function (s) {
      const el = $(s);
      if (el) el.textContent = track.artist;
    });
    const total = formatTime(track.duration);
    ['#totalTime', '#npTotalTime'].forEach(function (s) {
      const el = $(s);
      if (el) el.textContent = total;
    });
    const mini = $('#miniPlayer');
    if (mini) mini.classList.remove('hidden');
    updatePlayerFavButton();
    refreshIcons();
  }

  function updatePlayerFavButton() {
    const t = HaRoPlayer.getCurrent();
    if (!t) return;
    const f = HaRoStorage.isFavorite(t.id);
    ['#playerFavBtn', '#npFavBtn'].forEach(function (s) {
      const b = $(s);
      if (b) b.classList.toggle('active', f);
    });
  }

  function updatePlayerState(state) {
    if (!state) return;
    if (state.error && state.error !== 'Tap to play') {
      toast(state.error, 'error');
    }

    const playing = state.playing === true || (state.paused === false);

    ['#playPauseBtn', '#miniPlayBtn', '#npPlayPauseBtn'].forEach(function (s) {
      const btn = $(s);
      if (btn) btn.innerHTML = '<i data-lucide="' + (playing ? 'pause' : 'play') + '"></i>';
    });

    const npArt = $('#npArtwork');
    if (npArt) npArt.classList.toggle('playing', playing);

    const miniBars = $('#miniBars');
    if (miniBars) miniBars.classList.toggle('active', playing);

    // Update playing card highlight
    const current = HaRoPlayer.getCurrent();
    if (current) {
      $$('[data-track-id]').forEach(function (row) {
        row.classList.toggle('playing', row.getAttribute('data-track-id') === current.id && playing);
      });
    }

    if (typeof state.currentTime === 'number' && typeof state.duration === 'number' && state.duration > 0) {
      const p = (state.currentTime / state.duration) * 100;
      const cur = formatTime(state.currentTime);
      const dur = formatTime(state.duration);
      ['#progressBar', '#npProgressBar'].forEach(function (s) {
        const el = $(s);
        if (el) el.value = p;
      });
      ['#currentTime', '#npCurrentTime'].forEach(function (s) {
        const el = $(s);
        if (el) el.textContent = cur;
      });
      ['#totalTime', '#npTotalTime'].forEach(function (s) {
        const el = $(s);
        if (el) el.textContent = dur;
      });
    }
    refreshIcons();
  }

  function openQueue() {
    const panel = $('#queuePanel');
    const list = $('#queueList');
    if (!panel || !list) return;
    const queue = HaRoPlayer.getQueue();
    const current = HaRoPlayer.getCurrent();
    const cid = current ? current.id : null;
    if (queue.length === 0) {
      list.innerHTML = '<p style="color:var(--text-3);font-size:14px;padding:12px;">Queue is empty.</p>';
    } else {
      list.innerHTML = queue.map(function (t) {
        const active = t.id === cid;
        const art = t.artwork
          ? '<img src="' + escapeHtml(t.artwork) + '" alt="" />'
          : '<i data-lucide="music"></i>';
        return '<div class="track-row' + (active ? ' playing' : '') + '" data-queue-id="' + escapeHtml(t.id) + '">' +
          '<div class="track-row-artwork">' + art + '</div>' +
          '<div class="track-row-info">' +
            '<div class="track-row-title">' + escapeHtml(t.title) + '</div>' +
            '<div class="track-row-artist">' + escapeHtml(t.artist) + '</div>' +
          '</div></div>';
      }).join('');
    }
    list.onclick = function (e) {
      const row = e.target.closest('[data-queue-id]');
      if (!row) return;
      const id = row.getAttribute('data-queue-id');
      const t = queue.find(function (x) { return x.id === id; });
      if (t) { playTrack(t, queue); closeQueuePanel(); }
    };
    panel.classList.add('open');
    refreshIcons();
  }

  function closeQueuePanel() {
    const p = $('#queuePanel');
    if (p) p.classList.remove('open');
  }

  function bindTrackActions(container, getter) {
    if (!container) return;
    container.addEventListener('click', function (e) {
      const row = e.target.closest('[data-track-id]');
      if (!row) return;
      const id = row.getAttribute('data-track-id');
      const list = typeof getter === 'function' ? getter() : [];
      const track = trackCache[id] || list.find(function (t) { return t.id === id; });
      if (!track) return;
      const actionEl = e.target.closest('[data-action]');
      const action = actionEl ? actionEl.getAttribute('data-action') : null;

      if (action === 'play') { e.stopPropagation(); playTrack(track, list); return; }
      if (action === 'fav') {
        e.stopPropagation();
        const f = HaRoStorage.toggleFavorite(track);
        toast(f ? 'Added to favorites' : 'Removed from favorites', 'success');
        syncFavIcons();
        if (currentView === 'favorites') renderFavorites();
        return;
      }
      playTrack(track, list);
    });
  }

  function bindNavigation() {
    $$('.nav-item, .bottom-nav-item').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        const v = el.getAttribute('data-view');
        if (v) switchView(v);
      });
    });
  }

  function init() {
    applyTheme(HaRoStorage.getTheme());
    refreshIcons();
    renderMoodChips();
    bindNavigation();
    bindTheme();
    bindSearchInputs();
    bindSearchHistory();
    bindMoodChips();
    bindPlayerUI();

    bindTrackActions($('#searchResults'), function () { return currentSearchResults; });
    bindTrackActions($('#favoritesList'), function () { return HaRoStorage.getFavorites(); });
    bindTrackActions($('#recentList'), function () { return HaRoStorage.getRecent(); });
    bindTrackActions($('#trendingRow'), function () { return currentQueueSource; });
    bindTrackActions($('#recommendRow'), function () { return currentQueueSource; });
    bindTrackActions($('#recentHomeRow'), function () { return HaRoStorage.getRecent(); });
    bindTrackActions($('#discoverList'), function () { return currentQueueSource; });

    loadHome();
    renderSearchHistory();
    refreshIcons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
