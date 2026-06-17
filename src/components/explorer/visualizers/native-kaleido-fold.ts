import type { AudioSignal } from '../audio-signal';
import { hsbToRgb, rgbToHsb, type Palette } from '../palette';
import { resolveNativeKaleidoFoldTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import {
  clamp01,
  createSeededRandom,
  getParticleBudget,
  hasReducedMotion,
  mix,
} from './cong-particle-primitives';
import { createCueEventState } from './cue-event-state';

/* ── Native Kaleido Fold ─────────────────────────────────────
   Dihedral mirror-fold symmetry: sparse flow filaments rendered
   into a small offscreen buffer, composited as 2N alternating
   mirror copies. Distinct from cong-tidal-mirror's rotational
   arms — every other slice is reflected, so forms meet at the
   fold seams like slow ambient mandala glass. The center stays
   veiled to avoid a diagrammatic target look.
──────────────────────────────────────────────────────────────── */

interface FoldFilament {
  x: number;
  y: number;
  vx: number;
  vy: number;
  seed: number;
  depth: number;
  size: number;
}

const FOLD_MIN = 3;
const FOLD_MAX = 9;
const FOLD_BLEND_SECONDS = 2.4;

function shiftedColor(color: [number, number, number], hueShift: number): [number, number, number] {
  if (Math.abs(hueShift) < 0.01) return color;
  const hsb = rgbToHsb(color[0], color[1], color[2]);
  return hsbToRgb(hsb.h + hueShift, hsb.s, hsb.b);
}

export function createNativeKaleidoFold(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let rotation = 0;
  let foldCount = 5;
  let prevFoldCount = 5;
  let foldBlend = 1;
  let sectionCueCount = 0;
  let seamPulse = 0;
  let breath = 0;
  let filaments: FoldFilament[] = [];
  let buffer: HTMLCanvasElement | null = null;
  let bufferCtx: CanvasRenderingContext2D | null = null;
  let bufferSize = 0;
  let cue = createCueEventState();
  let random = createSeededRandom(51877);
  let config = {
    foldCount: 5,
    foldDriftSpeed: 0.05,
    wedgeParticleCount: 120,
    seamGlow: 0.4,
    centerVeil: 0.55,
    bufferScale: 0.62,
  };
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };

  function buildField(): void {
    random = createSeededRandom(51877 + Math.round(w + h * 0.7));
    bufferSize = Math.max(96, Math.round(Math.min(w, h) * config.bufferScale * (w < 768 ? 0.7 : 1)));
    buffer = document.createElement('canvas');
    buffer.width = bufferSize;
    buffer.height = bufferSize;
    bufferCtx = buffer.getContext('2d');
    filaments = [];
    const count = getParticleBudget(config.wedgeParticleCount, w);
    for (let index = 0; index < count; index += 1) {
      filaments.push(spawnFilament(true));
    }
  }

  function spawnFilament(scatter: boolean): FoldFilament {
    const angle = random() * Math.PI * 2;
    const radius = scatter ? random() * bufferSize * 0.48 : bufferSize * (0.06 + random() * 0.1);
    return {
      x: bufferSize * 0.5 + Math.cos(angle) * radius,
      y: bufferSize * 0.5 + Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
      seed: random() * 900,
      depth: random(),
      size: 0.6 + random() * 1.7,
    };
  }

  function advanceFilament(filament: FoldFilament, dt: number): void {
    const noiseScale = 0.0042 + curParams.turbulence * 0.0022;
    const angle = q.noise(filament.x * noiseScale, filament.y * noiseScale, time * 0.07 + filament.seed) * Math.PI * 4;
    const speed = (5 + curParams.drift * 16 + curAudio.energy * 9 + cue.motion * 7) * (0.5 + filament.depth * 0.7);
    // Gentle outward bias keeps content radiating from the veiled center.
    const cx = bufferSize * 0.5;
    const dx = filament.x - cx;
    const dy = filament.y - cx;
    const dist = Math.max(1, Math.hypot(dx, dy));
    filament.vx = mix(filament.vx, Math.cos(angle) * speed + (dx / dist) * speed * 0.22, 1 - Math.pow(0.002, dt));
    filament.vy = mix(filament.vy, Math.sin(angle) * speed + (dy / dist) * speed * 0.22, 1 - Math.pow(0.002, dt));
    filament.x += filament.vx * dt;
    filament.y += filament.vy * dt;
    if (dist > bufferSize * 0.52) {
      const next = spawnFilament(false);
      filament.x = next.x;
      filament.y = next.y;
      filament.vx = 0;
      filament.vy = 0;
    }
  }

  function paintBuffer(dt: number): void {
    if (!bufferCtx) return;
    const ctx = bufferCtx;
    // Fade existing trails toward transparency so the composite stays soft.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0,0,0,${0.045 + curParams.turbulence * 0.03})`;
    ctx.fillRect(0, 0, bufferSize, bufferSize);
    ctx.globalCompositeOperation = 'source-over';

    const sparkle = curParams.shimmer * 0.5 + curAudio.highs * 0.5;
    for (let index = 0; index < filaments.length; index += 1) {
      const filament = filaments[index];
      if (!hasReducedMotion()) advanceFilament(filament, dt);
      const base = index % 2 === 0 ? palette.accentGlow : palette.accentWarm;
      const tinted = shiftedColor(base, curParams.hueShift);
      const [red, green, blue] = cue.mixParticleColor(tinted, filament.seed);
      const flicker = q.noise(filament.seed, time * 0.4) * sparkle;
      const alpha = clamp01(0.05 + curParams.density * 0.08 + filament.depth * 0.05 + flicker * 0.1);
      const radius = filament.size * (0.7 + curParams.glow * 0.5 + curAudio.mids * 0.4 + cue.bloom * 0.5);
      ctx.fillStyle = `rgba(${red},${green},${blue},${alpha})`;
      ctx.beginPath();
      ctx.arc(filament.x, filament.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawFoldSet(ctx: CanvasRenderingContext2D, cx: number, cy: number, folds: number, alpha: number, scale: number): void {
    if (!buffer || alpha <= 0.002) return;
    const slices = folds * 2;
    const step = Math.PI / folds;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.scale(scale, scale);
    for (let slice = 0; slice < slices; slice += 1) {
      ctx.save();
      ctx.rotate(slice * step);
      if (slice % 2 === 1) ctx.scale(1, -1);
      ctx.globalAlpha = alpha;
      ctx.drawImage(buffer, -bufferSize * 0.5, -bufferSize * 0.5);
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  return {
    setup(_q, _w, _h, _palette, _tuning) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      const tuning = resolveNativeKaleidoFoldTuning(_tuning);
      config = {
        foldCount: tuning.foldCount,
        foldDriftSpeed: tuning.foldDriftSpeed,
        wedgeParticleCount: tuning.wedgeParticleCount,
        seamGlow: tuning.seamGlow,
        centerVeil: tuning.centerVeil,
        bufferScale: tuning.bufferScale,
      };
      time = 0;
      rotation = 0;
      foldCount = Math.max(FOLD_MIN, Math.min(FOLD_MAX, config.foldCount));
      prevFoldCount = foldCount;
      foldBlend = 1;
      sectionCueCount = 0;
      seamPulse = 0;
      breath = 0;
      cue = createCueEventState();
      buildField();
    },

    update(dt, params, audio) {
      curParams = params;
      curAudio = audio;
      cue.update(dt);
      seamPulse = Math.max(0, seamPulse - dt * 1.4);
      if ((audio.bassOnset ?? 0) > 0.55) {
        seamPulse = Math.max(seamPulse, clamp01(audio.bassOnset ?? 0));
      }
      breath = mix(breath, audio.bass * 0.6 + (audio.beatPulse ?? 0) * 0.4, 1 - Math.pow(0.01, dt));
      foldBlend = Math.min(1, foldBlend + dt / FOLD_BLEND_SECONDS);
      if (hasReducedMotion()) return;
      time += dt * (0.4 + params.drift * 0.9 + audio.energy * 0.25 + cue.motion * 0.2);
      rotation += dt * (config.foldDriftSpeed * (0.6 + params.drift * 0.8) + cue.sweep * 0.02);
      paintBuffer(dt);
    },

    draw(_q, ctx) {
      const cx = w * 0.46;
      const cy = h * 0.5;
      const scale = (Math.min(w, h) / Math.max(1, bufferSize)) * (0.92 + breath * 0.07 + cue.bloom * 0.04);

      const presence = 0.5 + curParams.density * 0.3 + curParams.glow * 0.2;
      if (foldBlend < 1 && prevFoldCount !== foldCount) {
        drawFoldSet(ctx, cx, cy, prevFoldCount, presence * (1 - foldBlend), scale);
        drawFoldSet(ctx, cx, cy, foldCount, presence * foldBlend, scale);
      } else {
        drawFoldSet(ctx, cx, cy, foldCount, presence, scale);
      }

      // Faint seam glow along fold axes, lifted briefly by bass onsets.
      const seamStrength = config.seamGlow * (0.12 + seamPulse * 0.55 + cue.bloom * 0.2);
      if (seamStrength > 0.02) {
        const tint = cue.mixForegroundColor(shiftedColor(palette.accentWarm, curParams.hueShift));
        const reach = Math.min(w, h) * (0.34 + breath * 0.05);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(cx, cy);
        ctx.rotate(rotation);
        ctx.strokeStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},${clamp01(seamStrength * 0.08)})`;
        ctx.lineWidth = 0.8 + seamPulse * 1.2;
        for (let fold = 0; fold < foldCount; fold += 1) {
          const angle = (Math.PI / foldCount) * fold * 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(angle) * reach * 0.2, Math.sin(angle) * reach * 0.2);
          ctx.lineTo(Math.cos(angle) * reach, Math.sin(angle) * reach);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Misty center veil — keeps the fold origin soft, never a bullseye.
      const [vr, vg, vb] = cue.mixBackgroundColor(palette.bgDark);
      const veilRadius = Math.min(w, h) * (0.16 + (1 - curParams.glow) * 0.05);
      const veil = ctx.createRadialGradient(cx, cy, 0, cx, cy, veilRadius);
      veil.addColorStop(0, `rgba(${vr},${vg},${vb},${clamp01(config.centerVeil * (0.6 - cue.focus * 0.25))})`);
      veil.addColorStop(1, `rgba(${vr},${vg},${vb},0)`);
      ctx.fillStyle = veil;
      ctx.fillRect(0, 0, w, h);
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      const impulse = clamp01(event.intensity);
      if (event.type === 'section-cue') {
        sectionCueCount += 1;
        const steps = [0, 1, -1, 2];
        const next = Math.max(FOLD_MIN, Math.min(FOLD_MAX, config.foldCount + steps[sectionCueCount % steps.length]));
        if (next !== foldCount) {
          prevFoldCount = foldCount;
          foldCount = next;
          foldBlend = 0;
        }
      }
      if (event.type === 'spark-burst' || event.type === 'bloom-flash' || event.type === 'storm-release') {
        seamPulse = Math.max(seamPulse, impulse);
      }
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      buildField();
    },

    destroy() {
      filaments = [];
      buffer = null;
      bufferCtx = null;
      q = undefined;
    },
  };
}
