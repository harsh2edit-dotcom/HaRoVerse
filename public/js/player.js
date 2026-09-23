/* ============================================================
   HaRoVerse — Player module
   Direct MP3 playback via JioSaavn. No HLS needed.
   ============================================================ */

const HaRoPlayer = (function () {
  'use strict';

  const audio = new Audio();
  audio.preload = 'metadata';

  let queue = [];
  let currentIndex = -1;
  let shuffle = false;
  let repeatMode = 'off';
  let onTrackChange = null;
  let onStateChange = null;

  function loadAndPlay(track) {
    if (!track || !track.streamUrl) {
      if (onStateChange) onStateChange({ error: 'Preview not available for this track.' });
      return;
    }

    if (onStateChange) onStateChange({ loading: true, error: null });

    audio.src = track.streamUrl;
    audio.load();
    audio.play()
      .then(function () {
        if (onStateChange) onStateChange({ loading: false });
      })
      .catch(function (err) {
        if (onStateChange) onStateChange({ loading: false, error: 'Tap to play' });
      });

    if (onTrackChange) onTrackChange(track);
    updateMediaSession(track);
  }

  function setQueue(tracks, startIndex) {
    queue = Array.isArray(tracks) ? tracks.slice() : [];
    currentIndex = typeof startIndex === 'number' ? startIndex : 0;
  }

  function getQueue() { return queue; }
  function getCurrent() { return queue[currentIndex] || null; }
  function getCurrentIndex() { return currentIndex; }

  function playTrack(track, sourceList) {
    if (!track || !track.id) return;

    if (Array.isArray(sourceList) && sourceList.length > 0) {
      const idx = sourceList.findIndex(function (t) { return t.id === track.id; });
      queue = sourceList.slice();
      currentIndex = idx >= 0 ? idx : 0;
    } else {
      const idx = queue.findIndex(function (t) { return t.id === track.id; });
      if (idx >= 0) currentIndex = idx;
      else { queue.push(track); currentIndex = queue.length - 1; }
    }

    loadAndPlay(queue[currentIndex]);
  }

  function togglePlay() {
    if (!audio.src) {
      const t = getCurrent();
      if (t) loadAndPlay(t);
      return;
    }
    if (audio.paused) audio.play().catch(function () {});
    else audio.pause();
  }

  function play() { if (audio.src) audio.play().catch(function () {}); }
  function pause() { audio.pause(); }

  function next() {
    if (queue.length === 0) return;
    if (shuffle) {
      let idx = currentIndex;
      if (queue.length > 1) {
        while (idx === currentIndex) idx = Math.floor(Math.random() * queue.length);
      }
      currentIndex = idx;
    } else {
      currentIndex = (currentIndex + 1) % queue.length;
    }
    loadAndPlay(queue[currentIndex]);
  }

  function prev() {
    if (queue.length === 0) return;
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    if (shuffle) {
      let idx = currentIndex;
      if (queue.length > 1) {
        while (idx === currentIndex) idx = Math.floor(Math.random() * queue.length);
      }
      currentIndex = idx;
    } else {
      currentIndex = (currentIndex - 1 + queue.length) % queue.length;
    }
    loadAndPlay(queue[currentIndex]);
  }

  function seek(percent) {
    if (!audio.duration || isNaN(audio.duration)) return;
    audio.currentTime = (percent / 100) * audio.duration;
  }

  function setVolume(v) { audio.volume = Math.max(0, Math.min(1, v)); }
  function getVolume() { return audio.volume; }

  function toggleShuffle() { shuffle = !shuffle; return shuffle; }
  function getShuffle() { return shuffle; }

  function toggleRepeat() {
    const modes = ['off', 'all', 'one'];
    const idx = modes.indexOf(repeatMode);
    repeatMode = modes[(idx + 1) % modes.length];
    return repeatMode;
  }
  function getRepeat() { return repeatMode; }

  function setCallbacks(h) {
    if (h.onTrackChange) onTrackChange = h.onTrackChange;
    if (h.onStateChange) onStateChange = h.onStateChange;
  }

  audio.addEventListener('timeupdate', function () {
    if (onStateChange) onStateChange({
      currentTime: audio.currentTime,
      duration: (audio.duration && !isNaN(audio.duration)) ? audio.duration : 0,
      paused: audio.paused
    });
  });

  audio.addEventListener('loadedmetadata', function () {
    if (onStateChange) onStateChange({
      currentTime: audio.currentTime,
      duration: (audio.duration && !isNaN(audio.duration)) ? audio.duration : 0
    });
  });

  audio.addEventListener('play', function () {
    if (onStateChange) onStateChange({ playing: true, paused: false, loading: false });
  });

  audio.addEventListener('pause', function () {
    if (onStateChange) onStateChange({ playing: false, paused: true });
  });

  audio.addEventListener('ended', function () {
    if (repeatMode === 'one') {
      audio.currentTime = 0;
      audio.play().catch(function () {});
    } else if (repeatMode === 'all' || currentIndex < queue.length - 1) {
      next();
    } else {
      if (onStateChange) onStateChange({ playing: false, ended: true });
    }
  });

  audio.addEventListener('error', function () {
    if (onStateChange) onStateChange({ error: 'Unable to play this track.' });
  });

  function updateMediaSession(track) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: 'HaRoVerse',
        artwork: track.artwork ? [{ src: track.artwork, sizes: '512x512', type: 'image/jpeg' }] : []
      });
      navigator.mediaSession.setActionHandler('play', function () { play(); });
      navigator.mediaSession.setActionHandler('pause', function () { pause(); });
      navigator.mediaSession.setActionHandler('previoustrack', function () { prev(); });
      navigator.mediaSession.setActionHandler('nexttrack', function () { next(); });
    } catch (e) {}
  }

  return {
    setQueue: setQueue,
    getQueue: getQueue,
    getCurrent: getCurrent,
    getCurrentIndex: getCurrentIndex,
    playTrack: playTrack,
    togglePlay: togglePlay,
    play: play,
    pause: pause,
    next: next,
    prev: prev,
    seek: seek,
    setVolume: setVolume,
    getVolume: getVolume,
    toggleShuffle: toggleShuffle,
    getShuffle: getShuffle,
    toggleRepeat: toggleRepeat,
    getRepeat: getRepeat,
    setCallbacks: setCallbacks
  };
})();
