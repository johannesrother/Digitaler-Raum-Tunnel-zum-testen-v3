const IDYLL_SOUND_VOLUME = 0.7;
const IDYLL_SOUND_URL = new URL("../../assets/sounds/Idylle.wav", import.meta.url);
const IDYLL_DUCKED_VOLUME = IDYLL_SOUND_VOLUME * 0.75;
const IDYLL_DUCK_DURATION = 2;
const HEARTBEAT_VOLUME = 0.4;
const HEARTBEAT_FADE_DURATION = 1.5;
const HEARTBEAT_URL = new URL("../../assets/sounds/Herzschlag.wav", import.meta.url);

/** Global, looping background sound for the idyll only. */
export function createIdyllSound() {
  const idyllAudio = new Audio(IDYLL_SOUND_URL.href);
  idyllAudio.preload = "auto";
  idyllAudio.loop = true;
  idyllAudio.volume = IDYLL_SOUND_VOLUME;
  idyllAudio.load();
  const heartbeatAudio = new Audio(HEARTBEAT_URL.href);
  heartbeatAudio.preload = "auto";
  heartbeatAudio.loop = true;
  heartbeatAudio.volume = 0;
  heartbeatAudio.load();

  let started = false;
  let fadeFrame = null;
  let stressFrame = null;
  let heartbeatStarted = false;
  let heartbeatUnlocked = false;
  let heartbeatUnlocking = false;
  let runId = 0;

  // Reuse the same silent HTML-audio unlock as the Rift sound, directly in
  // the existing START EXPERIENCE / REEXPERIENCE user gesture.
  const unlockHeartbeat = async () => {
    if (heartbeatUnlocked || heartbeatUnlocking || heartbeatStarted) return;
    heartbeatUnlocking = true;
    try {
      heartbeatAudio.volume = 0;
      await heartbeatAudio.play();
      if (!heartbeatStarted) {
        heartbeatAudio.pause();
        heartbeatAudio.currentTime = 0;
      }
      heartbeatUnlocked = true;
    } catch {
      // A subsequent real start interaction can retry the silent unlock.
    } finally {
      heartbeatUnlocking = false;
    }
  };

  const cancelStressFade = () => {
    if (stressFrame !== null) window.cancelAnimationFrame(stressFrame);
    stressFrame = null;
  };

  const start = () => {
    unlockHeartbeat();
    if (started) {
      return;
    }
    // A prior idyll-to-rift fade reaches zero. Every run must restore the
    // configured level before reusing this same HTMLAudioElement.
    idyllAudio.volume = IDYLL_SOUND_VOLUME;
    idyllAudio.currentTime = 0;
    idyllAudio.play().then(() => {
      started = true;
      removeStartListeners();
    }).catch(() => {
      // A later real interaction retries the same simple HTML-audio play call.
    });
  };

  const removeStartListeners = () => {
    window.removeEventListener("pointerdown", start);
    window.removeEventListener("click", start);
    window.removeEventListener("touchstart", start);
    window.removeEventListener("keydown", start);
  };

  return {
    start,
    startStress() {
      if (!started || heartbeatStarted) return;
      heartbeatStarted = true;
      heartbeatAudio.currentTime = 0;
      heartbeatAudio.volume = 0;
      const generation = runId;
      heartbeatAudio.play().catch((error) => {
        if (generation === runId && heartbeatStarted) console.error("HEARTBEAT PLAY ERROR", error);
      });
      const from = idyllAudio.volume;
      const startedAt = performance.now();
      const smooth = (value) => {
        const p = Math.min(1, value);
        return p * p * (3 - 2 * p);
      };
      const update = () => {
        const elapsed = (performance.now() - startedAt) / 1000;
        idyllAudio.volume = from + (IDYLL_DUCKED_VOLUME - from) * smooth(elapsed / IDYLL_DUCK_DURATION);
        heartbeatAudio.volume = HEARTBEAT_VOLUME * smooth(elapsed / HEARTBEAT_FADE_DURATION);
        stressFrame = elapsed < Math.max(IDYLL_DUCK_DURATION, HEARTBEAT_FADE_DURATION)
          ? window.requestAnimationFrame(update) : null;
      };
      update();
    },
    fadeOutAndStop(duration = 2.5) {
      if (!started) {
        return;
      }
      cancelStressFade();
      const from = idyllAudio.volume;
      const heartbeatFrom = heartbeatAudio.volume;
      const startedAt = performance.now();
      const update = () => {
        const progress = Math.min(1, (performance.now() - startedAt) / (duration * 1000));
        idyllAudio.volume = from * (1 - progress);
        heartbeatAudio.volume = heartbeatFrom * (1 - progress);
        if (progress < 1) {
          fadeFrame = window.requestAnimationFrame(update);
          return;
        }
        this.stop();
        fadeFrame = null;
      };
      update();
    },
    stop() {
      runId += 1;
      cancelStressFade();
      heartbeatStarted = false;
      heartbeatAudio.pause();
      heartbeatAudio.currentTime = 0;
      heartbeatAudio.volume = 0;
      started = false;
      removeStartListeners();
      if (fadeFrame !== null) {
        window.cancelAnimationFrame(fadeFrame);
        fadeFrame = null;
      }
      idyllAudio.pause();
      idyllAudio.currentTime = 0;
      idyllAudio.volume = IDYLL_SOUND_VOLUME;
    },
    dispose() {
      this.stop();
      idyllAudio.removeAttribute("src");
      idyllAudio.load();
      heartbeatAudio.removeAttribute("src");
      heartbeatAudio.load();
    },
  };
}
