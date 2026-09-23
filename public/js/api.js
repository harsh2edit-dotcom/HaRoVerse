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
    } catch (e) {
      const err = new Error('Unable to reach the music service. Check your connection.');
      err.status = 0;
      throw err;
    }

    let data = null;
    try { data = await response.json(); } catch (e) { data = null; }

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

  function getSong(id) {
    return request('/song/' + encodeURIComponent(id));
  }

  return {
    searchTracks: searchTracks,
    browseTracks: browseTracks,
    getSong: getSong
  };
})();
