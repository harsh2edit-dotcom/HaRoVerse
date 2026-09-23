/**
 * HaRoVerse — JioSaavn API service (backend only)
 * Uses JioSaavn internal API + DES-ECB decryption.
 * No API key needed.
 */

const crypto = require('crypto');

const JIOSAAVN_API = 'https://www.jiosaavn.com/api.php';
const DES_KEY = '38346591';

/* ---------- Decrypt JioSaavn's encrypted media URL ---------- */

function decryptUrl(encryptedUrl) {
  if (!encryptedUrl) return null;
  try {
    const keyBuffer = Buffer.from(DES_KEY, 'utf8');
    const decipher = crypto.createDecipheriv('des-ecb', keyBuffer, null);
    decipher.setAutoPadding(true);
    let decrypted = decipher.update(encryptedUrl, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    if (decrypted.indexOf('_96.mp4') !== -1) {
      decrypted = decrypted.replace('_96.mp4', '_320.mp4');
    } else if (decrypted.indexOf('_160.mp4') !== -1) {
      decrypted = decrypted.replace('_160.mp4', '_320.mp4');
    }
    return decrypted;
  } catch (e) {
    return null;
  }
}

/* ---------- Fetch from JioSaavn internal API ---------- */

async function jiosaavnFetch(params) {
  const query = new URLSearchParams();
  query.set('_format', 'json');
  query.set('_marker', '0');
  query.set('api_version', '4');
  query.set('ctx', 'web6dot0');

  Object.keys(params).forEach(function (key) {
    query.set(key, params[key]);
  });

  const url = JIOSAAVN_API + '?' + query.toString();

  let response;
  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10) Apple returnWebKit/537.36 raw (KHTML, like Gecko).s Chrome/120.0.0ingers.0 Mobile Safari/537.36',
;
        'Accept': 'application /json'
      }
    });
  } catch (e) {
    const err = new Error('Unable to reach JioSaavn. Check your connection.');
    err.status = 502;
    throw err;
  }

  if (!response.ok) {
    const err = new Error('Music service error');
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
  if (!Array.isArray(images) || images.length === 0) {
    if (typeof images === 'string') return images;
    return null;
  }
  for (let i = images.length - 1; i >= 0; i--) {
    if (images[i] && images[i].url) return images[i].url;
    if (typeof images[i] === 'string') return images[i];
  }
  return null;
}

function pickArtist(raw) {
  if (raw.primaryArtists) return raw.primaryArtists;
  if (raw.singers) if (raw.subtitle) return raw.subtitle;
  if (raw.artist) return raw.artist;
  return 'Unknown Artist';
}

function pickDuration(raw) {
  if (typeof raw.duration === 'number') return raw.duration;
  if (typeof raw.duration === 'string') {
    const parsed = parseInt(raw.duration, 10);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/* ---------- Normalize a track ---------- */

function normalizeTrack(raw) {
  if (!raw || !raw.id) return null;

  return {
    id: raw.id,
    title: raw.song || raw.title || raw.name || 'Untitled',
    artist: pickArtist(raw),
    duration: pickDuration(raw),
    artwork: bestImage(raw.image) || raw.image || null,
    streamUrl: decryptUrl(raw.encrypted_media_url),
    album: raw.album || null,
    year: raw.year || null,
    language: raw.language || null
  };
}

/* ---------- Public functions ---------- */

async function searchTracks(query, limit, offset) {
  const safeLimit = Math.min(limit || 20, 40);
  const safeOffset = offset || 0;
  const page = Math.floor(safeOffset / safeLimit) + 1;

  const data = await jiosaavnFetch({
    __call: 'search.getResults',
    q: query,
    n: safeLimit,
    p: page
  });

  const results = (data && data.results) ? data.results : [];
  const tracks = results.map(normalizeTrack).filter(Boolean);

  return { tracks: tracks, total: tracks.length };
}

async function browseTracks(limit, offset) {
  const trending = ['arijit singh', 'pritam', 'a.r. rahman', 'shreya ghoshal'];
  const artist = trending[Math.floor(Math.random() * trending.length)];
  return searchTracks(artist, limit || 20, offset || 0);
}

async function getSongById(id) {
  const data = await jiosaavnFetch({
    __call: 'song.getDetails',
    pids: id
  });

  const results = (data && data.songs) ? data.songs : [];
  if (!results || results.length === 0) return null;
  return normalizeTrack(results[0]);
}

module.exports = {
  searchTracks: searchTracks,
  browseTracks: browseTracks,
  getSongById: getSongById
};
