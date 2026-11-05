/**
 * Table sounds, made on the spot with Web Audio (no files to load). Quiet by design, and off
 * with one switch that each browser remembers.
 */

const SOUND_KEY = "showdown:sound";

let audio: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  audio ??= new AudioContext();
  // Browsers start audio suspended until the page has been clicked; by a bomb, it has been.
  if (audio.state === "suspended") void audio.resume();
  return audio;
}

export function soundOn(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // Storage blocked: the choice lasts until the page reloads.
  }
}

/** A bomb landing: a low thump that drops in pitch, under a short burst of muffled noise. Heavier tiers hit a little harder. */
export function playBombImpact(tier = 1) {
  if (!soundOn()) return;
  const ctx = context();
  if (!ctx) return;
  const now = ctx.currentTime;
  const weight = 0.55 + Math.min(tier, 17) / 40;

  const out = ctx.createGain();
  out.gain.value = 0.32 * weight;
  out.connect(ctx.destination);

  // The body: a sine falling from 110 Hz to 38 Hz.
  const thump = ctx.createOscillator();
  const thumpGain = ctx.createGain();
  thump.type = "sine";
  thump.frequency.setValueAtTime(110, now);
  thump.frequency.exponentialRampToValueAtTime(38, now + 0.45);
  thumpGain.gain.setValueAtTime(0.0001, now);
  thumpGain.gain.exponentialRampToValueAtTime(1, now + 0.012);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
  thump.connect(thumpGain).connect(out);
  thump.start(now);
  thump.stop(now + 0.75);

  // The crack: a quarter-second of noise through a low-pass filter.
  const length = Math.floor(ctx.sampleRate * 0.25);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 420;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.5;
  noise.connect(filter).connect(noiseGain).connect(out);
  noise.start(now);
}

/** A short burst of noise that fades out, to shape into card sounds. */
function noiseBurst(ctx: AudioContext, seconds: number) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  return source;
}

/**
 * A card slapped onto a pile: a short papery snap. `chain` counts cards in a quick run; from the
 * third on, each one rings a little higher.
 */
export function playCardFlip(chain = 0) {
  if (!soundOn()) return;
  const ctx = context();
  if (!ctx) return;
  const now = ctx.currentTime;
  const snap = noiseBurst(ctx, 0.09);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 2200;
  band.Q.value = 0.9;
  const gain = ctx.createGain();
  gain.gain.value = 0.22;
  snap.connect(band).connect(gain).connect(ctx.destination);
  snap.start(now);

  if (chain >= 3) {
    // A soft rising chime on a run: a whole tone higher each card.
    const tone = ctx.createOscillator();
    const toneGain = ctx.createGain();
    tone.type = "triangle";
    tone.frequency.value = 523 * 2 ** ((Math.min(chain, 10) - 3) / 6);
    toneGain.gain.setValueAtTime(0.0001, now);
    toneGain.gain.exponentialRampToValueAtTime(0.09, now + 0.01);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    tone.connect(toneGain).connect(ctx.destination);
    tone.start(now);
    tone.stop(now + 0.25);
  }
}

/** A card that didn't make it: a soft, dull knock. */
export function playThud() {
  if (!soundOn()) return;
  const ctx = context();
  if (!ctx) return;
  const now = ctx.currentTime;
  const knock = ctx.createOscillator();
  const gain = ctx.createGain();
  knock.type = "sine";
  knock.frequency.setValueAtTime(140, now);
  knock.frequency.exponentialRampToValueAtTime(70, now + 0.12);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  knock.connect(gain).connect(ctx.destination);
  knock.start(now);
  knock.stop(now + 0.18);
}
