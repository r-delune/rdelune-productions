import type { AudioSignal } from '../audio-signal';
import type { Palette } from '../palette';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { createCueEventState } from './cue-event-state';

interface PulseTile {
  x: number;
  y: number;
  size: number;
  seed: number;
  phase: number;
  column: number;
  row: number;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function seeded(seed: number): number {
  const value = Math.sin(seed * 42.127 + 19.19) * 9731.33;
  return value - Math.floor(value);
}

export function createCongGridPulse(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let eventPulse = 0;
  let cue = createCueEventState();
  let tiles: PulseTile[] = [];
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };
  let structureLift = 0;
  let structureLiftTarget = 0.08;
  let sectionCueCount = 0;

  const cell = 42;

  function rebuild() {
    tiles = [];
    const cols = Math.ceil(w / cell) + 4;
    const rows = Math.ceil(h / cell) + 4;

    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < cols; column++) {
        const seed = row * cols + column;
        tiles.push({
          x: column * cell - cell * 1.5,
          y: row * cell - cell * 1.5,
          size: cell * (0.28 + seeded(seed * 3.2) * 0.42),
          seed,
          phase: seeded(seed * 7.5) * Math.PI * 2,
          column,
          row,
        });
      }
    }
  }

  return {
    setup(_q, _w, _h, _palette) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      time = 0;
      eventPulse = 0;
      cue = createCueEventState();
      structureLift = 0;
      structureLiftTarget = 0.08;
      sectionCueCount = 0;
      rebuild();
    },

    update(dt, params, audio, exclusion) {
      curParams = params;
      curAudio = audio;
      curExclusion = exclusion;
      eventPulse = Math.max(0, eventPulse - dt * 1.8);
      cue.update(dt);
      structureLift = mix(structureLift, structureLiftTarget, 1 - Math.pow(0.001, dt));

      const reduced = typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) return;

      time += dt * (0.62 + params.drift * 1.6 + audio.energy * 0.55 + eventPulse * 0.35 + cue.motion * 0.42 + structureLift * 0.22);
    },

    draw(_q, ctx) {
      const [br, bg, bb] = cue.mixBackgroundColor(palette.bgDark);
      const [ar, ag, ab] = cue.mixCenterColor(palette.accentGlow);
      const [dr, dg, db] = palette.dotColor;
      const densityGate = 0.28 + structureLift * 0.24 + curParams.density * 0.58;
      const sweep = (time * (1.15 + curParams.drift * 1.5)) % 12;

      ctx.fillStyle = `rgba(${br},${bg},${bb},0.12)`;
      ctx.fillRect(0, 0, w, h);

      for (const tile of tiles) {
        if (seeded(tile.seed * 9.1) > densityGate) continue;

        const x = tile.x + Math.sin(time * 0.7 + tile.phase) * curParams.turbulence * 10;
        const y = tile.y + Math.cos(time * 0.55 + tile.phase) * curParams.turbulence * 8;
        if (x + tile.size > curExclusion.left && x < curExclusion.right &&
            y + tile.size > curExclusion.top && y < curExclusion.bottom) continue;

        const wave = Math.sin(time * 2.2 + tile.column * 0.42 + tile.row * 0.23 + tile.phase) * 0.5 + 0.5;
        const band = Math.max(0, 1 - Math.abs(((tile.column + tile.row * 0.45) % 12) - sweep) / 2.6);
        const noise = q.noise(tile.seed * 0.05, time * 0.22, 1);
        const pulse = Math.min(1, wave * (0.38 + structureLift * 0.16) + band * 0.72 + curAudio.bass * 0.22 + eventPulse * 0.55 + structureLift * 0.18);
        const tint = Math.min(1, noise * 0.24 + pulse * 0.48 + curParams.glow * 0.3);
        const [r, g, b] = cue.mixForegroundColor(cue.mixTerrainColor([
          Math.round(mix(dr, ar, tint)),
          Math.round(mix(dg, ag, tint)),
          Math.round(mix(db, ab, tint)),
        ], tile.seed), tile.seed + 29.5);
        const densityStep = cue.densityProgress(tile.seed);
        const alpha = (0.022 + structureLift * 0.018 + pulse * 0.12 + curParams.shimmer * 0.026 + curAudio.highs * 0.04 + cue.focus * 0.018) * Math.max(0, Math.min(1, 1 + densityStep * 0.6));
        const stretch = 0.9 + structureLift * 0.32 + pulse * 1.4 + curParams.impulse * 0.7 + cue.motion * 0.28 + cue.sizeProgress(tile.seed) * 0.42;
        const rotation = (tile.phase - Math.PI) * 0.08 + Math.sin(time + tile.phase) * (0.08 + curParams.drift * 0.14);

        ctx.save();
        ctx.translate(x + tile.size * 0.5, y + tile.size * 0.5);
        ctx.rotate(rotation);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.fillRect(-tile.size * 0.5, -tile.size * 0.5, tile.size * stretch, tile.size * (0.62 + pulse * 0.38));

        if (pulse > 0.68) {
          ctx.strokeStyle = `rgba(${ar},${ag},${ab},${(pulse - 0.68) * 0.18})`;
          ctx.lineWidth = 1;
          ctx.strokeRect(-tile.size * 0.5, -tile.size * 0.5, tile.size * stretch, tile.size * (0.62 + pulse * 0.38));
        }
        ctx.restore();
      }

      const scanX = (time * (80 + curParams.drift * 180)) % (w + cell * 4) - cell * 2;
      const [sr, sg, sb] = cue.mixCenterColor([ar, ag, ab]);
      const gradient = ctx.createLinearGradient(scanX - cell * 3, 0, scanX + cell * 3, 0);
      gradient.addColorStop(0, `rgba(${sr},${sg},${sb},0)`);
      gradient.addColorStop(0.5, `rgba(${sr},${sg},${sb},${0.02 + curParams.glow * 0.04 + cue.sweep * 0.05})`);
      gradient.addColorStop(1, `rgba(${sr},${sg},${sb},0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(scanX - cell * 3, 0, cell * 6, h);
    },

    onEvent(event: VisualEvent) {
      eventPulse = Math.max(eventPulse, event.intensity);
      cue.handle(event, palette);
      if (event.type === 'section-cue') {
        sectionCueCount += 1;
        structureLiftTarget = Math.max(structureLiftTarget, Math.min(1, 0.12 + sectionCueCount * 0.14));
      }
      if (event.type === 'density-surge' || event.type === 'motion-drift' || event.type === 'glow-pulse' || event.type === 'bloom-flash') {
        structureLiftTarget = Math.max(structureLiftTarget, Math.min(1, 0.36 + event.intensity * 0.5));
      }
      if (event.type === 'color-morph' || event.type === 'palette-morph' || event.type === 'spark-burst') {
        structureLiftTarget = Math.max(structureLiftTarget, Math.min(1, 0.28 + event.intensity * 0.46));
      }
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      rebuild();
    },

    destroy() {
      tiles = [];
    },
  };
}
