/* ============================================================
   HaRoVerse — API module
   All requests go to /api/music/* (our backend proxy).
   The API key is NEVER present in this file or any browser request.
   ============================================================ */

const HaRoAPI = (function () {
  'use strict';

  const BASE = '/api/music';

  function getUserId() {
    let id = localStorage.getItem('haroverse_user_id');
    if (!id) {
      id = 'hv-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
      localStorage.setItem('haroverse_user_id', id);
    }
    return id;
  }

  async function request(path, params) {
    const url = new URL(BASE + path, window.location.origin);
    if (params) {
      Object.entries(params).forEach(function (entry) {
        const key = entry[0];
        const value = entry[1];
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, value);
        }
      });
    }

    let response;
    try {
      response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
          'x-partner-user-id': getUserId()
        }
      });
    } catch (networkErr) {
      const err = new Error('Unable to reach the music service. Check your connection.');
      err.status = 0;
      throw err;
    }

    let data = null;
    try {
      data = await response.json();
    } catch (parseErr) {
      data = null;
    }

    if (!response.ok) {
      const msg = (data && data.error) ? data.error : 'Something went wrong';
      const err = new Error(msg);
      err.status = response.status;
      throw err;
    }

    return data;
  }

  function searchTracks(term, limit, offset) {
    return request('/search', { q: term, limit: limit || 30, offset: offset || 0 });
  }

  function browseTracks(limit, offset) {
    return request('/tracks', { limit: limit || 30, offset: offset || 0 });
  }

  function listCollections(limit, offset) {
    return request('/collections', { limit: limit || 20, offset: offset || 0 });
  }

  function getCollection(id, limit, offset) {
    return request('/collections/' + encodeURIComponent(id), {
      limit: limit || 50,
      offset: offset || 0
    });
  }

  function listMoods() {
    return request('/moods');
  }

  function listGenres() {
    return request('/genres');
  }

  return {
    searchTracks: searchTracks,
    browseTracks: browseTracks,
    listCollections: listCollections,
    getCollection: getCollection,
    listMoods: listMoods,
    listGenres: listGenres
  };
})();
