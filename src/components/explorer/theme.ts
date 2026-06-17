/* ── Explorer Color System ──────────────────────────────────
   Shared across all explorer components. Single source of truth.
   Primary   — near-white, moonlit crisp (titles, active track)
   Secondary — clearly readable (track titles, controls)
   Tertiary  — muted but legible (metadata, times, numbers)
   Accent    — icy cyan, single restrained energy color
──────────────────────────────────────────────────────────────── */

export const C1 = 'var(--explorer-c1)';
export const C2 = 'var(--explorer-c2)';
export const C3 = 'var(--explorer-c3)';
export const ACCENT = 'var(--explorer-accent)';
export const ACCENT_DIM = 'var(--explorer-accent-dim)';
export const ACCENT_BG = 'var(--explorer-accent-bg)';

/** Canvas background — deep navy, not pure black */
export const CANVAS_BG: [number, number, number] = [12, 16, 28];

/** Panel background RGB — used by canvas gradient vignette */
export const PANEL_BG_RGB: [number, number, number] = [10, 14, 26];
