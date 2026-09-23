const express = require('express');
const router = express.Router();
const epidemic = require('../services/epidemic');

function userHeader(req) {
  return req.headers['x-partner-user-id'] || 'haroverse-web';
}

function fail(res, error) {
  const status = error.status || 500;
  const message = error.message || 'Something went wrong';
  res.status(status).json({ error: message });
}

/* GET /api/music/search?q=...&limit=30&offset=0 */
router.get('/search', async function (req, res) {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ tracks: [], total: 0 });

    const limit = parseInt(req.query.limit, 10) || 30;
    const offset = parseInt(req.query.offset, 10) || 0;
    const result = await epidemic.searchTracks(q, limit, offset, userHeader(req));
    res.json(result);
  } catch (err) {
    fail(res, err);
  }
});

/* GET /api/music/tracks?limit=30&offset=0 */
router.get('/tracks', async function (req, res) {
  try {
    const limit = parseInt(req.query.limit, 10) || 30;
    const offset = parseInt(req.query.offset, 10) || 0;
    const result = await epidemic.browseTracks(limit, offset, userHeader(req));
    res.json(result);
  } catch (err) {
    fail(res, err);
  }
});

/* GET /api/music/collections?limit=20&offset=0 */
router.get('/collections', async function (req, res) {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = parseInt(req.query.offset, 10) || 0;
    const result = await epidemic.listCollections(limit, offset, userHeader(req));
    res.json(result);
  } catch (err) {
    fail(res, err);
  }
});

/* GET /api/music/collections/:id */
router.get('/collections/:id', async function (req, res) {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;
    const collection = await epidemic.getCollectionById(
      req.params.id, limit, offset, userHeader(req)
    );
    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    res.json(collection);
  } catch (err) {
    fail(res, err);
  }
});

/* GET /api/music/moods */
router.get('/moods', async function (req, res) {
  try {
    const moods = await epidemic.listMoods(userHeader(req));
    res.json({ moods: moods });
  } catch (err) {
    fail(res, err);
  }
});

/* GET /api/music/genres */
router.get('/genres', async function (req, res) {
  try {
    const genres = await epidemic.listGenres(userHeader(req));
    res.json({ genres: genres });
  } catch (err) {
    fail(res, err);
  }
});

module.exports = router;
