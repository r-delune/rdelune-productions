/* ── Audio Signal Utilities ────────────────────────────────
   Shared signal model and lightweight smoothing helpers for
   audio-reactive visual modulation.
──────────────────────────────────────────────────────────────── */

export interface AudioSignal {
  energy: number;
  bass: number;
  mids: number;
  highs: number;
  transient: number;
  activity?: number;
  playing?: number;
  /** 0–1 pulse on low-band spectral-flux onsets (kick-like hits). */
  bassOnset?: number;
  /** 0–1 pulse on high-band spectral-flux onsets (hat/snare-like hits). */
  highOnset?: number;
  /** 0–1 combined onset strength for consumers that don't care about the band. */
  onsetStrength?: number;
  /** 0–1 position within the current beat (0 = downbeat). Undefined when track has no BPM metadata. */
  beatPhase?: number;
  /** 0–1 position within the current 4-beat bar. Undefined when track has no BPM metadata. */
  barPhase?: number;
  /** Exponential decay from 1.0 on each downbeat. Undefined when track has no BPM metadata. */
  beatPulse?: number;
}

export const EMPTY_AUDIO_SIGNAL: Readonly<AudioSignal> = Object.freeze({
  energy: 0,
  bass: 0,
  mids: 0,
  highs: 0,
  transient: 0,
  activity: 0,
  playing: 0,
});

export function createAudioSignal(): AudioSignal {
  return { ...EMPTY_AUDIO_SIGNAL };
}

export function resetAudioSignal(signal: AudioSignal): void {
  signal.energy = 0;
  signal.bass = 0;
  signal.mids = 0;
  signal.highs = 0;
  signal.transient = 0;
  signal.activity = 0;
  signal.playing = 0;
  signal.bassOnset = 0;
  signal.highOnset = 0;
  signal.onsetStrength = 0;
  signal.beatPhase = undefined;
  signal.barPhase = undefined;
  signal.beatPulse = undefined;
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function smoothValue(current: number, target: number, dt: number, attack: number, release: number): number {
  const rate = target > current ? attack : release;
  const alpha = 1 - Math.exp(-rate * dt);
  return current + (target - current) * alpha;
}

export function smoothAudioSignal(signal: AudioSignal, target: AudioSignal, dt: number): void {
  signal.energy = clamp01(smoothValue(signal.energy, target.energy, dt, 10, 3.8));
  signal.bass = clamp01(smoothValue(signal.bass, target.bass, dt, 11, 4.1));
  signal.mids = clamp01(smoothValue(signal.mids, target.mids, dt, 10, 4.3));
  signal.highs = clamp01(smoothValue(signal.highs, target.highs, dt, 14, 5.2));
  signal.transient = clamp01(smoothValue(signal.transient, target.transient, dt, 24, 10));
  signal.activity = clamp01(smoothValue(signal.activity ?? 0, target.activity ?? 0, dt, 7.5, 3.2));
  signal.playing = clamp01(smoothValue(signal.playing ?? 0, target.playing ?? 0, dt, 8, 3.6));
  signal.bassOnset = clamp01(smoothValue(signal.bassOnset ?? 0, target.bassOnset ?? 0, dt, 28, 9));
  signal.highOnset = clamp01(smoothValue(signal.highOnset ?? 0, target.highOnset ?? 0, dt, 28, 9));
  signal.onsetStrength = clamp01(smoothValue(signal.onsetStrength ?? 0, target.onsetStrength ?? 0, dt, 28, 9));
}
