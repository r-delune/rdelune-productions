import type { AudioSignal } from '../audio-signal';
import { hsbToRgb } from '../palette';
import type { Palette } from '../palette';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { createCueEventState } from './cue-event-state';

const VERTEX_COUNT = 30;
const TAU = Math.PI * 2;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function hasReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Catmull-Rom closed spline — Canvas2D equivalent of p5 beginShape/curveVertex/endShape(CLOSE) */
function drawCatmullRom(ctx: CanvasRenderingContext2D, pts: Array<[number, number]>): void {
  const n = pts.length;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < n; i += 1) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2[0], p2[1]);
  }
  ctx.closePath();
}

interface VortexShape {
  phaseOffset: number;    // rotational phase in noise space
  noiseZOffset: number;   // per-shape Perlin z-slice offset
  scaleMultiplier: number;
}

export function createCongColourVortex(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let params: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let audio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let time = 0;
  let noiseZ = 0;
  let phase = 0;
  let sectionCueCount = 0;
  let burst = 0;
  let barPulse = 0;
  let cue = createCueEventState();
  let feedbackCanvas: HTMLCanvasElement;
  let feedbackCtx: CanvasRenderingContext2D;

  const shapes: VortexShape[] = [];

  function buildShapes(): void {
    shapes.length = 0;
    const count = phase === 0 ? 2 : phase === 1 ? 3 : phase === 2 ? 5 : 7;
    for (let i = 0; i < count; i += 1) {
      shapes.push({
        phaseOffset: (i / count) * TAU,
        noiseZOffset: i * 4.7,
        scaleMultiplier: 0.7 + (i / Math.max(1, count - 1)) * 0.6,
      });
    }
  }

  function drawShape(ctx: CanvasRenderingContext2D, shape: VortexShape, cx: number, cy: number, baseRadius: number): void {
    const pts: Array<[number, number]> = [];
    const noiseZValue = noiseZ + shape.noiseZOffset;
    const noiseDrive = 0.6 + params.turbulence * 0.8 + burst * 0.4;

    for (let i = 0; i < VERTEX_COUNT; i += 1) {
      const angle = (i / VERTEX_COUNT) * TAU + shape.phaseOffset;
      const xx = Math.cos(angle);
      const yy = Math.sin(angle);
      const n = q.noise(xx + 10, yy + 10, noiseZValue);
      const r = baseRadius * shape.scaleMultiplier * (0.38 + n * noiseDrive);
      pts.push([cx + xx * r, cy + yy * r]);
    }

    drawCatmullRom(ctx, pts);
  }

  return {
    setup(_q, _w, _h, _palette) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      time = 0;
      noiseZ = 0;
      phase = 0;
      sectionCueCount = 0;
      burst = 0;
      barPulse = 0;
      cue = createCueEventState();

      feedbackCanvas = document.createElement('canvas');
      feedbackCanvas.width = w;
      feedbackCanvas.height = h;
      feedbackCtx = feedbackCanvas.getContext('2d')!;

      // Seed feedback canvas with background
      const [br, bg, bb] = _palette.bgDark;
      feedbackCtx.fillStyle = `rgb(${br},${bg},${bb})`;
      feedbackCtx.fillRect(0, 0, w, h);

      buildShapes();
    },

    update(dt, nextParams, nextAudio, _exclusion: ExclusionRect) {
      params = nextParams;
      audio = nextAudio;
      cue.update(dt);
      burst = Math.max(0, burst - dt * 2.0);
      barPulse = Math.max(0, barPulse - dt * 3.8);
      if (audio.transient > 0.18) {
        burst = Math.max(burst, audio.transient * 0.85);
      }
      time += dt * (0.28 + params.drift * 0.5 + cue.motion * 0.3 + barPulse * 0.16 + audio.energy * 0.42);
      noiseZ += dt * (0.01 + params.drift * 0.008 + cue.motion * 0.005 + barPulse * 0.012 + audio.mids * 0.006);
    },

    draw(_q, ctx) {
      if (hasReducedMotion()) {
        const [br, bg, bb] = palette.bgDark;
        ctx.fillStyle = `rgb(${br},${bg},${bb})`;
        ctx.fillRect(0, 0, w, h);
        return;
      }

      const cx = w / 2 + audio.bass * (w * 0.04) * Math.cos(time * 0.7);
      const cy = h / 2 + audio.bass * (h * 0.04) * Math.sin(time * 0.5);
      const baseRadius = Math.min(w, h) * (0.22 + params.density * 0.14 + audio.energy * 0.08 + audio.bass * 0.12 + burst * 0.08 + barPulse * 0.045);

      // === Feedback zoom + rotate on the feedback canvas ===
      const zoomRate = 1 - (0.003 + params.drift * 0.005 + cue.motion * 0.002 + barPulse * 0.002);
      const rotRate = (0.002 + params.drift * 0.003) * (phase % 2 === 0 ? 1 : -1);
      feedbackCtx.save();
      feedbackCtx.translate(cx, cy);
      feedbackCtx.scale(zoomRate, zoomRate);
      feedbackCtx.rotate(rotRate);
      feedbackCtx.translate(-cx, -cy);
      feedbackCtx.globalAlpha = 0.96;
      feedbackCtx.drawImage(feedbackCanvas, 0, 0);
      feedbackCtx.restore();
      feedbackCtx.globalAlpha = 1;

      // Fade toward background
      const [br, bg, bb] = cue.mixBackgroundColor(palette.bgDark);
      feedbackCtx.fillStyle = `rgba(${br},${bg},${bb},${0.04 + params.density * 0.02})`;
      feedbackCtx.fillRect(0, 0, w, h);

      // === Draw vortex shapes onto feedback canvas ===
      for (let si = 0; si < shapes.length; si += 1) {
        const shape = shapes[si];

        // Hue: cycles with time, anchored to palette, shifted per shape
        const hueStep = phase >= 2 ? 28 + params.hueShift * 1.2 : 12 + params.hueShift * 0.6;
        const hue = ((palette.baseHue + time * 18 + si * hueStep + params.hueShift) % 360 + 360) % 360;
        const saturation = 0.72 + params.glow * 0.22 + cue.bloom * 0.1;
        const brightness = 0.55 + params.shimmer * 0.22 + burst * 0.15 + barPulse * 0.12;
        const [r, g, b] = cue.mixParticleColor(hsbToRgb(hue, saturation, brightness), si * 0.37);
        const alpha = clamp01(
          0.08 + params.glow * 0.12 + cue.bloom * 0.1 + burst * 0.12 + barPulse * 0.08
          - si * 0.008 // outer shapes slightly more transparent
        );

        feedbackCtx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        // NO strokeStyle — pure fill, no outlines
        drawShape(feedbackCtx, shape, cx, cy, baseRadius);
        feedbackCtx.fill();
      }

      // Output feedback canvas to main canvas
      ctx.drawImage(feedbackCanvas, 0, 0, w, h);
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      const intensity = clamp01(event.intensity ?? 0.5);
      if (event.type === 'section-cue') {
        sectionCueCount += 1;
        const nextPhase = event.sectionIndex ?? sectionCueCount;
        if (nextPhase !== phase) {
          phase = Math.min(3, nextPhase);
          buildShapes();
        }
        burst = Math.max(burst, 0.5 + intensity * 0.45);
      }
      if (event.type === 'bar-cue') {
        barPulse = Math.max(barPulse, 0.52 + intensity * 0.38);
        burst = Math.max(burst, 0.12 + intensity * 0.16);
      }
      if (event.type === 'bloom-flash' || event.type === 'spark-burst' || event.type === 'storm-release') {
        burst = Math.max(burst, 0.35 + intensity * 0.55);
      }
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      feedbackCanvas.width = w;
      feedbackCanvas.height = h;
      const [br, bg, bb] = palette.bgDark;
      feedbackCtx.fillStyle = `rgb(${br},${bg},${bb})`;
      feedbackCtx.fillRect(0, 0, w, h);
    },

    destroy() {
      feedbackCanvas.width = 0;
      feedbackCanvas.height = 0;
    },
  };
}
