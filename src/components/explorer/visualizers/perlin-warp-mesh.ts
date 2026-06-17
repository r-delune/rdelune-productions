/* ── perlin-warp-mesh Visualizer ─────────────────────────────
   Full-screen lattice of connected lines whose vertices are
   displaced by multi-octave Perlin noise. Bass drives warp
   amplitude; transients fire a radial ripple pulse from center.
──────────────────────────────────────────────────────────────── */

import type { Palette } from '../palette';
import type { Visualizer, VisualParams, VisualEvent, ExclusionRect } from '../visualizer';
import type { AudioSignal } from '../audio-signal';
import { createCueEventState } from './cue-event-state';

const COLS = 32;
const ROWS = 20;
const NOISE_SCALE = 0.11;
const RIPPLE_SPEED = 480;   // px/s radial expansion
const RIPPLE_WIDTH = 90;    // px half-band width
const RIPPLE_DECAY = 2.4;   // strength decay rate

export function createPerlinWarpMesh(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;

  let curParams: VisualParams = { turbulence: 0.3, density: 0.5, glow: 0.2, drift: 0.3, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };

  // Ripple state — triggered by transient
  let rippleStrength = 0;
  let rippleAge = 0;
  let prevTransient = 0;

  // Noise seed offsets for x and y displacement independence
  let seedX = 0;
  let seedY = 0;

  let cue = createCueEventState();

  // Pre-allocated vertex buffer [row][col] = {dx, dy}
  const verts: Array<Array<{ x: number; y: number }>> = [];

  function initVerts() {
    verts.length = 0;
    for (let r = 0; r < ROWS; r++) {
      const row: Array<{ x: number; y: number }> = [];
      for (let c = 0; c < COLS; c++) {
        row.push({ x: 0, y: 0 });
      }
      verts.push(row);
    }
  }

  return {
    setup(_q, _w, _h, _palette) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      seedX = Math.random() * 300;
      seedY = Math.random() * 300 + 400;
      cue = createCueEventState();
      initVerts();
    },

    update(dt, params, audio, _exclusion: ExclusionRect) {
      curParams = params;
      curAudio = audio;
      cue.update(dt);

      const reduced = typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) return;

      const activity = audio.activity ?? audio.energy;
      const speed = 0.08 + params.drift * 0.18 + activity * 0.12 + (audio.playing ?? 0) * 0.06 + cue.motion * 0.1;
      time += dt * speed;

      // Trigger ripple on transient spike
      if (audio.transient > 0.55 && audio.transient > prevTransient + 0.2) {
        rippleStrength = Math.min(1, rippleStrength + audio.transient * 0.9);
        rippleAge = 0;
      }
      prevTransient = audio.transient;

      if (rippleStrength > 0.003) {
        rippleAge += dt;
        rippleStrength *= Math.exp(-dt * RIPPLE_DECAY);
      }
    },

    draw(_q, ctx) {
      const reduced = typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const cellW = w / (COLS - 1);
      const cellH = h / (ROWS - 1);

      const activity = curAudio.activity ?? curAudio.energy;
      const bass = curAudio.bass ?? 0;
      const mids = curAudio.mids ?? 0;

      // Warp amplitude: bass drives physical depth, turbulence adds chaos
      const warpX = cellW * (0.55 + curParams.turbulence * 0.65 + bass * 0.55 + cue.motion * 0.22);
      const warpY = cellH * (0.45 + curParams.turbulence * 0.55 + bass * 0.45 + cue.motion * 0.18);

      // Secondary octave speed driven by mids
      const t2 = time * (1.6 + mids * 0.8);

      // Ripple geometry
      const cx = w * 0.5;
      const cy = h * 0.5;
      const rippleRadius = rippleAge * RIPPLE_SPEED;

      // Build displaced vertex positions
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const bx = c * cellW;
          const by = r * cellH;

          const nx = bx * NOISE_SCALE + seedX;
          const ny = by * NOISE_SCALE + seedY;

          // Primary noise layer
          const n1x = (q.noise(nx, ny, time) - 0.5) * 2;
          const n1y = (q.noise(nx + 50, ny + 50, time) - 0.5) * 2;

          // Secondary (finer detail, faster)
          const n2x = (q.noise(nx * 2.1, ny * 2.1, t2) - 0.5) * 2;
          const n2y = (q.noise(nx * 2.1 + 70, ny * 2.1 + 70, t2) - 0.5) * 2;

          const blend = 0.72 + curParams.turbulence * 0.22;
          let dx = (n1x * blend + n2x * (1 - blend)) * warpX;
          let dy = (n1y * blend + n2y * (1 - blend)) * warpY;

          // Add radial ripple displacement
          if (rippleStrength > 0.003) {
            const dist = Math.hypot(bx - cx, by - cy);
            const diff = dist - rippleRadius;
            if (Math.abs(diff) < RIPPLE_WIDTH) {
              const band = 1 - Math.abs(diff) / RIPPLE_WIDTH;
              const push = band * band * rippleStrength * 24;
              const ang = Math.atan2(by - cy, bx - cx);
              dx += Math.cos(ang) * push;
              dy += Math.sin(ang) * push;
            }
          }

          verts[r][c].x = bx + dx;
          verts[r][c].y = by + dy;
        }
      }

      // Line color: blend between dotColor and accentGlow by glow param
      const glowT = Math.min(1, curParams.glow + cue.focus * 0.5 + activity * 0.18);
      const [dr, dg, db] = cue.mixParticleColor(palette.dotColor, seedX);
      const [ar, ag, ab] = cue.mixCenterColor(palette.accentGlow);
      const lr = Math.round(dr + (ar - dr) * glowT);
      const lg = Math.round(dg + (ag - dg) * glowT);
      const lb = Math.round(db + (ab - db) * glowT);

      // Line alpha
      const baseAlpha = 0.06 + curParams.density * 0.1 + activity * 0.06 + curParams.glow * 0.06 + cue.bloom * 0.08;
      const alpha = Math.min(0.32, baseAlpha * (reduced ? 0.5 : 1));
      const lineWidth = 0.45 + curParams.glow * 0.5 + bass * 0.4;

      ctx.strokeStyle = `rgba(${lr},${lg},${lb},${alpha.toFixed(4)})`;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';

      // Draw horizontal rows
      ctx.beginPath();
      for (let r = 0; r < ROWS; r++) {
        ctx.moveTo(verts[r][0].x, verts[r][0].y);
        for (let c = 1; c < COLS; c++) {
          ctx.lineTo(verts[r][c].x, verts[r][c].y);
        }
      }
      ctx.stroke();

      // Draw vertical columns with slightly higher alpha for depth
      ctx.strokeStyle = `rgba(${lr},${lg},${lb},${(alpha * 0.72).toFixed(4)})`;
      ctx.beginPath();
      for (let c = 0; c < COLS; c++) {
        ctx.moveTo(verts[0][c].x, verts[0][c].y);
        for (let r = 1; r < ROWS; r++) {
          ctx.lineTo(verts[r][c].x, verts[r][c].y);
        }
      }
      ctx.stroke();
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
    },

    destroy() {
      verts.length = 0;
    },
  };
}
