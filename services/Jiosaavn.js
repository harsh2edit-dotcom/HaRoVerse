/**
 * HaRoVerse — JioSaavn API service (backend only)
 * No API key needed. Free Indian music streaming.
 */

const BASE_URL = process.env.SAAVN_API_URL || 'https://saavn.dev/api';

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
      headers: { 'Accept': 'application/json' }
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

/* ---------- Helpers ---------- */

function bestImage(images) {
  if (!Array.isArray(images) || images.length === 0) return null;
  // Last is usually highest quality
  return images[images.length - 1].url || images[0].url || null;
}

function bestStream(downloadUrls) {
  if (!Array.isArray(downloadUrls) || downloadUrls.length === 0) return null;
  // Prefer 320kbps, then 160, then anything
  const preferred = downloadUrls.find(function (u) { return u.quality === '320kbps'; })
    || downloadUrls.find(function (u) { return u.quality === '160kbps'; })
    || downloadUrls[0];
  return preferred ? preferred.url : null;
}

function normalizeTrack(raw) {
  if (!raw || !raw.id) return null;

  const primary = (raw.artists && raw.artists.primary) ? raw.artists.primary : [];
  const featured = (raw.artists && raw.artists.featured) ? raw.artists.featured : [];
  const allArtists = primary.concat(featured).filter(Boolean);
  const artistNames = allArtists.map(function (a) { return a.name; }).join(', ');

  return {
    id: raw.id,
    title: raw.name || 'Untitled',
    artist: artistNames || 'Unknown Artist',
    duration: typeof raw.duration === 'number' ? raw.duration : 0,
    artwork: bestImage(raw.image),
    streamUrl: bestStream(raw.downloadUrl),
    album: raw.album ? raw.album.name : null,
    year: raw.year || null,
    language: raw.language || null,
    hasLyrics: Boolean(raw.hasLyrics)
  };
}

/* ---------- Public functions ---------- */

async function searchTracks(query, limit, offset) {
  limit = Math.min(limit || 20, 40);
  offset = offset || 0;

  const data = await saavnFetch('/search/songs', {
    query: query,
    limit: limit,
    page: Math.floor(offset / limit) + 1
  });

  const results = (data && data.data && data.data.results) ? data.data.results : [];
  const tracks = results.map(normalizeTrack).filter(Boolean);

  return { tracks: tracks, total: tracks.length };
}

async function browseTracks(limit, offset) {
  // Use a trending playlist or search for popular artists
  const trending = ['Arijit Singh', 'Pritam', 'A.R. Rahman', 'Shreya Ghoshal'];
  const artist = trending[Math.floor(Math.random() * trending.length)];
  return searchTracks(artist, limit || 20, offset || 0);
}

async function getSongById(id) {
  const data = await saavnFetch('/songs/' + encodeURIComponent(id), {});
  if (!data || !data.data || !data.data[0]) return null;
  return normalizeTrack(data.data[0]);
}

module.exports = {
  searchTracks: searchTracks,
  browseTracks: browseTracks,
  getSongById: getSongById
};
