import type { AudioSignal } from '../audio-signal';
import { computeExclusion } from '../exclusion';
import type { Palette } from '../palette';
import { resolveCongBrokenGridTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { createCueEventState } from './cue-event-state';

interface GridCell {
  x: number;
  y: number;
  width: number;
  height: number;
  alpha: number;
  seed: number;
  pulse: number;
  drift: number;
  tilt: number;
  broken: boolean;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function seeded(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export function createCongBrokenGrid(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let cells: GridCell[] = [];
  let cue = createCueEventState();
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };
  let fractureLift = 0;
  let fractureLiftTarget = 0.08;
  let beatPulse = 0;
  let beatClock = 0;
  let sectionCueCount = 0;

  let config = {
    cellSize: 48,
    baseAlpha: 0.034,
    breakChance: 0.2,
  };

  function buildCells() {
    cells = [];
    const cols = Math.ceil(w / config.cellSize) + 2;
    const rows = Math.ceil(h / config.cellSize) + 2;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const seed = row * cols + col;
        const broken = seeded(seed * 2.7) < config.breakChance;
        cells.push({
          x: col * config.cellSize - config.cellSize * 0.5,
          y: row * config.cellSize - config.cellSize * 0.5,
          width: config.cellSize * 0.7,
          height: config.cellSize * 0.7,
          alpha: config.baseAlpha * (0.45 + seeded(seed * 1.9) * 0.65),
          seed: seed,
          pulse: seeded(seed * 3.1),
          drift: seeded(seed * 5.3),
          tilt: (seeded(seed * 7.1) - 0.5) * 0.9,
          broken,
        });
      }
    }
  }

  return {
    setup(_q, _w, _h, _palette, _tuning) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      const tuning = resolveCongBrokenGridTuning(_tuning);
      config = {
        cellSize: Math.max(24, tuning.cellSize),
        baseAlpha: tuning.baseAlpha,
        breakChance: tuning.breakChance,
      };
      time = 0;
      cue = createCueEventState();
      fractureLift = 0;
      fractureLiftTarget = 0.08;
      beatPulse = 0;
      beatClock = 0;
      sectionCueCount = 0;
      buildCells();
    },

    update(dt, params, audio, exclusion) {
      curParams = params;
      curAudio = audio;
      curExclusion = exclusion;
      cue.update(dt);
      fractureLift = mix(fractureLift, fractureLiftTarget, 1 - Math.pow(0.001, dt));
      const activity = audio.activity ?? audio.energy;
      const beatTarget = Math.max(audio.transient, audio.bass * 0.42 + activity * 0.18);
      beatPulse = mix(beatPulse, beatTarget, 1 - Math.pow(0.0007, dt));
      beatClock += dt * (1.25 + params.drift * 1.6 + activity * 1.1 + beatPulse * 1.4);

      const reduced = typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) return;

      time += dt * (0.46 + params.drift * 1.1 + activity * 0.42 + audio.energy * 0.55 + audio.transient * 0.4 + cue.motion * 0.36 + fractureLift * 0.22 + beatPulse * 0.34);
    },

    draw(_q, ctx) {
      const [br, bg, bb] = palette.bgDark;
      ctx.fillStyle = `rgba(${br},${bg},${bb},0.1)`;
      ctx.fillRect(0, 0, w, h);

      const [ar, ag, ab] = palette.accentGlow;
      const [dr, dg, db] = palette.dotColor;
      const columns = Math.ceil(w / config.cellSize) + 2;
      const sweepWidth = Math.max(w * 0.18, config.cellSize * 4);
      const activity = curAudio.activity ?? curAudio.energy;
      const sweepX = ((time * (120 + curParams.drift * 220 + beatPulse * 90)) % (w + sweepWidth * 2)) - sweepWidth;
      const diagonalPhase = time * (1.4 + curParams.impulse * 1.6 + curAudio.mids * 0.9);
      const beatWave = Math.sin(beatClock * Math.PI * 2);

      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const col = i % columns;
        const row = Math.floor(i / columns);

        // Skip exclusion zone
        if (cell.x + cell.width > curExclusion.left && cell.x < curExclusion.right &&
            cell.y + cell.height > curExclusion.top && cell.y < curExclusion.bottom) continue;

        const cellCenterX = cell.x + cell.width * 0.5;
        const cellCenterY = cell.y + cell.height * 0.5;
        const sweep = Math.max(0, 1 - Math.abs(cellCenterX - sweepX) / sweepWidth);
        const diagonal = Math.sin(diagonalPhase + col * 0.44 + row * 0.27 + cell.pulse * Math.PI * 2) * 0.5 + 0.5;
        const beatDistance = Math.abs(((col + row * 0.72 + beatClock * 2.2) % 8) - 4) / 4;
        const beatGate = Math.max(0, 1 - beatDistance * 1.35) * (0.16 + beatPulse * 0.84);
        const centerFalloff = Math.max(0, 1 - Math.hypot((cellCenterX - w * 0.42) / w, (cellCenterY - h * 0.48) / h) * 1.8);
        const gate = Math.max(sweep * 0.95, diagonal * (0.56 + fractureLift * 0.24), beatGate, centerFalloff * beatPulse * 0.45, curAudio.transient * 0.8, fractureLift * 0.24);
        const pulse = Math.min(1, gate + curParams.glow * 0.25 + curAudio.bass * 0.24);

        const baseAlpha = cell.broken ? cell.alpha * 0.45 : cell.alpha;
        const noiseVal = q.noise(cell.seed * 0.11, time * 0.28, col * 0.03 + row * 0.04);
        const tint = Math.min(1, noiseVal * 0.28 + pulse * 0.35 + curParams.glow * 0.34 + curAudio.bass * 0.28 + activity * 0.12);
        const [r, g, b] = cue.mixForegroundColor([
          Math.round(mix(dr, ar, tint)),
          Math.round(mix(dg, ag, tint)),
          Math.round(mix(db, ab, tint)),
        ], cell.seed);
        const densityStep = cue.densityProgress(cell.seed);
        const alpha = baseAlpha * (0.55 + fractureLift * 0.45 + pulse * 1.7 + curParams.density * 1.1 + cue.focus * 0.55 + cue.grain * 0.38) * Math.max(0, Math.min(1, 1 + densityStep * 0.62));

        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;

        const jitter = 2 + fractureLift * 10 + curParams.turbulence * 12 + curAudio.highs * 6 + beatPulse * 8;
        const driftX = (q.noise(cell.seed * 0.2, time * 0.42, 1) - 0.5) * jitter;
        const driftY = (q.noise(cell.seed * 0.2, time * 0.36, 2) - 0.5) * jitter;
        const scale = 0.58 + pulse * 0.36 + curAudio.bass * 0.18 + beatPulse * beatGate * 0.18 + cue.sizeProgress(cell.seed) * 0.36;
        const cellW = cell.width * scale;
        const cellH = cell.height * (0.62 + pulse * 0.42);
        const x = cell.x + (cell.width - cellW) * 0.5 + driftX;
        const y = cell.y + (cell.height - cellH) * 0.5 + driftY;

        if (cell.broken) {
          const scatterCount = 3 + Math.floor(cell.drift * 5 + fractureLift * 5);
          for (let s = 0; s < scatterCount; s++) {
            const localPhase = time * (0.62 + s * 0.09) + cell.seed * 0.37 + s;
            const sx = x + cellW * (0.18 + q.noise(cell.seed + s * 11, localPhase, 0) * 0.64);
            const sy = y + cellH * (0.18 + q.noise(cell.seed + s * 17, localPhase, 1) * 0.64);
            const ssize = 1.4 + pulse * 3.2 + s * 0.18;
            ctx.fillRect(sx, sy, ssize, ssize);
          }
        } else {
          ctx.save();
          ctx.translate(x + cellW * 0.5, y + cellH * 0.5);
          ctx.rotate(cell.tilt * (0.08 + curParams.drift * 0.16 + pulse * 0.1 + beatPulse * 0.08) + beatWave * beatGate * 0.08);
          ctx.fillRect(-cellW * 0.5, -cellH * 0.5, cellW, cellH);
          if (pulse > 0.58) {
            ctx.strokeStyle = `rgba(${ar},${ag},${ab},${(pulse - 0.55) * 0.08})`;
            ctx.lineWidth = 1;
            ctx.strokeRect(-cellW * 0.5, -cellH * 0.5, cellW, cellH);
          }
          ctx.restore();
        }
      }

      const [sr, sg, sb] = cue.mixCenterColor([ar, ag, ab]);
      const sweepGradient = ctx.createLinearGradient(sweepX - sweepWidth, 0, sweepX + sweepWidth, 0);
      sweepGradient.addColorStop(0, `rgba(${sr},${sg},${sb},0)`);
      sweepGradient.addColorStop(0.5, `rgba(${sr},${sg},${sb},${0.025 + curParams.glow * 0.035 + curAudio.highs * 0.03 + cue.sweep * 0.06 + beatPulse * 0.035})`);
      sweepGradient.addColorStop(1, `rgba(${sr},${sg},${sb},0)`);
      ctx.fillStyle = sweepGradient;
      ctx.fillRect(sweepX - sweepWidth, 0, sweepWidth * 2, h);

      ctx.strokeStyle = `rgba(${dr},${dg},${db},${0.012 + curParams.shimmer * 0.055 + curAudio.highs * 0.035})`;
      ctx.lineWidth = 1;

      const scanY = (time * (46 + curParams.drift * 110 + curAudio.energy * 80)) % h;
      ctx.beginPath();
      ctx.moveTo(0, scanY);
      ctx.lineTo(w, scanY);
      ctx.stroke();

      const scanY2 = (scanY + h * 0.38) % h;
      ctx.beginPath();
      ctx.moveTo(0, scanY2);
      ctx.lineTo(w, scanY2);
      ctx.stroke();
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      if (event.type === 'section-cue') {
        sectionCueCount += 1;
        fractureLiftTarget = Math.max(fractureLiftTarget, Math.min(1, 0.12 + sectionCueCount * 0.14));
        beatPulse = Math.min(1, beatPulse + 0.28 + event.intensity * 0.36);
      }
      if (event.type === 'density-surge' || event.type === 'motion-drift' || event.type === 'glow-pulse' || event.type === 'bloom-flash' || event.type === 'grain-bloom') {
        fractureLiftTarget = Math.max(fractureLiftTarget, Math.min(1, 0.34 + event.intensity * 0.52));
      }
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      buildCells();
    },

    destroy() {
      // No persistent resources to clean
    },
  };
}
