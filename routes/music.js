const express = require('express');
const router = express.Router();
const jiosaavn = require('../services/jiosaavn');

function fail(res, error) {
  const status = error.status || 500;
  const message = error.message || 'Something went wrong';
  res.status(status).json({ error: message });
}

/* GET /api/music/search?q=kesariya&limit=20&offset=0 */
router.get('/search', async function (req, res) {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ tracks: [], total: 0 });

    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = parseInt(req.query.offset, 10) || 0;
    const result = await jiosaavn.searchTracks(q, limit, offset);
    res.json(result);
  } catch (err) {
    fail(res, err);
  }
});

/* GET /api/music/tracks?limit=20 */
router.get('/tracks', async function (req, res) {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = parseInt(req.query.offset, 10) || 0;
    const result = await jiosaavn.browseTracks(limit, offset);
    res.json(result);
  } catch (err) {
    fail(res, err);
  }
});

/* GET /api/music/song/:id */
router.get('/song/:id', async function (req, res) {
  try {
    const track = await jiosaavn.getSongById(req.params.id);
    if (!track) return res.status(404).json({ error: 'Song not found' });
    res.json(track);
  } catch (err) {
    fail(res, err);
  }
});

/* Collections & moods — gracefully return empty (not available) */
router.get('/collections', function (req, res) {
  res.json({ collections: [], total: 0 });
});

router.get('/collections/:id', function (req, res) {
  res.status(404).json({ error: 'Collections not available' });
});

router.get('/moods', function (req, res) {
  res.json({ moods: [] });
});

router.get('/genres', function (req, res) {
  res.json({ genres: [] });
});

/* Stream endpoint — returns the direct URL */
router.get('/stream/:trackId', async function (req, res) {
  try {
    const track = await jiosaavn.getSongById(req.params.trackId);
    if (!track || !track.streamUrl) {
      return res.status(404).json({ error: 'Stream not available' });
    }
    res.json({
      streamUrl: track.streamUrl,
      expiresAt: null,
      cookies: null
    });
  } catch (err) {
    fail(res, err);
  }
});

module.exports = router;
