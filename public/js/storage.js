/* ============================================================
   HaRoVerse — Storage module
   Handles localStorage: favorites, recently played, theme, history
   ============================================================ */

const HaRoStorage = (function () {
  'use strict';

  const KEYS = {
    FAVORITES: 'haroverse_favorites',
    RECENT: 'haroverse_recent',
    THEME: 'haroverse_theme',
    HISTORY: 'haroverse_search_history'
  };

  const MAX_RECENT = 20;
  const MAX_HISTORY = 8;

  function safeGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* storage full or blocked — silently ignore */
    }
  }

  /* ---------- Favorites ---------- */
  function getFavorites() {
    return safeGet(KEYS.FAVORITES, []);
  }

  function isFavorite(trackId) {
    return getFavorites().some(function (t) { return t.id === trackId; });
  }

  function addFavorite(track) {
    const favs = getFavorites();
    if (favs.some(function (t) { return t.id === track.id; })) return favs;
    favs.unshift(track);
    safeSet(KEYS.FAVORITES, favs);
    return favs;
  }

  function removeFavorite(trackId) {
    const favs = getFavorites().filter(function (t) { return t.id !== trackId; });
    safeSet(KEYS.FAVORITES, favs);
    return favs;
  }

  function toggleFavorite(track) {
    if (isFavorite(track.id)) {
      removeFavorite(track.id);
      return false;
    }
    addFavorite(track);
    return true;
  }

  /* ---------- Recently Played ---------- */
  function getRecent() {
    return safeGet(KEYS.RECENT, []);
  }

  function addRecent(track) {
    let recent = getRecent().filter(function (t) { return t.id !== track.id; });
    recent.unshift(track);
    if (recent.length > MAX_RECENT) recent = recent.slice(0, MAX_RECENT);
    safeSet(KEYS.RECENT, recent);
    return recent;
  }

  function clearRecent() {
    safeSet(KEYS.RECENT, []);
  }

  /* ---------- Search History ---------- */
  function getHistory() {
    return safeGet(KEYS.HISTORY, []);
  }

  function addHistory(term) {
    term = (term || '').trim();
    if (!term) return getHistory();
    let history = getHistory().filter(function (t) {
      return t.toLowerCase() !== term.toLowerCase();
    });
    history.unshift(term);
    if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
    safeSet(KEYS.HISTORY, history);
    return history;
  }

  function clearHistory() {
    safeSet(KEYS.HISTORY, []);
  }

  /* ---------- Theme ---------- */
  function getTheme() {
    return safeGet(KEYS.THEME, 'dark');
  }

  function setTheme(theme) {
    safeSet(KEYS.THEME, theme);
  }

  return {
    getFavorites: getFavorites,
    isFavorite: isFavorite,
    addFavorite: addFavorite,
    removeFavorite: removeFavorite,
    toggleFavorite: toggleFavorite,
    getRecent: getRecent,
    addRecent: addRecent,
    clearRecent: clearRecent,
    getHistory: getHistory,
    addHistory: addHistory,
    clearHistory: clearHistory,
    getTheme: getTheme,
    setTheme: setTheme
  };
})();
