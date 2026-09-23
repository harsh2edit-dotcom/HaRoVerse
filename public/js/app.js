/* ============================================================
   HaRoVerse — App module
   UI orchestration, views, search, favorites, collections
   ============================================================ */

(function () {
  'use strict';

  /* ---------- State ---------- */
  let currentView = 'home';
  let searchDebounceTimer = null;
  let currentSearchResults = [];
  let allCollectionsLoaded = false;
  let currentCollectionId = null;
  let currentQueueSource = [];

  const MOODS = [
    'Chill', 'Focus', 'Cinematic', 'Energetic', 'Dark',
    'Happy', 'Romantic', 'Travel', 'Workout', 'Lo-Fi'
  ];

  /* ---------- DOM refs ---------- */
  const $ = function (sel) { return document.querySelector(sel); };
  const $$ = function (sel) { return document.querySelectorAll(sel); };

  /* ---------- Lucide re-render helper ---------- */
  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  /* ---------- Toast ---------- */
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
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 260);
    }, 2800);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ---------- Formatting ---------- */
  function formatTime(seconds) {
    if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* ---------- View switching ---------- */
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

    const main = $('#mainContent');
    if (main) main.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (view === 'favorites') renderFavorites();
    if (view === 'recent') renderRecent();
    if (view === 'collections') renderCollections();
    if (view === 'discover') renderDiscover();
  }

  /* ---------- Skeleton helpers ---------- */
  function skeletonCards(count) {
    let html = '';
    for (let i = 0; i < count; i++) {
      html += '<div class="track-card skeleton-card"></div>';
    }
    return html;
  }

  function skeletonRows(count) {
    let html = '';
    for (let i = 0; i < count; i++) {
      html += '<div class="track-row skeleton">' +
        '<div class="track-row-artwork"></div>' +
        '<div class="track-row-info"><div class="track-row-title"></div><div class="track-row-artist"></div></div>' +
        '<div class="track-row-duration">0:00</div>' +
        '</div>';
    }
    return html;
  }

  /* ---------- Track cache ---------- */
  const trackCache = {};

  function cacheTrack(track) {
    if (track && track.id) trackCache[track.id] = track;
  }

  function cacheTracks(list) {
    if (!Array.isArray(list)) return;
    list.forEach(cacheTrack);
  }

  /* ---------- Track rendering ---------- */

  function trackCardHTML(track) {
    cacheTrack(track);
    const fav = HaRoStorage.isFavorite(track.id);
    const art = track.artwork
      ? '<img src="' + escapeHtml(track.artwork) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'" />'
      : '<i data-lucide="music"></i>';

    return '<div class="track-card" data-track-id="' + escapeHtml(track.id) + '">' +
      '<div class="card-artwork">' +
        art +
        '<button class="card-play" data-action="play" aria-label="Play"><i data-lucide="play"></i></button>' +
      '</div>' +
      '<div class="card-title">' + escapeHtml(track.title) + '</div>' +
      '<div class="card-artist">' + escapeHtml(track.artist) + '</div>' +
      '<div class="card-meta">' +
        '<span class="card-duration">' + formatTime(track.duration) + '</span>' +
        '<button class="card-fav' + (fav ? ' active' : '') + '" data-action="fav" aria-label="Favorite">' +
          '<i data-lucide="heart"></i>' +
        '</button>' +
      '</div>' +
    '</div>';
  }

  function trackRowHTML(track) {
    cacheTrack(track);
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
      '<button class="track-row-play" data-action="play" aria-label="Play"><i data-lucide="play"></i></button>' +
      '<span class="track-row-duration">' + formatTime(track.duration) + '</span>' +
      '<button class="track-row-fav' + (fav ? ' active' : '') + '" data-action="fav" aria-label="Favorite">' +
        '<i data-lucide="heart"></i>' +
      '</button>' +
    '</div>';
  }

  /* ---------- Fav icons sync ---------- */
  function syncFavIcons() {
    $$('[data-track-id]').forEach(function (row) {
      const id = row.getAttribute('data-track-id');
      const fav = HaRoStorage.isFavorite(id);
      const favBtn = row.querySelector('[data-action="fav"]');
      if (favBtn) favBtn.classList.toggle('active', fav);
    });
    updatePlayerFavButton();
  }

  /* ---------- Play track ---------- */
  function playTrack(track, sourceList) {
    if (!track) return;
    cacheTrack(track);
    currentQueueSource = Array.isArray(sourceList) ? sourceList.slice() : [];
    HaRoPlayer.playTrack(track, sourceList);
    HaRoStorage.addRecent(track);
    renderHomeRecent();
    syncFavIcons();
  }

  /* ---------- Load Home data ---------- */
  async function loadHome() {
    try {
      const trending = await HaRoAPI.browseTracks(12, 0);
      const row = $('#trendingRow');
      if (row) {
        const tracks = trending.tracks || [];
        cacheTracks(tracks);
        row.innerHTML = tracks.length > 0
          ? tracks.map(trackCardHTML).join('')
          : '<p style="color:var(--text-3);font-size:14px;padding:12px;">No tracks available.</p>';
        refreshIcons();
      }
    } catch (err) {
      const row = $('#trendingRow');
      if (row) row.innerHTML = '<p style="color:var(--text-3);font-size:14px;padding:12px;">' + escapeHtml(err.message) + '</p>';
    }

    try {
      const recommend = await HaRoAPI.searchTracks('uplifting', 12, 0);
      const row = $('#recommendRow');
      if (row) {
        const tracks = recommend.tracks || [];
        cacheTracks(tracks);
        row.innerHTML = tracks.length > 0
          ? tracks.map(trackCardHTML).join('')
          : '<p style="color:var(--text-3);font-size:14px;padding:12px;">No recommendations yet.</p>';
        refreshIcons();
      }
    } catch (err) {
      const row = $('#recommendRow');
      if (row) row.innerHTML = '<p style="color:var(--text-3);font-size:14px;padding:12px;">' + escapeHtml(err.message) + '</p>';
    }

    renderHomeRecent();
  }

  function renderHomeRecent() {
    const recent = HaRoStorage.getRecent();
    const section = $('#recentHomeSection');
    const row = $('#recentHomeRow');
    if (!section || !row) return;

    if (recent.length === 0) {
      section.style.display = 'none';
      return;
    }
    section.style.display = '';
    cacheTracks(recent);
    row.innerHTML = recent.slice(0, 12).map(trackCardHTML).join('');
    refreshIcons();
  }

  /* ---------- Moods ---------- */
  function renderMoodChips() {
    const container = $('#moodChips');
    if (!container) return;
    container.innerHTML = MOODS.map(function (m) {
      return '<button class="mood-chip" data-mood="' + escapeHtml(m) + '">' + escapeHtml(m) + '</button>';
    }).join('');
  }

  function bindMoodChips() {
    const container = $('#moodChips');
    if (!container) return;
    container.addEventListener('click', function (e) {
      const chip = e.target.closest('.mood-chip');
      if (!chip) return;
      const mood = chip.getAttribute('data-mood');
      $$('.mood-chip').forEach(function (c) { c.classList.remove('active'); });
      chip.classList.add('active');
      const si = $('#searchInput');
      if (si) si.value = mood;
      switchView('search');
      runSearch(mood);
    });
  }

  /* ---------- Search ---------- */
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

    if (history.length === 0) {
      section.classList.add('hidden');
      return;
    }

    const results = $('#searchResults');
    const hasResults = results && results.children.length > 0;
    if (hasResults) {
      section.classList.add('hidden');
    } else {
      section.classList.remove('hidden');
    }

    chips.innerHTML = history.map(function (h) {
      return '<button class="history-chip" data-term="' + escapeHtml(h) + '">' + escapeHtml(h) + '</button>';
    }).join('');
 ');
 }

  function bindSearchHistory() {
           const chips = $('#historyChips const');
    if (chips) {
      chips.addEventListener('click', function (e) {
        const chip = e.target input = $('#search.closest('.history-chip');
        if (!chip) return;
        const term = chip.getAttribute('data-termInput');
        if (input) input.value = term;
        runSearch(term);
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
    const searchInput = $('#searchInput');
    const homeInput = $('#homeSearchInput');
    const clearBtn = $('#clearSearchBtn');

    function handleInput(e) {
      const value = e.target.value;
      if (clearBtn) clearBtn.classList.toggle('visible', value.length > 0);

      clearTimeout(searchDebounceTimer);
      if (!value.trim()) {
        if ($('#searchResults')) $('#searchResults').innerHTML = '';
        if ($('#searchEmpty')) $('#searchEmpty').classList.add('hidden');
        renderSearchHistory();
        return;
      }
      searchDebounceTimer = setTimeout(function () {
        runSearch(value);
      }, 380);
    }

    if (searchInput) {
      searchInput.addEventListener('input', handleInput);
      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          clearTimeout(searchDebounceTimer);
          runSearch(searchInput.value);
        }
      });
    }

    if (homeInput) {
      homeInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          const term = homeInput.value.trim();
          if (!term) return;
          const si = $('#searchInput');
          if (si) si.value = term;
          switchView('search');
          runSearch(term);
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        if (searchInput) searchInput.value = '';
        clearBtn.classList.remove('visible');
        if ($('#searchResults')) $('#searchResults').innerHTML = '';
        if ($('#searchEmpty')) $('#searchEmpty').classList.add('hidden');
        renderSearchHistory();
      });
    }
  }

  /* ---------- Favorites ---------- */
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

  /* ---------- Recently Played ---------- */
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

  /* ---------- Collections ---------- */
  async function renderCollections() {
    if (allCollectionsLoaded) return;
    const grid = $('#collectionsGrid');
    const empty = $('#collectionsEmpty');
    if (!grid || !empty) return;

    grid.innerHTML = skeletonCards(4);

    try {
      const data = await HaRoAPI.listCollections(20, 0);
      const collections = data.collections || [];

      if (collections.length === 0) {
        grid.innerHTML = '';
        empty.classList.remove('hidden');
        refreshIcons();
        return;
      }

      empty.classList.add('hidden');
      grid.innerHTML = collections.map(function (c) {
        const art = c.artwork
          ? '<img src="' + escapeHtml(c.artwork) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'" />'
          : '<i data-lucide="library"></i>';
        return '<div class="collection-card" data-collection-id="' + escapeHtml(c.id) + '">' +
          '<div class="collection-artwork">' + art + '</div>' +
          '<div class="collection-info">' +
            '<div class="collection-title">' + escapeHtml(c.title) + '</div>' +
            '<div class="collection-desc">' + escapeHtml(c.description || 'Curated collection') + '</div>' +
            '<div class="collection-count">' + (c.trackCount || 0) + ' tracks</div>' +
          '</div>' +
        '</div>';
      }).join('');
      refreshIcons();
      allCollectionsLoaded = true;
    } catch (err) {
      grid.innerHTML = '';
      empty.classList.remove('hidden');
      refreshIcons();
      toast('Music service unavailable', 'error');
    }
  }

  function bindCollections() {
    const grid = $('#collectionsGrid');
    if (grid) {
      grid.addEventListener('click', function (e) {
        const card = e.target.closest('[data-collection-id]');
        if (!card) return;
        const id = card.getAttribute('data-collection-id');
        openCollection(id);
      });
    }

    const backBtn = $('#backFromCollection');
    if (backBtn) {
      backBtn.addEventListener('click', function () { switchView('collections'); });
    }
  }

  async function openCollection(id) {
    currentCollectionId = id;
    switchView('collection-detail');

    const header = $('#collectionDetailHeader');
    const list = $('#collectionTracks');
    header.innerHTML = '';
    list.innerHTML = skeletonRows(6);

    try {
      const col = await HaRoAPI.getCollection(id, 100, 0);
      if (!col) {
        list.innerHTML = '<div class="empty-state"><h3>Collection not found</h3></div>';
        refreshIcons();
        return;
      }

      const tracks = col.tracks || [];
      cacheTracks(tracks);

      const art = col.artwork
        ? '<img src="' + escapeHtml(col.artwork) + '" alt="" />'
        : '<i data-lucide="library"></i>';

      header.innerHTML =
        '<div class="collection-detail-art">' + art + '</div>' +
        '<div class="collection-detail-info">' +
          '<h1>' + escapeHtml(col.title) + '</h1>' +
          '<p>' + escapeHtml(col.description || '') + '</p>' +
          '<div class="collection-detail-meta">' + (col.trackCount || 0) + ' tracks</div>' +
        '</div>';

      if (tracks.length === 0) {
        list.innerHTML = '<div class="empty-state"><h3>No tracks in this collection.</h3></div>';
      } else {
        list.innerHTML = tracks.map(trackRowHTML).join('');
      }
      refreshIcons();
    } catch (err) {
      list.innerHTML = '<div class="empty-state"><h3>' + escapeHtml(err.message) + '</h3></div>';
      refreshIcons();
      toast('Music service unavailable', 'error');
    }
  }

  /* ---------- Discover ---------- */
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
      toast('Music service unavailable', 'error');
    }
  }

  /* ---------- Theme ---------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    HaRoStorage.setTheme(theme);

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0a0a0f' : '#f5f5f7');

    $$('.theme-toggle').forEach(function (btn) {
      btn.innerHTML = '<i data-lucide="' + (theme === 'dark' ? 'sun' : 'moon') + '"></i><span>Theme</span>';
    });
    refreshIcons();
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  }

  function bindTheme() {
    $$('.theme-toggle').forEach(function (btn) {
      btn.addEventListener('click', toggleTheme);
    });
  }

  /* ---------- Player UI binding ---------- */
  function bindPlayerUI() {
    const playPauseBtn = $('#playPauseBtn');
    const miniPlayBtn = $('#miniPlayBtn');
    const prevBtn = $('#prevBtn');
    const nextBtn = $('#nextBtn');
    const shuffleBtn = $('#shuffleBtn');
    const repeatBtn = $('#repeatBtn');
    const progressBar = $('#progressBar');
    const volumeBar = $('#volumeBar');
    const playerFavBtn = $('#playerFavBtn');
    const queueBtn = $('#queueBtn');

    const npPlayPause = $('#npPlayPauseBtn');
    const npPrev = $('#npPrevBtn');
    const npNext = $('#npNextBtn');
    const npShuffle = $('#npShuffleBtn');
    const npRepeat = $('#npRepeatBtn');
    const npProgress = $('#npProgressBar');
    const npFav = $('#npFavBtn');
    const npQueue = $('#npQueueBtn');
    const npClose = $('#npCloseBtn');
    const miniPlayer = $('#miniPlayer');

    if (playPauseBtn) playPauseBtn.addEventListener('click', function () { HaRoPlayer.togglePlay(); });
    if (miniPlayBtn) miniPlayBtn.addEventListener('click', function (e) { e.stopPropagation(); HaRoPlayer.togglePlay(); });
    if (prevBtn) prevBtn.addEventListener('click', function () { HaRoPlayer.prev(); });
    if (nextBtn) nextBtn.addEventListener('click', function () { HaRoPlayer.next(); });

    if (shuffleBtn) shuffleBtn.addEventListener('click', function () {
      const on = HaRoPlayer.toggleShuffle();
      shuffleBtn.classList.toggle('active', on);
      if (npShuffle) npShuffle.classList.toggle('active', on);
      toast(on ? 'Shuffle on' : 'Shuffle off', 'info');
    });

    if (repeatBtn) repeatBtn.addEventListener('click', function () {
      const mode = HaRoPlayer.toggleRepeat();
      repeatBtn.classList.toggle('active', mode !== 'off');
      if (npRepeat) npRepeat.classList.toggle('active', mode !== 'off');
      toast('Repeat: ' + mode, 'info');
    });

    if (progressBar) {
      progressBar.addEventListener('input', function () {
        HaRoPlayer.seek(parseFloat(progressBar.value));
      });
    }
    if (npProgress) {
      npProgress.addEventListener('input', function () {
        HaRoPlayer.seek(parseFloat(npProgress.value));
      });
    }

    if (volumeBar) {
      volumeBar.addEventListener('input', function () {
        HaRoPlayer.setVolume(parseFloat(volumeBar.value));
      });
    }

    if (playerFavBtn) playerFavBtn.addEventListener('click', function () {
      const track = HaRoPlayer.getCurrent();
      if (!track) return;
      const nowFav = HaRoStorage.toggleFavorite(track);
      toast(nowFav ? 'Added to favorites' : 'Removed from favorites', 'success');
      syncFavIcons();
    });

    if (npFav) npFav.addEventListener('click', function () {
      const track = HaRoPlayer.getCurrent();
      if (!track) return;
      const nowFav = HaRoStorage.toggleFavorite(track);
      toast(nowFav ? 'Added to favorites' : 'Removed from favorites', 'success');
      syncFavIcons();
    });

    if (queueBtn) queueBtn.addEventListener('click', openQueue);
    if (npQueue) npQueue.addEventListener('click', openQueue);

    if (npPlayPause) npPlayPause.addEventListener('click', function () { HaRoPlayer.togglePlay(); });
    if (npPrev) npPrev.addEventListener('click', function () { HaRoPlayer.prev(); });
    if (npNext) npNext.addEventListener('click', function () { HaRoPlayer.next(); });

    if (npShuffle) npShuffle.addEventListener('click', function () {
      const on = HaRoPlayer.toggleShuffle();
      npShuffle.classList.toggle('active', on);
      if (shuffleBtn) shuffleBtn.classList.toggle('active', on);
    });

    if (npRepeat) npRepeat.addEventListener('click', function () {
      const mode = HaRoPlayer.toggleRepeat();
      npRepeat.classList.toggle('active', mode !== 'off');
      if (repeatBtn) repeatBtn.classList.toggle('active', mode !== 'off');
    });

    if (npClose) npClose.addEventListener('click', function () {
      $('#nowPlaying').classList.remove('open');
    });

    if (miniPlayer) {
      miniPlayer.addEventListener('click', function () {
        $('#nowPlaying').classList.add('open');
      });
    }

    const closeQueue = $('#closeQueueBtn');
    if (closeQueue) closeQueue.addEventListener('click', closeQueuePanel);

    HaRoPlayer.setCallbacks({
      onTrackChange: function (track) {
        updatePlayerTrack(track);
      },
      onStateChange: function (state) {
        updatePlayerState(state);
      }
    });
  }

  function updatePlayerTrack(track) {
    if (!track) return;
    const art = track.artwork
      ? '<img src="' + escapeHtml(track.artwork) + '" alt="" onerror="this.style.display=\'none\'" />'
      : '<i data-lucide="music"></i>';

    ['#playerArtwork', '#miniArtwork', '#npArtwork'].forEach(function (sel) {
      const el = $(sel);
      if (el) el.innerHTML = art;
    });

    ['#playerTitle', '#miniTitle', '#npTitle'].forEach(function (sel) {
      const el = $(sel);
      if (el) el.textContent = track.title;
    });

    ['#playerArtist', '#miniArtist', '#npArtist'].forEach(function (sel) {
      const el = $(sel);
      if (el) el.textContent = track.artist;
    });

    const total = formatTime(track.duration);
    ['#totalTime', '#npTotalTime'].forEach(function (sel) {
      const el = $(sel);
      if (el) el.textContent = total;
    });

    const mini = $('#miniPlayer');
    if (mini) mini.classList.remove('hidden');

    updatePlayerFavButton();
    refreshIcons();
  }

  function updatePlayerFavButton() {
    const track = HaRoPlayer.getCurrent();
    if (!track) return;
    const fav = HaRoStorage.isFavorite(track.id);
    ['#playerFavBtn', '#npFavBtn'].forEach(function (sel) {
      const btn = $(sel);
      if (btn) btn.classList.toggle('active', fav);
    });
  }

  function updatePlayerState(state) {
    if (!state) return;

    if (state.error) {
      toast(state.error, 'error');
      return;
    }

    // Loading indicator on artwork
    if (typeof state.loading === 'boolean') {
      ['#playerArtwork', '#miniArtwork', '#npArtwork'].forEach(function (sel) {
        const k el = $(sel);
        if (el) el.classList.toggle('loading', state.loading);
      });
    }

    const playing = state.playing === true || (state.paused === false);
    const iconName = playing ? 'pause' : 'play';

    ['#playPauseBtn', '#miniPlayBtn', '#npPlayPauseBtn'].forEach(function (sel) {
      const btn = $(sel);
      if (btn) {
        btn.innerHTML = '<i data-lucide="' + iconName + '"></i>';
      }
    });

    const npArt = $('#npArtwork');
    if (npArt) npArt.classList.toggle('playing', playing);

    if (typeof state.currentTime === 'number' &&
        typeof state.duration === 'number' &&
        state.duration > 0) {
      const percent = (state.currentTime / state.duration) * 100;
      const cur = formatTime(state.currentTime);
      const dur = formatTime(state.duration);

      ['#progressBar', '#npProgressBar'].forEach(function (sel) {
        const el = $(sel);
        if (el) el.value = percent;
      });
      ['#currentTime', '#npCurrentTime'].forEach(function (sel) {
        const el = $(sel);
        if (el) el.textContent = cur;
      });
      ['#totalTime', '#npTotalTime'].forEach(function (sel) {
        const el = $(sel);
        if (el) el.textContent = dur;
      });
    }

    refreshIcons();
  }

  /* ---------- Queue panel ---------- */
  function openQueue() {
    const panel = $('#queuePanel');
    const list = $('#queueList');
    if (!panel || !list) return;

    const queue = HaRoPlayer.getQueue();
    const current = HaRoPlayer.getCurrent();
    const currentId = current ? current.id : null;

    if (queue.length === 0) {
aro      list.innerHTML = '<p style="color:var(--text-3);font-size:14px;padding:12px;">Queue is empty.</p>';
    } else {
      list.innerHTML = queue.map(function (t) {
        const active = t.id === currentId;
        const art = t.artwork
          ? '<img src="' + escapeHtml(t.artwork) + '" alt.

="" />'
          : '<i data-lucide="music"></**i>';
        return '<div class="track-rowStep' + (active ? '  playing' : '') + '" data-queue-id="' + escapeHtml(t.id) + '">' +
          '<div class="track-row-artwork">' + art + '</div>' +
          '<div class="track-row-info">' +
            '<div class="track-row-title">' + escapeHtml(t.title) + '</div>' +
            '<div class="track-row-artist">' + escapeHtml(t.artist) + '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    list.onclick = function (e) {
      const row = e.target.closest('[data-queue-id]');
      if (!row) return;
      const id = row.getAttribute('data-queue-id');
      const track = queue.find(function (t) { return t.id === id; });
      if (track) {
        playTrack(track, queue);
        closeQueuePanel();
      }
    };

    panel.classList.add('open');
    refreshIcons();
  }

  function closeQueuePanel() {
    const panel = $('#queuePanel');
    if (panel) panel.classList.remove('open');
  }

  /* ---------- Generic track action delegation ---------- */
  function bindTrackActions(container, sourceListGetter) {
    if (!container) return;
    container.addEventListener('click', function (e) {
      const row = e.target.closest('[data-track-id]');
      if (!row) return;
      const trackId = row.getAttribute('data-track-id');
      const list = typeof sourceListGetter === 'function' ? sourceListGetter() : [];
      const track = trackCache[trackId] || list.find(function (t) { return t.id === trackId; });
      if (!track) return;

      const actionEl = e.target.closest('[data-action]');
      const action = actionEl ? actionEl.getAttribute('data-action') : null;

      if (action === 'play') {
        e.stopPropagation();
        playTrack(track, list);
        return;
      }

      if (action === 'fav') {
        e.stopPropagation();
        const nowFav = HaRoStorage.toggleFavorite(track);
        toast(nowFav ? 'Added to favorites' : 'Removed from favorites', 'success');
        syncFavIcons();
        if (currentView === 'favorites') renderFavorites();
        return;
      }

      playTrack(track, list);
    });
  }

  /* ---------- Navigation binding ---------- */
  function bindNavigation() {
    $$('.nav-item, .bottom-nav-item').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        const view = el.getAttribute('data-view');
        if (view) switchView(view);
      });
    });
  }

  /* ---------- Init ---------- */
  function init() {
    applyTheme(HaRoStorage.getTheme());

    refreshIcons();
    renderMoodChips();

    bindNavigation();
    bindTheme();
    bindSearchInputs();
    bindSearchHistory();
    bindMoodChips();
    bindCollections();
    bindPlayerUI();

    // Track action delegation
    bindTrackActions($('#searchResults'), function () { return currentSearchResults; });
    bindTrackActions($('#favoritesList'), function () { return HaRoStorage.getFavorites(); });
    bindTrackActions($('#recentList'), function () { return HaRoStorage.getRecent(); });
    bindTrackActions($('#trendingRow'), function () { return currentQueueSource; });
    bindTrackActions($('#recommendRow'), function () { return currentQueueSource; });
    bindTrackActions($('#recentHomeRow'), function () { return HaRoStorage.getRecent(); });
    bindTrackActions($('#collectionTracks'), function () { return currentQueueSource; });
    bindTrackActions($('#discoverList'), function () { return currentQueueSource; });

    loadHome();
    renderSearchHistory();
    refreshIcons();
  }

  /* ---------- Boot ---------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
