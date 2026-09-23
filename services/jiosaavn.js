/**
 * HaRoVerse — JioSaavn API service (backend only)
 * No API key needed. Includes stream URL decryption.
 */

const BASE_URL = 'https://saavnapi-nine.vercel.app';

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
    const err = new Error('Unable to reach music service.');
    err.status = 502;
    throw err;
  }

  if (!response.ok) {
    const err = new Error('Music service error');
    err.status = response.status >= 500 ? 502 : response.status;
    throw err;
  }

  return response.json();
}

/* ---------- Stream URL Decryption ---------- */

function decryptUrl(encryptedUrl) {
  if (!encryptedUrl) return null;
  try {
    // JioSaavn ke encrypted URLs ko decrypt karne ka logic
    // Agar encrypted URL already direct hai (http se start), toh wahi return karo
    if (encryptedUrl.startsWith('http')) return encryptedUrl;
    
    // Base64 decode try karo
    const decoded = Buffer.from(encryptedUrl, 'base64').toString('utf-8');
    if (decoded.startsWith('http')) return decoded;
    
    return null;
  } catch (e) {
    return null;
  }
}

/* ---------- Normalisers ---------- */

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

function bestStreamUrl(raw) {
  // Try all possible stream URL fields
  const candidates = [
    raw.downloadUrl, raw.downloadUrls, raw.media_url, 
    raw.url, raw.stream_url, raw.streamUrl, raw.encryptedMediaUrl
  ];
  
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (!candidate) continue;
    
    // If it's an array of quality objects
    if (Array.isArray(candidate)) {
      const order = ['320kbps', '160kbps', '96kbps'];
      for (let q = 0; q < order.length; q++) {
        const found = candidate.find(function (u) { return u && u.quality === order[q]; });
        if (found && found.url) return found.url;
        if (found && found.link) return found.link;
      }
      // Fallback: first with url
      const any = candidate.find(function (u) { return u && (u.url || u.link); });
      if (any) return any.url || any.link;
    }
    
    // If it's a string, try decrypt or use directly
    if (typeof candidate === 'string') {
      const decrypted = decryptUrl(candidate);
      if (decrypted) return decrypted;
    }
  }
  
  return null;
}

function normalizeTrack(raw) {
  if (!raw || !raw.id) return null;

  const duration = typeof raw.duration === 'number' ? raw.duration
    : typeof raw.duration === 'string' ? parseInt(raw.duration, 10) || 0 : 0;

  // Artist extraction
  let artist = 'Unknown Artist';
  if (raw.primaryArtists) {
    artist = Array.isArray(raw.primaryArtists) 
      ? raw.primaryArtists.map(function(a) { return a.name; }).join(', ')
      : raw.primaryArtists;
  } else if (raw.artists && raw.artists.primary) {
    artist = Array.isArray(raw.artists.primary)
      ? raw.artists.primary.map(function(a) { return a.name; }).join(', ')
      : raw.artists.primary;
  } else if (raw.singers) {
    artist = raw.singers;
  } else if (raw.author) {
    artist = raw.author;
  }

  return {
    id: raw.id,
    title: raw.name || raw.title || raw.song || 'Untitled',
    artist: artist,
    duration: duration,
    artwork: bestImage(raw.image) || raw.artworkUrl || null,
    streamUrl: bestStreamUrl(raw),
    album: (raw.album && raw.album.name) ? raw.album.name : (raw.album || null),
    year: raw.year || null
  };
}

/* ---------- Extract results from various API shapes ---------- */

function extractResults(data) {
  if (!data) return [];
  if (data.data && Array.isArray(data.data.results)) return data.data.results;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.results)) return data.results;
  if (Array.isArray(data.songs)) return data.songs;
  if (Array.isArray(data)) return data;
  return [];
}

/* ---------- Public functions ---------- */

async function searchTracks(query, limit, offset) {
  limit = Math.min(limit || 20, 40);
  offset = offset || 0;

  let data;
  try {
    // Primary endpoint
    data = await saavnFetch('/result/', { query: query, limit: limit });
  } catch (e) {
    // Fallback
    data = await saavnFetch('/api/search/songs', { query: query, limit: limit });
  }

  const results = extractResults(data);
  const tracks = results.map(normalizeTrack).filter(Boolean);

  return { tracks: tracks, total: tracks.length };
}

async function browseTracks(limit, offset) {
  const trending = ['Arijit Singh', 'Pritam', 'A.R. Rahman', 'Shreya Ghoshal'];
  const artist = trending[Math.floor(Math.random() * trending.length)];
  return searchTracks(artist, limit || 20, offset || 0);
}

async function getSongById(id) {
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
