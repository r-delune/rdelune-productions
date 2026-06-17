import type { Palette } from '../palette';
import type { VisualEvent, VisualEventReleaseMode, VisualEventTarget } from '../visualizer';

export type Rgb = [number, number, number];

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function seededUnit(value: number): number {
  const x = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function shiftRgb(base: Rgb, hueShift = 0, saturation = 1, brightness = 1): Rgb {
  const [r0, g0, b0] = base.map((value) => value / 255);
  const max = Math.max(r0, g0, b0);
  const min = Math.min(r0, g0, b0);
  const light = (max + min) / 2;
  const delta = max - min;
  let hue = 0;
  let sat = 0;

  if (delta > 0) {
    sat = delta / (1 - Math.abs(2 * light - 1));
    if (max === r0) hue = ((g0 - b0) / delta) % 6;
    else if (max === g0) hue = (b0 - r0) / delta + 2;
    else hue = (r0 - g0) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  hue = (hue + hueShift + 360) % 360;
  sat = clamp01(sat * saturation);
  const nextLight = clamp01(light * brightness);
  const chroma = (1 - Math.abs(2 * nextLight - 1)) * sat;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = nextLight - chroma / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) [r, g, b] = [chroma, x, 0];
  else if (hue < 120) [r, g, b] = [x, chroma, 0];
  else if (hue < 180) [r, g, b] = [0, chroma, x];
  else if (hue < 240) [r, g, b] = [0, x, chroma];
  else if (hue < 300) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];

  return [
    Math.round(clamp01(r + m) * 255),
    Math.round(clamp01(g + m) * 255),
    Math.round(clamp01(b + m) * 255),
  ];
}

function eventColor(event: VisualEvent, palette: Palette): Rgb {
  if (event.color) return event.color;
  return shiftRgb(
    palette.accentGlow,
    event.palette?.hueShift ?? 0,
    event.palette?.saturation ?? 1,
    event.palette?.brightness ?? 1,
  );
}

function mixRgb(base: Rgb, target: Rgb | null, progress: number): Rgb {
  if (!target) return base;
  const t = smoothstep(progress);
  return [
    Math.round(mix(base[0], target[0], t)),
    Math.round(mix(base[1], target[1], t)),
    Math.round(mix(base[2], target[2], t)),
  ];
}

export interface CueEventState {
  bloom: number;
  focus: number;
  grain: number;
  motion: number;
  sweep: number;
  update(dt: number): void;
  handle(event: VisualEvent, palette: Palette): void;
  particleProgress(seed?: number): number;
  densityProgress(seed?: number): number;
  sizeProgress(seed?: number): number;
  mixParticleColor(base: Rgb, seed?: number): Rgb;
  mixCenterColor(base: Rgb): Rgb;
  mixBackgroundColor(base: Rgb, seed?: number): Rgb;
  mixRidgeColor(base: Rgb, seed?: number): Rgb;
  mixForegroundColor(base: Rgb, seed?: number): Rgb;
  mixMistColor(base: Rgb, seed?: number): Rgb;
  mixTerrainColor(base: Rgb, seed?: number): Rgb;
}

interface MorphChannel {
  target: Rgb | null;
  progress: number;
  duration: number;
  releaseMode: VisualEventReleaseMode;
}

interface ScalarChannel {
  strength: number;
  progress: number;
  duration: number;
  releaseMode: VisualEventReleaseMode;
}

type ChannelName = 'particles' | 'center' | 'background' | 'ridges' | 'foreground' | 'mist' | 'terrain';

function createMorphChannel(): MorphChannel {
  return {
    target: null,
    progress: 0,
    duration: 1,
    releaseMode: 'one-by-one',
  };
}

function createScalarChannel(): ScalarChannel {
  return {
    strength: 0,
    progress: 1,
    duration: 1,
    releaseMode: 'one-by-one',
  };
}

function channelProgress(channel: MorphChannel, seed = 0): number {
  if (!channel.target) return 0;
  if (channel.releaseMode === 'all-at-once') return channel.progress;
  const threshold = seededUnit(seed + 211.5) * 0.72;
  return smoothstep((channel.progress - threshold) / 0.28);
}

function scalarProgress(channel: ScalarChannel, seed = 0): number {
  if (Math.abs(channel.strength) < 0.001) return 0;
  if (channel.releaseMode === 'all-at-once') return channel.progress;
  const threshold = seededUnit(seed + 417.9) * 0.74;
  return smoothstep((channel.progress - threshold) / 0.26);
}

function scalarValue(channel: ScalarChannel, seed = 0): number {
  return channel.strength * scalarProgress(channel, seed);
}

function mixChannelColor(base: Rgb, channel: MorphChannel, seed = 0): Rgb {
  return mixRgb(base, channel.target, channelProgress(channel, seed));
}

function targetChannels(target: VisualEventTarget | undefined): ChannelName[] {
  if (!target || target === 'all') return ['particles', 'center', 'background', 'ridges', 'foreground', 'mist', 'terrain'];
  if (target === 'particles') return ['particles', 'foreground'];
  return [target];
}

export function createCueEventState(): CueEventState {
  const channels: Record<ChannelName, MorphChannel> = {
    particles: createMorphChannel(),
    center: createMorphChannel(),
    background: createMorphChannel(),
    ridges: createMorphChannel(),
    foreground: createMorphChannel(),
    mist: createMorphChannel(),
    terrain: createMorphChannel(),
  };
  const densityChannel = createScalarChannel();
  const sizeChannel = createScalarChannel();

  function triggerScalar(channel: ScalarChannel, strength: number, durationMs: number | undefined, releaseMode: VisualEventReleaseMode | undefined): void {
    channel.strength = Math.max(-1, Math.min(1, strength));
    channel.progress = 0;
    channel.duration = Math.max(0.12, (durationMs ?? 3600) / 1000);
    channel.releaseMode = releaseMode ?? 'one-by-one';
  }

  const state: CueEventState = {
    bloom: 0,
    focus: 0,
    grain: 0,
    motion: 0,
    sweep: 0,

    update(dt) {
      state.bloom = Math.max(0, state.bloom - dt * 1.35);
      state.focus = Math.max(0, state.focus - dt * 0.42);
      state.grain = Math.max(0, state.grain - dt * 0.72);
      state.motion = Math.max(0, state.motion - dt * 0.38);
      state.sweep = Math.max(0, state.sweep - dt * 0.58);
      for (const channel of Object.values(channels)) {
        if (channel.target) channel.progress = Math.min(1, channel.progress + dt / channel.duration);
      }
      for (const channel of [densityChannel, sizeChannel]) {
        channel.progress = Math.min(1, channel.progress + dt / channel.duration);
        if (channel.progress >= 1) {
          channel.strength *= Math.exp(-dt * 0.72);
          if (Math.abs(channel.strength) < 0.002) channel.strength = 0;
        }
      }
    },

    handle(event, palette) {
      const intensity = clamp01(event.intensity);

      if (event.type === 'color-morph' || event.type === 'palette-morph') {
        const target = eventColor(event, palette);
        const fallbackDuration = event.target === 'background' ? 12000 : event.target === 'terrain' ? 9000 : 6200;
        const duration = Math.max(0.12, (event.durationMs ?? fallbackDuration) / 1000);
        const releaseMode = event.releaseMode ?? 'one-by-one';
        for (const channelName of targetChannels(event.target)) {
          const channel = channels[channelName];
          channel.target = target;
          channel.progress = 0;
          channel.duration = duration;
          channel.releaseMode = channelName === 'center' || channelName === 'background'
            ? 'all-at-once'
            : releaseMode;
        }
      }

      if (event.type === 'glow-pulse' || event.type === 'focus-shift') {
        state.focus = Math.min(1, state.focus + intensity * 0.62);
      }
      if (event.type === 'bloom-flash' || event.type === 'spark-burst') {
        state.bloom = Math.min(1, state.bloom + intensity * 0.78);
        triggerScalar(sizeChannel, 0.46 + intensity * 0.42, event.durationMs ?? 2200, event.releaseMode);
      }
      if (event.type === 'density-surge' || event.type === 'motion-drift') {
        state.motion = Math.min(1, state.motion + intensity * 0.58);
        triggerScalar(densityChannel, event.type === 'density-surge' ? 0.38 + intensity * 0.58 : 0.18 + intensity * 0.32, event.durationMs ?? 4200, event.releaseMode);
        triggerScalar(sizeChannel, 0.16 + intensity * 0.28, event.durationMs ?? 4200, event.releaseMode);
      }
      if (event.type === 'veil-sweep') {
        state.sweep = Math.min(1, state.sweep + intensity * 0.68);
      }
      if (event.type === 'grain-bloom') {
        state.grain = Math.min(1, state.grain + intensity * 0.72);
        triggerScalar(densityChannel, -(0.18 + intensity * 0.34), event.durationMs ?? 3600, event.releaseMode);
        triggerScalar(sizeChannel, 0.1 + intensity * 0.18, event.durationMs ?? 3600, event.releaseMode);
      }
      if (event.type === 'storm-release' || event.type === 'section-cue') {
        triggerScalar(densityChannel, 0.24 + intensity * 0.46, event.durationMs ?? 3600, event.releaseMode);
        triggerScalar(sizeChannel, 0.18 + intensity * 0.3, event.durationMs ?? 3600, event.releaseMode);
      }
      if (event.type === 'color-morph' || event.type === 'palette-morph') {
        triggerScalar(densityChannel, 0.1 + intensity * 0.18, event.durationMs ?? 6200, event.releaseMode);
        triggerScalar(sizeChannel, 0.08 + intensity * 0.2, event.durationMs ?? 6200, event.releaseMode);
      }
    },

    particleProgress(seed = 0) {
      const colorProgress = Math.max(
        channelProgress(channels.particles, seed),
        channelProgress(channels.foreground, seed + 37.7),
      );
      return Math.max(colorProgress, Math.abs(scalarValue(densityChannel, seed)), Math.abs(scalarValue(sizeChannel, seed)));
    },

    densityProgress(seed = 0) {
      return scalarValue(densityChannel, seed);
    },

    sizeProgress(seed = 0) {
      return scalarValue(sizeChannel, seed);
    },

    mixParticleColor(base, seed = 0) {
      return mixChannelColor(mixChannelColor(base, channels.particles, seed), channels.foreground, seed + 37.7);
    },

    mixCenterColor(base) {
      return mixChannelColor(base, channels.center, 0);
    },

    mixBackgroundColor(base, seed = 0) {
      return mixChannelColor(base, channels.background, seed);
    },

    mixRidgeColor(base, seed = 0) {
      return mixChannelColor(mixChannelColor(base, channels.ridges, seed), channels.terrain, seed + 19.3);
    },

    mixForegroundColor(base, seed = 0) {
      return mixChannelColor(base, channels.foreground, seed);
    },

    mixMistColor(base, seed = 0) {
      return mixChannelColor(mixChannelColor(base, channels.mist, seed), channels.background, seed + 13.1);
    },

    mixTerrainColor(base, seed = 0) {
      return mixChannelColor(base, channels.terrain, seed);
    },
  };

  return state;
}
