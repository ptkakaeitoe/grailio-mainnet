/**
 * Tiny synthesized sound effects (Web Audio, no asset files). Every call is
 * best-effort: without audio support or with a blocked context it stays silent.
 */
let ctx: AudioContext | null = null;

/** Safari 17+: play as media, so the iPhone's ring/silent switch doesn't mute effects. */
function playAsMedia() {
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session && session.type !== "playback") session.type = "playback";
  } catch {
    // Older browsers: no audio session API.
  }
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    playAsMedia();
    ctx ??= new AudioContext();
    // "suspended" until a tap; iOS also uses "interrupted" after calls and app switches.
    if (ctx.state !== "running") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Call from a tap/click handler so later, async sounds are allowed to play.
 * Mobile browsers only start audio inside a user gesture, and iOS also wants
 * something actually played then, so this plays one silent sample.
 */
export function unlockAudio() {
  const ac = audio();
  if (!ac || ac.state === "running") return;
  try {
    const src = ac.createBufferSource();
    src.buffer = ac.createBuffer(1, 1, 22_050);
    src.connect(ac.destination);
    src.start(0);
  } catch {
    // Best effort: stay silent.
  }
}

let installed = false;

/**
 * Unlocks audio on the first tap or key press anywhere, and again after the
 * browser suspends it (iOS does when you switch apps or take a call). Sounds
 * then play on phones even when they fire after an animation, not in the tap.
 * Touch-down isn't a "user gesture" on mobile (only touch-up and click are),
 * so all of them are listened to.
 */
export function installAudioUnlock() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const onGesture = () => {
    if (!ctx || ctx.state !== "running") unlockAudio();
  };
  for (const type of ["pointerdown", "pointerup", "touchend", "click", "keydown"] as const) {
    window.addEventListener(type, onGesture, { capture: true, passive: true });
  }
}

function tone(ac: AudioContext, freq: number, start: number, length: number, type: OscillatorType, volume: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + length + 0.02);
}

function noise(ac: AudioContext, start: number, length: number, from: number, to: number, volume: number) {
  const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * length), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(from, start);
  filter.frequency.exponentialRampToValueAtTime(to, start + length);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(start);
}

/** Coin "ka-ching" for a confirmed pack purchase. */
export function playPurchase() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.02;
  noise(ac, t, 0.08, 6000, 3000, 0.08);
  tone(ac, 987.77, t, 0.12, "square", 0.05); // B5
  tone(ac, 1318.51, t + 0.08, 0.45, "square", 0.05); // E6
  tone(ac, 2637.02, t + 0.08, 0.3, "sine", 0.03);
}

/** Foil tearing while the seal breaks. */
export function playTear() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.02;
  noise(ac, t, 0.55, 800, 5000, 0.18);
  noise(ac, t + 0.2, 0.35, 1500, 7000, 0.1);
}

/** Card reveal; rarer cards (0 Common … 3 Legendary) get a longer, brighter flourish. */
export function playReveal(rarity: number) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.02;
  // C major arpeggio climbing higher with rarity.
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98, 2093.0];
  const count = 3 + Math.max(0, Math.min(3, rarity)) + (rarity >= 3 ? 1 : 0);
  const step = rarity >= 2 ? 0.07 : 0.09;
  for (let i = 0; i < count; i++) tone(ac, notes[i], t + i * step, 0.5, "triangle", 0.07);
  const end = t + count * step;
  tone(ac, notes[count - 1], end, rarity >= 2 ? 1.2 : 0.6, "sine", 0.06);
  if (rarity >= 2) {
    // Shimmer for Epic and Legendary.
    for (let i = 0; i < 8; i++) tone(ac, 3000 + Math.random() * 2000, end + i * 0.05, 0.15, "sine", 0.015);
  }
}

/** Short confirmation chime (swap success). */
export function playSuccess() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.02;
  tone(ac, 783.99, t, 0.18, "triangle", 0.06); // G5
  tone(ac, 1174.66, t + 0.1, 0.4, "triangle", 0.06); // D6
}
