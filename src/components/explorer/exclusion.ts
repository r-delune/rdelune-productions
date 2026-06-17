/* ── Multi-Factor Exclusion Zone ────────────────────────────
   Behind the player panel: reduce alpha, motion, density,
   and contrast — not just a uniform dim.
──────────────────────────────────────────────────────────────── */

import type { ExclusionRect } from './visualizer';

export interface ExclusionFactors {
  alpha: number;     // 0-1, overall opacity multiplier
  motion: number;    // 0-1, movement speed multiplier
  density: number;   // 0-1, particle density / render probability
  contrast: number;  // 0-1, colour contrast multiplier
}

/** Fully outside — no degradation */
const OUTSIDE: ExclusionFactors = { alpha: 1, motion: 1, density: 1, contrast: 1 };

/** Fully inside — maximum degradation */
const INSIDE_ALPHA    = 0.08;
const INSIDE_MOTION   = 0.25;
const INSIDE_DENSITY  = 0.35;
const INSIDE_CONTRAST = 0.4;

/**
 * Compute exclusion factors for a point relative to the panel rect.
 * Returns OUTSIDE (constant ref) when fully outside — cheap early exit.
 */
export function computeExclusion(
  x: number,
  y: number,
  rect: ExclusionRect,
): ExclusionFactors {
  // Distance from rect edge, normalised by pad
  const dx = x < rect.left
    ? (rect.left - x) / rect.pad
    : x > rect.right
      ? (x - rect.right) / rect.pad
      : 0;
  const dy = y < rect.top
    ? (rect.top - y) / rect.pad
    : y > rect.bottom
      ? (y - rect.bottom) / rect.pad
      : 0;
  const dist = Math.max(dx, dy);

  // Fully outside the soft edge
  if (dist >= 1) return OUTSIDE;

  // Smoothstep for organic falloff
  const t = dist * dist * (3 - 2 * dist);

  return {
    alpha:    INSIDE_ALPHA    + t * (1 - INSIDE_ALPHA),
    motion:   INSIDE_MOTION   + t * (1 - INSIDE_MOTION),
    density:  INSIDE_DENSITY  + t * (1 - INSIDE_DENSITY),
    contrast: INSIDE_CONTRAST + t * (1 - INSIDE_CONTRAST),
  };
}
