const WHITE_ROOM_SOUND_VOLUME = 0.8;
const WHITE_ROOM_FADE_OUT_SECONDS = 5;
const WHITE_ROOM_SOUND_URL = new URL(
  "../../assets/sounds/82078__kapanoush__sinus-aditive.aiff",
  import.meta.url,
);

/** Reuses the tunnel's simple global HTML-audio playback approach. */
export function createWhiteRoomTone({ onActivate, onFadeStart, onFadeProgress, onEnded } = {}) {
  const whiteRoomAudio = new Audio(WHITE_ROOM_SOUND_URL.href);
  whiteRoomAudio.preload = "auto";
  whiteRoomAudio.loop = false;
  whiteRoomAudio.volume = WHITE_ROOM_SOUND_VOLUME;
  whiteRoomAudio.load();

  let unlocked = false;
  let unlocking = false;
  let activated = false;
  let fadeFrame = null;
  let playbackStarted = false;
  let returnStarted = false;
  let returnProgress = 0;
  let playbackGeneration = 0;

  const cancelFadeFrame = () => {
    if (fadeFrame !== null) window.cancelAnimationFrame(fadeFrame);
    fadeFrame = null;
  };

  const applyReturnFade = (progress) => {
    if (!returnStarted) {
      returnStarted = true;
      // Prepare the initial scene while the existing white blend is still 1.
      onFadeStart?.();
    }
    returnProgress = Math.max(returnProgress, progress);
    whiteRoomAudio.volume = WHITE_ROOM_SOUND_VOLUME * (1 - returnProgress);
    onFadeProgress?.(returnProgress);
  };

  const handleEnded = () => {
    // Ignore the silent unlock probe and callbacks belonging to stopped runs.
    if (!activated || !playbackStarted) return;
    cancelFadeFrame();
    applyReturnFade(1);
    activated = false;
    playbackStarted = false;
    // The original REEXPERIENCE scheduling only begins after the return is done.
    onEnded?.();
  };
  whiteRoomAudio.addEventListener("ended", handleEnded);

  const unlock = async () => {
    if (unlocked || unlocking || activated) {
      return;
    }
    unlocking = true;
    try {
      whiteRoomAudio.volume = 0;
      await whiteRoomAudio.play();
      if (activated) return;
      whiteRoomAudio.pause();
      whiteRoomAudio.currentTime = 0;
      whiteRoomAudio.volume = WHITE_ROOM_SOUND_VOLUME;
      unlocked = true;
      removeUnlockListeners();
    } catch {
      whiteRoomAudio.volume = WHITE_ROOM_SOUND_VOLUME;
    } finally {
      unlocking = false;
    }
  };

  const removeUnlockListeners = () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("click", unlock);
    window.removeEventListener("touchstart", unlock);
    window.removeEventListener("keydown", unlock);
  };

  window.addEventListener("pointerdown", unlock);
  window.addEventListener("click", unlock);
  window.addEventListener("touchstart", unlock, { passive: true });
  window.addEventListener("keydown", unlock);

  return {
    activate({ fadeInDuration = 0 } = {}) {
      if (activated) {
        return;
      }
      activated = true;
      playbackStarted = false;
      returnStarted = false;
      returnProgress = 0;
      const generation = ++playbackGeneration;
      cancelFadeFrame();
      whiteRoomAudio.currentTime = 0;
      whiteRoomAudio.volume = fadeInDuration > 0 ? 0 : WHITE_ROOM_SOUND_VOLUME;
      whiteRoomAudio.play().then(() => {
        if (!activated || generation !== playbackGeneration) return;
        playbackStarted = true;
        // Report only an actual, successful playback start. The silent
        // autoplay-unlock probe must never count as a White-Room sound run.
        onActivate?.();
        const startedAt = performance.now();
        const update = () => {
          if (!activated || generation !== playbackGeneration) return;
          const duration = whiteRoomAudio.duration;
          if (Number.isFinite(duration) && duration > 0) {
            const fadeDuration = Math.min(WHITE_ROOM_FADE_OUT_SECONDS, duration * 0.75);
            const fadeStart = duration - fadeDuration;
            if (whiteRoomAudio.currentTime >= fadeStart) {
              const progress = Math.min(1, (whiteRoomAudio.currentTime - fadeStart) / fadeDuration);
              applyReturnFade(progress * progress * (3 - 2 * progress));
            }
          }
          if (!returnStarted) {
            const fadeIn = fadeInDuration > 0
              ? Math.min(1, (performance.now() - startedAt) / (fadeInDuration * 1000))
              : 1;
            whiteRoomAudio.volume = WHITE_ROOM_SOUND_VOLUME * fadeIn;
          }
          fadeFrame = window.requestAnimationFrame(update);
        };
        update();
      }).catch((error) => {
        if (generation !== playbackGeneration) return;
        activated = false;
        console.error("WHITE ROOM AUDIO ERROR:", error);
      });
    },
    deactivate() {
      playbackGeneration++;
      cancelFadeFrame();
      activated = false;
      playbackStarted = false;
      returnStarted = false;
      returnProgress = 0;
      whiteRoomAudio.pause();
      whiteRoomAudio.currentTime = 0;
      whiteRoomAudio.volume = WHITE_ROOM_SOUND_VOLUME;
    },
    dispose() {
      removeUnlockListeners();
      this.deactivate();
      whiteRoomAudio.removeEventListener("ended", handleEnded);
      whiteRoomAudio.removeAttribute("src");
      whiteRoomAudio.load();
    },
  };
}
