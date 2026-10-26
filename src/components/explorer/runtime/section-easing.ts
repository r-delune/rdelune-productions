/* ── Section Easing Curves ───────────────────────────────────
   Shared, role-aware easing for section transitions. Every kernel
   receives its section-boundary swell (cueState approach/release)
   and its parameter-lerp speed through these curves, so transitions
   feel musical — a `build` accelerates with anticipation, a
   `release`/`afterglow` settles fast then lingers — instead of one
   flat exponential chase for every role.

   This is the CPU-side companion to the GPU section-progress ratchet
   in visualizers/three-scene-helpers.ts (SECTION_TAU): same musical
   philosophy — intro/afterglow slow and atmospheric, build→peak the
   sharpest — expressed as easing curves the param system can apply.
──────────────────────────────────────────────────────────────── */

import type { ExplorerStoryboardSectionRole } from './types';

/** A normalized easing curve: maps 0..1 → 0..1. Pure, no allocation. */
export type EaseFn = (t: number) => number;

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

export const linear: EaseFn = (t) => clamp01(t);
export const smoothstep: EaseFn = (t) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
export const easeInQuad: EaseFn = (t) => {
  const x = clamp01(t);
  return x * x;
};
export const easeOutQuad: EaseFn = (t) => {
  const x = clamp01(t);
  return x * (2 - x);
};
export const easeInOutCubic: EaseFn = (t) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const easeOutExpo: EaseFn = (t) => {
  const x = clamp01(t);
  return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
};

export interface SectionEasing {
  /** Curve applied to the section-boundary swell (0..1 approach/release). */
  curve: EaseFn;
  /** Parameter-lerp speed for updateLerpParams (per-frame ease factor at 60fps). */
  lerpSpeed: number;
}

/** Canonical role order, mirrors ExplorerStoryboardSectionRole. */
export const SECTION_ROLE_ORDER: readonly ExplorerStoryboardSectionRole[] = [
  'intro',
  'establish',
  'drift',
  'build',
  'lift',
  'peak',
  'release',
  'afterglow',
];

// Per-role easing. The musical feel comes from the CURVE SHAPE, not from faster
// chasing: every lerpSpeed is kept at or below the historical constant (0.4) so
// no role tracks its target more tightly than before — that avoids snappy/jumpy
// section changes. Relative ordering still reads (peak is the tightest, intro/
// afterglow the loosest) but the whole range is gentle.
const ROLE_EASING: Readonly<Record<ExplorerStoryboardSectionRole, SectionEasing>> = {
  intro:     { curve: easeOutQuad,    lerpSpeed: 0.20 },
  establish: { curve: easeOutQuad,    lerpSpeed: 0.24 },
  drift:     { curve: smoothstep,     lerpSpeed: 0.22 },
  build:     { curve: easeInQuad,     lerpSpeed: 0.30 },
  lift:      { curve: easeInQuad,     lerpSpeed: 0.34 },
  peak:      { curve: easeInOutCubic, lerpSpeed: 0.38 },
  release:   { curve: easeOutExpo,    lerpSpeed: 0.26 },
  afterglow: { curve: easeOutExpo,    lerpSpeed: 0.18 },
};

// Matches the previous constant lerp behaviour (DEFAULT_SPEED 0.4, smoothstep
// swell) so any section without a resolved role is unchanged from before.
const DEFAULT_EASING: SectionEasing = { curve: smoothstep, lerpSpeed: 0.4 };

/** Easing for a section role; falls back to the neutral default when absent. */
export function getSectionEasing(role?: ExplorerStoryboardSectionRole): SectionEasing {
  return role ? ROLE_EASING[role] ?? DEFAULT_EASING : DEFAULT_EASING;
}
