'use client';

import { useEffect, useRef, useState } from 'react';
import useQ5 from '@/hooks/useQ5';
import { EMPTY_AUDIO_SIGNAL, clamp01 } from './audio-signal';
import type { AudioSignal } from './audio-signal';
import { applyAudioSignal, applyEvent, createLerpParams, decayTargets, updateLerpParams } from './params';
import { getSectionEasing, type EaseFn, type SectionEasing } from './runtime/section-easing';
import type { LerpParams } from './params';
import { applyPaletteHueShift, applyPaletteTransform, clonePalette, generatePalette, type Palette } from './palette';
import { getVisualizerTuning } from './tuning';
import { EXPLORER_DESKTOP_BREAKPOINT, EXPLORER_PANEL_SOFT_EDGE, EXPLORER_TABLET_BREAKPOINT, getExplorerStageMetrics } from './runtime/layout';
import { getBeatGridPosition, getSectionIndex, buildTrackVisualPlan, getSectionRecipe } from './runtime/plans';
import { GRAIN_COUNT, getDefaultExplorerRecipe } from './runtime/recipes';
import type { BeatGrid, ExplorerRecipe, ExplorerSceneProfile, SectionVisualStep, TrackVisualConfig, TrackVisualPlan } from './runtime/types';
import type { ExclusionRect, PointerSignal, VisualEvent, VisualParams, Visualizer } from './visualizer';
import { createVisualizer } from './visualizers/registry';
import { preloadArtworkImage } from './artwork-cache';
import { getProductionPlaybackMode } from './playback-capability';
import { getQualityScale, getRenderQualityTelemetry, reportFrame } from './render-quality';

export { getCardStyle } from './runtime/plans';

/* ── Explorer Canvas Runtime ────────────────────────────────
   The canvas is a generic section orchestrator.
   `TrackVisualPlan` decides which recipe belongs to a section.
   The canvas turns that plan into live visualizer stages and
   crossfades them, while keeping audio and cue modulation shared.
──────────────────────────────────────────────────────────────── */

function smoothstep01(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

// Softer S-curve (Perlin smootherstep) for section crossfades: gentler ramp in
// and out than smoothstep, so a kernel change reads as a slow dissolve rather
// than a cut. Used only for the section transition blend.
function smootherstep01(value: number): number {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function formatTimelineTime(time: number): string {
  const seconds = Math.max(0, Math.floor(time));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

interface CueState {
  sectionProgress: number;
  approach: number;
  release: number;
  density: number;
}

interface SceneProfile {
  idleAlpha: number;
  horizonAlpha: number;
  veilAlpha: number;
  leftGlowX: number;
  leftGlowY: number;
  leftGlowRadius: number;
  leftGlowStrength: number;
  lowerGlowX: number;
  lowerGlowY: number;
  lowerGlowRadius: number;
  lowerGlowStrength: number;
  washX: number;
  washY: number;
  washRadius: number;
  washStrength: number;
  sweepWidth: number;
  sweepStrength: number;
  rippleX: number;
  rippleY: number;
  rippleAspect: number;
  rippleStrength: number;
  grain: number;
  vignette: number;
}

interface OverlayScale {
  ambient: number;
  glow: number;
  wash: number;
  sweep: number;
  ripple: number;
  grain: number;
  material: number;
}

interface StageCueWash {
  color: [number, number, number];
  age: number;
  life: number;
  alpha: number;
}

interface StageCueSweep {
  color: [number, number, number];
  age: number;
  life: number;
  alpha: number;
  angle: number;
  width: number;
}

interface StageCueTint {
  color: [number, number, number];
  age: number;
  duration: number;
  alpha: number;
}

interface ProductionsVisualSmokeTelemetry {
  recipeId: string;
  kernel: string;
  sceneProfile: ExplorerSceneProfile;
  frameCount: number;
  frameEma: number;
  fpsEstimate: number;
  qualityScale: number;
  targetFrameMs: number;
}

type WindowWithProductionsVisualSmoke = Window & {
  __PRODUCTIONS_RENDER_QUALITY__?: ProductionsVisualSmokeTelemetry;
};

const SCENE_PROFILES: Readonly<Record<ExplorerSceneProfile, SceneProfile>> = {
  ink: {
    idleAlpha: 1,
    horizonAlpha: 0.62,
    veilAlpha: 1,
    leftGlowX: 0.12,
    leftGlowY: 0.24,
    leftGlowRadius: 0.62,
    leftGlowStrength: 1.12,
    lowerGlowX: 0.35,
    lowerGlowY: 0.8,
    lowerGlowRadius: 0.44,
    lowerGlowStrength: 0.74,
    washX: 0.2,
    washY: 0.42,
    washRadius: 0.3,
    washStrength: 0.86,
    sweepWidth: 420,
    sweepStrength: 0.84,
    rippleX: 0.16,
    rippleY: 0.36,
    rippleAspect: 0.52,
    rippleStrength: 0.72,
    grain: 1.14,
    vignette: 0.88,
  },
  smoke: {
    idleAlpha: 0.64,
    horizonAlpha: 0.18,
    veilAlpha: 0.34,
    leftGlowX: 0.18,
    leftGlowY: 0.4,
    leftGlowRadius: 0.72,
    leftGlowStrength: 0.74,
    lowerGlowX: 0.48,
    lowerGlowY: 0.78,
    lowerGlowRadius: 0.5,
    lowerGlowStrength: 1.22,
    washX: 0.3,
    washY: 0.58,
    washRadius: 0.34,
    washStrength: 0.58,
    sweepWidth: 500,
    sweepStrength: 0.42,
    rippleX: 0.3,
    rippleY: 0.56,
    rippleAspect: 0.6,
    rippleStrength: 0.34,
    grain: 0.62,
    vignette: 1.08,
  },
  tide: {
    idleAlpha: 0.54,
    horizonAlpha: 1.12,
    veilAlpha: 0.28,
    leftGlowX: 0.08,
    leftGlowY: 0.36,
    leftGlowRadius: 0.48,
    leftGlowStrength: 0.56,
    lowerGlowX: 0.52,
    lowerGlowY: 0.72,
    lowerGlowRadius: 0.38,
    lowerGlowStrength: 0.92,
    washX: 0.34,
    washY: 0.62,
    washRadius: 0.24,
    washStrength: 0.68,
    sweepWidth: 640,
    sweepStrength: 0.3,
    rippleX: 0.26,
    rippleY: 0.62,
    rippleAspect: 0.24,
    rippleStrength: 1.18,
    grain: 0.82,
    vignette: 0.76,
  },
  cloud: {
    idleAlpha: 1.16,
    horizonAlpha: 0.34,
    veilAlpha: 0.78,
    leftGlowX: 0.16,
    leftGlowY: 0.22,
    leftGlowRadius: 0.76,
    leftGlowStrength: 1.22,
    lowerGlowX: 0.38,
    lowerGlowY: 0.7,
    lowerGlowRadius: 0.46,
    lowerGlowStrength: 0.56,
    washX: 0.18,
    washY: 0.34,
    washRadius: 0.38,
    washStrength: 0.72,
    sweepWidth: 380,
    sweepStrength: 0.34,
    rippleX: 0.14,
    rippleY: 0.3,
    rippleAspect: 0.68,
    rippleStrength: 0.46,
    grain: 0.72,
    vignette: 0.66,
  },
  rain: {
    idleAlpha: 0.32,
    horizonAlpha: 0.12,
    veilAlpha: 0.18,
    leftGlowX: 0.22,
    leftGlowY: 0.18,
    leftGlowRadius: 0.48,
    leftGlowStrength: 0.52,
    lowerGlowX: 0.44,
    lowerGlowY: 0.84,
    lowerGlowRadius: 0.32,
    lowerGlowStrength: 0.48,
    washX: 0.28,
    washY: 0.5,
    washRadius: 0.2,
    washStrength: 0.44,
    sweepWidth: 260,
    sweepStrength: 1.28,
    rippleX: 0.24,
    rippleY: 0.44,
    rippleAspect: 0.34,
    rippleStrength: 0.28,
    grain: 1.02,
    vignette: 1.16,
  },
  flow: {
    idleAlpha: 0.48,
    horizonAlpha: 0.28,
    veilAlpha: 0.42,
    leftGlowX: 0.2,
    leftGlowY: 0.46,
    leftGlowRadius: 0.52,
    leftGlowStrength: 0.68,
    lowerGlowX: 0.3,
    lowerGlowY: 0.76,
    lowerGlowRadius: 0.4,
    lowerGlowStrength: 0.76,
    washX: 0.3,
    washY: 0.54,
    washRadius: 0.32,
    washStrength: 0.94,
    sweepWidth: 360,
    sweepStrength: 0.62,
    rippleX: 0.28,
    rippleY: 0.52,
    rippleAspect: 0.4,
    rippleStrength: 0.58,
    grain: 1.18,
    vignette: 0.88,
  },
  spiral: {
    idleAlpha: 0.28,
    horizonAlpha: 0.08,
    veilAlpha: 0.18,
    leftGlowX: 0.32,
    leftGlowY: 0.24,
    leftGlowRadius: 0.42,
    leftGlowStrength: 0.84,
    lowerGlowX: 0.46,
    lowerGlowY: 0.64,
    lowerGlowRadius: 0.36,
    lowerGlowStrength: 0.68,
    washX: 0.4,
    washY: 0.44,
    washRadius: 0.22,
    washStrength: 1.12,
    sweepWidth: 300,
    sweepStrength: 0.96,
    rippleX: 0.34,
    rippleY: 0.42,
    rippleAspect: 0.74,
    rippleStrength: 1.2,
    grain: 1.04,
    vignette: 1,
  },
  contour: {
    idleAlpha: 0.74,
    horizonAlpha: 1.2,
    veilAlpha: 0.22,
    leftGlowX: 0.1,
    leftGlowY: 0.3,
    leftGlowRadius: 0.46,
    leftGlowStrength: 0.54,
    lowerGlowX: 0.44,
    lowerGlowY: 0.8,
    lowerGlowRadius: 0.38,
    lowerGlowStrength: 0.7,
    washX: 0.24,
    washY: 0.62,
    washRadius: 0.24,
    washStrength: 0.54,
    sweepWidth: 580,
    sweepStrength: 0.24,
    rippleX: 0.22,
    rippleY: 0.6,
    rippleAspect: 0.22,
    rippleStrength: 0.96,
    grain: 0.72,
    vignette: 0.82,
  },
  planet: {
    idleAlpha: 0.22,
    horizonAlpha: 0.04,
    veilAlpha: 0.14,
    leftGlowX: 0.36,
    leftGlowY: 0.26,
    leftGlowRadius: 0.38,
    leftGlowStrength: 0.72,
    lowerGlowX: 0.5,
    lowerGlowY: 0.54,
    lowerGlowRadius: 0.32,
    lowerGlowStrength: 1.28,
    washX: 0.44,
    washY: 0.46,
    washRadius: 0.28,
    washStrength: 1.34,
    sweepWidth: 280,
    sweepStrength: 0.56,
    rippleX: 0.42,
    rippleY: 0.48,
    rippleAspect: 0.84,
    rippleStrength: 1.42,
    grain: 0.56,
    vignette: 1.24,
  },
  particle: {
    idleAlpha: 0.62,
    horizonAlpha: 0.42,
    veilAlpha: 0.36,
    leftGlowX: 0.16,
    leftGlowY: 0.44,
    leftGlowRadius: 0.58,
    leftGlowStrength: 0.78,
    lowerGlowX: 0.34,
    lowerGlowY: 0.74,
    lowerGlowRadius: 0.42,
    lowerGlowStrength: 0.84,
    washX: 0.3,
    washY: 0.52,
    washRadius: 0.3,
    washStrength: 0.82,
    sweepWidth: 420,
    sweepStrength: 0.54,
    rippleX: 0.28,
    rippleY: 0.52,
    rippleAspect: 0.42,
    rippleStrength: 0.58,
    grain: 1.08,
    vignette: 0.9,
  },
  galaxy: {
    idleAlpha: 0.5,
    horizonAlpha: 0.22,
    veilAlpha: 0.3,
    leftGlowX: 0.28,
    leftGlowY: 0.28,
    leftGlowRadius: 0.5,
    leftGlowStrength: 0.88,
    lowerGlowX: 0.44,
    lowerGlowY: 0.66,
    lowerGlowRadius: 0.38,
    lowerGlowStrength: 0.76,
    washX: 0.38,
    washY: 0.48,
    washRadius: 0.28,
    washStrength: 1.04,
    sweepWidth: 340,
    sweepStrength: 0.74,
    rippleX: 0.36,
    rippleY: 0.46,
    rippleAspect: 0.7,
    rippleStrength: 1,
    grain: 0.84,
    vignette: 1.04,
  },
  storm: {
    idleAlpha: 0.38,
    horizonAlpha: 0.18,
    veilAlpha: 0.2,
    leftGlowX: 0.2,
    leftGlowY: 0.24,
    leftGlowRadius: 0.52,
    leftGlowStrength: 0.92,
    lowerGlowX: 0.42,
    lowerGlowY: 0.82,
    lowerGlowRadius: 0.34,
    lowerGlowStrength: 0.9,
    washX: 0.34,
    washY: 0.5,
    washRadius: 0.24,
    washStrength: 1.12,
    sweepWidth: 300,
    sweepStrength: 1.16,
    rippleX: 0.34,
    rippleY: 0.48,
    rippleAspect: 0.46,
    rippleStrength: 1.18,
    grain: 1.2,
    vignette: 1.16,
  },
  mist: {
    idleAlpha: 0.72,
    horizonAlpha: 0.24,
    veilAlpha: 0.48,
    leftGlowX: 0.14,
    leftGlowY: 0.32,
    leftGlowRadius: 0.68,
    leftGlowStrength: 0.84,
    lowerGlowX: 0.4,
    lowerGlowY: 0.76,
    lowerGlowRadius: 0.42,
    lowerGlowStrength: 0.68,
    washX: 0.22,
    washY: 0.48,
    washRadius: 0.32,
    washStrength: 0.62,
    sweepWidth: 440,
    sweepStrength: 0.38,
    rippleX: 0.18,
    rippleY: 0.42,
    rippleAspect: 0.58,
    rippleStrength: 0.42,
    grain: 0.54,
    vignette: 0.78,
  },
  texture: {
    idleAlpha: 0.58,
    horizonAlpha: 0.16,
    veilAlpha: 0.32,
    leftGlowX: 0.16,
    leftGlowY: 0.28,
    leftGlowRadius: 0.54,
    leftGlowStrength: 0.62,
    lowerGlowX: 0.44,
    lowerGlowY: 0.8,
    lowerGlowRadius: 0.36,
    lowerGlowStrength: 0.54,
    washX: 0.28,
    washY: 0.52,
    washRadius: 0.22,
    washStrength: 0.48,
    sweepWidth: 380,
    sweepStrength: 0.52,
    rippleX: 0.22,
    rippleY: 0.46,
    rippleAspect: 0.44,
    rippleStrength: 0.36,
    grain: 1.28,
    vignette: 0.92,
  },
  line: {
    idleAlpha: 0.66,
    horizonAlpha: 0.22,
    veilAlpha: 0.44,
    leftGlowX: 0.18,
    leftGlowY: 0.3,
    leftGlowRadius: 0.58,
    leftGlowStrength: 0.78,
    lowerGlowX: 0.42,
    lowerGlowY: 0.78,
    lowerGlowRadius: 0.4,
    lowerGlowStrength: 0.58,
    washX: 0.24,
    washY: 0.46,
    washRadius: 0.28,
    washStrength: 0.56,
    sweepWidth: 400,
    sweepStrength: 0.44,
    rippleX: 0.2,
    rippleY: 0.4,
    rippleAspect: 0.52,
    rippleStrength: 0.48,
    grain: 0.68,
    vignette: 0.82,
  },
  grid: {
    idleAlpha: 0.48,
    horizonAlpha: 0.18,
    veilAlpha: 0.28,
    leftGlowX: 0.2,
    leftGlowY: 0.26,
    leftGlowRadius: 0.5,
    leftGlowStrength: 0.68,
    lowerGlowX: 0.46,
    lowerGlowY: 0.82,
    lowerGlowRadius: 0.34,
    lowerGlowStrength: 0.48,
    washX: 0.3,
    washY: 0.54,
    washRadius: 0.2,
    washStrength: 0.42,
    sweepWidth: 320,
    sweepStrength: 0.68,
    rippleX: 0.28,
    rippleY: 0.48,
    rippleAspect: 0.38,
    rippleStrength: 0.32,
    grain: 0.72,
    vignette: 0.94,
  },
  geology: {
    idleAlpha: 0.28,
    horizonAlpha: 0.18,
    veilAlpha: 0.22,
    leftGlowX: 0.3,
    leftGlowY: 0.6,
    leftGlowRadius: 0.42,
    leftGlowStrength: 0.44,
    lowerGlowX: 0.42,
    lowerGlowY: 0.82,
    lowerGlowRadius: 0.34,
    lowerGlowStrength: 0.58,
    washX: 0.36,
    washY: 0.72,
    washRadius: 0.22,
    washStrength: 0.32,
    sweepWidth: 260,
    sweepStrength: 0.28,
    rippleX: 0.34,
    rippleY: 0.7,
    rippleAspect: 0.28,
    rippleStrength: 0.24,
    grain: 1.42,
    vignette: 1.08,
  },
  sparse: {
    idleAlpha: 0.92,
    horizonAlpha: 0.28,
    veilAlpha: 0.56,
    leftGlowX: 0.1,
    leftGlowY: 0.24,
    leftGlowRadius: 0.64,
    leftGlowStrength: 0.92,
    lowerGlowX: 0.38,
    lowerGlowY: 0.74,
    lowerGlowRadius: 0.44,
    lowerGlowStrength: 0.64,
    washX: 0.18,
    washY: 0.4,
    washRadius: 0.34,
    washStrength: 0.68,
    sweepWidth: 480,
    sweepStrength: 0.32,
    rippleX: 0.14,
    rippleY: 0.34,
    rippleAspect: 0.6,
    rippleStrength: 0.44,
    grain: 0.42,
    vignette: 0.58,
  },
};

// Section transition lengths. Lengthened for the ambient catalogue so a kernel
// change between sections reads as a slow dissolve, not a cut (the experience is
// "one world that breathes"). Cross-kernel crossfades are the longest because
// they swap renderers; same-sketch morphs can be a touch quicker.
const SKETCH_MERGE_TRANSITION_SECONDS = 2.6;
const SKETCH_CROSSFADE_SECONDS = 7.5;
const SAME_SKETCH_MORPH_SECONDS = 2.8;

function getStepTransitionSeconds(step?: SectionVisualStep): number {
  const transitionMs = step?.transitionMs;
  if (transitionMs === undefined || !isFinite(transitionMs)) return SKETCH_MERGE_TRANSITION_SECONDS;
  return Math.max(0.12, transitionMs / 1000);
}

function createLivingAudioSignal(time: number, source: AudioSignal, activity: number, playing: number): AudioSignal {
  const idle = clamp01(activity * (0.62 + playing * 0.38));
  const pulse = Math.max(0, Math.sin(time * 1.55) - 0.92);
  const drift = 0.5 + Math.sin(time * 0.27 + Math.sin(time * 0.073) * 1.8) * 0.5;
  const shimmer = 0.5 + Math.sin(time * 0.84 + 0.8) * 0.5;

  return {
    energy: clamp01((0.22 + drift * 0.10) * idle + source.energy * (0.88 + playing * 0.18)),
    bass: clamp01((0.16 + Math.sin(time * 0.43 + 1.2) * 0.05) * idle + source.bass * (0.9 + playing * 0.12)),
    mids: clamp01((0.20 + Math.sin(time * 0.61 + 2.4) * 0.06) * idle + source.mids * (0.9 + playing * 0.12)),
    highs: clamp01((0.13 + shimmer * 0.06) * idle + source.highs * (0.88 + playing * 0.16)),
    transient: clamp01(pulse * 0.12 * idle + source.transient * (0.95 + playing * 0.18)),
    activity: clamp01(activity),
    playing: clamp01(playing),
    bassOnset: clamp01((source.bassOnset ?? 0) * playing),
    highOnset: clamp01((source.highOnset ?? 0) * playing),
    onsetStrength: clamp01((source.onsetStrength ?? 0) * playing),
  };
}

function createTimedMobileSignal(currentTime: number, beatGrid: BeatGrid, playing: boolean): AudioSignal {
  if (!playing) return EMPTY_AUDIO_SIGNAL;

  const beatSeconds = 60 / Math.max(1, beatGrid.bpm);
  const elapsed = Math.max(0, currentTime - beatGrid.beatStartAt);
  const beatPhase = (elapsed / beatSeconds) % 1;
  const barPhase = (elapsed / beatGrid.barDurationSeconds) % 1;
  const pulse = Math.exp(-beatPhase * 5.4);
  const barLift = Math.exp(-barPhase * 9);

  return {
    energy: clamp01(0.12 + pulse * 0.14 + barLift * 0.06),
    bass: clamp01(0.08 + pulse * 0.28 + barLift * 0.08),
    mids: clamp01(0.09 + pulse * 0.1),
    highs: clamp01(0.045 + pulse * 0.06),
    transient: clamp01(pulse * 0.34 + barLift * 0.18),
    activity: clamp01(0.2 + pulse * 0.2),
    playing: 1,
    beatPhase,
    barPhase,
    beatPulse: pulse,
  };
}

function mixChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function tintTriplet(value: [number, number, number], target: [number, number, number], amount: number): [number, number, number] {
  return [
    mixChannel(value[0], target[0], amount),
    mixChannel(value[1], target[1], amount),
    mixChannel(value[2], target[2], amount),
  ];
}

function getThemeBottomColor(): [number, number, number] {
  return [5, 8, 16];
}

function getThemeTransitionColor(palette: Palette): [number, number, number] {
  return tintTriplet(palette.bgDark, [2, 4, 10], 0.5);
}

interface Stage {
  recipe: ExplorerRecipe;
  baseParams: VisualParams;
  viz: Visualizer;
  lerpParams: LerpParams;
  buffer: HTMLCanvasElement;
  materialBuffer: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  basePalette: Palette;
  palette: Palette;
  cueWashes: StageCueWash[];
  cueSweeps: StageCueSweep[];
  cueTint: StageCueTint | null;
  sectionHueOffset: number;
  sectionHueTarget: number;
  sectionSatOffset: number;
  sectionSatTarget: number;
  sectionBriOffset: number;
  sectionBriTarget: number;
}

interface MobileParticle {
  x: number;
  y: number;
  r: number;
  speed: number;
  warm: boolean;
}

interface MobileRenderInput {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  palette: Palette;
  recipe: ExplorerRecipe;
  particles: readonly MobileParticle[];
  time: number;
  progress: number;
  sectionIndex: number;
  sectionFlash: number;
  energy: number;
  bass: number;
  mids: number;
  highs: number;
  transient: number;
  motionScale: number;
  colorPresence: number;
}

function seededMobileUnit(seedLabel: string, index: number, salt = 0): number {
  return ((hashString(`${seedLabel}:${index}:${salt}`) % 10000) / 10000);
}

function drawMobileLineField(input: MobileRenderInput): void {
  const { ctx, width, height, palette, recipe, time, progress, sectionIndex, sectionFlash, energy, mids, highs, motionScale, colorPresence } = input;
  const [accentR, accentG, accentB] = palette.accentGlow;
  const [warmR, warmG, warmB] = palette.accentWarm;
  const isContour = recipe.sceneProfile === 'contour' || recipe.sceneProfile === 'tide';
  const rows: number = isContour ? 11 : 8;
  const amplitude = (isContour ? 14 : 24) + mids * 28 + sectionFlash * 10;
  const phase = time * (isContour ? 0.36 : 0.56) * motionScale + sectionIndex * 0.74;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.lineWidth = isContour ? 1.15 : 1.4 + energy * 1.8;
  for (let row = 0; row < rows; row += 1) {
    const rowProgress = row / (rows - 1);
    const yBase = height * (0.16 + rowProgress * 0.72);
    const alpha = (0.028 + energy * 0.042 + sectionFlash * 0.035) * (1 - rowProgress * 0.22) * colorPresence;
    ctx.strokeStyle = row % 2 === 0
      ? `rgba(${accentR},${accentG},${accentB},${alpha})`
      : `rgba(${warmR},${warmG},${warmB},${alpha * 0.82})`;
    ctx.beginPath();
    for (let x = -28; x <= width + 28; x += isContour ? 14 : 18) {
      const local = x / Math.max(width, 1);
      const wave = Math.sin(local * (isContour ? 11 : 8.2) + phase + row * 0.62) * amplitude
        + Math.sin(local * (isContour ? 25 : 18) + time * 0.18 * motionScale + row) * (4 + highs * 10);
      const y = yBase + wave + Math.sin(progress * Math.PI * 2 + row) * 8;
      if (x <= -28) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawMobileParticles(input: MobileRenderInput, sparse = false): void {
  const { ctx, width, height, palette, particles, time, progress, sectionFlash, energy, bass, highs, transient, motionScale, colorPresence } = input;
  const [accentR, accentG, accentB] = palette.accentGlow;
  const [warmR, warmG, warmB] = palette.accentWarm;
  const count = sparse ? Math.ceil(particles.length * 0.46) : particles.length;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let index = 0; index < count; index += 1) {
    const particle = particles[index];
    const travel = (time * particle.speed * motionScale + progress * (0.16 + particle.speed)) % 1;
    const x = ((particle.x + travel * (sparse ? 0.1 : 0.22) + Math.sin(time * 0.09 + particle.y * 4) * 0.035 * motionScale) % 1) * width;
    const y = ((particle.y + Math.sin(time * particle.speed + particle.x * 6) * 0.05 * motionScale + progress * 0.06) % 1) * height;
    const pulse = 0.65 + Math.sin(time * (1.2 + particle.speed) + particle.x * 8) * 0.35;
    const radius = particle.r * (1 + energy * 1.2 + transient * 1.8) * (0.75 + pulse * 0.35) * (sparse ? 0.82 : 1);
    ctx.fillStyle = particle.warm
      ? `rgba(${warmR},${warmG},${warmB},${(0.035 + bass * 0.055 + sectionFlash * 0.03) * colorPresence})`
      : `rgba(${accentR},${accentG},${accentB},${(0.032 + highs * 0.06 + sectionFlash * 0.026) * colorPresence})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawMobileRain(input: MobileRenderInput): void {
  const { ctx, width, height, palette, recipe, time, progress, sectionIndex, sectionFlash, energy, highs, motionScale, colorPresence } = input;
  const [accentR, accentG, accentB] = palette.accentGlow;
  const [warmR, warmG, warmB] = palette.accentWarm;
  const seedLabel = `${recipe.id}:rain:${sectionIndex}`;
  const drops = 58;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.lineWidth = 0.8 + energy * 1.2;
  for (let index = 0; index < drops; index += 1) {
    const lane = seededMobileUnit(seedLabel, index, 1);
    const fall = (seededMobileUnit(seedLabel, index, 2) + time * (0.18 + seededMobileUnit(seedLabel, index, 3) * 0.32) * motionScale + progress * 0.34) % 1;
    const x = lane * width + Math.sin(time * 0.34 + index) * 18;
    const y = fall * (height + 120) - 80;
    const length = 20 + seededMobileUnit(seedLabel, index, 4) * 58 + highs * 20;
    const alpha = (0.035 + energy * 0.05 + sectionFlash * 0.05) * colorPresence;
    ctx.strokeStyle = index % 5 === 0
      ? `rgba(${warmR},${warmG},${warmB},${alpha * 0.62})`
      : `rgba(${accentR},${accentG},${accentB},${alpha})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - length * 0.28, y + length);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMobileRadial(input: MobileRenderInput): void {
  const { ctx, width, height, palette, recipe, time, progress, sectionIndex, sectionFlash, energy, bass, mids, highs, motionScale, colorPresence } = input;
  const [accentR, accentG, accentB] = palette.accentGlow;
  const [warmR, warmG, warmB] = palette.accentWarm;
  const cx = width * (recipe.sceneProfile === 'planet' ? 0.54 : 0.48 + Math.sin(time * 0.11) * 0.08);
  const cy = height * (recipe.sceneProfile === 'planet' ? 0.42 : 0.46 + Math.cos(time * 0.09) * 0.07);
  const radius = Math.min(width, height) * (recipe.sceneProfile === 'planet' ? 0.18 : 0.11 + energy * 0.08);
  const rings = recipe.sceneProfile === 'planet' ? 5 : 3;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let ring = 0; ring < rings; ring += 1) {
    const ringRadius = radius * (1 + ring * 0.52 + bass * 0.24 + sectionFlash * 0.18);
    ctx.lineWidth = 1 + (rings - ring) * 0.34;
    ctx.strokeStyle = ring % 2 === 0
      ? `rgba(${accentR},${accentG},${accentB},${(0.055 + energy * 0.08 + sectionFlash * 0.06) * colorPresence})`
      : `rgba(${warmR},${warmG},${warmB},${(0.04 + mids * 0.07) * colorPresence})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, ringRadius * (1.2 + ring * 0.15), ringRadius * (0.54 + ring * 0.07), time * 0.12 * motionScale + ring * 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  const spokes = recipe.sceneProfile === 'planet' ? 18 : 34;
  for (let index = 0; index < spokes; index += 1) {
    const angle = (index / spokes) * Math.PI * 2 + time * (0.18 + highs * 0.2) * motionScale + sectionIndex * 0.2;
    const inner = radius * (0.6 + Math.sin(time * 0.6 + index) * 0.12);
    const outer = radius * (2.2 + energy * 1.4 + seededMobileUnit(recipe.id, index, 4));
    const alpha = (0.018 + energy * 0.04 + sectionFlash * 0.04) * colorPresence;
    ctx.strokeStyle = `rgba(${index % 3 === 0 ? warmR : accentR},${index % 3 === 0 ? warmG : accentG},${index % 3 === 0 ? warmB : accentB},${alpha})`;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMobileFlow(input: MobileRenderInput): void {
  const { ctx, width, height, palette, recipe, time, progress, sectionIndex, sectionFlash, energy, bass, mids, motionScale, colorPresence } = input;
  const [accentR, accentG, accentB] = palette.accentGlow;
  const [warmR, warmG, warmB] = palette.accentWarm;
  const columns = recipe.sceneProfile === 'grid' ? 9 : 6;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let column = 0; column < columns; column += 1) {
    const x = width * ((column + 0.5) / columns);
    const drift = Math.sin(time * 0.24 * motionScale + column + sectionIndex) * width * 0.045;
    const bandWidth = width * (0.018 + energy * 0.018 + (column % 2) * 0.006);
    const gradient = ctx.createLinearGradient(x + drift, height * 0.06, x - drift, height * 0.92);
    const alpha = (0.018 + mids * 0.04 + sectionFlash * 0.045) * colorPresence;
    gradient.addColorStop(0, `rgba(${accentR},${accentG},${accentB},0)`);
    gradient.addColorStop(0.4, `rgba(${column % 2 ? warmR : accentR},${column % 2 ? warmG : accentG},${column % 2 ? warmB : accentB},${alpha})`);
    gradient.addColorStop(1, `rgba(${accentR},${accentG},${accentB},0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(x + drift - bandWidth * 0.5, 0, bandWidth, height);
  }

  ctx.lineWidth = 1 + bass * 2;
  ctx.strokeStyle = `rgba(${warmR},${warmG},${warmB},${(0.034 + energy * 0.046) * colorPresence})`;
  for (let row = 0; row < 5; row += 1) {
    ctx.beginPath();
    for (let x = -30; x <= width + 30; x += 22) {
      const local = x / Math.max(width, 1);
      const y = height * (0.22 + row * 0.14)
        + Math.sin(local * 6 + time * 0.32 * motionScale + row + progress * 4) * (18 + mids * 24);
      if (x <= -30) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawMobileRecipeLayer(input: MobileRenderInput): void {
  const profile = input.recipe.sceneProfile;

  if (profile === 'rain') {
    drawMobileRain(input);
    return;
  }

  if (profile === 'flow' || profile === 'grid' || profile === 'geology') {
    drawMobileFlow(input);
    return;
  }

  if (profile === 'contour' || profile === 'tide' || profile === 'line') {
    drawMobileLineField(input);
    return;
  }

  if (profile === 'planet' || profile === 'spiral' || profile === 'storm' || profile === 'galaxy') {
    drawMobileRadial(input);
    if (profile === 'galaxy' || profile === 'storm') drawMobileParticles(input, profile === 'storm');
    return;
  }

  if (profile === 'cloud' || profile === 'mist' || profile === 'smoke') {
    drawMobileParticles(input, false);
    drawMobileLineField(input);
    return;
  }

  drawMobileParticles(input, profile === 'sparse' || profile === 'texture');
}

function getCueState(sectionTimes: number[], currentTime: number): CueState {
  if (!sectionTimes.length) {
    return { sectionProgress: 0, approach: 0, release: 0, density: 0 };
  }

  let previousCue = 0;
  let nextCue = sectionTimes[0];
  let nextIndex = 0;

  while (nextIndex < sectionTimes.length && sectionTimes[nextIndex] <= currentTime) {
    previousCue = sectionTimes[nextIndex];
    nextIndex += 1;
  }

  const fallbackGap = nextIndex > 1
    ? sectionTimes[nextIndex - 1] - sectionTimes[nextIndex - 2]
    : sectionTimes[0];

  nextCue = nextIndex < sectionTimes.length
    ? sectionTimes[nextIndex]
    : previousCue + Math.max(fallbackGap, 24);

  const interval = Math.max(nextCue - previousCue, 12);
  const leadWindow = Math.min(18, Math.max(6, interval * 0.45));
  const releaseWindow = Math.min(10, Math.max(4, interval * 0.28));
  const timeUntilCue = nextCue - currentTime;
  const timeSinceCue = currentTime - previousCue;

  return {
    sectionProgress: clamp01((currentTime - previousCue) / interval),
    approach: smoothstep01(1 - timeUntilCue / leadWindow),
    release: previousCue > 0 ? smoothstep01(1 - timeSinceCue / releaseWindow) : 0,
    density: clamp01(sectionTimes.length / 8),
  };
}

function applySharedModulation(
  lerpParams: LerpParams,
  baseParams: VisualParams,
  dt: number,
  audioSignal: AudioSignal,
  trackProgress: number,
  playbackTime: number,
  playEnergy: number,
  cueState: CueState,
  curve: EaseFn,
): void {
  decayTargets(lerpParams, baseParams, dt);
  applyAudioSignal(lerpParams, baseParams, audioSignal, trackProgress, playbackTime);

  if (playEnergy > 0.001) {
    const macroBreath = 0.5 + Math.sin(playbackTime * 0.16 + trackProgress * Math.PI * 2) * 0.5;
    lerpParams.glow.target = Math.max(
      lerpParams.glow.target,
      Math.min(1, baseParams.glow + playEnergy * (0.035 + macroBreath * 0.05)),
    );
    lerpParams.drift.target = Math.max(
      lerpParams.drift.target,
      Math.min(1, baseParams.drift + playEnergy * (0.02 + macroBreath * 0.03)),
    );
  }

  const slowPhase = 0.5 + Math.sin(playbackTime * 0.026 + trackProgress * Math.PI * 2.4) * 0.5;
  const sectionPhase = 0.5 + Math.sin(cueState.sectionProgress * Math.PI * 2 + playbackTime * 0.018) * 0.5;
  const progressionPresence = 0.28 + playEnergy * 0.72;
  lerpParams.hueShift.target = clampParam(
    lerpParams.hueShift.target + ((slowPhase - 0.5) * 2.8 + (sectionPhase - 0.5) * 1.2) * progressionPresence,
    -45,
    45,
  );
  lerpParams.shimmer.target = Math.max(
    lerpParams.shimmer.target,
    Math.min(1, baseParams.shimmer + (0.018 + slowPhase * 0.036) * progressionPresence),
  );
  lerpParams.density.target = Math.max(
    lerpParams.density.target,
    Math.min(1, baseParams.density + sectionPhase * 0.026 * progressionPresence),
  );
  lerpParams.drift.target = Math.max(
    lerpParams.drift.target,
    Math.min(1, baseParams.drift + (0.012 + slowPhase * 0.022) * progressionPresence),
  );

  // Ease the section-boundary swell through the role's musical curve so the
  // approach/release feels shaped (anticipation on a build, quick exhale on a
  // release) rather than the raw linear lead-in.
  const easedApproach = curve(cueState.approach);
  const easedRelease = curve(cueState.release);
  const cueBlend = easedApproach * 0.72 + easedRelease * 0.4;
  if (cueBlend <= 0) return;

  lerpParams.glow.target = Math.max(
    lerpParams.glow.target,
    Math.min(1, baseParams.glow + cueBlend * (0.08 + cueState.density * 0.1)),
  );
  lerpParams.turbulence.target = Math.max(
    lerpParams.turbulence.target,
    Math.min(1, baseParams.turbulence + cueBlend * (0.05 + cueState.density * 0.05)),
  );
  lerpParams.density.target = Math.max(
    lerpParams.density.target,
    Math.min(1, baseParams.density + easedRelease * (0.03 + cueState.density * 0.04)),
  );
  lerpParams.drift.target = Math.max(
    lerpParams.drift.target,
    Math.min(1, baseParams.drift + cueState.sectionProgress * cueBlend * 0.08),
  );
  lerpParams.shimmer.target = Math.max(
    lerpParams.shimmer.target,
    Math.min(1, baseParams.shimmer + cueBlend * 0.06 + easedRelease * 0.06),
  );
  lerpParams.impulse.target = Math.max(
    lerpParams.impulse.target,
    Math.min(1, baseParams.impulse + easedRelease * 0.12),
  );

  const cueHueTarget = baseParams.hueShift + (cueState.sectionProgress - 0.5) * (4 + cueState.density * 5);
  lerpParams.hueShift.target += (cueHueTarget - lerpParams.hueShift.target) * (0.03 + cueBlend * 0.04);
}

function fillCanvas(ctx: CanvasRenderingContext2D, palette: Palette, width: number, height: number): void {
  const [br, bg, bb] = palette.bgDark;
  ctx.fillStyle = `rgb(${br},${bg},${bb})`;
  ctx.fillRect(0, 0, width, height);
}

function clampParam(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function eventColor(event: VisualEvent, palette: Palette): [number, number, number] {
  if (event.color) return event.color;
  if (event.palette?.hueShift !== undefined) {
    const shifted = generatePalette(null);
    applyPaletteHueShift(shifted, palette, event.palette.hueShift);
    return shifted.accentGlow;
  }
  return palette.accentGlow;
}

function pushCueWash(stage: Stage, event: VisualEvent, alphaScale = 1): void {
  if (stage.cueWashes.length >= 6) stage.cueWashes.shift();
  stage.cueWashes.push({
    color: eventColor(event, stage.palette),
    age: 0,
    life: Math.max(0.18, (event.durationMs ?? 900) / 1000),
    alpha: Math.min(0.42, (0.12 + event.intensity * 0.26) * alphaScale),
  });
}

function pushCueSweep(stage: Stage, event: VisualEvent, alphaScale = 1): void {
  if (stage.cueSweeps.length >= 4) stage.cueSweeps.shift();
  const seed = event.t * 0.37 + event.intensity * 8.1;
  stage.cueSweeps.push({
    color: eventColor(event, stage.palette),
    age: 0,
    life: Math.max(0.35, (event.durationMs ?? 2400) / 1000),
    alpha: Math.min(0.32, (0.08 + event.intensity * 0.22) * alphaScale),
    angle: -0.42 + Math.sin(seed) * 0.24,
    width: 0.16 + event.intensity * 0.16,
  });
}

function applyGenericCueEvent(stage: Stage, event: VisualEvent): void {
  const i = event.intensity;

  if (event.type === 'bar-cue') {
    stage.lerpParams.glow.target = clampParam(stage.lerpParams.glow.target + i * 0.07, 0, 1);
    stage.lerpParams.shimmer.target = clampParam(stage.lerpParams.shimmer.target + i * 0.11, 0, 1);
    stage.lerpParams.impulse.target = clampParam(stage.lerpParams.impulse.target + i * 0.1, 0, 1);
    return;
  }

  if (event.type === 'section-cue') {
    stage.lerpParams.density.target = clampParam(stage.lerpParams.density.target + i * 0.18, 0, 1);
    stage.lerpParams.glow.target = clampParam(stage.lerpParams.glow.target + i * 0.16, 0, 1);
    stage.lerpParams.drift.target = clampParam(stage.lerpParams.drift.target + i * 0.12, 0, 1);
    stage.lerpParams.shimmer.target = clampParam(stage.lerpParams.shimmer.target + i * 0.1, 0, 1);
    stage.lerpParams.impulse.target = clampParam(stage.lerpParams.impulse.target + i * 0.08, 0, 1);
    pushCueWash(stage, event, 0.32);
    return;
  }

  if (event.type === 'color-morph' || event.type === 'palette-morph') {
    stage.lerpParams.glow.target = clampParam(stage.lerpParams.glow.target + i * 0.08, 0, 1);
    stage.lerpParams.shimmer.target = clampParam(stage.lerpParams.shimmer.target + i * 0.06, 0, 1);
    if ((event.target === 'background' || event.target === 'terrain') && event.palette?.hueShift !== undefined) {
      stage.lerpParams.hueShift.target = clampParam(stage.lerpParams.hueShift.target + event.palette.hueShift * 0.18, -45, 45);
    }
    return;
  }

  if (event.type === 'density-surge') {
    stage.lerpParams.density.target = clampParam(stage.lerpParams.density.target + i * 0.32, 0, 1);
    stage.lerpParams.turbulence.target = clampParam(stage.lerpParams.turbulence.target + i * 0.2, 0, 1);
    stage.lerpParams.drift.target = clampParam(stage.lerpParams.drift.target + i * 0.2, 0, 1);
    stage.lerpParams.glow.target = clampParam(stage.lerpParams.glow.target + i * 0.16, 0, 1);
    stage.lerpParams.impulse.target = clampParam(stage.lerpParams.impulse.target + i * 0.18, 0, 1);
    pushCueWash(stage, event, 0.5);
    return;
  }

  if (event.type === 'glow-pulse' || event.type === 'bloom-flash') {
    stage.lerpParams.glow.target = clampParam(stage.lerpParams.glow.target + i * 0.42, 0, 1);
    stage.lerpParams.shimmer.target = clampParam(stage.lerpParams.shimmer.target + i * 0.22, 0, 1);
    stage.lerpParams.impulse.target = clampParam(stage.lerpParams.impulse.target + i * 0.34, 0, 1);
    pushCueWash(stage, event, event.type === 'bloom-flash' ? 1.25 : 0.8);
    return;
  }

  if (event.type === 'spark-burst') {
    stage.lerpParams.shimmer.target = clampParam(stage.lerpParams.shimmer.target + i * 0.42, 0, 1);
    stage.lerpParams.impulse.target = clampParam(stage.lerpParams.impulse.target + i * 0.52, 0, 1);
    pushCueWash(stage, event, 0.65);
    return;
  }

  if (event.type === 'focus-shift') {
    stage.lerpParams.glow.target = clampParam(stage.lerpParams.glow.target + i * 0.2, 0, 1);
    stage.lerpParams.hueShift.target = clampParam(stage.lerpParams.hueShift.target + (event.palette?.hueShift ?? 4) * 0.2, -45, 45);
    pushCueWash(stage, event, 0.44);
    return;
  }

  if (event.type === 'veil-sweep') {
    stage.lerpParams.shimmer.target = clampParam(stage.lerpParams.shimmer.target + i * 0.2, 0, 1);
    stage.lerpParams.glow.target = clampParam(stage.lerpParams.glow.target + i * 0.14, 0, 1);
    pushCueSweep(stage, event, 1);
    return;
  }

  if (event.type === 'motion-drift') {
    stage.lerpParams.drift.target = clampParam(stage.lerpParams.drift.target + i * 0.34, 0, 1);
    stage.lerpParams.turbulence.target = clampParam(stage.lerpParams.turbulence.target + i * 0.24, 0, 1);
    stage.lerpParams.density.target = clampParam(stage.lerpParams.density.target + i * 0.12, 0, 1);
    if (event.palette?.hueShift !== undefined) {
      stage.lerpParams.hueShift.target = clampParam(stage.lerpParams.hueShift.target + event.palette.hueShift * 0.6, -45, 45);
    }
    pushCueSweep(stage, event, 0.58);
    return;
  }

  if (event.type === 'grain-bloom') {
    stage.lerpParams.shimmer.target = clampParam(stage.lerpParams.shimmer.target + i * 0.28, 0, 1);
    stage.lerpParams.impulse.target = clampParam(stage.lerpParams.impulse.target + i * 0.24, 0, 1);
    stage.lerpParams.glow.target = clampParam(stage.lerpParams.glow.target + i * 0.18, 0, 1);
    pushCueWash(stage, event, 0.72);
    pushCueSweep(stage, event, 0.34);
  }
}

function updateStageCueEffects(stage: Stage, dt: number): void {
  if (stage.cueTint) {
    stage.cueTint.age = Math.min(stage.cueTint.duration, stage.cueTint.age + dt);
  }

  for (let index = stage.cueWashes.length - 1; index >= 0; index -= 1) {
    stage.cueWashes[index].age += dt;
    if (stage.cueWashes[index].age >= stage.cueWashes[index].life) stage.cueWashes.splice(index, 1);
  }

  for (let index = stage.cueSweeps.length - 1; index >= 0; index -= 1) {
    stage.cueSweeps[index].age += dt;
    if (stage.cueSweeps[index].age >= stage.cueSweeps[index].life) stage.cueSweeps.splice(index, 1);
  }
}

function drawStageCueEffects(
  ctx: CanvasRenderingContext2D,
  stage: Stage,
  width: number,
  height: number,
  colorPresence = 1,
  qualityScale = 1,
): void {
  ctx.save();
  if (stage.cueTint) {
    const tint = stage.cueTint;
    const alpha = smoothstep01(tint.age / tint.duration) * tint.alpha * colorPresence;
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(${tint.color[0]},${tint.color[1]},${tint.color[2]},${alpha})`;
    ctx.fillRect(0, 0, width, height);
  }

  if (qualityScale >= 0.7) {
    for (let index = 0; index < stage.cueWashes.length; index += 1) {
      const wash = stage.cueWashes[index];
      const progress = clamp01(wash.age / wash.life);
      const alpha = (1 - progress) * wash.alpha * colorPresence;
      const radius = Math.max(width, height) * (0.22 + progress * 0.5);
      const x = width * (0.28 + index * 0.11);
      const y = height * (0.34 + Math.sin(index * 1.7) * 0.22);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(${wash.color[0]},${wash.color[1]},${wash.color[2]},${alpha})`);
      gradient.addColorStop(0.55, `rgba(${wash.color[0]},${wash.color[1]},${wash.color[2]},${alpha * 0.22})`);
      gradient.addColorStop(1, `rgba(${wash.color[0]},${wash.color[1]},${wash.color[2]},0)`);
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }
  }

  if (qualityScale >= 0.62) {
    for (let index = 0; index < stage.cueSweeps.length; index += 1) {
      const sweep = stage.cueSweeps[index];
      const progress = clamp01(sweep.age / sweep.life);
      const eased = smoothstep01(progress);
      const diagonal = Math.hypot(width, height);
      const bandWidth = diagonal * sweep.width;
      const travel = diagonal * 1.65;
      const center = -travel * 0.5 + travel * eased;

      ctx.save();
      ctx.translate(width * 0.5, height * 0.5);
      ctx.rotate(sweep.angle);
      const gradient = ctx.createLinearGradient(center - bandWidth, 0, center + bandWidth, 0);
      const alpha = Math.sin(progress * Math.PI) * sweep.alpha * colorPresence;
      gradient.addColorStop(0, `rgba(${sweep.color[0]},${sweep.color[1]},${sweep.color[2]},0)`);
      gradient.addColorStop(0.5, `rgba(${sweep.color[0]},${sweep.color[1]},${sweep.color[2]},${alpha})`);
      gradient.addColorStop(1, `rgba(${sweep.color[0]},${sweep.color[1]},${sweep.color[2]},0)`);
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = gradient;
      ctx.fillRect(-diagonal, -diagonal, diagonal * 2, diagonal * 2);
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawManagedStageImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLCanvasElement,
  width: number,
  height: number,
  alpha: number,
  colorPresence: number,
  time: number,
  seed: number,
  compositeOperation: GlobalCompositeOperation = 'source-over',
  offsetX = 0,
  offsetY = 0,
  scale = 1,
): void {
  if (alpha <= 0.001) return;

  const presence = clamp01(colorPresence);
  const reveal = smoothstep01(presence);

  ctx.save();
  ctx.globalAlpha = alpha;
  if (offsetX !== 0 || offsetY !== 0 || scale !== 1) {
    ctx.translate(width * 0.5 + offsetX, height * 0.5 + offsetY);
    ctx.scale(scale, scale);
    ctx.translate(-width * 0.5, -height * 0.5);
  }

  if (presence >= 0.995) {
    ctx.filter = 'none';
    ctx.globalCompositeOperation = compositeOperation;
    ctx.drawImage(image, 0, 0, width, height);
    ctx.restore();
    return;
  }

  ctx.globalCompositeOperation = compositeOperation;
  ctx.filter = `grayscale(${Math.round((1 - presence) * 100)}%) saturate(${Math.round(presence * 100)}%)`;
  ctx.drawImage(image, 0, 0, width, height);
  ctx.filter = 'none';

  ctx.restore();
}

function getStepBaseParams(recipe: ExplorerRecipe, step?: SectionVisualStep): VisualParams {
  const params = { ...recipe.baseParams, ...step?.params };

  return {
    turbulence: clampParam(params.turbulence, 0, 1),
    density: clampParam(params.density, 0, 1),
    glow: clampParam(params.glow, 0, 1),
    drift: clampParam(params.drift, 0, 1),
    hueShift: clampParam(params.hueShift, -45, 45),
    shimmer: clampParam(params.shimmer, 0, 1),
    impulse: clampParam(params.impulse, 0, 1),
    strokeMode: clampParam(params.strokeMode ?? 1, 0, 1),
  };
}

function getOverlayScale(sceneProfile: ExplorerSceneProfile): OverlayScale {
  switch (sceneProfile) {
    case 'tide':
      return { ambient: 0.22, glow: 0.16, wash: 0.18, sweep: 0.12, ripple: 0.24, grain: 0.95, material: 1.25 };
    case 'texture':
      return { ambient: 0.12, glow: 0.1, wash: 0.1, sweep: 0.2, ripple: 0.1, grain: 1.6, material: 1.55 };
    case 'grid':
      return { ambient: 0.16, glow: 0.14, wash: 0.12, sweep: 0.42, ripple: 0.12, grain: 1.1, material: 0.8 };
    case 'geology':
      return { ambient: 0.12, glow: 0.12, wash: 0.08, sweep: 0.12, ripple: 0.08, grain: 1.65, material: 1.4 };
    case 'line':
      return { ambient: 0.18, glow: 0.18, wash: 0.14, sweep: 0.34, ripple: 0.22, grain: 0.9, material: 0.95 };
    case 'sparse':
      return { ambient: 0.2, glow: 0.22, wash: 0.14, sweep: 0.16, ripple: 0.18, grain: 0.75, material: 0.7 };
    case 'rain':
      return { ambient: 0.1, glow: 0.12, wash: 0.1, sweep: 0.58, ripple: 0.18, grain: 1.25, material: 0.9 };
    case 'planet':
    case 'storm':
    case 'galaxy':
      return { ambient: 0.36, glow: 0.44, wash: 0.38, sweep: 0.42, ripple: 0.58, grain: 0.82, material: 0.38 };
    default:
      return { ambient: 0.34, glow: 0.34, wash: 0.28, sweep: 0.28, ripple: 0.36, grain: 1, material: 0.52 };
  }
}

function createMaterialBuffer(width: number, height: number, palette: Palette, sceneProfile: ExplorerSceneProfile, materialOverlayAlpha = 1): HTMLCanvasElement {
  const buffer = document.createElement('canvas');
  buffer.width = width;
  buffer.height = height;
  const ctx = buffer.getContext('2d');
  if (!ctx) return buffer;

  const [dr, dg, db] = palette.dotColor;
  const [ar, ag, ab] = palette.accentGlow;
  const [wr, wg, wb] = palette.accentWarm;
  const scale = getOverlayScale(sceneProfile).material * materialOverlayAlpha;
  const fiberCount = Math.round((900 + width * height / 900) * scale);
  const longBias = sceneProfile === 'tide' || sceneProfile === 'flow' || sceneProfile === 'contour';
  const verticalBias = sceneProfile === 'rain' || sceneProfile === 'storm';
  const blockBias = sceneProfile === 'grid' || sceneProfile === 'texture';

  ctx.clearRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';

  for (let i = 0; i < fiberCount; i += 1) {
    const x1 = Math.random() * width;
    const y1 = Math.random() * height;
    const depth = y1 / Math.max(height, 1);
    const angle = verticalBias
      ? Math.PI * 0.5 + (Math.random() - 0.5) * 0.7
      : longBias
        ? (Math.random() - 0.5) * 0.34
        : Math.random() * Math.PI * 2;
    const segmentLength = longBias
      ? 10 + Math.random() * (34 + depth * 80)
      : blockBias
        ? 2 + Math.random() * 16
        : 2 + Math.random() * 9;
    const x2 = x1 + Math.cos(angle) * segmentLength;
    const y2 = y1 + Math.sin(angle) * segmentLength;
    const warm = Math.random() > 0.62;
    const r = Math.round(warm ? (dr * 0.55 + wr * 0.45) : (dr * 0.7 + ar * 0.3));
    const g = Math.round(warm ? (dg * 0.55 + wg * 0.45) : (dg * 0.7 + ag * 0.3));
    const b = Math.round(warm ? (db * 0.55 + wb * 0.45) : (db * 0.7 + ab * 0.3));
    const alpha = (0.008 + Math.random() * 0.026) * scale * (longBias ? 1 + depth * 0.75 : 1);

    ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.lineWidth = Math.random() > 0.82 ? 1.25 : 0.65;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  if (blockBias && materialOverlayAlpha > 0.35) {
    for (let i = 0; i < 120 * scale; i += 1) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const size = 8 + Math.random() * 42;
      ctx.fillStyle = `rgba(${ar},${ag},${ab},${0.004 + Math.random() * 0.012})`;
      ctx.fillRect(x, y, size, 1 + Math.random() * 3);
    }
  }

  return buffer;
}

interface Props {
  albumName: string;
  trackTitle: string;
  isPlaying: boolean;
  trackProgress: number;
  baseColor: string | null;
  artworkUrl?: string;
  sectionTimes: number[];
  songSectionTimes?: number[];
  sectionTimesSource?: string | null;
  beatGrid: BeatGrid;
  trackDuration?: number;
  currentTime: number;
  panelCollapsed?: boolean;
  visualConfig?: TrackVisualConfig;
  audioSignalRef: { current: AudioSignal };
  initialSelectionReady?: boolean;
  reviewMotion?: boolean;
  showSketchLabel?: boolean;
  colorOnlyWhilePlaying?: boolean;
  hasPlaybackStarted?: boolean;
  rotationSeed?: string;
}

export default function ExplorerCanvas({
  albumName,
  trackTitle,
  isPlaying,
  trackProgress,
  baseColor,
  artworkUrl,
  sectionTimes,
  songSectionTimes,
  sectionTimesSource,
  beatGrid,
  trackDuration,
  currentTime,
  panelCollapsed = false,
  visualConfig,
  audioSignalRef,
  initialSelectionReady = true,
  reviewMotion = false,
  showSketchLabel = false,
  colorOnlyWhilePlaying = false,
  hasPlaybackStarted = false,
  rotationSeed,
}: Props) {
  const playbackMode = getProductionPlaybackMode();
  const useTimedMobileSignal = playbackMode === 'ios-listening';
  const containerRef = useRef<HTMLDivElement>(null);
  const mobileCanvasRef = useRef<HTMLCanvasElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [visualRuntimeReady, setVisualRuntimeReady] = useState(false);
  const [startupOverlayVisible, setStartupOverlayVisible] = useState(true);
  const [startupOverlayMounted, setStartupOverlayMounted] = useState(true);
  const staticPalette = clonePalette(generatePalette(baseColor));

  const albumNameRef = useRef(albumName);
  const trackTitleRef = useRef(trackTitle);
  const playingRef = useRef(isPlaying);
  const progressRef = useRef(trackProgress);
  const baseColorRef = useRef(baseColor);
  const artworkUrlRef = useRef(artworkUrl);
  const sectionTimesRef = useRef(sectionTimes);
  const beatGridRef = useRef(beatGrid);
  const trackDurationRef = useRef(trackDuration);
  const currentTimeRef = useRef(currentTime);
  const panelCollapsedRef = useRef(panelCollapsed);
  const visualConfigRef = useRef(visualConfig);
  const colorOnlyWhilePlayingRef = useRef(colorOnlyWhilePlaying);
  const hasPlaybackStartedRef = useRef(hasPlaybackStarted);
  const rotationSeedRef = useRef(rotationSeed);

  useEffect(() => { albumNameRef.current = albumName; }, [albumName]);
  useEffect(() => { trackTitleRef.current = trackTitle; }, [trackTitle]);
  useEffect(() => { playingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { progressRef.current = trackProgress; }, [trackProgress]);
  useEffect(() => { baseColorRef.current = baseColor; }, [baseColor]);
  useEffect(() => { artworkUrlRef.current = artworkUrl; }, [artworkUrl]);
  useEffect(() => { if (artworkUrl) preloadArtworkImage(artworkUrl); }, [artworkUrl]);
  useEffect(() => { sectionTimesRef.current = sectionTimes; }, [sectionTimes]);
  useEffect(() => { beatGridRef.current = beatGrid; }, [beatGrid]);
  useEffect(() => { trackDurationRef.current = trackDuration; }, [trackDuration]);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { panelCollapsedRef.current = panelCollapsed; }, [panelCollapsed]);
  useEffect(() => { visualConfigRef.current = visualConfig; }, [visualConfig]);
  useEffect(() => { colorOnlyWhilePlayingRef.current = colorOnlyWhilePlaying; }, [colorOnlyWhilePlaying]);
  useEffect(() => { hasPlaybackStartedRef.current = hasPlaybackStarted; }, [hasPlaybackStarted]);
  useEffect(() => { rotationSeedRef.current = rotationSeed; }, [rotationSeed]);

  useEffect(() => {
    const syncViewport = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };

    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  const stage = getExplorerStageMetrics(viewportSize.width, viewportSize.height, { collapsed: panelCollapsed });
  const supportsRichVisualRuntime = viewportSize.width >= EXPLORER_TABLET_BREAKPOINT;
  const shouldPrepareRuntime = initialSelectionReady && supportsRichVisualRuntime && stage.width > 0 && stage.height > 0;
  const { ready: q5Ready, failed } = useQ5({ enabled: visualRuntimeReady });

  const publishVisualSmokeTelemetry = (stage: Stage, frameCount: number) => {
    const telemetry = getRenderQualityTelemetry();
    (window as WindowWithProductionsVisualSmoke).__PRODUCTIONS_RENDER_QUALITY__ = {
      recipeId: stage.recipe.id,
      kernel: stage.recipe.kernel,
      sceneProfile: stage.recipe.sceneProfile,
      frameCount,
      ...telemetry,
    };
  };

  useEffect(() => {
    if (!shouldPrepareRuntime) {
      setVisualRuntimeReady(false);
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;

    const start = () => {
      if (!cancelled) setVisualRuntimeReady(true);
    };

    if ('requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(start, { timeout: 600 });
    } else {
      timeoutId = setTimeout(start, 180);
    }

    return () => {
      cancelled = true;
      if (idleId != null && 'cancelIdleCallback' in window) window.cancelIdleCallback(idleId);
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, [shouldPrepareRuntime]);

  useEffect(() => {
    if (!q5Ready) return;
    const raf = requestAnimationFrame(() => setStartupOverlayVisible(false));
    const unmount = setTimeout(() => setStartupOverlayMounted(false), 3000);
    return () => { cancelAnimationFrame(raf); clearTimeout(unmount); };
  }, [q5Ready]);

  useEffect(() => {
    if (supportsRichVisualRuntime) return;

    const canvas = mobileCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const particles = Array.from({ length: reduced ? 26 : 52 }, (_, index) => {
      const seed = hashString(`${albumNameRef.current}::${trackTitleRef.current}::mobile::${index}`);
      return {
        x: ((seed % 997) / 997),
        y: (((seed >>> 3) % 991) / 991),
        r: 1.4 + ((seed >>> 8) % 100) / 100 * 3.8,
        speed: 0.08 + ((seed >>> 13) % 100) / 100 * 0.24,
        warm: (seed & 1) === 1,
      };
    });

    let frameId: number | null = null;
    let lastDraw = 0;
    let dpr = 1;
    let width = 0;
    let height = 0;
    let sectionFlash = 0;
    let barPulse = 0;
    let previousTimeValue = 0;
    let previousSectionIndex = -1;
    let previousRecipeId = '';
    let sectionHueShift = 0;
    let sectionHueTarget = 0;
    let pageVisible = document.visibilityState !== 'hidden';
    let mobilePlanAlbumName = '';
    let mobilePlanTrackTitle = '';
    let mobilePlanBaseColor: string | null = null;
    let mobilePlanSectionTimes: number[] | null = null;
    let mobilePlanVisualConfig: TrackVisualConfig | undefined;
    let mobilePlanBeatGrid: BeatGrid | null = null;
    let mobilePlanDuration: number | undefined;
    let mobilePlanArtworkUrl: string | undefined;
    let mobilePlan: TrackVisualPlan = buildTrackVisualPlan('', '', [], undefined, null, rotationSeedRef.current, undefined, beatGridRef.current, undefined);

    const getMobilePlan = () => {
      const nextSectionTimes = sectionTimesRef.current;
      const needsPlan = mobilePlanAlbumName !== albumNameRef.current
        || mobilePlanTrackTitle !== trackTitleRef.current
        || mobilePlanBaseColor !== baseColorRef.current
        || mobilePlanSectionTimes !== nextSectionTimes
        || mobilePlanVisualConfig !== visualConfigRef.current
        || mobilePlanBeatGrid !== beatGridRef.current
        || mobilePlanDuration !== trackDurationRef.current
        || mobilePlanArtworkUrl !== artworkUrlRef.current;

      if (needsPlan) {
        mobilePlanAlbumName = albumNameRef.current;
        mobilePlanTrackTitle = trackTitleRef.current;
        mobilePlanBaseColor = baseColorRef.current;
        mobilePlanSectionTimes = nextSectionTimes;
        mobilePlanVisualConfig = visualConfigRef.current;
        mobilePlanBeatGrid = beatGridRef.current;
        mobilePlanDuration = trackDurationRef.current;
        mobilePlanArtworkUrl = artworkUrlRef.current;
        mobilePlan = buildTrackVisualPlan(
          mobilePlanAlbumName,
          mobilePlanTrackTitle,
          nextSectionTimes,
          mobilePlanVisualConfig,
          mobilePlanBaseColor,
          rotationSeedRef.current,
          mobilePlanDuration,
          mobilePlanBeatGrid,
          mobilePlanArtworkUrl,
        );
      }

      return mobilePlan;
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, reduced ? 1.15 : 1.6);
      width = Math.max(1, window.innerWidth);
      height = Math.max(1, window.innerHeight);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (now: number) => {
      frameId = null;
      if (!pageVisible) return;
      frameId = window.requestAnimationFrame(draw);
      const activeMotion = playingRef.current || sectionFlash > 0.02 || barPulse > 0.02;
      const minFrameMs = reduced
        ? 1000 / 12
        : activeMotion
          ? 1000 / 36
          : 1000 / 12;
      if (now - lastDraw < minFrameMs) return;
      const dt = lastDraw > 0 ? Math.min((now - lastDraw) / 1000, 0.08) : 1 / 30;
      lastDraw = now;

      const progress = clamp01(progressRef.current);
      const currentTimeValue = currentTimeRef.current;
      const audioSignal = useTimedMobileSignal
        ? createTimedMobileSignal(currentTimeValue, beatGridRef.current, playingRef.current)
        : playingRef.current ? audioSignalRef.current : EMPTY_AUDIO_SIGNAL;
      const plan = getMobilePlan();
      const sectionTimesValue = sectionTimesRef.current;
      const sectionIndex = getSectionIndex(sectionTimesValue, currentTimeValue);
      const step = plan.steps[Math.max(0, Math.min(sectionIndex, plan.steps.length - 1))];
      const recipe = getSectionRecipe(plan, sectionIndex);
      const normalForwardPlayback = playingRef.current && currentTimeValue >= previousTimeValue && currentTimeValue - previousTimeValue <= 3.5;
      if (normalForwardPlayback && plan.events.some((event) => event.type === 'bar-cue' && event.t > previousTimeValue && event.t <= currentTimeValue)) {
        barPulse = 1;
      }
      previousTimeValue = currentTimeValue;
      if (previousSectionIndex >= 0 && sectionIndex !== previousSectionIndex) {
        sectionFlash = 1;
        // Deterministic hue target per section: spread across ±60° with good variety
        sectionHueTarget = ((sectionIndex * 29) % 120) - 60;
      }
      if (previousRecipeId && recipe.id !== previousRecipeId) {
        sectionFlash = 1;
      }
      previousSectionIndex = sectionIndex;
      previousRecipeId = recipe.id;
      sectionFlash = Math.max(0, sectionFlash - dt * (reduced ? 1.4 : 2.4));
      // Lerp toward section hue target (~1.7s half-life); snap when reduced-motion.
      sectionHueShift = reduced
        ? sectionHueTarget
        : sectionHueShift + (sectionHueTarget - sectionHueShift) * Math.min(1, dt * 0.4);
      barPulse = Math.max(0, barPulse - dt * (reduced ? 3.2 : 5.4));

      const playingLevel = playingRef.current ? 1 : 0;
      const energy = clamp01((audioSignal.energy || 0) * 0.9 + (audioSignal.activity || 0) * 0.22 + playingLevel * 0.08);
      const bass = clamp01(audioSignal.bass || 0);
      const mids = clamp01(audioSignal.mids || 0);
      const highs = clamp01(audioSignal.highs || 0);
      const transient = clamp01(audioSignal.transient || 0);
      const t = now * 0.001;
      const motionScale = reduced ? 0.18 : 1;
      const basePalette = clonePalette(generatePalette(baseColorRef.current));
      const palette = clonePalette(basePalette);
      applyPaletteTransform(palette, basePalette, {
        ...(step?.palette ?? {}),
        hueShift: (step?.palette?.hueShift ?? 0) + (step?.params?.hueShift ?? recipe.baseParams.hueShift ?? 0) * 0.45 + sectionHueShift,
      });
      const [bgR, bgG, bgB] = palette.bgDark;
      const [midR, midG, midB] = palette.bgMid;
      const [accentR, accentG, accentB] = palette.accentGlow;
      const [warmR, warmG, warmB] = palette.accentWarm;
      const [bottomR, bottomG, bottomB] = getThemeBottomColor();
      const colorPresence = colorOnlyWhilePlayingRef.current && hasPlaybackStartedRef.current ? (playingRef.current ? 1 : 0) : 1;

      ctx.globalCompositeOperation = 'source-over';
      const background = ctx.createLinearGradient(0, 0, 0, height);
      background.addColorStop(0, `rgb(${bgR},${bgG},${bgB})`);
      background.addColorStop(0.52, `rgb(${midR},${midG},${midB})`);
      background.addColorStop(1, `rgb(${bottomR},${bottomG},${bottomB})`);
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);

      const driftX = width * (0.24 + progress * 0.48 + Math.sin(t * 0.18) * 0.08 * motionScale);
      const driftY = height * (0.22 + Math.sin(t * 0.13 + progress * Math.PI) * 0.1 * motionScale);
      const glowRadius = Math.max(width, height) * (0.42 + bass * 0.18 + sectionFlash * 0.08 + barPulse * 0.035);
      const primaryGlow = ctx.createRadialGradient(driftX, driftY, 0, driftX, driftY, glowRadius);
      primaryGlow.addColorStop(0, `rgba(${accentR},${accentG},${accentB},${0.18 + energy * 0.28 + sectionFlash * 0.18 + barPulse * 0.09})`);
      primaryGlow.addColorStop(0.45, `rgba(${accentR},${accentG},${accentB},${0.055 + mids * 0.08})`);
      primaryGlow.addColorStop(1, `rgba(${accentR},${accentG},${accentB},0)`);
      ctx.fillStyle = primaryGlow;
      ctx.fillRect(0, 0, width, height);

      const lowerX = width * (0.72 + Math.sin(t * 0.1 + progress * 4.2) * 0.1 * motionScale);
      const lowerY = height * (0.76 - bass * 0.08);
      const lowerGlow = ctx.createRadialGradient(lowerX, lowerY, 0, lowerX, lowerY, Math.max(width, height) * 0.48);
      lowerGlow.addColorStop(0, `rgba(${warmR},${warmG},${warmB},${0.12 + bass * 0.22 + transient * 0.14 + barPulse * 0.06})`);
      lowerGlow.addColorStop(0.55, `rgba(${warmR},${warmG},${warmB},${0.035 + energy * 0.06})`);
      lowerGlow.addColorStop(1, `rgba(${warmR},${warmG},${warmB},0)`);
      ctx.fillStyle = lowerGlow;
      ctx.fillRect(0, 0, width, height);

      drawMobileRecipeLayer({
        ctx,
        width,
        height,
        palette,
        recipe,
        particles,
        time: t,
        progress,
        sectionIndex,
        sectionFlash,
        energy,
        bass,
        mids,
        highs,
        transient,
        motionScale,
        colorPresence,
      });

      const sweepX = width * ((progress + t * 0.012 * motionScale) % 1);
      const sweep = ctx.createLinearGradient(sweepX - width * 0.22, 0, sweepX + width * 0.22, 0);
      sweep.addColorStop(0, `rgba(${accentR},${accentG},${accentB},0)`);
      sweep.addColorStop(0.5, `rgba(${accentR},${accentG},${accentB},${(0.018 + energy * 0.05 + sectionFlash * 0.08 + barPulse * 0.05) * colorPresence})`);
      sweep.addColorStop(1, `rgba(${accentR},${accentG},${accentB},0)`);
      ctx.fillStyle = sweep;
      ctx.fillRect(sweepX - width * 0.22, 0, width * 0.44, height);

      const vignette = ctx.createRadialGradient(width * 0.5, height * 0.48, Math.min(width, height) * 0.18, width * 0.5, height * 0.5, Math.max(width, height) * 0.74);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(0.72, `rgba(${bottomR},${bottomG},${bottomB},0.12)`);
      vignette.addColorStop(1, `rgba(${bottomR},${bottomG},${bottomB},0.38)`);
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
    };

    resize();
    frameId = window.requestAnimationFrame(draw);
    const syncVisibility = () => {
      pageVisible = document.visibilityState !== 'hidden';
      if (pageVisible) {
        lastDraw = 0;
        if (frameId == null) frameId = window.requestAnimationFrame(draw);
        return;
      }
      if (frameId != null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }
    };
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', syncVisibility);

    return () => {
      if (frameId != null) window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', syncVisibility);
    };
  }, [audioSignalRef, baseColor, supportsRichVisualRuntime, trackTitle, albumName, useTimedMobileSignal]);

  useEffect(() => {
    if (!visualRuntimeReady || !q5Ready || !containerRef.current || !supportsRichVisualRuntime || stage.width <= 0 || stage.height <= 0) return;

    const container = containerRef.current;
    const Q5 = (window as any).Q5;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let removed = false;
    let lastFrameTime = performance.now();
    let currentAlbumName = '';
    let currentTrackTitle = '';
    let currentBaseColor: string | null = null;
    let currentArtworkUrl: string | undefined;
    let currentVisualConfig: TrackVisualConfig | undefined;
    let currentBeatGrid = beatGridRef.current;
    let currentTrackDuration = trackDurationRef.current;
    let palette: Palette;
    let activePlan: TrackVisualPlan = buildTrackVisualPlan('', '', [], undefined, null, rotationSeedRef.current, undefined, currentBeatGrid);

    // Cached grain canvases — 6 pre-rendered frames rotated every 3 draw calls.
    // Replaces ~1500 fillRect() calls/frame with a single drawImage().
    const GRAIN_FRAME_COUNT = 6;
    const GRAIN_FRAME_HOLD = 3;
    let grainCanvases: HTMLCanvasElement[] = [];
    let grainFrameIndex = 0;
    let grainFrameCounter = 0;
    // Vignette gradient cache: geometry, fade color, and profile strength
    // change only on resize/palette/recipe swaps.
    let vignetteGradient: CanvasGradient | null = null;
    let vignetteColorKey = -1;
    let vignetteStrengthKey = -1;
    let vignetteSizeKey = -1;

    // Pointer response is deliberately compositor-level: every Canvas2D and
    // Three sketch receives the same restrained sense of depth without adding
    // input branches to individual kernels. Mouse/pen only; touch and reduced
    // motion retain the authored scene unchanged.
    let pointerTargetX = 0.5;
    let pointerTargetY = 0.5;
    let pointerX = 0.5;
    let pointerY = 0.5;
    let pointerPresenceTarget = 0;
    let pointerPresence = 0;
    let pointerVelocityTarget = 0;
    let pointerVelocity = 0;
    let pointerDeltaTargetX = 0;
    let pointerDeltaTargetY = 0;
    let pointerDeltaX = 0;
    let pointerDeltaY = 0;
    let pointerLastX = 0;
    let pointerLastY = 0;
    let pointerLastAt = 0;

    // Viewer agency: a tap on the background (not on UI) lets the world respond with a
    // gentle bloom. It reuses the authored visual-event system rather than adding input
    // branches to kernels, and stays restrained — throttled, drained in the draw loop,
    // mouse/pen only, disabled under reduced motion.
    let pendingTapSurges = 0;
    let lastTapAt = 0;

    const onPointerTap = (event: PointerEvent) => {
      if (reduced) return;
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      const target = event.target as Node | null;
      if (!target || !(target === container || container.contains(target))) return;
      const now = performance.now();
      if (now - lastTapAt < 360) return;
      lastTapAt = now;
      pendingTapSurges = Math.min(pendingTapSurges + 1, 2);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (reduced || (event.pointerType !== 'mouse' && event.pointerType !== 'pen')) return;
      const bounds = container.getBoundingClientRect();
      const inside = event.clientX >= bounds.left && event.clientX <= bounds.right
        && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
      pointerPresenceTarget = inside ? 1 : 0;
      if (!inside) return;

      pointerTargetX = clamp01((event.clientX - bounds.left) / Math.max(1, bounds.width));
      pointerTargetY = clamp01((event.clientY - bounds.top) / Math.max(1, bounds.height));
      const eventTime = performance.now();
      if (pointerLastAt > 0) {
        const elapsed = Math.max(8, eventTime - pointerLastAt);
        const moveX = event.clientX - pointerLastX;
        const moveY = event.clientY - pointerLastY;
        const distance = Math.hypot(moveX, moveY);
        pointerVelocityTarget = clamp01((distance / elapsed) * 0.5);
        pointerDeltaTargetX = Math.max(-1, Math.min(1, moveX / Math.max(24, bounds.width * 0.035)));
        pointerDeltaTargetY = Math.max(-1, Math.min(1, moveY / Math.max(24, bounds.height * 0.035)));
      }
      pointerLastX = event.clientX;
      pointerLastY = event.clientY;
      pointerLastAt = eventTime;
    };

    const releasePointer = () => {
      pointerPresenceTarget = 0;
      pointerVelocityTarget = 0;
      pointerDeltaTargetX = 0;
      pointerDeltaTargetY = 0;
      pointerLastAt = 0;
    };

    const pointerSignal: PointerSignal = {
      x: 0.5,
      y: 0.5,
      presence: 0,
      velocity: 0,
      deltaX: 0,
      deltaY: 0,
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerTap, { passive: true });
    window.addEventListener('blur', releasePointer);
    document.addEventListener('mouseleave', releasePointer);

    function buildGrainCanvases(cw: number, ch: number): void {
      // Render at half resolution — grain texture scales fine and halves memory.
      const gw = Math.max(64, Math.round(cw * 0.5));
      const gh = Math.max(40, Math.round(ch * 0.5));
      grainCanvases = Array.from({ length: GRAIN_FRAME_COUNT }, () => {
        const canvas = document.createElement('canvas');
        canvas.width = gw;
        canvas.height = gh;
        const gctx = canvas.getContext('2d');
        if (!gctx) return canvas;
        gctx.clearRect(0, 0, gw, gh);
        // White dots at full opacity — globalAlpha on drawImage controls intensity.
        gctx.fillStyle = 'rgba(255,255,255,1)';
        for (let i = 0; i < GRAIN_COUNT; i += 1) {
          gctx.fillRect(Math.random() * gw, Math.random() * gh, 1, 1);
        }
        return canvas;
      });
      grainFrameIndex = 0;
      grainFrameCounter = 0;
    }
    let currentSectionIndex = 0;
    let activeStage: Stage | null = null;
    let outgoingStage: Stage | null = null;
    let transitionProgress = 1;
    let transitionDuration = SKETCH_MERGE_TRANSITION_SECONDS;
    let pendingRuntimeRebuild = false;
    let pendingRuntimeRebuildApplied = false;
    let runtimeRebuildProgress = 1;
    let lastCueCount = 0;
    let prevSectionTimes: number[] = [];
    let playEnergy = 0;
    let colorPresence = colorOnlyWhilePlayingRef.current && hasPlaybackStartedRef.current && !playingRef.current ? 0 : 1;
    let lastEventTime = 0;
    let prevBeatPhase = 0;
    let beatPulseValue = 0;
    let lastOnsetBridgeAt = -Infinity;
    let dispatchedPlanEventIds = new Set<string>();
    const brokenRecipeIds = new Set<string>();
    const reportedStageErrors = new Set<string>();
    let renderedFrameCount = 0;

    function destroyStage(stage: Stage | null): void {
      if (!stage) return;
      try {
        stage.viz.destroy();
      } catch (error) {
        reportStageError(stage.recipe.id, 'destroy', error);
      }
    }

    function reportStageError(recipeId: string, phase: string, error: unknown): void {
      const key = `${recipeId}:${phase}`;
      if (reportedStageErrors.has(key)) return;
      reportedStageErrors.add(key);
      console.error(`[ExplorerCanvas] visualizer ${phase} failed for recipe "${recipeId}"`, error);
    }

    function getPlanStep(sectionIndex: number): SectionVisualStep | undefined {
      return activePlan.steps[Math.max(0, Math.min(sectionIndex, activePlan.steps.length - 1))];
    }

    function createSectionCueEvent(sectionIndex: number, sectionTimes: readonly number[]): VisualEvent | null {
      if (sectionIndex <= 0) return null;
      const cueIndex = sectionIndex - 1;
      const cueTime = sectionTimes[cueIndex];
      if (cueTime === undefined || !isFinite(cueTime)) return null;
      const intensity = 0.4 + (cueIndex / Math.max(sectionTimes.length, 1)) * 0.4;

      return {
        t: cueTime,
        intensity,
        type: 'section-cue',
        sectionIndex,
        sectionCount: sectionTimes.length + 1,
      };
    }

    function estimateTrackEndFromSections(sectionTimes: readonly number[]): number {
      if (!sectionTimes.length) return 1;
      const lastCue = sectionTimes[sectionTimes.length - 1] ?? 0;
      const previousCue = sectionTimes.length > 1 ? sectionTimes[sectionTimes.length - 2] ?? 0 : 0;
      const finalSpan = Math.max(12, lastCue - previousCue);
      return Math.max(1, lastCue + finalSpan);
    }

    function boostEventForPlaybackTime(event: VisualEvent, currentTime: number, sectionTimes: readonly number[]): VisualEvent {
      const progress = clamp01(currentTime / estimateTrackEndFromSections(sectionTimes));
      const lateLift = progress > 0.75 ? (progress - 0.75) * 0.24 : 0;
      const intensity = clampParam(event.intensity * (0.86 + progress * 0.28 + lateLift), 0, 1);
      return intensity === event.intensity ? event : { ...event, intensity };
    }

    function shortenReplayEvent(event: VisualEvent): VisualEvent {
      if (event.type === 'color-morph' || event.type === 'palette-morph') {
        return { ...event, durationMs: Math.min(event.durationMs ?? 5200, 4200) };
      }

      return {
        ...event,
        intensity: clampParam(event.intensity * 0.82, 0, 1),
        durationMs: Math.min(event.durationMs ?? 1200, event.type === 'section-cue' ? 900 : 1100),
      };
    }

    function dispatchSectionCueRange(q: any, width: number, height: number, fromSectionIndex: number, toSectionIndex: number, currentTime: number): void {
      const sectionTimes = sectionTimesRef.current;
      for (let sectionIndex = Math.max(1, fromSectionIndex); sectionIndex <= toSectionIndex; sectionIndex += 1) {
        const event = createSectionCueEvent(sectionIndex, sectionTimes);
        if (!event) continue;
        const replayEvent = sectionIndex === toSectionIndex ? event : shortenReplayEvent(event);
        const boostedEvent = boostEventForPlaybackTime(replayEvent, currentTime, sectionTimes);
        activeStage = dispatchEventToStage(activeStage, q, width, height, boostedEvent);
        outgoingStage = dispatchEventToStage(outgoingStage, q, width, height, boostedEvent);

        // Set deterministic section ambient palette targets, lerped in renderStage independently
        // of lerpParams.hueShift so applySharedModulation cannot overwrite it.
        const sectionHueShift = ((sectionIndex * 29) % 120) - 60;
        const sectionSat      = 1 + (((sectionIndex * 17) % 30) - 15) / 100;
        const sectionBri      = 1 + (((sectionIndex *  7) % 20) - 10) / 100;
        for (const s of [activeStage, outgoingStage]) {
          if (!s) continue;
          s.sectionHueTarget = clampParam(sectionHueShift, -60, 60);
          s.sectionSatTarget = sectionSat;
          s.sectionBriTarget = sectionBri;
        }
      }
      lastCueCount = Math.max(lastCueCount, toSectionIndex);
    }

    function applyStepToStage(stage: Stage, step?: SectionVisualStep, refreshMaterial = true): void {
      const previousBaseParams = stage.baseParams;
      stage.baseParams = getStepBaseParams(stage.recipe, step);
      applyPaletteTransform(stage.basePalette, palette, step?.palette);
      if (refreshMaterial) {
        stage.materialBuffer = createMaterialBuffer(stage.buffer.width, stage.buffer.height, stage.basePalette, stage.recipe.sceneProfile, stage.recipe.materialOverlayAlpha ?? 1);
      }

      for (const key of ['turbulence', 'density', 'glow', 'drift', 'hueShift', 'shimmer', 'impulse'] as const) {
        const nextTarget = stage.baseParams[key];
        stage.lerpParams[key].target = refreshMaterial
          ? nextTarget
          : previousBaseParams[key] + (nextTarget - previousBaseParams[key]) * 0.72;
      }
    }

    function instantiateStage(q: any, width: number, height: number, recipe: ExplorerRecipe, step?: SectionVisualStep): Stage {
      const buffer = document.createElement('canvas');
      buffer.width = width;
      buffer.height = height;
      const ctx = buffer.getContext('2d');
      if (!ctx) throw new Error('Failed to create stage buffer');

      const basePalette = clonePalette(palette);
      applyPaletteTransform(basePalette, palette, step?.palette);
      const stagePalette = clonePalette(basePalette);
      const baseParams = getStepBaseParams(recipe, step);
      applyPaletteHueShift(stagePalette, basePalette, baseParams.hueShift);
      fillCanvas(ctx, stagePalette, width, height);
      const materialBuffer = createMaterialBuffer(width, height, stagePalette, recipe.sceneProfile, recipe.materialOverlayAlpha ?? 1);

      const viz = createVisualizer(recipe.kernel);
      viz.setup(q, width, height, stagePalette, getVisualizerTuning(recipe.tuningKey), {
        albumName: albumNameRef.current,
        trackTitle: trackTitleRef.current,
        artworkUrl: artworkUrlRef.current,
        assetSeed: `${albumNameRef.current}::${trackTitleRef.current}`,
        beatGrid: beatGridRef.current,
      });

      return {
        recipe,
        baseParams,
        viz,
        lerpParams: createLerpParams(baseParams),
        buffer,
        materialBuffer,
        ctx,
        basePalette,
        palette: stagePalette,
        cueWashes: [],
        cueSweeps: [],
        cueTint: null,
        sectionHueOffset: 0,
        sectionHueTarget: 0,
        sectionSatOffset: 1,
        sectionSatTarget: 1,
        sectionBriOffset: 1,
        sectionBriTarget: 1,
      };
    }

    function createStage(q: any, width: number, height: number, recipe: ExplorerRecipe, step?: SectionVisualStep): Stage | null {
      const safeRecipe = recipe.id !== getDefaultExplorerRecipe().id && brokenRecipeIds.has(recipe.id)
        ? getDefaultExplorerRecipe()
        : recipe;

      try {
        return instantiateStage(q, width, height, safeRecipe, step);
      } catch (error) {
        reportStageError(safeRecipe.id, 'setup', error);
        if (safeRecipe.id === getDefaultExplorerRecipe().id) return null;
        brokenRecipeIds.add(safeRecipe.id);

        try {
          return instantiateStage(q, width, height, getDefaultExplorerRecipe(), step);
        } catch (fallbackError) {
          reportStageError(getDefaultExplorerRecipe().id, 'setup', fallbackError);
          return null;
        }
      }
    }

    function recoverStage(stage: Stage, q: any, width: number, height: number, phase: string, error: unknown): Stage | null {
      reportStageError(stage.recipe.id, phase, error);
      const failedRecipeId = stage.recipe.id;
      destroyStage(stage);

      if (failedRecipeId === getDefaultExplorerRecipe().id) return null;

      brokenRecipeIds.add(failedRecipeId);
      return createStage(q, width, height, getDefaultExplorerRecipe(), getPlanStep(currentSectionIndex));
    }

    function resizeStage(q: any, stage: Stage | null, width: number, height: number): Stage | null {
      if (!stage) return null;

      try {
        stage.buffer.width = width;
        stage.buffer.height = height;
        stage.materialBuffer = createMaterialBuffer(width, height, stage.palette, stage.recipe.sceneProfile, stage.recipe.materialOverlayAlpha ?? 1);
        fillCanvas(stage.ctx, stage.palette, width, height);
        stage.viz.resize(width, height);
        return stage;
      } catch (error) {
        return recoverStage(stage, q, width, height, 'resize', error);
      }
    }

    function rebuildRuntime(q: any, width: number, height: number, mainCtx: CanvasRenderingContext2D): void {
      destroyStage(outgoingStage);
      destroyStage(activeStage);

      currentAlbumName = albumNameRef.current;
      currentTrackTitle = trackTitleRef.current;
      currentBaseColor = baseColorRef.current;
      currentArtworkUrl = artworkUrlRef.current;
      currentVisualConfig = visualConfigRef.current;
      currentBeatGrid = beatGridRef.current;
      currentTrackDuration = trackDurationRef.current;
      palette = clonePalette(generatePalette(currentBaseColor));
      activePlan = buildTrackVisualPlan(currentAlbumName, currentTrackTitle, sectionTimesRef.current, currentVisualConfig, currentBaseColor, rotationSeedRef.current, currentTrackDuration, currentBeatGrid, currentArtworkUrl);
      currentSectionIndex = getSectionIndex(sectionTimesRef.current, currentTimeRef.current);
      activeStage = createStage(q, width, height, getSectionRecipe(activePlan, currentSectionIndex), getPlanStep(currentSectionIndex));
      outgoingStage = null;
      transitionProgress = 1;
      transitionDuration = getStepTransitionSeconds(getPlanStep(currentSectionIndex));
      lastCueCount = 0;
      prevSectionTimes = sectionTimesRef.current;
      lastEventTime = 0;
      dispatchedPlanEventIds = new Set();
      fillCanvas(mainCtx, palette, width, height);
      if (currentSectionIndex > 0) {
        dispatchSectionCueRange(q, width, height, 1, currentSectionIndex, currentTimeRef.current);
      }
      dispatchPlanEvents(q, width, height, 0, currentTimeRef.current);
      lastEventTime = currentTimeRef.current;
    }

    function startSectionTransition(q: any, width: number, height: number, nextSectionIndex: number): void {
      const nextRecipe = getSectionRecipe(activePlan, nextSectionIndex);
      const nextStep = getPlanStep(nextSectionIndex);
      currentSectionIndex = nextSectionIndex;

      if (!activeStage) {
        activeStage = createStage(q, width, height, nextRecipe, nextStep);
        transitionProgress = 1;
        transitionDuration = getStepTransitionSeconds(nextStep);
        return;
      }

      if (activeStage.recipe.id === nextRecipe.id || activeStage.recipe.kernel === nextRecipe.kernel) {
        const previousCueCount = lastCueCount;
        applyStepToStage(activeStage, nextStep, false);
        transitionProgress = 1;
        outgoingStage = null;
        transitionDuration = Math.max(SAME_SKETCH_MORPH_SECONDS, getStepTransitionSeconds(nextStep) * 0.55);
        if (nextSectionIndex > previousCueCount) {
          dispatchSectionCueRange(q, width, height, previousCueCount + 1, nextSectionIndex, currentTimeRef.current);
        } else {
          const sectionCue = createSectionCueEvent(nextSectionIndex, sectionTimesRef.current);
          if (sectionCue) {
            activeStage = dispatchEventToStage(activeStage, q, width, height, boostEventForPlaybackTime({
              ...sectionCue,
              durationMs: Math.round(transitionDuration * 1000),
            }, currentTimeRef.current, sectionTimesRef.current));
          }
        }
        return;
      }

      destroyStage(outgoingStage);
      outgoingStage = activeStage;
      activeStage = createStage(q, width, height, nextRecipe, nextStep);
      if (!activeStage) {
        destroyStage(outgoingStage);
        outgoingStage = null;
        transitionProgress = 1;
        return;
      }
      transitionProgress = 0;
      transitionDuration = Math.max(SKETCH_CROSSFADE_SECONDS, getStepTransitionSeconds(nextStep));
    }

    function renderStage(
      stage: Stage | null,
      q: any,
      dt: number,
      audioSignal: AudioSignal,
      exclusion: ExclusionRect,
      playbackTime: number,
      cueState: CueState,
      easing: SectionEasing,
    ): { stage: Stage | null; params: VisualParams | null } {
      if (!stage) return { stage: null, params: null };

      try {
        applySharedModulation(
          stage.lerpParams,
          stage.baseParams,
          dt,
          audioSignal,
          progressRef.current,
          playbackTime,
          playEnergy,
          cueState,
          easing.curve,
        );

        // Role-aware lerp speed: a build ramps deliberately, a peak arrives
        // quickly, a release/afterglow settles then lingers.
        const params = updateLerpParams(stage.lerpParams, dt, easing.lerpSpeed);
        // Zero-touch quality tier: scale the frame-local snapshot (never the
        // persistent lerp targets) so most kernels draw lighter under load.
        const quality = getQualityScale();
        if (quality < 0.999) {
          params.density *= quality;
          params.shimmer *= 0.5 + quality * 0.5;
        }
        params.pointer = pointerSignal;
        // Lerp section ambient palette (hue + sat + bri) independently (~2.5s settle); snap when reduced-motion.
        const hueSpeed = reduced ? 1 : Math.min(1, dt * 0.28);
        stage.sectionHueOffset += (stage.sectionHueTarget - stage.sectionHueOffset) * hueSpeed;
        stage.sectionSatOffset += (stage.sectionSatTarget - stage.sectionSatOffset) * hueSpeed;
        stage.sectionBriOffset += (stage.sectionBriTarget - stage.sectionBriOffset) * hueSpeed;
        applyPaletteTransform(stage.palette, stage.basePalette, {
          hueShift:   params.hueShift + stage.sectionHueOffset,
          saturation: stage.sectionSatOffset,
          brightness: stage.sectionBriOffset,
        });
        stage.viz.update(dt, params, audioSignal, exclusion);
        stage.viz.draw(q, stage.ctx);
        updateStageCueEffects(stage, dt);
        return { stage, params };
      } catch (error) {
        return {
          stage: recoverStage(stage, q, stage.buffer.width, stage.buffer.height, 'render', error),
          params: null,
        };
      }
    }

    function dispatchEventToStage(stage: Stage | null, q: any, width: number, height: number, event: VisualEvent): Stage | null {
      if (!stage) return null;

      try {
        applyEvent(stage.lerpParams, event);
        applyGenericCueEvent(stage, event);
        stage.viz.onEvent(event);
        return stage;
      } catch (error) {
        return recoverStage(stage, q, width, height, 'event', error);
      }
    }

    function dispatchPlanEvents(q: any, width: number, height: number, previousTime: number, currentTime: number): void {
      const timeJump = currentTime < previousTime - 0.25 || currentTime - previousTime > 3.5;
      if (currentTime < previousTime - 0.25) {
        dispatchedPlanEventIds = new Set();
      }

      const forwardSeekReplay = currentTime - previousTime > 3.5;
      const startTime = currentTime < previousTime ? 0 : previousTime;
      let replayBurstCount = 0;
      let latestJumpBarCue: VisualEvent | null = null;
      for (let index = 0; index < activePlan.events.length; index += 1) {
        const event = activePlan.events[index];
        if (dispatchedPlanEventIds.has(event.id)) continue;
        if (event.t < startTime || event.t > currentTime) continue;
        const burstLike = event.type === 'spark-burst' || event.type === 'glow-pulse' || event.type === 'bloom-flash';
        if (forwardSeekReplay && event.generated && burstLike) {
          replayBurstCount += 1;
          if (replayBurstCount > 1) {
            dispatchedPlanEventIds.add(event.id);
            continue;
          }
        }

        const visualEvent: VisualEvent = {
          t: event.t,
          intensity: event.intensity,
          type: event.type,
          ...(event.sectionIndex !== undefined ? { sectionIndex: event.sectionIndex } : {}),
          ...(event.target ? { target: event.target } : {}),
          ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
          ...(event.color ? { color: event.color } : {}),
          ...(event.palette ? { palette: event.palette } : {}),
          ...(event.releaseMode ? { releaseMode: event.releaseMode } : {}),
        };
        if (event.type === 'bar-cue' && timeJump) {
          latestJumpBarCue = visualEvent;
          dispatchedPlanEventIds.add(event.id);
          continue;
        }
        const normalizedEvent = forwardSeekReplay && event.generated ? shortenReplayEvent(visualEvent) : visualEvent;
        const eventToDispatch = event.generated
          ? boostEventForPlaybackTime(normalizedEvent, currentTime, sectionTimesRef.current)
          : normalizedEvent;
        activeStage = dispatchEventToStage(activeStage, q, width, height, eventToDispatch);
        outgoingStage = dispatchEventToStage(outgoingStage, q, width, height, eventToDispatch);
        dispatchedPlanEventIds.add(event.id);
      }
      if (latestJumpBarCue) {
        const replayEvent = shortenReplayEvent(latestJumpBarCue);
        activeStage = dispatchEventToStage(activeStage, q, width, height, replayEvent);
        outgoingStage = dispatchEventToStage(outgoingStage, q, width, height, replayEvent);
      }
    }

    const q = new Q5('instance', container);

    const getCanvasSize = () => ({
      width: Math.max(1, container.clientWidth),
      height: Math.max(1, container.clientHeight),
    });

    q.setup = () => {
      const { width, height } = getCanvasSize();
      q.createCanvas(width, height);
      q.pixelDensity(1);
      q.noiseDetail(4, 0.5);
      buildGrainCanvases(width, height);

      const ctx = q.drawingContext as CanvasRenderingContext2D;
      rebuildRuntime(q, q.width, q.height, ctx);
    };

    q.draw = () => {
      if (removed || !activeStage) return;

      const width = q.width;
      const height = q.height;
      const ctx = q.drawingContext as CanvasRenderingContext2D;
      const now = performance.now();
      if (document.visibilityState === 'hidden') {
        lastFrameTime = now;
        return;
      }
      const minFrameMs = reduced
        ? 1000 / 18
        : playingRef.current || reviewMotion || outgoingStage || pendingRuntimeRebuild
          ? 1000 / 45
          : 1000 / 18;
      if (now - lastFrameTime < minFrameMs) return;
      const frameElapsedMs = now - lastFrameTime;
      const dt = Math.min(frameElapsedMs / 1000, 0.033);
      lastFrameTime = now;

      // Quality governor: only sample frames under the 45fps playing cap —
      // the idle 18fps throttle would otherwise read as sustained slowness.
      if (!reduced && minFrameMs === 1000 / 45) reportFrame(frameElapsedMs);

      const frameDt = reduced ? Math.min(dt, 0.008) : dt;
      const pointerPositionBlend = 1 - Math.exp(-frameDt / 0.7);
      const pointerPresenceBlend = 1 - Math.exp(-frameDt / (pointerPresenceTarget > pointerPresence ? 0.9 : 1.8));
      const pointerVelocityBlend = 1 - Math.exp(-frameDt / (pointerVelocityTarget > pointerVelocity ? 0.14 : 0.8));
      pointerX += (pointerTargetX - pointerX) * pointerPositionBlend;
      pointerY += (pointerTargetY - pointerY) * pointerPositionBlend;
      pointerPresence += (pointerPresenceTarget - pointerPresence) * pointerPresenceBlend;
      pointerVelocity += (pointerVelocityTarget - pointerVelocity) * pointerVelocityBlend;
      pointerDeltaX += (pointerDeltaTargetX - pointerDeltaX) * pointerVelocityBlend;
      pointerDeltaY += (pointerDeltaTargetY - pointerDeltaY) * pointerVelocityBlend;
      pointerVelocityTarget *= Math.exp(-frameDt / 0.2);
      pointerDeltaTargetX *= Math.exp(-frameDt / 0.16);
      pointerDeltaTargetY *= Math.exp(-frameDt / 0.16);
      pointerSignal.x = pointerX;
      pointerSignal.y = pointerY;
      pointerSignal.presence = pointerPresence;
      pointerSignal.velocity = pointerVelocity;
      pointerSignal.deltaX = pointerDeltaX;
      pointerSignal.deltaY = pointerDeltaY;

      const sectionTimesValue = sectionTimesRef.current;
      const needsRebuild = albumNameRef.current !== currentAlbumName
        || trackTitleRef.current !== currentTrackTitle
        || baseColorRef.current !== currentBaseColor
        || artworkUrlRef.current !== currentArtworkUrl
        || sectionTimesValue !== prevSectionTimes
        || beatGridRef.current !== currentBeatGrid
        || trackDurationRef.current !== currentTrackDuration;
      const visualConfigChanged = visualConfigRef.current !== currentVisualConfig;

      if (needsRebuild && !pendingRuntimeRebuild) {
        pendingRuntimeRebuild = true;
        pendingRuntimeRebuildApplied = false;
        runtimeRebuildProgress = 0;
      }

      if (pendingRuntimeRebuild && !pendingRuntimeRebuildApplied && runtimeRebuildProgress >= 0.5) {
        rebuildRuntime(q, width, height, ctx);
        pendingRuntimeRebuildApplied = true;
      }

      if (!pendingRuntimeRebuild && visualConfigChanged) {
        currentVisualConfig = visualConfigRef.current;
        activePlan = buildTrackVisualPlan(currentAlbumName, currentTrackTitle, sectionTimesRef.current, currentVisualConfig, currentBaseColor, rotationSeedRef.current, currentTrackDuration, currentBeatGrid, currentArtworkUrl);
        const configSectionIndex = getSectionIndex(sectionTimesRef.current, currentTimeRef.current);
        const configRecipe = getSectionRecipe(activePlan, configSectionIndex);
        const configStep = getPlanStep(configSectionIndex);
        if (!activeStage || activeStage.recipe.id !== configRecipe.id) {
          startSectionTransition(q, width, height, configSectionIndex);
        } else {
          currentSectionIndex = configSectionIndex;
          applyStepToStage(activeStage, configStep);
        }
      }

      const currentTimeValue = currentTimeRef.current;
      const runtimeMatchesSelection = !pendingRuntimeRebuild || pendingRuntimeRebuildApplied;
      const cueState = getCueState(runtimeMatchesSelection ? sectionTimesValue : prevSectionTimes, currentTimeValue);

      // Do not advance a replacement track through the outgoing track's plan
      // during the first half of the rebuild fade. The rebuilt runtime replays
      // the correct section and events once its incoming stage is installed.
      if (runtimeMatchesSelection) {
        const resolvedSectionIndex = getSectionIndex(sectionTimesValue, currentTimeValue);

        if (resolvedSectionIndex !== currentSectionIndex) {
          startSectionTransition(q, width, height, resolvedSectionIndex);
        }

        if (resolvedSectionIndex < lastCueCount) {
          lastCueCount = resolvedSectionIndex;
        }
        while (lastCueCount < resolvedSectionIndex) {
          const nextSectionIndex = lastCueCount + 1;
          const event = createSectionCueEvent(nextSectionIndex, sectionTimesValue);
          if (event) {
            const boostedEvent = boostEventForPlaybackTime(event, currentTimeValue, sectionTimesValue);
            activeStage = dispatchEventToStage(activeStage, q, width, height, boostedEvent);
            outgoingStage = dispatchEventToStage(outgoingStage, q, width, height, boostedEvent);
          }
          lastCueCount += 1;
        }

        dispatchPlanEvents(q, width, height, lastEventTime, currentTimeValue);
        lastEventTime = currentTimeValue;
      }

      const playTarget = playingRef.current ? 1 : reviewMotion ? 0.58 : 0.42;
      const playBlend = 1 - Math.exp(-frameDt / (playingRef.current ? 1.15 : 2.8));
      playEnergy += (playTarget - playEnergy) * playBlend;
      const colorTarget = colorOnlyWhilePlayingRef.current && hasPlaybackStartedRef.current ? (playingRef.current ? 1 : 0) : 1;
      const colorBlend = 1 - Math.exp(-frameDt / (playingRef.current ? 2.8 : 3.8));
      colorPresence += (colorTarget - colorPresence) * colorBlend;

      const miniPlayerWidth = Math.min(Math.max(width * 0.34, 360), 520);
      const miniPlayerRight = 20;
      const miniPlayerBottom = 20;
      const miniPlayerHeight = 94;
      const exclusion: ExclusionRect = width >= EXPLORER_DESKTOP_BREAKPOINT
        ? {
            left: Math.max(0, width - miniPlayerRight - miniPlayerWidth),
            right: width - miniPlayerRight,
            top: Math.max(0, height - miniPlayerBottom - miniPlayerHeight),
            bottom: height - miniPlayerBottom,
            pad: EXPLORER_PANEL_SOFT_EDGE,
          }
        : {
            left: width + EXPLORER_PANEL_SOFT_EDGE * 2,
            right: width + EXPLORER_PANEL_SOFT_EDGE * 3,
            top: 0,
            bottom: height,
            pad: EXPLORER_PANEL_SOFT_EDGE,
          };

      const reviewTime = now * 0.001;
      const playingLevel = playingRef.current ? playEnergy : 0;
      const activityLevel = reviewMotion ? Math.max(playEnergy, 0.72) : Math.max(0.60, playEnergy);
      const audioSignal = createLivingAudioSignal(reviewTime, playingRef.current ? audioSignalRef.current : EMPTY_AUDIO_SIGNAL, activityLevel, playingLevel);
      const playbackTime = currentTimeValue + reviewTime * (1 - playingLevel * 0.72);

      // BPM-derived beat clock — injected into audioSignal so all visualizers and
      // params computation receive it without any signature changes.
      // DESIGN DECISION: only authored showcase BPM drives a beat clock. No runtime
      // tempo estimation. A synthetic default-grid clock would pulse at the wrong
      // tempo AND suppress real FFT transients (params.ts downweights transient
      // whenever beatPulse is defined). Unauthored tracks stay alive via
      // energy/transient/onset signals and section cues only.
      const liveBeatGrid = beatGridRef.current;
      if (liveBeatGrid && liveBeatGrid.bpm > 0 && liveBeatGrid.bpmSource === 'authored') {
        const bps = liveBeatGrid.bpm / 60;
        const elapsed = playbackTime - liveBeatGrid.beatStartAt;
        if (elapsed >= 0) {
          const totalBeats = elapsed * bps;
          const bp = totalBeats % 1;
          // Detect downbeat crossing (phase wraps from near-1 back to near-0)
          if (prevBeatPhase > 0.8 && bp < 0.2) {
            beatPulseValue = 1.0;
          }
          // Exponential decay — reaches ~0.05 just before the next downbeat
          beatPulseValue *= Math.pow(0.001, frameDt * bps * 0.55);
          prevBeatPhase = bp;
          audioSignal.beatPhase = bp;
          audioSignal.barPhase = (totalBeats % 4) / 4;
          audioSignal.beatPulse = beatPulseValue;
        }
      }

      // Onset → cue-event bridge: strong bass onsets occasionally become a soft
      // spark-burst so every sketch gets musically-timed gestures via the existing
      // cue machinery. Hard-throttled — accents should feel like weather, not strobes.
      const bridgeOnset = audioSignal.bassOnset ?? 0;
      if (
        playingRef.current
        && bridgeOnset > 0.7
        && audioSignal.energy > 0.45
        && now - lastOnsetBridgeAt >= 2500
      ) {
        lastOnsetBridgeAt = now;
        const onsetEvent: VisualEvent = {
          t: currentTimeValue,
          type: 'spark-burst',
          intensity: 0.25 + bridgeOnset * 0.2,
          durationMs: 620,
          target: 'particles',
        };
        activeStage = dispatchEventToStage(activeStage, q, width, height, onsetEvent);
        outgoingStage = dispatchEventToStage(outgoingStage, q, width, height, onsetEvent);
      }

      const sectionEasing = getSectionEasing(getPlanStep(currentSectionIndex)?.role);
      const activeRender = renderStage(activeStage, q, frameDt, audioSignal, exclusion, playbackTime, cueState, sectionEasing);
      activeStage = activeRender.stage;
      const outgoingRender = renderStage(outgoingStage, q, frameDt, audioSignal, exclusion, playbackTime, cueState, sectionEasing);
      outgoingStage = outgoingRender.stage;

      if (!activeStage) {
        fillCanvas(ctx, palette, width, height);
        return;
      }

      const activeParams = activeRender.params ?? activeStage.baseParams;
      const activePalette = activeStage.palette;
      const [fadeR, fadeG, fadeB] = getThemeTransitionColor(activePalette);
      const sceneProfile = SCENE_PROFILES[activeStage.recipe.sceneProfile];
      const overlayScale = getOverlayScale(activeStage.recipe.sceneProfile);
      const pointerOffsetX = (pointerX - 0.5) * 18 * pointerPresence;
      const pointerOffsetY = (pointerY - 0.5) * 13 * pointerPresence;
      const pointerScale = 1 + pointerPresence * 0.012;
      let activeCompositeAlpha = 1;
      const transitionBlend = outgoingStage ? smootherstep01(transitionProgress) : 1;

      if (outgoingStage) {
        const blendedPalette = clonePalette(activePalette);
        blendedPalette.bgDark = tintTriplet(outgoingStage.palette.bgDark, activePalette.bgDark, transitionBlend);
        blendedPalette.bgMid = tintTriplet(outgoingStage.palette.bgMid, activePalette.bgMid, transitionBlend);
        fillCanvas(ctx, blendedPalette, width, height);
      } else {
        fillCanvas(ctx, activePalette, width, height);
      }
      if (outgoingStage) {
        transitionProgress = Math.min(1, transitionProgress + frameDt / transitionDuration);
        const transitionBlend = smootherstep01(transitionProgress);
        const outgoingAlpha = 1 - transitionBlend;
        const incomingAlpha = transitionBlend;

        if (outgoingAlpha > 0.001) {
          drawManagedStageImage(ctx, outgoingStage.buffer, width, height, outgoingAlpha, colorPresence, playbackTime, currentSectionIndex + 17);
        }
        activeCompositeAlpha = incomingAlpha;
        ctx.globalAlpha = activeCompositeAlpha;
      } else {
        ctx.globalAlpha = 1;
      }
      drawManagedStageImage(
        ctx,
        activeStage.buffer,
        width,
        height,
        activeCompositeAlpha,
        colorPresence,
        playbackTime,
        currentSectionIndex,
        'source-over',
        pointerOffsetX,
        pointerOffsetY,
        pointerScale,
      );
      if (overlayScale.material > 0.02 && activeCompositeAlpha > 0.001) {
        const materialAlpha = Math.min(0.72, 0.22 + activeParams.density * 0.22 + activeParams.turbulence * 0.16)
          * overlayScale.material
          * (activeStage.recipe.materialOverlayAlpha ?? 1)
          * activeCompositeAlpha;
        drawManagedStageImage(
          ctx,
          activeStage.materialBuffer,
          width,
          height,
          materialAlpha,
          colorPresence,
          playbackTime,
          currentSectionIndex + 31,
          activeStage.recipe.sceneProfile === 'tide' ? 'screen' : 'source-over',
          pointerOffsetX * 0.55,
          pointerOffsetY * 0.55,
          1 + (pointerScale - 1) * 0.55,
        );
        ctx.globalCompositeOperation = 'source-over';
      }
      const qualityScale = getQualityScale();
      if (activeCompositeAlpha > 0.001) drawStageCueEffects(ctx, activeStage, width, height, colorPresence, qualityScale);
      ctx.globalAlpha = 1;
      renderedFrameCount += 1;
      publishVisualSmokeTelemetry(activeStage, renderedFrameCount);

      if (outgoingStage && transitionProgress >= 1) {
        destroyStage(outgoingStage);
        outgoingStage = null;
      }

      if (pendingRuntimeRebuild) {
        runtimeRebuildProgress = Math.min(1, runtimeRebuildProgress + frameDt / SKETCH_MERGE_TRANSITION_SECONDS);
        const rebuildBlend = smoothstep01(runtimeRebuildProgress);
        const blackAlpha = rebuildBlend < 0.5
          ? smoothstep01(rebuildBlend * 2)
          : 1 - smoothstep01((rebuildBlend - 0.5) * 2);
        if (blackAlpha > 0.001) {
          ctx.globalAlpha = blackAlpha;
          ctx.fillStyle = `rgb(${fadeR},${fadeG},${fadeB})`;
          ctx.fillRect(0, 0, width, height);
          ctx.globalAlpha = 1;
        }
        if (runtimeRebuildProgress >= 1) {
          pendingRuntimeRebuild = false;
          pendingRuntimeRebuildApplied = false;
        }
      }

      const playhead = clamp01(progressRef.current);
      const energy = audioSignal.energy;
      const bass = audioSignal.bass;
      const mids = audioSignal.mids;
      const highs = audioSignal.highs;
      const transient = audioSignal.transient;
      const cueBlend = cueState.approach * 0.72 + cueState.release * 0.4;
      const motionBoost = 0.56 + playEnergy * 0.28 + energy * 0.78 + bass * 0.42 + activeParams.drift * 0.2;
      const cueGlow = cueBlend * (0.7 + cueState.density * 0.3);
      const audioGlow = energy * 0.28 + activeParams.glow * 0.34 + activeParams.shimmer * 0.2 + activeParams.impulse * 0.42;
      const idlePresence = clamp01(1 - playEnergy * 1.12);
      const [ar, ag, ab] = activePalette.accentGlow;
      const [wr, wg, wb] = activePalette.accentWarm;

      // A quiet local lift gives the pointer presence rather than making it a
      // visible control. Velocity briefly tightens the glow, then leaves a
      // slow afterimage through the independently eased position.
      if (pointerPresence > 0.01 && colorPresence > 0.01) {
        const pointerCenterX = pointerX * width;
        const pointerCenterY = pointerY * height;
        const pointerRadius = Math.max(width, height) * (0.16 + pointerVelocity * 0.045);
        const pointerAlpha = (0.026 + pointerVelocity * 0.042)
          * pointerPresence
          * colorPresence
          * Math.min(1, overlayScale.glow + 0.35);
        const pointerGlow = ctx.createRadialGradient(
          pointerCenterX,
          pointerCenterY,
          0,
          pointerCenterX,
          pointerCenterY,
          pointerRadius,
        );
        pointerGlow.addColorStop(0, `rgba(${ar},${ag},${ab},${pointerAlpha * 0.76})`);
        pointerGlow.addColorStop(0.24, `rgba(${wr},${wg},${wb},${pointerAlpha})`);
        pointerGlow.addColorStop(0.38, `rgba(${ar},${ag},${ab},${pointerAlpha * 0.3})`);
        pointerGlow.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = pointerGlow;
        ctx.fillRect(0, 0, width, height);

        // Two sub-pixel "attention motes" lag around the eased position. They
        // make the interaction discoverable without drawing a cursor halo.
        const moteTime = now * 0.00045;
        for (let moteIndex = 0; moteIndex < 2; moteIndex += 1) {
          const phase = moteTime + moteIndex * 2.7;
          const orbit = 18 + moteIndex * 13;
          const moteX = pointerCenterX + Math.cos(phase) * orbit;
          const moteY = pointerCenterY + Math.sin(phase * 0.83) * orbit * 0.62;
          const moteRadius = 1.2 + pointerVelocity * 1.4 + moteIndex * 0.45;
          const mote = ctx.createRadialGradient(moteX, moteY, 0, moteX, moteY, moteRadius * 4.5);
          const moteAlpha = (0.1 + pointerVelocity * 0.16) * pointerPresence * colorPresence;
          mote.addColorStop(0, `rgba(${wr},${wg},${wb},${moteAlpha})`);
          mote.addColorStop(0.24, `rgba(${ar},${ag},${ab},${moteAlpha * 0.56})`);
          mote.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
          ctx.fillStyle = mote;
          ctx.fillRect(moteX - moteRadius * 4.5, moteY - moteRadius * 4.5, moteRadius * 9, moteRadius * 9);
        }
        ctx.restore();
      }

      if (idlePresence > 0.02 && sceneProfile.idleAlpha * overlayScale.ambient > 0.01) {
        const idleDrift = now * 0.000035;
        const idleHaloX = width * (sceneProfile.leftGlowX + Math.sin(idleDrift) * 0.08);
        const idleHaloY = height * (sceneProfile.leftGlowY + Math.cos(idleDrift * 1.24) * 0.07);
        const idleHalo = ctx.createRadialGradient(idleHaloX, idleHaloY, 0, idleHaloX, idleHaloY, Math.max(width, height) * sceneProfile.leftGlowRadius);
        idleHalo.addColorStop(0, `rgba(${ar},${ag},${ab},${(0.03 + idlePresence * 0.038 + activeParams.glow * 0.02) * sceneProfile.idleAlpha * overlayScale.ambient * colorPresence})`);
        idleHalo.addColorStop(0.42, `rgba(${ar},${ag},${ab},${(0.008 + idlePresence * 0.014) * sceneProfile.idleAlpha * overlayScale.ambient * colorPresence})`);
        idleHalo.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
        ctx.fillStyle = idleHalo;
        ctx.fillRect(0, 0, width, height);

        const horizonY = height * (sceneProfile.lowerGlowY + Math.sin(idleDrift * 0.8) * 0.025);
        const horizon = ctx.createLinearGradient(0, horizonY - 120, 0, horizonY + 180);
        horizon.addColorStop(0, 'rgba(0,0,0,0)');
        horizon.addColorStop(0.42, `rgba(${wr},${wg},${wb},${(0.01 + idlePresence * 0.014) * sceneProfile.horizonAlpha * overlayScale.ambient * colorPresence})`);
        horizon.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = horizon;
        ctx.fillRect(0, horizonY - 140, width, 280);

        const veil = ctx.createLinearGradient(0, 0, width, 0);
        veil.addColorStop(0, `rgba(${ar},${ag},${ab},${(0.008 + idlePresence * 0.01) * sceneProfile.veilAlpha * overlayScale.ambient * colorPresence})`);
        veil.addColorStop(0.38, 'rgba(255,255,255,0)');
        veil.addColorStop(0.72, `rgba(${wr},${wg},${wb},${(0.005 + idlePresence * 0.007) * sceneProfile.veilAlpha * overlayScale.ambient * colorPresence})`);
        veil.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = veil;
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(${ar},${ag},${ab},${(0.006 + idlePresence * 0.01) * sceneProfile.horizonAlpha * overlayScale.ambient * colorPresence})`;
        for (let index = 0; index < 3; index += 1) {
          const progress = index / 2;
          const lineY = height * (0.28 + progress * 0.28 + Math.sin(idleDrift * (1.1 + index * 0.2) + index * 1.4) * 0.018);
          const amplitude = 18 + index * 12;
          ctx.beginPath();
          for (let x = -80; x <= width + 80; x += 32) {
            const y = lineY + Math.sin(x * 0.005 + idleDrift * (1.8 + progress) + index * 1.7) * amplitude;
            if (x <= -80) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.restore();
      }

      const leftGlowX = width * (sceneProfile.leftGlowX + playhead * 0.18 + Math.sin(now * 0.00009 + bass * 1.2) * (0.018 + bass * 0.024));
      const leftGlowY = height * (sceneProfile.leftGlowY + Math.cos(now * 0.00007 + mids * 0.8) * (0.022 + energy * 0.02));
      const leftGlow = ctx.createRadialGradient(leftGlowX, leftGlowY, 0, leftGlowX, leftGlowY, Math.max(width, height) * (sceneProfile.leftGlowRadius + bass * 0.1));
      leftGlow.addColorStop(0, `rgba(${ar},${ag},${ab},${(0.05 + 0.065 * motionBoost + cueGlow * 0.06 + audioGlow * 0.09) * sceneProfile.leftGlowStrength * overlayScale.glow * colorPresence})`);
      leftGlow.addColorStop(0.35, `rgba(${ar},${ag},${ab},${(0.018 + 0.024 * motionBoost + cueGlow * 0.022 + audioGlow * 0.034) * sceneProfile.leftGlowStrength * overlayScale.glow * colorPresence})`);
      leftGlow.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
      ctx.fillStyle = leftGlow;
      ctx.fillRect(0, 0, width, height);

      const lowerGlowX = width * (sceneProfile.lowerGlowX + Math.sin(now * 0.00005 + bass * 0.9) * (0.038 + bass * 0.035));
      const lowerGlowY = height * (sceneProfile.lowerGlowY - playhead * 0.12 - bass * 0.05);
      const lowerGlow = ctx.createRadialGradient(lowerGlowX, lowerGlowY, 0, lowerGlowX, lowerGlowY, Math.max(width, height) * sceneProfile.lowerGlowRadius);
      lowerGlow.addColorStop(0, `rgba(${wr},${wg},${wb},${(0.03 + 0.04 * motionBoost + cueState.release * 0.04 + bass * 0.06 + transient * 0.08) * sceneProfile.lowerGlowStrength * overlayScale.glow * colorPresence})`);
      lowerGlow.addColorStop(0.55, `rgba(${wr},${wg},${wb},${(0.012 + cueState.release * 0.012 + bass * 0.018 + energy * 0.012) * sceneProfile.lowerGlowStrength * overlayScale.glow * colorPresence})`);
      lowerGlow.addColorStop(1, `rgba(${wr},${wg},${wb},0)`);
      ctx.fillStyle = lowerGlow;
      ctx.fillRect(0, 0, width, height);

      if (qualityScale >= 0.7) {
        const washX = width * (sceneProfile.washX + playhead * 0.3 + Math.sin(playbackTime * 0.11 + bass * 1.7) * 0.06);
        const washY = height * (sceneProfile.washY + Math.cos(playbackTime * 0.09 + mids * 1.5) * 0.08);
        const wash = ctx.createRadialGradient(washX, washY, 0, washX, washY, Math.max(width, height) * (sceneProfile.washRadius + bass * 0.12));
        wash.addColorStop(0, `rgba(${ar},${ag},${ab},${(0.018 + energy * 0.045 + bass * 0.055 + transient * 0.08) * sceneProfile.washStrength * overlayScale.wash * colorPresence})`);
        wash.addColorStop(0.55, `rgba(${ar},${ag},${ab},${(0.008 + energy * 0.02 + bass * 0.018) * sceneProfile.washStrength * overlayScale.wash * colorPresence})`);
        wash.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
        ctx.fillStyle = wash;
        ctx.fillRect(0, 0, width, height);
      }

      if (qualityScale >= 0.62 && (energy > 0.002 || transient > 0.002) && sceneProfile.sweepStrength * overlayScale.sweep > 0.01) {
        const halfSweepWidth = sceneProfile.sweepWidth * 0.5;
        const sweepX = width * (sceneProfile.leftGlowX + playhead * 0.44 + Math.sin(playbackTime * 0.16 + highs * 2.4) * (0.05 + highs * 0.06));
        const sweep = ctx.createLinearGradient(sweepX - halfSweepWidth, 0, sweepX + halfSweepWidth, 0);
        sweep.addColorStop(0, `rgba(${ar},${ag},${ab},0)`);
        sweep.addColorStop(0.5, `rgba(${ar},${ag},${ab},${(0.012 + energy * 0.03 + transient * 0.075 + highs * 0.028) * sceneProfile.sweepStrength * overlayScale.sweep * colorPresence})`);
        sweep.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
        ctx.fillStyle = sweep;
        ctx.fillRect(sweepX - halfSweepWidth, 0, sceneProfile.sweepWidth, height);
      }

      // Ripple overlay — elliptical glow at the scene's focus point, pulsing with audio.
      // rippleAspect squeezes the gradient vertically so each scene profile can have
      // a distinct oval hotspot that matches its visual geometry.
      const rippleScale = sceneProfile.rippleStrength * overlayScale.ripple;
      if (qualityScale >= 0.7 && rippleScale > 0.01 && colorPresence > 0.01) {
        const rx = width * sceneProfile.rippleX;
        const ry = height * sceneProfile.rippleY;
        const aspect = Math.max(0.12, sceneProfile.rippleAspect);
        const rippleRadius = Math.max(width, height) * 0.32;
        const rippleAlpha = (0.01 + energy * 0.028 + bass * 0.018 + cueBlend * 0.014) * rippleScale * colorPresence;
        ctx.save();
        ctx.translate(rx, ry);
        ctx.scale(1, aspect);
        const rippleGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, rippleRadius);
        rippleGrad.addColorStop(0, `rgba(${ar},${ag},${ab},${rippleAlpha})`);
        rippleGrad.addColorStop(0.45, `rgba(${ar},${ag},${ab},${rippleAlpha * 0.28})`);
        rippleGrad.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
        ctx.fillStyle = rippleGrad;
        ctx.fillRect(-rippleRadius, -rippleRadius / aspect, rippleRadius * 2, (rippleRadius * 2) / aspect);
        ctx.restore();
      }

      const grainIntensity = (0.66 + (playingRef.current ? 0.12 : 0) + highs * 0.1) * sceneProfile.grain * overlayScale.grain;
      // Advance through pre-rendered grain frames every GRAIN_FRAME_HOLD draw calls.
      // One drawImage replaces ~1500 fillRect() calls per frame.
      grainFrameCounter += 1;
      if (grainFrameCounter >= GRAIN_FRAME_HOLD) {
        grainFrameCounter = 0;
        grainFrameIndex = (grainFrameIndex + 1) % Math.max(1, grainCanvases.length);
      }
      const grainCanvas = grainCanvases[grainFrameIndex];
      if (grainCanvas) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.08, 0.012 * grainIntensity);
        ctx.drawImage(grainCanvas, 0, 0, width, height);
        ctx.restore();
      }

      // Geometry, fade color, and profile strength change only on
      // resize/palette/recipe swaps, so the gradient is cached rather than
      // rebuilt every frame.
      const fadeColorKey = (fadeR << 16) | (fadeG << 8) | fadeB;
      const sizeKey = width * 0x4000 + height;
      if (!vignetteGradient || fadeColorKey !== vignetteColorKey || sceneProfile.vignette !== vignetteStrengthKey || sizeKey !== vignetteSizeKey) {
        vignetteGradient = ctx.createRadialGradient(width * 0.42, height * 0.5, Math.min(width, height) * 0.18, width * 0.5, height * 0.5, Math.max(width, height) * 0.72);
        vignetteGradient.addColorStop(0, `rgba(${fadeR},${fadeG},${fadeB},0)`);
        vignetteGradient.addColorStop(0.72, `rgba(${fadeR},${fadeG},${fadeB},${0.08 * sceneProfile.vignette})`);
        vignetteGradient.addColorStop(1, `rgba(${fadeR},${fadeG},${fadeB},${0.36 * sceneProfile.vignette})`);
        vignetteColorKey = fadeColorKey;
        vignetteStrengthKey = sceneProfile.vignette;
        vignetteSizeKey = sizeKey;
      }
      ctx.fillStyle = vignetteGradient;
      ctx.fillRect(0, 0, width, height);
    };

    q.windowResized = () => {
      const { width, height } = getCanvasSize();
      q.resizeCanvas(width, height);
      const ctx = q.drawingContext as CanvasRenderingContext2D;
      fillCanvas(ctx, palette, q.width, q.height);
      buildGrainCanvases(q.width, q.height);
      activeStage = resizeStage(q, activeStage, q.width, q.height);
      outgoingStage = resizeStage(q, outgoingStage, q.width, q.height);
    };

    return () => {
      removed = true;
      q.noLoop();
      destroyStage(activeStage);
      destroyStage(outgoingStage);
      q.remove();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('blur', releasePointer);
      document.removeEventListener('mouseleave', releasePointer);
    };
  }, [audioSignalRef, supportsRichVisualRuntime, q5Ready, reviewMotion, stage.height, stage.width, visualRuntimeReady]);

  const [bgR, bgG, bgB] = staticPalette.bgDark;
  const [midR, midG, midB] = staticPalette.bgMid;
  const [accentR, accentG, accentB] = staticPalette.accentGlow;
  const [warmR, warmG, warmB] = staticPalette.accentWarm;
  const [bottomR, bottomG, bottomB] = getThemeBottomColor();
  const visualColorFilter = colorOnlyWhilePlaying && hasPlaybackStarted && !isPlaying ? 'grayscale(1) saturate(0)' : 'none';
  const mobileDebugPlan = !supportsRichVisualRuntime && showSketchLabel
    ? buildTrackVisualPlan(albumName, trackTitle, sectionTimes, visualConfig, baseColor, rotationSeed, trackDuration, beatGrid, artworkUrl)
    : null;
  const mobileDebugSectionIndex = mobileDebugPlan ? getSectionIndex(sectionTimes, currentTime) : 0;
  const mobileDebugRecipe = mobileDebugPlan ? getSectionRecipe(mobileDebugPlan, mobileDebugSectionIndex) : null;
  const mobileBeatPosition = getBeatGridPosition(beatGrid, currentTime);
  const showSectionTimeline = process.env.NODE_ENV !== 'production';
  const timelinePlan = showSectionTimeline
    ? buildTrackVisualPlan(albumName, trackTitle, sectionTimes, visualConfig, baseColor, rotationSeed, trackDuration, beatGrid, artworkUrl)
    : null;
  const timelineSectionIndex = showSectionTimeline ? getSectionIndex(sectionTimes, currentTime) : 0;
  const timelineRecipe = timelinePlan ? getSectionRecipe(timelinePlan, timelineSectionIndex) : null;
  const barCueEvents = timelinePlan?.events.filter((event) => event.type === 'bar-cue') ?? [];
  const timelineBeatPosition = getBeatGridPosition(beatGrid, currentTime);
  const displaySectionTimes = songSectionTimes ?? sectionTimes;
  const displaySectionIndex = showSectionTimeline ? getSectionIndex(displaySectionTimes, currentTime) : 0;
  const lastSectionTime = Math.max(sectionTimes[sectionTimes.length - 1] ?? 0, displaySectionTimes[displaySectionTimes.length - 1] ?? 0);
  const lastBarTime = barCueEvents[barCueEvents.length - 1]?.t ?? 0;
  const timelineEnd = Math.max(trackDuration ?? 0, lastSectionTime * 1.25, lastBarTime, 60);
  const regionStart = displaySectionIndex > 0 ? displaySectionTimes[displaySectionIndex - 1] ?? 0 : 0;
  const regionEnd = displaySectionTimes[displaySectionIndex] ?? timelineEnd;
  const timelineSections = timelinePlan
    ? (() => {
      const plan = timelinePlan;
      return Array.from({ length: Math.max(1, displaySectionTimes.length + 1) }, (_, index) => {
        const start = index > 0 ? displaySectionTimes[index - 1] ?? 0 : 0;
        const end = displaySectionTimes[index] ?? timelineEnd;
        const recipe = getSectionRecipe(plan, index);
        return { index, start, end, recipe };
      });
    })()
    : [];
  const sectionTimelineOverlay = showSectionTimeline ? (
    <div
      className={`absolute bottom-0 left-0 right-0 z-10 h-12 overflow-hidden border-t text-[9px] backdrop-blur-sm ${sectionTimesSource === 'fallback' ? 'border-amber-500/40 bg-amber-900/70 text-amber-200' : 'border-white/10 bg-black/55 text-white/70'}`}
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      <div
        className="absolute inset-y-0 bg-white/10"
        style={{
          left: `${clamp01(regionStart / timelineEnd) * 100}%`,
          width: `${clamp01((regionEnd - regionStart) / timelineEnd) * 100}%`,
        }}
      />
      <div className="absolute left-2 top-1 z-10 uppercase tracking-[0.12em]">
        song section {displaySectionIndex + 1}/{displaySectionTimes.length + 1} / visual {timelineSectionIndex + 1}/{timelinePlan?.steps.length ?? 0} / {timelineRecipe?.id ?? 'unassigned'} / {beatGrid.bpm} bpm {beatGrid.bpmSource} / bar {timelineBeatPosition.barNumber}{sectionTimesSource === 'fallback' ? ' / ⚠ FALLBACK' : sectionTimesSource === 'detected' ? ' / detected' : sectionTimesSource === 'manual' ? ' / manual' : ''}
      </div>
      <div className="absolute inset-x-0 bottom-0 top-4">
        {timelineSections.map(({ index, start, end, recipe }) => {
          const left = clamp01(start / timelineEnd) * 100;
          const width = Math.max(0.8, clamp01((end - start) / timelineEnd) * 100);
          const active = index === displaySectionIndex;
          const label = `S${index + 1}: ${formatTimelineTime(start)}-${formatTimelineTime(end)}`;
          return (
            <div
              key={`${recipe.id}-${index}-${start}`}
              className={`absolute bottom-1 top-0 overflow-hidden border-l px-1.5 ${active ? 'border-white/70 bg-white/18 text-white' : 'border-white/18 bg-black/10 text-white/58'}`}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`song section ${index + 1} · ${formatTimelineTime(start)}-${formatTimelineTime(end)} · visual ${recipe.id} · ${recipe.sceneProfile}`}
            >
              <div className="truncate leading-3">{label}</div>
              <div className="truncate text-[8px] uppercase leading-3 opacity-70">{recipe.id}</div>
            </div>
          );
        })}
      </div>
      {barCueEvents.map((event) => (
        <div
          key={event.id}
          className="absolute bottom-0 h-2 border-l border-cyan-200/25"
          style={{ left: `${clamp01(event.t / timelineEnd) * 100}%` }}
        />
      ))}
      {displaySectionTimes.map((time, index) => (
        <div
          key={`${time}-${index}`}
          className="absolute inset-y-0 border-l border-white/30"
          style={{ left: `${clamp01(time / timelineEnd) * 100}%` }}
        >
          <span className="absolute bottom-0.5 left-1 whitespace-nowrap text-white/65">
            {formatTimelineTime(time)} s{index + 1}
          </span>
        </div>
      ))}
      <div
        className="absolute inset-y-0 z-20 w-px bg-white shadow-[0_0_7px_rgba(255,255,255,0.8)]"
        style={{ left: `${clamp01(currentTime / timelineEnd) * 100}%` }}
      />
    </div>
  ) : null;

  if (!supportsRichVisualRuntime) {
    return (
      <div
        className="explorer-mobile-visual-fallback fixed inset-0 z-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background: `radial-gradient(circle at 30% 18%, rgba(${accentR}, ${accentG}, ${accentB}, 0.38) 0%, rgba(${accentR}, ${accentG}, ${accentB}, 0.08) 34%, rgba(${accentR}, ${accentG}, ${accentB}, 0) 62%), radial-gradient(circle at 82% 78%, rgba(${warmR}, ${warmG}, ${warmB}, 0.24) 0%, rgba(${warmR}, ${warmG}, ${warmB}, 0) 48%), radial-gradient(circle at 46% 54%, rgba(${midR}, ${midG}, ${midB}, 0.58) 0%, rgba(${midR}, ${midG}, ${midB}, 0) 46%), linear-gradient(180deg, rgb(${bgR}, ${bgG}, ${bgB}) 0%, rgb(${midR}, ${midG}, ${midB}) 48%, rgb(${bottomR}, ${bottomG}, ${bottomB}) 100%)`,
          filter: visualColorFilter,
          transition: 'filter 2.8s ease',
          opacity: failed ? 0.92 : 1,
        }}
      >
        <canvas
          ref={mobileCanvasRef}
          className="absolute inset-0 h-full w-full"
        />
        {sectionTimelineOverlay}
        {mobileDebugPlan && mobileDebugRecipe ? (
          <div
            className="absolute left-3 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] max-w-[calc(100vw-1.5rem)] rounded-full border px-2.5 py-1 text-[9px] uppercase"
            style={{
              color: 'rgba(245,248,255,0.74)',
              background: 'rgba(4,8,16,0.42)',
              borderColor: 'rgba(245,248,255,0.14)',
              letterSpacing: '0.14em',
              backdropFilter: 'blur(10px)',
            }}
          >
            {mobileDebugRecipe.name} · section {Math.min(mobileDebugSectionIndex + 1, mobileDebugPlan.steps.length)}/{mobileDebugPlan.steps.length}
            {` · ${beatGrid.bpm} BPM ${beatGrid.bpmSource} · bar ${mobileBeatPosition.barNumber}`}
          </div>
        ) : null}
        {startupOverlayMounted && (
          <div
            className="absolute inset-0 pointer-events-none z-10"
            style={{ background: '#050810', opacity: startupOverlayVisible ? 1 : 0, transition: 'opacity 2000ms ease' }}
          />
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="fixed z-0 overflow-hidden [&>canvas]:block"
      aria-hidden="true"
      style={{
        top: `${stage.top}px`,
        bottom: `${viewportSize.height - stage.bottom}px`,
        left: `${stage.left}px`,
        right: `${viewportSize.width - stage.right}px`,
        width: 'auto',
        height: `${stage.height}px`,
        contain: 'strict',
        background: `radial-gradient(circle at 18% 24%, rgba(${accentR}, ${accentG}, ${accentB}, 0.2) 0%, rgba(${accentR}, ${accentG}, ${accentB}, 0) 34%), radial-gradient(circle at 42% 82%, rgba(${warmR}, ${warmG}, ${warmB}, 0.12) 0%, rgba(${warmR}, ${warmG}, ${warmB}, 0) 36%), linear-gradient(180deg, rgb(${bgR}, ${bgG}, ${bgB}) 0%, rgb(${midR}, ${midG}, ${midB}) 52%, rgb(${bottomR}, ${bottomG}, ${bottomB}) 100%)`,
        filter: visualColorFilter,
        transition: 'filter 2.8s ease',
        opacity: failed ? 0.92 : 1,
      }}
    >
      {sectionTimelineOverlay}
      {startupOverlayMounted && (
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={{ background: '#050810', opacity: startupOverlayVisible ? 1 : 0, transition: 'opacity 2000ms ease' }}
        />
      )}
    </div>
  );
}
