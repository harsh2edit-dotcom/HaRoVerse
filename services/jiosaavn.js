/**
 * HaRoVerse — JioSaavn API service (backend only)
 * No API key needed. Free Indian music streaming.
 * Public instance: https://saavnapi-nine.vercel.app
 */

const BASE_URL = process.env.SAAVN_API_URL || 'https://saavnapi-nine.vercel.app';

async function saavnFetch(endpoint, params) {
  params = params || {};
  const url = new URL(endpoint, BASE_URL);

  Object.entries(params).forEach(function (entry) {
    const key = entry[0];
    const value = entry[1];
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  let response;
  try {
    response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'HaRoVerse/2.0'
      }
    });
  } catch (e) {
    const err = new Error('Unable to reach music service. Check your connection.');
    err.status = 502;
    throw err;
  }

  if (!response.ok) {
    let message = 'Music service error';
    if (response.status === 404) message = 'No songs found';
    else if (response.status === 429) message = 'Too many requests, please wait';
    else if (response.status >= 500) message = 'Music service temporarily unavailable';
    const err = new Error(message);
    err.status = response.status >= 500 ? 502 : response.status;
    throw err;
  }

  let data;
  try {
    data = await response.json();
  } catch (e) {
    const err = new Error('Invalid response from music service');
    err.status = 502;
    throw err;
  }

  return data;
}

/* ---------- Response normalisers (handle multiple API shapes) ---------- */

function bestImage(images) {
  if (!Array.isArray(images) || images.length === 0) {
    if (typeof images === 'string') return images;
    return null;
  }
  // Last entry is usually highest quality
  for (let i = images.length - 1; i >= 0; i--) {
    if (images[i] && images[i].url) return images[i].url;
    if (typeof images[i] === 'string') return images[i];
  }
  return null;
}

function bestStream(downloadUrls) {
  if (!Array.isArray(downloadUrls) || downloadUrls.length === 0) return null;
  // Prefer 320kbps, then 160, then 96, then anything
  const order = ['320kbps', '160kbps', '96kbps', '48kbps', '12kbps'];
  for (let i = 0; i < order.length; i++) {
    const found = downloadUrls.find(function (u) {
      return u && u.quality === order[i] && u.url;
    });
    if (found) return found.url;
  }
  // Fallback: first one with url
  const any = downloadUrls.find(function (u) { return u && u.url; });
  return any ? any.url : null;
}

function extractArtists(raw) {
  // Handle multiple shapes
  if (raw.primaryArtists) {
    if (Array.isArray(raw.primaryArtists)) {
      return raw.primaryArtists.map(function (a) { return a.name; }).join(', ');
    }
    if (typeof raw.primaryArtists === 'string') return raw.primaryArtists;
  }

  if (raw.artists) {
    if (raw.artists.primary && Array.isArray(raw.artists.primary)) {
      const primary = raw.artists.primary.map(function (a) { return a.name; });
      const featured = (raw.artists.featured || []).map(function (a) { return a.name; });
      return primary.concat(featured).join(', ');
    }
    if (typeof raw.artists === 'string') return raw.artists;
  }

  if (raw.singers) return raw.singers;
  if (raw.artist) return raw.artist;
  if (raw.subtitle) return raw.subtitle;

  return 'Unknown Artist';
}

function normalizeTrack(raw) {
  if (!raw || !raw.id) return null;

  const duration = typeof raw.duration === 'number' ? raw.duration
    : typeof raw.duration === 'string' ? parseInt(raw.duration, 10) || 0
    : 0;

  return {
    id: raw.id,
    title: raw.name || raw.title || raw.song || 'Untitled',
    artist: extractArtists(raw),
    duration: duration,
    artwork: bestImage(raw.image) || bestImage(raw.images) || null,
    streamUrl: bestStream(raw.downloadUrl) || bestStream(raw.downloadUrls) || raw.media_url || null,
    album: (raw.album && raw.album.name) ? raw.album.name : (raw.album || null),
    year: raw.year || null,
    language: raw.language || null
  };
}

function extractResults(data) {
  // Handle multiple API response shapes
  if (!data) return [];

  // Shape 1: { data: { results: [...] } }
  if (data.data && Array.isArray(data.data.results)) return data.data.results;

  // Shape 2: { data: [...] }
  if (Array.isArray(data.data)) return data.data;

  // Shape 3: { results: [...] }
  if (Array.isArray(data.results)) return data.results;

  // Shape 4: { songs: [...] }
  if (Array.isArray(data.songs)) return data.songs;

  // Shape 5: direct array
  if (Array.isArray(data)) return data;

  return [];
}

/* ---------- Public functions ---------- */

async function searchTracks(query, limit, offset) {
  limit = Math.min(limit || 20, 40);
  offset = offset || 0;

  // Try modern endpoint first
  let data;
  let results = [];

  try {
    data = await saavnFetch('/result/', { query: query, limit: limit });
    results = extractResults(data);
  } catch (e) {
    // Fallback: try /search/songs
    data = await saavnFetch('/api/search/songs', { query: query, limit: limit });
    results = extractResults(data);
  }

  const tracks = results.map(normalizeTrack).filter(Boolean);

  return { tracks: tracks, total: tracks.length };
}

async function browseTracks(limit, offset) {
  // Use popular artists as "trending"
  const trending = ['Arijit Singh', 'Pritam', 'A.R. Rahman', 'Shreya Ghoshal', 'Ed Sheeran'];
  const artist = trending[Math.floor(Math.random() * trending.length)];
  return searchTracks(artist, limit || 20, offset || 0);
}

async function getSongById(id) {
  // Try /song/ endpoint
  let data;
  try {
    data = await saavnFetch('/song/', { id: id });
  } catch (e) {
    data = await saavnFetch('/api/songs/' + encodeURIComponent(id), {});
  }

  const results = extractResults(data);
  if (!results || results.length === 0) return null;
  return normalizeTrack(results[0]);
}

module.exports = {
  searchTracks: searchTracks,
  browseTracks: browseTracks,
  getSongById: getSongById
};
