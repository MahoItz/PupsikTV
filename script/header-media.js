function initHeaderRats() {
  const headerVideos = Array.from(document.querySelectorAll('.rats-video'));
  if (headerVideos.length === 0) return;
  let timerId;
  let playbackId = 0;

  function scheduleNextPlay() {
    clearTimeout(timerId);
    const delay = (Math.floor(Math.random() * 36) + 5) * 1000;
    timerId = setTimeout(() => {
      void playVideo();
    }, delay);
  }

  function stopVideo(video) {
    video.pause();
    video.classList.remove('is-active');
    if (video.readyState > 0) video.currentTime = 0;
  }

  async function playVideo(
    index = Math.floor(Math.random() * headerVideos.length)
  ) {
    if (!Number.isInteger(index) || index < 0 || index >= headerVideos.length) {
      throw new RangeError('Rat video index must be between 0 and 3');
    }
    clearTimeout(timerId);
    const currentPlayback = ++playbackId;
    headerVideos.forEach(stopVideo);
    const video = headerVideos[index];
    video.classList.add('is-active');
    try {
      await video.play();
      return video;
    } catch (error) {
      if (currentPlayback === playbackId) {
        stopVideo(video);
        console.warn(
          'Header rat video could not play:',
          video.getAttribute('src'),
          error
        );
        scheduleNextPlay();
      }
      return null;
    }
  }

  headerVideos.forEach((video) => {
    video.addEventListener('ended', () => {
      if (!video.classList.contains('is-active')) return;
      stopVideo(video);
      scheduleNextPlay();
    });
    video.addEventListener('error', () => {
      if (!video.classList.contains('is-active')) return;
      stopVideo(video);
      scheduleNextPlay();
    });
  });

  window.playHeaderRats = playVideo;
  void playVideo();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHeaderRats, { once: true });
} else {
  initHeaderRats();
}
