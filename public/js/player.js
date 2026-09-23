/* ============================================================
   HaRoVerse — Player module
   HLS.js + HTML5 Audio API persistent player.
   Fetches preview stream URL from backend (API key stays server-side).
   ============================================================ */

const HaRoPlayer = (function () {
  'use strict';

  const audio = new Audio();
  audio.preload = 'metadata';
  audio.crossOrigin = 'anonymous';

  let hls = null;
  let queue = [];
  let currentIndex = -1;
  let shuffle = false;
  let repeatMode = 'off';
  let onTrackChange = null;
  let onStateChange = null;
  let currentStreamUrl = null;
  let isLoading = false;

  /* ---------- HLS support check ---------- */
  function hasNativeHLS() {
    return audio.canPlayType('application/vnd.apple.mpegurl') !== '';
  }

  function hasHlsJs() {
    return window.Hls && window.Hls.isSupported();
  }

  function destroyHls() {
    if (hls) {
      try { hls.destroy(); } catch (e) {}
      hls = null;
    }
  }

  function getUserId() {
    let id = localStorage.getItem('haroverse_user_id');
    if (!id) {
      id = 'hv-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
      localStorage.setItem('haroverse_user_id', id);
    }
    return id;
  }

  /* ---------- Fetch stream URL from our backend ---------- */
  async function fetchStreamUrl(trackId) {
    const response = await fetch('/api/music/stream/' + encodeURIComponent(trackId), {
      headers: {
        'Accept': 'application/json',
        'x-partner-user-id': getUserId()
      }
    });

    let data = null;
    try {
      data = await response.json();
    } catch (e) {
      data = null;
    }

    if (!response.ok) {
      const msg = (data && data.error) ? data.error : 'Preview not available for this track.';
      const err = new Error(msg);
      err.status = response.status;
      throw err;
    }

    if (!data || !data.streamUrl) {
      const err = new Error('Preview not available for this track.');
      err.status = 404;
      throw err;
    }

    return data;
  }

  /* ---------- Load and play ---------- */
  async function loadAndPlay(track) {
    if (!track || !track.id) return;

    isLoading = true;
    if (onStateChange) onStateChange({ loading: true, error: null });

    try {
      const streamData = await fetchStreamUrl(track.id);
      currentStreamUrl = streamData.streamUrl;

      // Clean up previous
      destroyHls();
      try { audio.pause(); } catch (e) {}
      audio.removeAttribute('src');
      try { audio.load(); } catch (e) {}

      // Native HLS (Safari, iOS)
      if (hasNativeHLS()) {
        audio.src = currentStreamUrl;
        if (onTrackChange) onTrackChange(track);
        updateMediaSession(track);
        await audio.play().catch(function () {});
      }
      // HLS.js (Chrome, Firefox, Edge)
      else if (hasHlsJs()) {
        hls = new window.Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 30
        });

        if (streamData.cookies) {
          hls.config.xhrSetup = function (xhr) {
            try {
              xhr.setRequestHeader('Cookie', streamData.cookies);
            } catch (e) {}
          };
        }

        hls.loadSource(currentStreamUrl);
        hls.attachMedia(audio);

        hls.on(window.Hls.Events.MANIFEST_PARSED, function () {
          audio.play().catch(function () {});
        });

        hls.on(window.Hls.Events.ERROR, function (event, data) {
          if (data && data.fatal) {
            if (onStateChange) onStateChange({ error: 'Unable to play this track.' });
            destroyHls();
          }
        });

        if (onTrackChange) onTrackChange(track);
        updateMediaSession(track);
      }
      // Fallback: direct audio src
      else {
        audio.src = currentStreamUrl;
        if (onTrackChange) onTrackChange(track);
        updateMediaSession(track);
        await audio.play().catch(function () {});
      }

      isLoading = false;
      if (onStateChange) onStateChange({ loading: false });
    } catch (err) {
      isLoading = false;
      if (onStateChange) {
        onStateChange({ loading: false, error: err.message });
      }
    }
  }

  /* ---------- Public API ---------- */

  function setQueue(tracks, startIndex) {
    queue = Array.isArray(tracks) ? tracks.slice() : [];
    currentIndex = typeof startIndex === 'number' ? startIndex : 0;
  }

  function getQueue() { return queue; }
  function getCurrent() { return queue[currentIndex] || null; }
  function getCurrentIndex() { return currentIndex; }
  function getIsLoading() { return isLoading; }

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

  function togglePlay() {
    if (!audio.src && !currentStreamUrl) {
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
    if (!audio.duration || isNaN(audio.duration)) return;
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

  function isPlaying() {
    return !audio.paused && !audio.ended && audio.readyState > 2;
  }

  function setCallbacks(handlers) {
    if (handlers.onTrackChange) onTrackChange = handlers.onTrackChange;
    if (handlers.onStateChange) onStateChange = handlers.onStateChange;
  }

  /* ---------- Audio events ---------- */

  audio.addEventListener('timeupdate', function () {
    if (onStateChange) {
      onStateChange({
        currentTime: audio.currentTime,
        duration: (audio.duration && !isNaN(audio.duration)) ? audio.duration : 0,
        paused: audio.paused
      });
    }
  });

  audio.addEventListener('loadedmetadata', function () {
    if (onStateChange) {
      onStateChange({
        currentTime: audio.currentTime,
        duration: (audio.duration && !isNaN(audio.duration)) ? audio.duration : 0
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
    } catch (e) {}
  }

  return {
    setQueue: setQueue,
    getQueue: getQueue,
    getCurrent: getCurrent,
    getCurrentIndex: getCurrentIndex,
    getIsLoading: getIsLoading,
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
