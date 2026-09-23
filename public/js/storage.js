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
    } catch (e) { return fallback; }
  }

  function safeSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function getFavorites() { return safeGet(KEYS.FAVORITES, []); }
  function isFavorite(id) { return getFavorites().some(function (t) { return t.id === id; }); }

  function addFavorite(track) {
    const favs = getFavorites();
    if (favs.some(function (t) { return t.id === track.id; })) return favs;
    favs.unshift(track);
    safeSet(KEYS.FAVORITES, favs);
    return favs;
  }

  function removeFavorite(id) {
    const favs = getFavorites().filter(function (t) { return t.id !== id; });
    safeSet(KEYS.FAVORITES, favs);
    return favs;
  }

  function toggleFavorite(track) {
    if (isFavorite(track.id)) { removeFavorite(track.id); return false; }
    addFavorite(track); return true;
  }

  function getRecent() { return safeGet(KEYS.RECENT, []); }

  function addRecent(track) {
    let recent = getRecent().filter(function (t) { return t.id !== track.id; });
    recent.unshift(track);
    if (recent.length > MAX_RECENT) recent = recent.slice(0, MAX_RECENT);
    safeSet(KEYS.RECENT, recent);
    return recent;
  }

  function getHistory() { return safeGet(KEYS.HISTORY, []); }

  function addHistory(term) {
    term = (term || '').trim();
    if (!term) return getHistory();
    let h = getHistory().filter(function (t) { return t.toLowerCase() !== term.toLowerCase(); });
    h.unshift(term);
    if (h.length > MAX_HISTORY) h = h.slice(0, MAX_HISTORY);
    safeSet(KEYS.HISTORY, h);
    return h;
  }

  function clearHistory() { safeSet(KEYS.HISTORY, []); }
  function getTheme() { return safeGet(KEYS.THEME, 'dark'); }
  function setTheme(t) { safeSet(KEYS.THEME, t); }

  return {
    getFavorites: getFavorites,
    isFavorite: isFavorite,
    addFavorite: addFavorite,
    removeFavorite: removeFavorite,
    toggleFavorite: toggleFavorite,
    getRecent: getRecent,
    addRecent: addRecent,
    getHistory: getHistory,
    addHistory: addHistory,
    clearHistory: clearHistory,
    getTheme: getTheme,
    setTheme: setTheme
  };
})();
