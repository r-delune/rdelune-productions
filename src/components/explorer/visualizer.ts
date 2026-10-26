/* ── Visualizer Interface ───────────────────────────────────
   Contract for pluggable canvas render systems.
──────────────────────────────────────────────────────────────── */

import type { Palette } from './palette';
import type { AudioSignal } from './audio-signal';
import type { VisualizerTuningConfig } from './tuning';
import type { BeatGrid } from './runtime/types';

/** Eased desktop pointer presence. Coordinates are normalized, top-origin. */
export interface PointerSignal {
  x: number;
  y: number;
  presence: number;
  velocity: number;
  deltaX: number;
  deltaY: number;
}

/** Internal visual parameters — every visualizer reads these each frame */
export interface VisualParams {
  turbulence: number;  // 0-1, noise complexity / amplitude
  density: number;     // 0-1, particle count or layer opacity scaling
  glow: number;        // 0-1, accent colour intensity
  drift: number;       // 0-1, movement speed scaling
  hueShift: number;    // -30 to +30 degrees, applied to palette hues
  shimmer: number;     // 0-1, fine detail / sparkle response
  impulse: number;     // 0-1, short-lived burst intensity
  strokeMode?: number; // 0-1, sketch-specific linework toggle
  verticalHueGradient?: number; // 0-1, flow-field-only top/bottom colour variation
  pointer?: PointerSignal; // optional desktop interaction; absent/zero for touch + reduced motion
}

/** Sparse musical event derived from track timing or authored visual plans. */
export type VisualEventType =
  | 'section-cue'
  | 'bar-cue'
  | 'storm-release'
  | 'color-morph'
  | 'palette-morph'
  | 'density-surge'
  | 'glow-pulse'
  | 'spark-burst'
  | 'bloom-flash'
  | 'focus-shift'
  | 'veil-sweep'
  | 'motion-drift'
  | 'grain-bloom';
export type VisualEventTarget = 'particles' | 'center' | 'all' | 'background' | 'ridges' | 'foreground' | 'mist' | 'terrain';
export type VisualEventReleaseMode = 'all-at-once' | 'one-by-one';

export interface VisualEvent {
  t: number;           // timestamp in seconds
  intensity: number;   // 0-1
  type?: VisualEventType;
  sectionIndex?: number;
  sectionCount?: number;
  target?: VisualEventTarget;
  durationMs?: number;
  color?: [number, number, number];
  palette?: {
    hueShift?: number;
    saturation?: number;
    brightness?: number;
    contrast?: number;
  };
  releaseMode?: VisualEventReleaseMode;
}

/** Exclusion zone rectangle — computed by canvas, passed to visualizer */
export interface ExclusionRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  pad: number;
}

/** Optional runtime assets for visualizers that need album/track context */
export interface VisualizerRuntimeContext {
  albumName: string;
  trackTitle: string;
  artworkUrl?: string;
  assetSeed?: string;
  beatGrid?: BeatGrid;
}

/** Pluggable render system */
export interface Visualizer {
  /** Called once when visualizer is attached to a canvas */
  setup(q: any, w: number, h: number, palette: Palette, tuning?: VisualizerTuningConfig, context?: VisualizerRuntimeContext): void;

  /** Called every frame before draw. dt is frame delta in seconds (~0.016) */
  update(dt: number, params: VisualParams, audio: AudioSignal, exclusion: ExclusionRect): void;

  /** Called every frame after update — render to the canvas */
  draw(q: any, ctx: CanvasRenderingContext2D): void;  

  /** Called when a scheduled musical visual event fires */
  onEvent(event: VisualEvent): void;

  /** Called on window resize */
  resize(w: number, h: number): void;

  /** Called when switching albums or unmounting — release resources */
  destroy(): void;
}
