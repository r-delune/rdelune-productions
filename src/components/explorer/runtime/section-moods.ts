import type { SectionPaletteConfig } from './types';
import type { VisualParams } from '../visualizer';

export interface SectionMood {
  params?: Partial<VisualParams>;
  palette?: SectionPaletteConfig;
}

export const SECTION_MOODS: Readonly<Record<string, SectionMood>> = {
  'sketch-dim-blue': {
    params: { turbulence: 0.3, density: 0.44, glow: 0.2, drift: 0.24, hueShift: -12, shimmer: 0.16, impulse: 0 },
    palette: { hueShift: -8, saturation: 0.88, brightness: 0.9, contrast: 1 },
  },
  'sketch-blue-lift': {
    params: { turbulence: 0.38, density: 0.58, glow: 0.32, drift: 0.42, hueShift: -4, shimmer: 0.24, impulse: 0.03 },
    palette: { hueShift: -4, saturation: 0.98, brightness: 0.98, contrast: 1 },
  },
  'sketch-warm-build': {
    params: { turbulence: 0.5, density: 0.7, glow: 0.46, drift: 0.56, hueShift: 10, shimmer: 0.36, impulse: 0.05 },
    palette: { hueShift: 10, saturation: 1.08, brightness: 1.06, contrast: 1.04 },
  },
  'sketch-white-climax': {
    params: { turbulence: 0.66, density: 0.82, glow: 0.72, drift: 0.72, hueShift: 18, shimmer: 0.56, impulse: 0.16 },
    palette: { hueShift: 14, saturation: 0.72, brightness: 1.22, contrast: 1.12 },
  },
  'sketch-green-release': {
    params: { turbulence: 0.28, density: 0.4, glow: 0.24, drift: 0.26, hueShift: 28, shimmer: 0.16, impulse: 0 },
    palette: { hueShift: 24, saturation: 0.94, brightness: 0.94, contrast: 0.98 },
  },
  'sketch-violet-afterglow': {
    params: { turbulence: 0.2, density: 0.28, glow: 0.2, drift: 0.18, hueShift: -24, shimmer: 0.2, impulse: 0 },
    palette: { hueShift: -20, saturation: 0.82, brightness: 0.9, contrast: 0.94 },
  },
  'sketch-ember-pulse': {
    params: { turbulence: 0.74, density: 0.78, glow: 0.74, drift: 0.72, hueShift: 24, shimmer: 0.52, impulse: 0.18 },
    palette: { hueShift: 24, saturation: 1.32, brightness: 1.16, contrast: 1.18 },
  },
  'sketch-cold-spark': {
    params: { turbulence: 0.46, density: 0.66, glow: 0.52, drift: 0.42, hueShift: -18, shimmer: 0.64, impulse: 0.05 },
    palette: { hueShift: -18, saturation: 0.9, brightness: 1.14, contrast: 1.1 },
  },
  'sketch-deep-pressure': {
    params: { turbulence: 0.64, density: 0.78, glow: 0.32, drift: 0.68, hueShift: -6, shimmer: 0.22, impulse: 0.08 },
    palette: { hueShift: -6, saturation: 1.04, brightness: 0.78, contrast: 1.18 },
  },
  'sketch-silver-wash': {
    params: { turbulence: 0.26, density: 0.36, glow: 0.52, drift: 0.22, hueShift: 4, shimmer: 0.46, impulse: 0.02 },
    palette: { hueShift: 4, saturation: 0.48, brightness: 1.18, contrast: 1.04 },
  },
  'sketch-acid-thread': {
    params: { turbulence: 0.62, density: 0.5, glow: 0.5, drift: 0.58, hueShift: 34, shimmer: 0.4, impulse: 0.08 },
    palette: { hueShift: 34, saturation: 1.28, brightness: 1.02, contrast: 1.1 },
  },
  'sketch-red-peak': {
    params: { turbulence: 0.72, density: 0.86, glow: 0.76, drift: 0.78, hueShift: 30, shimmer: 0.42, impulse: 0.2 },
    palette: { hueShift: 30, saturation: 1.14, brightness: 1.12, contrast: 1.2 },
  },
  'sketch-blackout-drop': {
    params: { turbulence: 0.2, density: 0.22, glow: 0.1, drift: 0.16, hueShift: 0, shimmer: 0.06, impulse: 0 },
    palette: { hueShift: 0, saturation: 0.72, brightness: 0.62, contrast: 1.22 },
  },
  'sketch-rose-cloud': {
    params: { turbulence: 0.32, density: 0.44, glow: 0.34, drift: 0.28, hueShift: 16, shimmer: 0.24, impulse: 0.02 },
    palette: { hueShift: 16, saturation: 0.96, brightness: 1.02, contrast: 0.96 },
  },
  'sketch-aqua-release': {
    params: { turbulence: 0.24, density: 0.34, glow: 0.3, drift: 0.24, hueShift: -32, shimmer: 0.22, impulse: 0 },
    palette: { hueShift: -32, saturation: 0.92, brightness: 0.98, contrast: 0.98 },
  },
  'sketch-gold-afterimage': {
    params: { turbulence: 0.36, density: 0.42, glow: 0.44, drift: 0.32, hueShift: 26, shimmer: 0.36, impulse: 0.03 },
    palette: { hueShift: 26, saturation: 1.02, brightness: 1.1, contrast: 1.02 },
  },
};

export const REVIEW_SECTION_MOOD_IDS: readonly string[] = [
  'sketch-dim-blue',
  'sketch-cold-spark',
  'sketch-ember-pulse',
  'sketch-white-climax',
  'sketch-aqua-release',
  'sketch-deep-pressure',
  'sketch-silver-wash',
  'sketch-acid-thread',
  'sketch-red-peak',
  'sketch-blackout-drop',
  'sketch-rose-cloud',
  'sketch-gold-afterimage',
  'sketch-green-release',
  'sketch-violet-afterglow',
];

export function getSectionMood(moodId: string | undefined): SectionMood | undefined {
  if (!moodId) return undefined;
  return SECTION_MOODS[moodId];
}
