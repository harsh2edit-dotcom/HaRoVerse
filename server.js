require('dotenv').config();

const express = require('express');
const path = require('path');
const musicRoutes = require('./routes/music');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0
}));

app.use('/api/music', musicRoutes);

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('[HaRoVerse Error]', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Something went wrong'
  });
});

app.listen(PORT, () => {
  console.log('🎵 HaRoVerse running on port ' + PORT);
  console.log('   Your world. Your sound.');
});
