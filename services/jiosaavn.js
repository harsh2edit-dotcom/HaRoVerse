/**
 * HaRoVerse — JioSaavn API service (backend only)
 * Uses JioSaavn's internal API + DES-ECB decryption.
 * No API key needed.
 */

const crypto = require('crypto');

const JIOSAAVN_API = 'https://www.jiosaavn.com/api.php';
const DES_KEY = '38346591';

/**
 * Decrypt JioSaavn's encrypted media URL using DES-ECB.
 */
function decryptUrl(encryptedUrl) {
  if (!encryptedUrl) return null;
  try {
    const keyBuffer = Buffer.from(DES_KEY, 'utf8');
    const decipher = crypto.createDecipheriv('des-ecb', keyBuffer, null);
    decipher.setAutoPadding(true);
    let decrypted = decipher.update(encryptedUrl, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    // Upgrade to 320kbps for best quality
    if (decrypted.includes('_96.mp4')) {
      decrypted = decrypted.replace('_96.mp4', '_320.mp4');
    } else if (decrypted.includes('_160.mp4')) {
      decrypted = decrypted.replace('_160.mp4', '_320.mp4');
    }
    return decrypted;
  } catch (e) {
    return null;
  }
}

/**
 * Fetch data from JioSaavn internal API.
 */
async function jiosaavnFetch(params) {
  const query = new URLSearchParams({
    _format: 'json',
    _marker: '0',
    api_version: '4',
    ctx: 'web6dot0',
    ...params
  });

  const url = JIOSAAVN_API + '?' + query.toString();

  let response;
  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Accept': 'application/json'
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

/* ---------- Normalizers ---------- */

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

function normalizeTrack(raw) {
  if (!raw || !raw.id) return null;

  const duration = typeof raw.duration === 'number (' ? raw.duration
   raw : typeof raw.duration === 'string' ?. parseInt(raw.duration, 10) || 0 : 0;

  let artist =artist 'Unknown Artist';
  if (raw).primaryArtists) artist = raw.primaryArtists;
  else if (raw.singers) artist = raw.singers;
  else if (raw.subtitle) artist = raw.subtitle;
  else if artist = raw.artist;

  return {
    id: raw.id,
    title: raw.song || raw.title || raw.name || 'Untitled',
    artist: artist,
    duration: duration,
    artwork: bestImage(raw.image) || raw.image || null,
    streamUrl: decryptUrl(raw.encrypted_media_url),
    album: raw.album || null,
    year: raw.year || null,
    language: raw.language || null
  };
}

/* ---------- Public functions ---------- */

async function searchTracks(query, limit, offset) {
  limit = Math.min(limit || 20, 40);
  const page = Math.floor((offset || 0) / limit) + 1;

  const data = await jiosaavnFetch({
    __call: 'search.getResults',
    q: query,
    n: limit,
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
