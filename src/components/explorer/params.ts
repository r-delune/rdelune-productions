/* ── Lerped Parameter System ────────────────────────────────
   Manages current/target pairs for VisualParams.
   Events change targets; the render loop smoothly eases
   current → target over ~4-8 seconds.
──────────────────────────────────────────────────────────────── */

import type { VisualParams, VisualEvent } from './visualizer';
import type { AudioSignal } from './audio-signal';

export interface LerpField {
  current: number;
  target: number;
}

export interface LerpParams {
  turbulence: LerpField;
  density: LerpField;
  glow: LerpField;
  drift: LerpField;
  hueShift: LerpField;
  shimmer: LerpField;
  impulse: LerpField;
  strokeMode: LerpField;
  verticalHueGradient: LerpField;
}

const FIELDS: (keyof LerpParams)[] = ['turbulence', 'density', 'glow', 'drift', 'hueShift', 'shimmer', 'impulse', 'strokeMode', 'verticalHueGradient'];

/** Default lerp speed — gives ~4-8s transitions at 60fps */
const DEFAULT_SPEED = 0.4;

export function createLerpParams(initial: VisualParams): LerpParams {
  return {
    turbulence: { current: initial.turbulence, target: initial.turbulence },
    density:    { current: initial.density,    target: initial.density },
    glow:       { current: initial.glow,       target: initial.glow },
    drift:      { current: initial.drift,      target: initial.drift },
    hueShift:   { current: initial.hueShift,   target: initial.hueShift },
    shimmer:    { current: initial.shimmer,    target: initial.shimmer },
    impulse:    { current: initial.impulse,    target: initial.impulse },
    strokeMode: { current: initial.strokeMode ?? 1, target: initial.strokeMode ?? 1 },
    verticalHueGradient: { current: initial.verticalHueGradient ?? 0, target: initial.verticalHueGradient ?? 0 },
  };
}

/** Pre-allocated snapshot — reused every frame (no allocation) */
const _snapshot: VisualParams = {
  turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0, strokeMode: 1, verticalHueGradient: 0,
};

/**
 * Ease current → target for each field.
 * Returns a reused VisualParams object (do not store across frames).
 */
export function updateLerpParams(
  p: LerpParams,
  dt: number,
  speed: number = DEFAULT_SPEED,
): VisualParams {
  const t = 1 - Math.pow(1 - speed, dt * 60); // frame-rate independent lerp

  for (const key of FIELDS) {
    const f = p[key];
    f.current += (f.target - f.current) * t;
    // snap when close
    if (Math.abs(f.target - f.current) < 0.0005) f.current = f.target;
    _snapshot[key] = f.current;
  }

  return _snapshot;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Apply a sparse musical event to lerp targets.
 * Higher intensity → larger parameter shifts.
 * Targets decay naturally via baseParams reset (handled by orchestrator).
 */
export function applyEvent(p: LerpParams, event: VisualEvent): void {
  const i = event.intensity;

  if (event.type === 'bar-cue') {
    p.glow.target = clamp(p.glow.target + i * 0.08, 0, 1);
    p.shimmer.target = clamp(p.shimmer.target + i * 0.12, 0, 1);
    p.impulse.target = clamp(p.impulse.target + i * 0.1, 0, 1);
    return;
  }

  p.turbulence.target = clamp(p.turbulence.target + i * 0.16, 0, 1);
  p.density.target    = clamp(p.density.target + i * 0.08, 0, 1);
  p.glow.target       = clamp(p.glow.target + i * 0.18, 0, 1);
  p.drift.target      = clamp(p.drift.target + i * 0.12, 0, 1);
  p.hueShift.target   = clamp(p.hueShift.target + i * 8, -30, 30);
  p.shimmer.target    = clamp(p.shimmer.target + i * 0.06, 0, 1);
}

export function applyAudioSignal(p: LerpParams, base: VisualParams, signal: AudioSignal, trackProgress: number, currentTime: number): void {
  const energy = clamp(signal.energy, 0, 1);
  const bass = clamp(signal.bass, 0, 1);
  const mids = clamp(signal.mids, 0, 1);
  const highs = clamp(signal.highs, 0, 1);
  const transient = clamp(signal.transient, 0, 1);
  const activity = clamp(signal.activity ?? 0, 0, 1);
  const playing = clamp(signal.playing ?? 0, 0, 1);

  const livingDrive = activity * (0.18 + playing * 0.2);
  const driftDrive = bass * 0.7 + energy * 0.3 + livingDrive;
  const detailDrive = highs * 0.74 + transient * 0.26 + activity * 0.16;
  const macroPhase = Math.sin(trackProgress * Math.PI * 2 + currentTime * 0.04);

  p.turbulence.target = Math.max(
    p.turbulence.target,
    clamp(base.turbulence + driftDrive * 0.28 + highs * 0.14 + transient * 0.12 + activity * 0.045, 0, 1),
  );

  p.density.target = Math.max(
    p.density.target,
    clamp(base.density + mids * 0.3 + energy * 0.12 + activity * 0.035 + Math.max(0, macroPhase) * (mids + activity * 0.32) * 0.04, 0, 1),
  );

  // When BPM clock is available, shift timing-sensitive params to beat-derived signal.
  // transient (FFT spectral flux) is ~50-100ms late and imprecise; beatPulse is exact.
  const hasBeatClock = signal.beatPulse !== undefined;
  const beatPulseDrive = hasBeatClock ? (signal.beatPulse as number) : 0;
  const transientImpulseWeight = hasBeatClock ? 0.22 : 0.92;
  const transientGlowWeight = hasBeatClock ? 0.10 : 0.36;

  // Per-band onsets are accents on top of the smoothed bands — kept small so
  // the mood stays ambient. With an authored clock the clock remains primary.
  const bassOnset = clamp(signal.bassOnset ?? 0, 0, 1);
  const highOnset = clamp(signal.highOnset ?? 0, 0, 1);
  const bassOnsetImpulseWeight = hasBeatClock ? 0.18 : 0.45;

  p.glow.target = Math.max(
    p.glow.target,
    clamp(base.glow + energy * 0.18 + highs * 0.22 + transient * transientGlowWeight + beatPulseDrive * 0.20 + bassOnset * 0.10 + mids * 0.08 + activity * 0.055, 0, 1),
  );

  p.drift.target = Math.max(
    p.drift.target,
    clamp(base.drift + bass * 0.34 + energy * 0.18 + activity * 0.085 + Math.max(0, macroPhase) * (bass + activity * 0.24) * 0.06, 0, 1),
  );

  p.shimmer.target = Math.max(
    p.shimmer.target,
    clamp(base.shimmer + highs * 0.55 + transient * 0.24 + highOnset * 0.22 + energy * 0.08 + activity * 0.045, 0, 1),
  );

  p.impulse.target = Math.max(
    p.impulse.target,
    clamp(base.impulse + transient * transientImpulseWeight + beatPulseDrive * 0.68 + bassOnset * bassOnsetImpulseWeight + bass * 0.08 + activity * playing * 0.03, 0, 1),
  );

  const hueTarget = clamp(
    base.hueShift
      + Math.sin(currentTime * 0.12) * (1.8 + detailDrive * 4.4)
      + (highs - bass) * 4
      + (trackProgress - 0.5) * 6,
    -30,
    30,
  );

  p.hueShift.target += (hueTarget - p.hueShift.target) * (0.03 + detailDrive * 0.06 + energy * 0.04);
}

/**
 * Gently decay targets back toward base values.
 * Called each frame so params return to baseline after events.
 */
export function decayTargets(p: LerpParams, base: VisualParams, dt: number): void {
  const t = 1 - Math.pow(0.85, dt * 60); // slow decay

  for (const key of FIELDS) {
    const f = p[key];
    const b = base[key] ?? f.current;
    f.target += (b - f.target) * t;
  }
}
