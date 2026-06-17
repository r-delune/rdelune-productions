import type { AudioSignal } from '../audio-signal';
import { hsbToRgb, rgbToHsb, type Palette } from '../palette';
import { getQualityScale } from '../render-quality';
import { resolveNativeReactionVeilTuning } from '../tuning';
import type { VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { clamp01, createSeededRandom, hasReducedMotion, mix } from './cong-particle-primitives';
import { createCueEventState } from './cue-event-state';

/* ── Native Reaction Veil ────────────────────────────────────
   Gray–Scott reaction–diffusion simulated on a low-resolution
   grid, rendered through a small ImageData canvas and upscaled
   with smoothing into a living organic veil. Feed/kill drift on
   a slow LFO and the grid reseeds on section cues so the
   pattern never freezes or dies. Bass onsets inject droplets.
──────────────────────────────────────────────────────────────── */

const DIFFUSION_U = 0.2097;
const DIFFUSION_V = 0.105;

function shiftedColor(color: [number, number, number], hueShift: number): [number, number, number] {
  if (Math.abs(hueShift) < 0.01) return color;
  const hsb = rgbToHsb(color[0], color[1], color[2]);
  return hsbToRgb(hsb.h + hueShift, hsb.s, hsb.b);
}

export function createNativeReactionVeil(): Visualizer {
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let gw = 0;
  let gh = 0;
  let u: Float32Array | null = null;
  let v: Float32Array | null = null;
  let nextU: Float32Array | null = null;
  let nextV: Float32Array | null = null;
  let gridCanvas: HTMLCanvasElement | null = null;
  let gridCtx: CanvasRenderingContext2D | null = null;
  let gridImage: ImageData | null = null;
  let cue = createCueEventState();
  let random = createSeededRandom(70313);
  let dropletQueue = 0;
  let renderParity = 0;
  let config = {
    gridScale: 160,
    feed: 0.037,
    kill: 0.0605,
    iterationsPerFrame: 6,
    injectStrength: 0.6,
    veilAlpha: 0.5,
  };
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };

  function buildGrid(): void {
    gw = w < 768 ? Math.round(config.gridScale * 0.6) : config.gridScale;
    gh = Math.max(24, Math.round(gw * (h / Math.max(1, w))));
    const cells = gw * gh;
    u = new Float32Array(cells).fill(1);
    v = new Float32Array(cells).fill(0);
    nextU = new Float32Array(cells);
    nextV = new Float32Array(cells);
    gridCanvas = document.createElement('canvas');
    gridCanvas.width = gw;
    gridCanvas.height = gh;
    gridCtx = gridCanvas.getContext('2d');
    gridImage = gridCtx ? gridCtx.createImageData(gw, gh) : null;
    seedSpots(8);
  }

  function seedSpots(count: number): void {
    if (!u || !v) return;
    for (let spot = 0; spot < count; spot += 1) {
      injectDroplet(random(), random(), 2 + Math.floor(random() * 3));
    }
  }

  function injectDroplet(unitX: number, unitY: number, radius: number): void {
    if (!v) return;
    const cx = Math.round(unitX * (gw - 1));
    const cy = Math.round(unitY * (gh - 1));
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= gw || y < 0 || y >= gh) continue;
        v[y * gw + x] = Math.min(1, v[y * gw + x] + config.injectStrength);
      }
    }
  }

  function step(feed: number, kill: number): void {
    if (!u || !v || !nextU || !nextV) return;
    for (let y = 0; y < gh; y += 1) {
      const up = y === 0 ? 0 : y - 1;
      const down = y === gh - 1 ? gh - 1 : y + 1;
      for (let x = 0; x < gw; x += 1) {
        const left = x === 0 ? 0 : x - 1;
        const right = x === gw - 1 ? gw - 1 : x + 1;
        const index = y * gw + x;
        const uc = u[index];
        const vc = v[index];
        const lapU = u[y * gw + left] + u[y * gw + right] + u[up * gw + x] + u[down * gw + x] - 4 * uc;
        const lapV = v[y * gw + left] + v[y * gw + right] + v[up * gw + x] + v[down * gw + x] - 4 * vc;
        const reaction = uc * vc * vc;
        nextU[index] = Math.min(1, Math.max(0, uc + DIFFUSION_U * lapU - reaction + feed * (1 - uc)));
        nextV[index] = Math.min(1, Math.max(0, vc + DIFFUSION_V * lapV + reaction - (feed + kill) * vc));
      }
    }
    const swapU = u;
    const swapV = v;
    u = nextU;
    v = nextV;
    nextU = swapU;
    nextV = swapV;
  }

  function renderGrid(): void {
    if (!v || !gridCtx || !gridImage) return;
    const data = gridImage.data;
    const lowColor = cue.mixBackgroundColor(palette.bgMid);
    const highColor = cue.mixMistColor(shiftedColor(palette.accentGlow, curParams.hueShift));
    const alphaScale = clamp01(config.veilAlpha * (0.6 + curParams.density * 0.3 + cue.grain * 0.2));
    for (let index = 0; index < v.length; index += 1) {
      const concentration = clamp01(v[index] * 2.4);
      const eased = concentration * concentration * (3 - 2 * concentration);
      const offset = index * 4;
      data[offset] = Math.round(mix(lowColor[0], highColor[0], eased));
      data[offset + 1] = Math.round(mix(lowColor[1], highColor[1], eased));
      data[offset + 2] = Math.round(mix(lowColor[2], highColor[2], eased));
      data[offset + 3] = Math.round(eased * alphaScale * 255);
    }
    gridCtx.putImageData(gridImage, 0, 0);
  }

  return {
    setup(_q, _w, _h, _palette, _tuning) {
      w = _w;
      h = _h;
      palette = _palette;
      const tuning = resolveNativeReactionVeilTuning(_tuning);
      config = {
        gridScale: tuning.gridScale,
        feed: tuning.feed,
        kill: tuning.kill,
        iterationsPerFrame: tuning.iterationsPerFrame,
        injectStrength: tuning.injectStrength,
        veilAlpha: tuning.veilAlpha,
      };
      time = 0;
      dropletQueue = 0;
      random = createSeededRandom(70313 + Math.round(w + h));
      cue = createCueEventState();
      buildGrid();
      // Pre-roll so section 1 opens alive rather than with bare seeds, and
      // render once so reduced-motion users get a stable non-blank frame.
      for (let warm = 0; warm < 90; warm += 1) step(config.feed, config.kill);
      renderGrid();
    },

    update(dt, params, audio) {
      curParams = params;
      curAudio = audio;
      cue.update(dt);
      if (hasReducedMotion()) return;
      time += dt;

      if ((audio.bassOnset ?? 0) > 0.5) dropletQueue += 1;
      while (dropletQueue > 0) {
        dropletQueue -= 1;
        injectDroplet(0.15 + random() * 0.7, 0.15 + random() * 0.7, 2 + Math.floor(random() * 2));
      }

      // Slow LFO plus gentle mids modulation keeps the pattern wandering
      // between growth regimes instead of settling or dying out.
      const feed = config.feed + Math.sin(time * 0.05) * 0.0024 + curAudio.mids * 0.0016;
      const kill = config.kill + Math.cos(time * 0.037) * 0.0012;
      const iterations = Math.max(2, Math.round(config.iterationsPerFrame * (0.7 + audio.energy * 0.5) * getQualityScale()));
      for (let iteration = 0; iteration < iterations; iteration += 1) {
        step(feed, kill);
      }
      // Re-render the grid canvas every other frame; the cached canvas still
      // composites every frame, so motion stays smooth at half the readback cost.
      renderParity = (renderParity + 1) % 2;
      if (renderParity === 0) renderGrid();
    },

    draw(_q, ctx) {
      if (!gridCanvas) return;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.globalAlpha = clamp01(0.65 + curParams.glow * 0.25 + cue.bloom * 0.15);
      ctx.drawImage(gridCanvas, 0, 0, gw, gh, 0, 0, w, h);
      ctx.restore();
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      const impulse = clamp01(event.intensity);
      if (event.type === 'section-cue') {
        seedSpots(2 + Math.round(impulse * 3));
      }
      if (event.type === 'spark-burst' || event.type === 'density-surge' || event.type === 'storm-release') {
        dropletQueue += 1 + Math.round(impulse * 2);
      }
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      buildGrid();
      for (let warm = 0; warm < 60; warm += 1) step(config.feed, config.kill);
      renderGrid();
    },

    destroy() {
      u = null;
      v = null;
      nextU = null;
      nextV = null;
      gridCanvas = null;
      gridCtx = null;
      gridImage = null;
    },
  };
}
