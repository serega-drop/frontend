const clips = {
  "game-chime": 0.70,
  "skin-reward": 0.72,
  "case-drop": 0.72,
  "upgrade-loss": 0.72,
  "case-tick": 0.23,
} as const;

type Clip = keyof typeof clips;
const preferenceKey = "serega-drop:sound";
const downloads = new Map<Clip, Promise<ArrayBuffer>>();
const decoded = new Map<Clip, Promise<AudioBuffer>>();
const playing = new Set<() => void>();
let context: AudioContext | undefined;
let enabled: boolean | undefined;
let generation = 0;

export function gameSoundEnabled() {
  if (enabled !== undefined) return enabled;
  try {
    return (enabled = localStorage.getItem(preferenceKey) !== "off");
  } catch {
    return (enabled = true);
  }
}

export function setGameSoundEnabled(value: boolean) {
  enabled = value;
  generation++;
  try {
    localStorage.setItem(preferenceKey, value ? "on" : "off");
  } catch {
    // The current tab still remembers the preference.
  }
  if (value) unlockGameAudio();
  else for (const stop of playing) stop();
}

function download(clip: Clip) {
  let pending = downloads.get(clip);
  if (!pending) {
    pending = fetch(`${import.meta.env.BASE_URL}audio/${clip}.mp3`)
      .then((response) => {
        if (!response.ok) throw Error("Sound unavailable");
        return response.arrayBuffer();
      })
      .catch((error) => {
        downloads.delete(clip);
        throw error;
      });
    downloads.set(clip, pending);
  }
  return pending;
}

export function preloadGameAudio() {
  if (!gameSoundEnabled()) return;
  for (const clip of Object.keys(clips) as Clip[]) void download(clip).catch(() => {});
}

function bufferFor(audio: AudioContext, clip: Clip) {
  let pending = decoded.get(clip);
  if (!pending) {
    pending = download(clip)
      .then((bytes) => audio.decodeAudioData(bytes.slice(0)))
      .catch((error) => {
        decoded.delete(clip);
        throw error;
      });
    decoded.set(clip, pending);
  }
  return pending;
}

// Run from a user gesture, before an asynchronous game request.
export function unlockGameAudio() {
  if (!gameSoundEnabled() || typeof AudioContext === "undefined") return;
  try {
    const audio = (context ??= new AudioContext());
    if (audio.state !== "running") void audio.resume().catch(() => {});
    for (const clip of Object.keys(clips) as Clip[]) {
      void bufferFor(audio, clip).catch(() => {});
    }
  } catch {
    // The game remains usable when the browser cannot initialize audio.
  }
}

export function playGameSound(clip: Clip): () => void {
  const audio = context;
  if (!audio || !gameSoundEnabled() || document.hidden) return () => {};
  const started = performance.now();
  const version = generation;
  let source: AudioBufferSourceNode | undefined;
  let gain: GainNode | undefined;
  let stopped = false;

  function stop() {
    if (stopped) return;
    stopped = true;
    playing.delete(stop);
    if (!source || !gain) return;
    const now = audio!.currentTime;
    gain.gain.setTargetAtTime(0, now, 0.012);
    source.stop(now + 0.055);
  }

  void bufferFor(audio, clip).then((buffer) => {
    if (stopped || version !== generation || audio.state !== "running" || document.hidden) return;
    const elapsed = (performance.now() - started) / 1000;
    if (clip === "case-tick" && elapsed > 0.055) return;
    if (elapsed > 0.55) return;

    source = audio.createBufferSource();
    gain = audio.createGain();
    source.buffer = buffer;
    gain.gain.value = clips[clip];
    source.connect(gain);
    gain.connect(audio.destination);
    source.onended = () => {
      source?.disconnect();
      gain?.disconnect();
      playing.delete(stop);
      source = undefined;
      gain = undefined;
    };
    playing.add(stop);
    source.start();
  }).catch(() => {});

  return stop;
}
