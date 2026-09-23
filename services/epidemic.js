/**
 * HaRoVerse — Epidemic Sound API service (backend only)
 * The API key NEVER leaves this file. It is read from
 * process.env.EPIDEMIC_SOUND_API_KEY and used only in
 * server-to-server requests.
 *
 * Base URL: https://partner-content-api.epidemicsound.com
 * Auth: Authorization: Bearer <API_KEY>
 * User context: x-partner-user-id header
 */

const BASE_URL = 'https://partner-content-api.epidemicsound.com';

function getApiKey() {
  const key = process.env.EPIDEMIC_SOUND_API_KEY;
  if (!key || key.trim().length === 0) {
    const err = new Error('Music service is not configured. Add EPIDEMIC_SOUND_API_KEY.');
    err.status = 503;
    throw err;
  }
  return key.trim();
}

/**
 * Core authenticated fetch to Epidemic Sound.
 * Never exposed to the frontend.
 */
async function epidemicFetch(endpoint, params = {}, partnerUserId = 'haroverse-web') {
  const apiKey = getApiKey();
  const url = new URL(endpoint, BASE_URL);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  const headers = {
    'Authorization': 'Bearer ' + apiKey,
    'Accept': 'application/json',
    'x-partner-user-id': partnerUserId
  };

  let response;
  try {
    response = await fetch(url.toString(), { headers });
  } catch (networkErr) {
    const err = new Error('Unable to reach the music service. Check your connection.');
    err.status = 502;
    throw err;
  }

  if (!response.ok) {
    const status = response.status;
    let message = 'Music service error';

    switch (status) {
      case 400: message = 'Invalid request to the music service'; break;
      case 401: message = 'Music service authentication failed'; break;
      case 403: message = 'Access denied by the music service'; break;
      case 404: message = 'Requested music resource was not found'; break;
      case 429: message = 'Too many requests — please wait a moment'; break;
      case 500:
      case 502:
      case 503:
        message = 'Music service is temporarily unavailable'; break;
      default:
        message = 'Music service returned status ' + status;
    }

    const err = new Error(message);
    err.status = status >= 500 ? 502 : status;
    throw err;
  }

  let data;
  try {
    data = await response.json();
  } catch (parseErr) {
    const err = new Error('Music service returned an invalid response');
    err.status = 502;
    throw err;
  }

  return data;
}

/* ---------- Normalisers (map ES shape → HaRoVerse shape) ---------- */

function pickArtwork(images) {
  if (!images) return null;
  return images.default || images.M || images.L || images.S || images.XS || null;
}

function normalizeTrack(raw) {
  if (!raw || !raw.id) return null;

  const mainArtists = Array.isArray(raw.mainArtists) ? raw.mainArtists : [];
  const featuredArtists = Array.isArray(raw.featuredArtists) ? raw.featuredArtists : [];
  const allArtists = [...mainArtists, ...featuredArtists].filter(Boolean);

  return {
    id: raw.id,
    title: raw.title || 'Untitled Track',
    artist: allArtists.length > 0 ? allArtists.join(', ') : 'Unknown Artist',
    duration: typeof raw.length === 'number' ? raw.length : 0, // seconds
    artwork: pickArtwork(raw.images),
    bpm: raw.bpm || null,
    hasVocals: Boolean(raw.hasVocals),
    moods: (raw.moods || []).map(function (m) { return { id: m.id, name: m.name }; }),
    genres: (raw.genres || []).map(function (g) { return { id: g.id, name: g.name }; })
  };
}

function normalizeCollection(raw) {
  if (!raw || !raw.id) return null;

  const tracks = Array.isArray(raw.tracks)
    ? raw.tracks.map(normalizeTrack).filter(Boolean)
    : [];

  return {
    id: raw.id,
    title: raw.name || 'Untitled Collection',
    description: raw.description || '',
    artwork: pickArtwork(raw.images),
    trackCount: typeof raw.availableTracks === 'number' ? raw.availableTracks : tracks.length,
    tracks: tracks
  };
}

/* ---------- Public service functions ---------- */

async function searchTracks(term, limit, offset, partnerUserId) {
  limit = Math.min(limit || 30, 60);
  offset = offset || 0;
  const data = await epidemicFetch(
    '/v0/tracks/search',
    { term: term, limit: limit, offset: offset },
    partnerUserId
  );
  const tracks = (data.tracks || []).map(normalizeTrack).filter(Boolean);
  return { tracks: tracks, total: tracks.length };
}

async function browseTracks(limit, offset, partnerUserId) {
  limit = Math.min(limit || 30, 100);
  offset = offset || 0;
  const data = await epidemicFetch(
    '/v0/tracks',
    { limit: limit, offset: offset },
    partnerUserId
  );
  const tracks = (data.tracks || []).map(normalizeTrack).filter(Boolean);
  return { tracks: tracks, total: tracks.length };
}

async function listCollections(limit, offset, partnerUserId) {
  limit = Math.min(limit || 20, 20);
  offset = offset || 0;
  const data = await epidemicFetch(
    '/v0/collections',
    { limit: limit, offset: offset, excludeFields: 'tracks' },
    partnerUserId
  );
  const collections = (data.collections || []).map(normalizeCollection).filter(Boolean);
  return { collections: collections, total: collections.length };
}

async function getCollectionById(id, limit, offset, partnerUserId) {
  limit = Math.min(limit || 50, 100);
  offset = offset || 0;
  const data = await epidemicFetch(
    '/v0/collections/' + encodeURIComponent(id),
    { limit: limit, offset: offset },
    partnerUserId
  );
  return normalizeCollection(data);
}

async function listMoods(partnerUserId) {
  const data = await epidemicFetch(
    '/v0/moods',
    { type: 'featured', limit: 20 },
    partnerUserId
  );
  return (data.moods || []).map(function (m) {
    return { id: m.id, name: m.name, artwork: pickArtwork(m.images) };
  });
}

async function listGenres(partnerUserId) {
  const data = await epidemicFetch(
    '/v0/genres',
    { type: 'featured', limit: 20 },
    partnerUserId
  );
  return (data.genres || []).map(function (g) {
    return { id: g.id, name: g.name, artwork: pickArtwork(g.images) };
  });
}

module.exports = {
  searchTracks: searchTracks,
  browseTracks: browseTracks,
  listCollections: listCollections,
  getCollectionById: getCollectionById,
  listMoods: listMoods,
  listGenres: listGenres
};
