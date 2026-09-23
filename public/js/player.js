/* ============================================================
   HaRoVerse — Player module
   HTML5 Audio API based persistent player.
   ============================================================ */

const HaRoPlayer = (function () {
  'use strict';

  const audio = new Audio();
  audio.preload = 'metadata';

  let queue = [];
  let currentIndex = -1;
  let shuffle = false;
  let repeatMode = 'off'; // off | all | one
  let onTrackChange = null;
  let onStateChange = null;

  /* ---------- Public API ---------- */

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
      if (idx >= 0) {
        currentIndex = idx;
      } else {
        queue.push(track);
        currentIndex = queue.length - 1;
      }
    }

    loadAndPlay(queue[currentIndex]);
  }

  function loadAndPlay(track) {
    if (!track) return;
    // Epidemic Sound stream manifest URL (HLS). We request it via backend.
    // For preview playback the API returns a preview URL embedded in track.
    // We use the direct preview URL if available, otherwise try the stream endpoint.
    const src = track.previewUrl || null;

    if (!src) {
      // No direct audio URL available from the normalised track.
      // Notify listeners so the UI can show a message.
      if (onStateChange) {
        onStateChange({ error: 'Preview not available for this track.' });
      }
      return;
    }

    audio.src = src;
    audio.play().catch(function () {
      /* autoplay may be blocked — user gesture required */
    });

    if (onTrackChange) onTrackChange(track);
    updateMediaSession(track);
  }

  function togglePlay() {
    if (!audio.src) {
      const track = getCurrent();
      if (track) loadAndPlay(track);
      return;
    }
    if (audio.paused) {
      audio.play().catch(function () {});
    } else {
      audio.pause();
    }
  }

  function play() {
    if (audio.src) audio.play().catch(function () {});
  }

  function pause() {
    audio.pause();
  }

  function next() {
    if (queue.length === 0) return;
    if (shuffle) {
      let idx = currentIndex;
      if (queue.length > 1) {
        while (idx === currentIndex) {
          idx = Math.floor(Math.random() * queue.length);
        }
      }
      currentIndex = idx;
    } else {
      currentIndex = (currentIndex + 1) % queue.length;
    }
    loadAndPlay(queue[currentIndex]);
  }

  function prev() {
    if (queue.length === 0) return;
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    if (shuffle) {
      let idx = currentIndex;
      if (queue.length > 1) {
        while (idx === currentIndex) {
          idx = Math.floor(Math.random() * queue.length);
        }
      }
      currentIndex = idx;
    } else {
      currentIndex = (currentIndex - 1 + queue.length) % queue.length;
    }
    loadAndPlay(queue[currentIndex]);
  }

  function seek(percent) {
    if (!audio.duration) return;
    audio.currentTime = (percent / 100) * audio.duration;
  }

  function setVolume(value) {
    audio.volume = Math.max(0, Math.min(1, value));
  }

  function getVolume() { return audio.volume; }

  function toggleShuffle() {
    shuffle = !shuffle;
    return shuffle;
  }

  function getShuffle() { return shuffle; }

  function toggleRepeat() {
    const modes = ['off', 'all', 'one'];
    const idx = modes.indexOf(repeatMode);
    repeatMode = modes[(idx + 1) % modes.length];
    return repeatMode;
  }

  function getRepeat() { return repeatMode; }

  function isPlaying() { return !audio.paused && !audio.ended && audio.readyState > 2; }

  function setCallbacks(handlers) {
    if (handlers.onTrackChange) onTrackChange = handlers.onTrackChange;
    if (handlers.onStateChange) onStateChange = handlers.onStateChange;
  }

  /* ---------- Audio events ---------- */

  audio.addEventListener('timeupdate', function () {
    if (onStateChange) {
      onStateChange({
        currentTime: audio.currentTime,
        duration: audio.duration || 0,
        paused: audio.paused
      });
    }
  });

  audio.addEventListener('play', function () {
    if (onStateChange) onStateChange({ playing: true, paused: false });
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

  /* ---------- Media Session API ---------- */

  function updateMediaSession(track) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: 'HaRoVerse',
        artwork: track.artwork
          ? [{ src: track.artwork, sizes: '512x512', type: 'image/jpeg' }]
          : []
      });
      navigator.mediaSession.setActionHandler('play', function () { play(); });
      navigator.mediaSession.setActionHandler('pause', function () { pause(); });
      navigator.mediaSession.setActionHandler('previoustrack', function () { prev(); });
      navigator.mediaSession.setActionHandler('nexttrack', function () { next(); });
    } catch (e) {
      /* Media Session not fully supported */
    }
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
    isPlaying: isPlaying,
    setCallbacks: setCallbacks
  };
})();
