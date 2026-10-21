import { useStore } from './store';

export type SoundName =
  | 'click'
  | 'hover'
  | 'miss'
  | 'hit'
  | 'sunk'
  | 'victory'
  | 'defeat'
  | 'turn'
  | 'tick'
  | 'go'
  | 'ping'
  | 'place'
  | 'error';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    ctx = new Ctor();
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Call once from a user gesture (click/touch) to unlock audio on mobile browsers. */
export function unlockAudio(): void {
  ensureContext();
}

function tone(
  ac: AudioContext,
  out: AudioNode,
  opts: { type?: OscillatorType; from: number; to?: number; start?: number; duration: number; gain?: number; attack?: number },
): void {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  const t0 = ac.currentTime + (opts.start ?? 0);
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(opts.from, t0);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t0 + opts.duration);
  const peak = opts.gain ?? 0.3;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + (opts.attack ?? 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.duration);
  osc.connect(g).connect(out);
  osc.start(t0);
  osc.stop(t0 + opts.duration + 0.05);
}

function noise(ac: AudioContext, out: AudioNode, opts: { duration: number; gain?: number; start?: number; lowpass?: number; highpass?: number }): void {
  const length = Math.floor(ac.sampleRate * opts.duration);
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const g = ac.createGain();
  const t0 = ac.currentTime + (opts.start ?? 0);
  g.gain.setValueAtTime(opts.gain ?? 0.25, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.duration);
  let node: AudioNode = src;
  if (opts.lowpass) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = opts.lowpass;
    node.connect(f);
    node = f;
  }
  if (opts.highpass) {
    const f = ac.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = opts.highpass;
    node.connect(f);
    node = f;
  }
  node.connect(g).connect(out);
  src.start(t0);
}

const recipes: Record<SoundName, (ac: AudioContext, out: AudioNode) => void> = {
  click: (ac, out) => tone(ac, out, { from: 1400, to: 900, duration: 0.06, gain: 0.12 }),
  hover: (ac, out) => tone(ac, out, { from: 1800, duration: 0.03, gain: 0.04 }),
  place: (ac, out) => {
    tone(ac, out, { type: 'triangle', from: 520, to: 660, duration: 0.09, gain: 0.18 });
    tone(ac, out, { type: 'sine', from: 880, duration: 0.08, start: 0.05, gain: 0.08 });
  },
  miss: (ac, out) => {
    noise(ac, out, { duration: 0.35, gain: 0.22, lowpass: 900 });
    tone(ac, out, { type: 'sine', from: 260, to: 110, duration: 0.32, gain: 0.2 });
  },
  hit: (ac, out) => {
    noise(ac, out, { duration: 0.4, gain: 0.5, lowpass: 2200 });
    tone(ac, out, { type: 'sawtooth', from: 190, to: 50, duration: 0.42, gain: 0.35 });
    tone(ac, out, { type: 'square', from: 95, to: 35, duration: 0.5, gain: 0.25 });
  },
  sunk: (ac, out) => {
    noise(ac, out, { duration: 0.8, gain: 0.55, lowpass: 1500 });
    tone(ac, out, { type: 'sawtooth', from: 220, to: 40, duration: 0.8, gain: 0.35 });
    tone(ac, out, { type: 'sine', from: 660, to: 330, duration: 0.5, start: 0.12, gain: 0.18 });
    tone(ac, out, { type: 'sine', from: 440, to: 220, duration: 0.6, start: 0.3, gain: 0.16 });
  },
  victory: (ac, out) => {
    [523, 659, 784, 1047].forEach((f, i) => tone(ac, out, { type: 'triangle', from: f, duration: 0.35, start: i * 0.14, gain: 0.22 }));
    tone(ac, out, { type: 'sine', from: 1319, duration: 0.7, start: 0.6, gain: 0.18 });
  },
  defeat: (ac, out) => {
    [392, 349, 311, 262].forEach((f, i) => tone(ac, out, { type: 'triangle', from: f, duration: 0.45, start: i * 0.2, gain: 0.2 }));
    noise(ac, out, { duration: 1, gain: 0.12, lowpass: 500, start: 0.4 });
  },
  turn: (ac, out) => {
    tone(ac, out, { type: 'sine', from: 740, duration: 0.14, gain: 0.14 });
    tone(ac, out, { type: 'sine', from: 988, duration: 0.2, start: 0.12, gain: 0.14 });
  },
  tick: (ac, out) => tone(ac, out, { type: 'square', from: 880, duration: 0.07, gain: 0.08 }),
  go: (ac, out) => {
    tone(ac, out, { type: 'square', from: 1320, duration: 0.18, gain: 0.12 });
    tone(ac, out, { type: 'sine', from: 1760, duration: 0.3, start: 0.05, gain: 0.1 });
  },
  ping: (ac, out) => tone(ac, out, { type: 'sine', from: 1000, to: 900, duration: 0.7, gain: 0.12 }),
  error: (ac, out) => {
    tone(ac, out, { type: 'square', from: 220, duration: 0.12, gain: 0.1 });
    tone(ac, out, { type: 'square', from: 180, duration: 0.16, start: 0.12, gain: 0.1 });
  },
};

/** Plays a synthesized sound effect, honouring the user's sound settings. */
export function playSound(name: SoundName): void {
  const { settings } = useStore.getState();
  if (!settings.sound) return;
  const ac = ensureContext();
  if (!ac || !master) return;
  master.gain.value = Math.max(0, Math.min(1, settings.volume));
  try {
    recipes[name](ac, master);
  } catch {
    /* audio is best-effort */
  }
}
