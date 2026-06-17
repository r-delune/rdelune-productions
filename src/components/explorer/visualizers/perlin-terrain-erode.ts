/* ── perlin-terrain-erode Visualizer ────────────────────────
   A balanced topographic landscape made from terraced contours
   and paired sediment streams that travel through runoff channels.

   Bass  -> terrain relief and channel breathing
   Mids  -> visible sediment population
   Highs -> sediment speed and shimmer
   Cue events -> paired runoff surges
──────────────────────────────────────────────────────────────── */

import type { AudioSignal } from '../audio-signal';
import { computeExclusion } from '../exclusion';
import type { Palette } from '../palette';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { createCueEventState } from './cue-event-state';

const SCAN_STEP = 8;
const NOISE_SCALE_X = 0.0032;
const NOISE_SCALE_Y = 0.0027;
const OCTAVE_COUNT = 4;
const MAX_AMPLITUDE = 82;
const DESKTOP_CHANNELS = 9;
const MOBILE_CHANNELS = 6;
const DESKTOP_TRACER_PAIRS = 94;
const MOBILE_TRACER_PAIRS = 40;
const TWO_PI = Math.PI * 2;

type Rgb = [number, number, number];
type Side = -1 | 1;

interface TerrainChannel {
  distance: number;
  bend: number;
  phase: number;
  seed: number;
  surge: number;
}

interface SedimentTracer {
  channel: number;
  progress: number;
  rate: number;
  seed: number;
  size: number;
  crossOffset: number;
  leftX: number;
  leftY: number;
  prevLeftX: number;
  prevLeftY: number;
  rightX: number;
  rightY: number;
  prevRightX: number;
  prevRightY: number;
  elevation: number;
}

interface PathPoint {
  x: number;
  y: number;
  elevation: number;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function seededUnit(value: number): number {
  const result = Math.sin(value * 29.173 + 13.719) * 43758.5453;
  return result - Math.floor(result);
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    Math.round(mix(a[0], b[0], t)),
    Math.round(mix(a[1], b[1], t)),
    Math.round(mix(a[2], b[2], t)),
  ];
}

function rgba(color: Rgb, alpha: number): string {
  return `rgba(${color[0]},${color[1]},${color[2]},${clamp01(alpha).toFixed(3)})`;
}

function hasReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function createPerlinTerrainErode(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let isMobile = false;
  let seedOffset = 0;
  let trailAlpha = 0.09;
  let bassRollingAvg = 0;
  let eventLift = 0;
  let channels: TerrainChannel[] = [];
  let tracers: SedimentTracer[] = [];
  let cue = createCueEventState();

  let curParams: VisualParams = { turbulence: 0.38, density: 0.46, glow: 0.22, drift: 0.32, hueShift: 8, shimmer: 0.24, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };

  function channelCount(): number {
    return isMobile ? MOBILE_CHANNELS : DESKTOP_CHANNELS;
  }

  function maximumTracerPairs(): number {
    return isMobile ? MOBILE_TRACER_PAIRS : DESKTOP_TRACER_PAIRS;
  }

  // Large-scale terrain is bilateral; a quiet detail layer keeps it geological.
  function sampleHeight(sx: number, sy: number, clock: number): number {
    const mirroredX = Math.abs(sx - w * 0.5);
    let macro = 0;
    let detail = 0;
    let amplitude = 1;
    let frequency = 1;
    let total = 0;

    for (let octave = 0; octave < OCTAVE_COUNT; octave += 1) {
      const mx = mirroredX * NOISE_SCALE_X * frequency + seedOffset + octave * 7.3;
      const my = sy * NOISE_SCALE_Y * frequency + seedOffset + octave * 5.1;
      const dx = sx * NOISE_SCALE_X * frequency + seedOffset * 1.7 + octave * 11.6;
      const dy = sy * NOISE_SCALE_Y * frequency + seedOffset * 0.8 + octave * 8.9;
      const nt = clock * (0.12 + octave * 0.045);
      macro += (q.noise(mx, my, nt) - 0.5) * amplitude;
      detail += (q.noise(dx, dy, nt * 1.23 + 31.7) - 0.5) * amplitude;
      total += amplitude * 0.5;
      amplitude *= 0.52;
      frequency *= 1.92;
    }

    if (total <= 0) return 0;
    return (macro / total) * 0.84 + (detail / total) * 0.16;
  }

  function terrainGradient(sx: number, sy: number, clock: number): [number, number] {
    const epsilon = 5;
    const gx = sampleHeight(sx + epsilon, sy, clock) - sampleHeight(sx - epsilon, sy, clock);
    const gy = sampleHeight(sx, sy + epsilon, clock) - sampleHeight(sx, sy - epsilon, clock);
    return [gx / (epsilon * 2), gy / (epsilon * 2)];
  }

  function buildChannels(): void {
    channels = Array.from({ length: channelCount() }, (_, index) => {
      const proportion = (index + 0.65) / channelCount();
      return {
        distance: proportion,
        bend: 0.55 + seededUnit(index * 17.1 + seedOffset) * 0.72,
        phase: seededUnit(index * 23.7 + seedOffset) * TWO_PI,
        seed: seededUnit(index * 91.3 + seedOffset) * 800,
        surge: 0,
      };
    });

    tracers = Array.from({ length: maximumTracerPairs() }, (_, index) => ({
      channel: index % channels.length,
      progress: seededUnit(index * 73.9 + seedOffset),
      rate: 16 + seededUnit(index * 37.7 + seedOffset) * 33,
      seed: seededUnit(index * 51.1 + seedOffset) * 900,
      size: 0.7 + seededUnit(index * 16.3 + seedOffset) * 1.55,
      crossOffset: (seededUnit(index * 11.9 + seedOffset) - 0.5) * 18,
      leftX: 0,
      leftY: 0,
      prevLeftX: 0,
      prevLeftY: 0,
      rightX: 0,
      rightY: 0,
      prevRightX: 0,
      prevRightY: 0,
      elevation: 0.5,
    }));

    for (const tracer of tracers) {
      placeTracer(tracer, true);
    }
  }

  function pathPoint(tracer: SedimentTracer, side: Side, progress: number): PathPoint {
    const channel = channels[tracer.channel];
    const y = -h * 0.1 + progress * h * 1.2;
    const widthScale = Math.max(100, w * 0.43);
    const baseDistance = w * 0.035 + channel.distance * widthScale;
    const valleyWave = Math.sin(
      y * (0.006 + channel.bend * 0.0022)
      + time * (0.24 + channel.bend * 0.12)
      + channel.phase,
    ) * (12 + channel.bend * 16 + curParams.turbulence * 14);
    const macroDrift = (q.noise(channel.seed, y * 0.0035, time * 0.075) - 0.5)
      * (26 + curParams.turbulence * 34);
    const irregularity = (q.noise(
      channel.seed + (side === -1 ? 17.2 : 39.4),
      y * 0.0062,
      time * 0.11 + tracer.seed * 0.001,
    ) - 0.5) * (5 + curParams.turbulence * 9);
    let x = w * 0.5 + side * (baseDistance + valleyWave + macroDrift + tracer.crossOffset) + irregularity;
    const [gradientX] = terrainGradient(x, y, time);
    x -= gradientX * w * (5 + curParams.turbulence * 4);

    return {
      x,
      y,
      elevation: sampleHeight(x, y, time) * 0.5 + 0.5,
    };
  }

  function placeTracer(tracer: SedimentTracer, resetTrail = false): void {
    const left = pathPoint(tracer, -1, tracer.progress);
    const right = pathPoint(tracer, 1, tracer.progress);
    if (resetTrail) {
      tracer.prevLeftX = left.x;
      tracer.prevLeftY = left.y;
      tracer.prevRightX = right.x;
      tracer.prevRightY = right.y;
    } else {
      tracer.prevLeftX = tracer.leftX;
      tracer.prevLeftY = tracer.leftY;
      tracer.prevRightX = tracer.rightX;
      tracer.prevRightY = tracer.rightY;
    }
    tracer.leftX = left.x;
    tracer.leftY = left.y;
    tracer.rightX = right.x;
    tracer.rightY = right.y;
    tracer.elevation = (left.elevation + right.elevation) * 0.5;
  }

  function visibleTracerPairs(): number {
    const mids = curAudio.mids ?? 0;
    const scale = clamp01(0.3 + curParams.density * 0.56 + mids * 0.14 + cue.motion * 0.12);
    return Math.max(channels.length * 2, Math.round(maximumTracerPairs() * scale));
  }

  function drawHaze(ctx: CanvasRenderingContext2D): void {
    const terrainColor = cue.mixTerrainColor(palette.accentGlow, 7) as Rgb;
    const midColor = palette.bgMid as Rgb;
    const relief = curAudio.bass ?? 0;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let band = 0; band < 3; band += 1) {
      const y = h * (0.3 + band * 0.22 + Math.sin(time * 0.13 + band) * 0.014);
      const radius = h * (0.16 + band * 0.045 + relief * 0.035);
      const color = mixRgb(midColor, terrainColor, 0.25 + band * 0.12);
      const glow = ctx.createRadialGradient(w * 0.5, y, 0, w * 0.5, y, Math.max(w * 0.42, radius));
      glow.addColorStop(0, rgba(color, 0.018 + curParams.glow * 0.017 + cue.focus * 0.014));
      glow.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, y - radius, w, radius * 2);
    }
    ctx.restore();
  }

  function drawTerraces(ctx: CanvasRenderingContext2D): void {
    const bass = curAudio.bass ?? 0;
    const activity = curAudio.activity ?? curAudio.energy;
    const glow = clamp01(curParams.glow + cue.focus * 0.45 + activity * 0.16);
    const amplitude = MAX_AMPLITUDE
      * (0.3 + curParams.turbulence * 0.56 + bass * 0.42 + bassRollingAvg * 0.18 + eventLift * 0.12);
    const ridge = cue.mixRidgeColor(palette.accentGlow, seedOffset) as Rgb;
    const valley = cue.mixTerrainColor(palette.bgMid, seedOffset + 8) as Rgb;
    const middle = cue.mixTerrainColor(palette.dotColor, seedOffset + 17) as Rgb;
    const steps = isMobile ? 22 : 46;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineJoin = 'round';
    for (let row = -2; row <= Math.ceil(h / SCAN_STEP) + 2; row += 1) {
      const baseY = row * SCAN_STEP;
      const depth = clamp01(baseY / Math.max(1, h));
      const centerHeight = sampleHeight(w * 0.5, baseY, time);
      const elevation = centerHeight * 0.5 + 0.5;
      const tint = clamp01(elevation * 0.68 + depth * 0.14 + glow * 0.18);
      const color = tint > 0.58
        ? mixRgb(middle, ridge, (tint - 0.58) / 0.42)
        : mixRgb(valley, middle, tint / 0.58);
      const alpha = 0.036 + depth * 0.03 + glow * 0.052 + Math.max(0, centerHeight) * 0.045;

      ctx.beginPath();
      ctx.strokeStyle = rgba(color, alpha);
      ctx.lineWidth = 0.6 + depth * 0.78 + Math.max(0, centerHeight) * 0.62 + cue.bloom * 0.42;
      for (let step = 0; step <= steps; step += 1) {
        const x = (step / steps) * w;
        const heightValue = sampleHeight(x, baseY, time);
        const y = baseY + heightValue * amplitude * (0.36 + depth * 0.5);
        if (step === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawChannels(ctx: CanvasRenderingContext2D): void {
    const ridge = cue.mixRidgeColor(palette.accentGlow, 45) as Rgb;
    const warm = cue.mixRidgeColor(palette.accentWarm, 72) as Rgb;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineCap = 'round';
    for (let channelIndex = 0; channelIndex < channels.length; channelIndex += 1) {
      const channel = channels[channelIndex];
      const color = mixRgb(ridge, warm, channel.distance * 0.25 + channel.surge * 0.28);
      for (const side of [-1, 1] as Side[]) {
        ctx.beginPath();
        const guide: SedimentTracer = {
          ...tracers[channelIndex],
          channel: channelIndex,
          crossOffset: 0,
        };
        for (let step = 0; step <= 24; step += 1) {
          const point = pathPoint(guide, side, step / 24);
          if (step === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        }
        ctx.strokeStyle = rgba(color, 0.018 + curParams.glow * 0.026 + channel.surge * 0.075 + cue.focus * 0.025);
        ctx.lineWidth = 0.6 + channel.surge * 1.2 + cue.bloom * 0.35;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawSediment(ctx: CanvasRenderingContext2D): void {
    const activity = curAudio.activity ?? curAudio.energy;
    const glow = clamp01(curParams.glow + activity * 0.2 + cue.bloom * 0.28);
    const base = cue.mixParticleColor(palette.dotColor, seedOffset) as Rgb;
    const light = cue.mixForegroundColor(palette.accentGlow, seedOffset + 24) as Rgb;
    const count = visibleTracerPairs();

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineCap = 'round';
    for (let index = 0; index < count; index += 1) {
      const tracer = tracers[index];
      const channel = channels[tracer.channel];
      const densityLift = cue.densityProgress(tracer.seed);
      const sizeLift = cue.sizeProgress(tracer.seed);
      const color = cue.mixParticleColor(
        mixRgb(base, light, 0.22 + tracer.elevation * 0.44 + glow * 0.2 + channel.surge * 0.16),
        tracer.seed,
      ) as Rgb;

      for (const side of [-1, 1] as Side[]) {
        const x = side === -1 ? tracer.leftX : tracer.rightX;
        const y = side === -1 ? tracer.leftY : tracer.rightY;
        const px = side === -1 ? tracer.prevLeftX : tracer.prevRightX;
        const py = side === -1 ? tracer.prevLeftY : tracer.prevRightY;
        const factors = computeExclusion(x, y, curExclusion);
        if (factors.density < 0.2 && seededUnit(tracer.seed) > factors.density) continue;

        const flowPulse = 0.68 + Math.sin(time * 1.8 + tracer.seed) * 0.22;
        const alpha = (0.15 + curParams.density * 0.13 + glow * 0.12 + channel.surge * 0.18)
          * flowPulse * factors.alpha * clamp01(1 + densityLift * 0.52);
        const size = tracer.size
          * (0.75 + tracer.elevation * 0.42 + curParams.shimmer * 0.32 + channel.surge * 0.4 + sizeLift * 0.42);
        const dx = x - px;
        const dy = y - py;
        const angle = Math.atan2(dy, dx);

        ctx.strokeStyle = rgba(color, alpha * 0.56);
        ctx.lineWidth = Math.max(0.45, size * 0.52);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(x, y);
        ctx.stroke();

        ctx.fillStyle = rgba(color, alpha);
        ctx.beginPath();
        ctx.ellipse(x, y, size * (1.38 + channel.surge * 0.34), size * 0.7, angle, 0, TWO_PI);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawDeposits(ctx: CanvasRenderingContext2D): void {
    if (curParams.glow < 0.08 && eventLift < 0.03 && cue.bloom < 0.03) return;
    const depositColor = cue.mixForegroundColor(palette.accentWarm, seedOffset + 63) as Rgb;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let index = 0; index < channels.length; index += 1) {
      const channel = channels[index];
      const progress = 0.57 + seededUnit(channel.seed) * 0.27;
      const guide: SedimentTracer = { ...tracers[index], channel: index, crossOffset: 0 };
      for (const side of [-1, 1] as Side[]) {
        const point = pathPoint(guide, side, progress);
        const factors = computeExclusion(point.x, point.y, curExclusion);
        const pulse = smoothstep(Math.sin(time * 0.8 + channel.phase) * 0.5 + 0.5);
        const radius = 1 + channel.surge * 2.5 + cue.bloom * 2 + pulse * curParams.shimmer;
        const alpha = (0.03 + channel.surge * 0.14 + cue.bloom * 0.08 + curParams.glow * 0.045)
          * factors.alpha;
        ctx.fillStyle = rgba(depositColor, alpha);
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, TWO_PI);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function energizeChannels(intensity: number): void {
    const lift = clamp01(intensity);
    for (let index = 0; index < channels.length; index += 1) {
      const cadence = seededUnit(index * 41.5 + time * 7 + seedOffset);
      if (cadence < 0.36 + lift * 0.48) {
        channels[index].surge = Math.max(channels[index].surge, 0.28 + lift * 0.72);
      }
    }
    eventLift = Math.max(eventLift, lift);
  }

  return {
    setup(_q, _w, _h, _palette) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      isMobile = w < 768;
      seedOffset = 21 + seededUnit(w * 0.12 + h * 0.17) * 420;
      time = 0;
      bassRollingAvg = 0;
      eventLift = 0;
      trailAlpha = 0.09;
      cue = createCueEventState();
      buildChannels();
    },

    update(dt, params, audio, exclusion) {
      curParams = params;
      curAudio = audio;
      curExclusion = exclusion;
      cue.update(dt);
      if (hasReducedMotion()) return;

      const activity = audio.activity ?? audio.energy;
      const bass = audio.bass ?? 0;
      const highs = audio.highs ?? 0;
      const playing = audio.playing ?? 0;
      bassRollingAvg = bassRollingAvg * 0.96 + bass * 0.04;
      eventLift = Math.max(0, eventLift - dt * 0.32);
      trailAlpha = 0.07 + params.shimmer * 0.036 + cue.sweep * 0.024;
      time += dt * (0.18 + params.drift * 0.38 + activity * 0.11 + playing * 0.05 + cue.motion * 0.17);

      for (const channel of channels) {
        channel.surge = Math.max(0, channel.surge - dt * 0.52);
      }

      const count = visibleTracerPairs();
      for (let index = 0; index < count; index += 1) {
        const tracer = tracers[index];
        const surge = channels[tracer.channel].surge;
        const speed = tracer.rate
          * (0.66 + params.drift * 0.7 + highs * 0.58 + activity * 0.24 + surge * 0.8 + cue.motion * 0.32);
        tracer.progress += speed * dt / Math.max(1, h * 1.2);
        if (tracer.progress > 1) {
          tracer.progress -= 1;
          placeTracer(tracer, true);
        } else {
          placeTracer(tracer);
        }
      }
    },

    draw(_q, ctx) {
      const background = cue.mixBackgroundColor(palette.bgDark) as Rgb;
      ctx.fillStyle = rgba(background, trailAlpha);
      ctx.fillRect(0, 0, w, h);

      drawHaze(ctx);
      drawTerraces(ctx);
      if (hasReducedMotion()) return;

      drawChannels(ctx);
      drawSediment(ctx);
      drawDeposits(ctx);
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      const intensity = event.intensity ?? 0.5;
      if (event.type === 'spark-burst' || event.type === 'bloom-flash') {
        energizeChannels(0.4 + intensity * 0.6);
      }
      if (event.type === 'section-cue' || event.type === 'storm-release') {
        energizeChannels(0.26 + intensity * 0.54);
      }
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      isMobile = w < 768;
      seedOffset = 21 + seededUnit(w * 0.12 + h * 0.17) * 420;
      buildChannels();
    },

    destroy() {
      channels = [];
      tracers = [];
    },
  };
}
