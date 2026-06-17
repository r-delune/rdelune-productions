import type { AudioSignal } from '../audio-signal';
import type { Palette } from '../palette';
import { resolveCongSparseConstellationTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { createCueEventState } from './cue-event-state';

interface ConstellationPair {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  alpha: number;
  speed: number;
  seed: number;
  size: number;
  connected: boolean;
  afterglow: number;
  tilt: number;
  layer: number;
  flicker: number;
  branch: number;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function createCongSparseConstellation(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let pairs: ConstellationPair[] = [];
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };
  let eventFlash = 0;
  let cue = createCueEventState();
  let growth = 0;
  let growthTarget = 0.28;
  let sectionCueCount = 0;

  let config = {
    pairCount: 34,
    baseAlpha: 0.052,
    connectionChance: 0.62,
  };

  function buildPairs() {
    pairs = [];
    for (let i = 0; i < config.pairCount; i++) {
      const layer = i / Math.max(1, config.pairCount - 1);
      const x1 = w * (0.07 + Math.random() * 0.72);
      const y1 = h * (0.1 + Math.random() * 0.8);
      const angle = Math.random() * Math.PI * 2;
      const dist = 42 + Math.random() * 150;
      const x2 = x1 + Math.cos(angle) * dist;
      const y2 = y1 + Math.sin(angle) * dist;
      
      pairs.push({
        x1, y1, x2, y2,
        alpha: config.baseAlpha * (0.65 + Math.random() * 1.25),
        speed: 0.06 + Math.random() * 0.18,
        seed: Math.random() * 1000,
        size: 1.7 + Math.random() * 3.6,
        connected: Math.random() < config.connectionChance,
        afterglow: i < 8 ? (i / 8) * 0.38 : Math.random(),
        tilt: angle,
        layer,
        flicker: Math.random(),
        branch: Math.random() < 0.44 ? -1 : Math.floor(Math.random() * Math.max(1, i)),
      });
    }
  }

  return {
    setup(_q, _w, _h, _palette, _tuning) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      const tuning = resolveCongSparseConstellationTuning(_tuning);
      config = {
        pairCount: Math.max(46, Math.round(tuning.pairCount * 2.25)),
        baseAlpha: Math.max(0.042, tuning.baseAlpha * 2.2),
        connectionChance: Math.min(0.86, Math.max(0.48, tuning.connectionChance + 0.24)),
      };
      time = 0;
      eventFlash = 0;
      cue = createCueEventState();
      growth = 0;
      growthTarget = 0.28;
      sectionCueCount = 0;
      buildPairs();
    },

    update(dt, params, audio, exclusion) {
      curParams = params;
      curAudio = audio;
      curExclusion = exclusion;
      cue.update(dt);

      const reduced = typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      eventFlash = Math.max(0, eventFlash - dt * 1.8);
      growth = mix(growth, growthTarget, 1 - Math.pow(0.001, dt));
      if (reduced) return;

      time += dt * (0.16 + params.drift * 0.72 + audio.energy * 0.16 + eventFlash * 0.08 + cue.motion * 0.18);
    },

    draw(_q, ctx) {
      const [br, bg, bb] = palette.bgDark;
      ctx.fillStyle = `rgba(${br},${bg},${bb},0.09)`;
      ctx.fillRect(0, 0, w, h);

      const [ar, ag, ab] = palette.accentGlow;
      const [wr, wg, wb] = palette.accentWarm;
      const [dr, dg, db] = palette.dotColor;
      const density = 0.72 + growth * 0.7 + curParams.density * 1.65 + curAudio.energy * 0.65;
      const glow = 0.78 + growth * 0.55 + curParams.glow * 1.8 + curParams.shimmer * 0.8 + curAudio.highs * 0.7 + eventFlash * 1.6 + cue.focus * 0.5;
      const drift = time * (0.8 + curParams.drift * 1.4);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        
        const driftX = Math.sin(drift * pair.speed + pair.seed) * (18 + pair.layer * 32 + curParams.turbulence * 18);
        const driftY = Math.cos(drift * pair.speed * 0.7 + pair.seed) * (12 + pair.layer * 18 + curParams.turbulence * 14);
        const shear = Math.sin(time * 0.09 + pair.seed) * curParams.turbulence * 42;
        
        const px1 = pair.x1 + driftX;
        const py1 = pair.y1 + driftY;
        const px2 = pair.x2 + driftX * 0.8 + shear;
        const py2 = pair.y2 + driftY * 0.8;
        
        const centerX = (px1 + px2) / 2;
        const centerY = (py1 + py2) / 2;
        if (centerX > curExclusion.left - 30 && centerX < curExclusion.right + 30 &&
            centerY > curExclusion.top - 30 && centerY < curExclusion.bottom + 30) continue;

        const afterglowPhase = (time * (0.08 + curParams.shimmer * 0.16) + pair.afterglow) % 1;
        const afterglow = afterglowPhase < 0.42 ? Math.sin((afterglowPhase / 0.42) * Math.PI) : 0;
        const flicker = 0.7 + Math.sin(time * (0.8 + pair.flicker * 2.2) + pair.seed) * 0.22;
        
        const noiseVal = q.noise(pair.seed * 0.1, time * 0.02, 0);
        const tint = Math.min(1, noiseVal * 0.34 + curParams.glow * 0.5 + curAudio.mids * 0.26 + pair.layer * 0.24);
        const warmTint = Math.max(0, tint - 0.52) * 1.8;
        const [r, g, b] = cue.mixForegroundColor([
          Math.round(mix(mix(dr, ar, tint), wr, warmTint)),
          Math.round(mix(mix(dg, ag, tint), wg, warmTint)),
          Math.round(mix(mix(db, ab, tint), wb, warmTint)),
        ], pair.seed);
        const densityStep = cue.densityProgress(pair.seed);
        const sizeStep = cue.sizeProgress(pair.seed);
        const eventAlpha = Math.max(0, Math.min(1, 1 + densityStep * 0.62));
        
        if (pair.connected) {
          const lineAlpha = pair.alpha * (0.5 + growth * 0.6 + curParams.density * 0.72 + afterglow * 0.5 + eventFlash * 0.8 + cue.sweep * 0.25) * flicker * eventAlpha;
          ctx.strokeStyle = `rgba(${r},${g},${b},${lineAlpha})`;
          ctx.lineWidth = 0.55 + curParams.shimmer * 0.95 + eventFlash * 0.8 + sizeStep * 0.5;
          ctx.beginPath();
          ctx.moveTo(px1, py1);
          const bendX = centerX + Math.cos(pair.tilt + Math.PI * 0.5) * (8 + curParams.turbulence * 34);
          const bendY = centerY + Math.sin(pair.tilt + Math.PI * 0.5) * (8 + curParams.turbulence * 28);
          ctx.quadraticCurveTo(bendX, bendY, px2, py2);
          ctx.stroke();
        }

        if (pair.branch >= 0 && pair.branch < i && i % 3 !== 1) {
          const target = pairs[pair.branch];
          const targetX = target.x1 + Math.sin(drift * target.speed + target.seed) * 18;
          const targetY = target.y1 + Math.cos(drift * target.speed * 0.7 + target.seed) * 12;
          const branchAlpha = pair.alpha * 0.34 * density * (0.45 + growth * 0.42 + eventFlash + cue.motion * 0.3) * eventAlpha;
          ctx.strokeStyle = `rgba(${r},${g},${b},${branchAlpha})`;
          ctx.lineWidth = 0.45;
          ctx.beginPath();
          ctx.moveTo(px1, py1);
          ctx.lineTo(targetX, targetY);
          ctx.stroke();
        }
        
        const pointAlpha = pair.alpha * density * (0.82 + afterglow * 0.8 + eventFlash * 1.25) * flicker * eventAlpha;
        const radius = pair.size * (0.72 + growth * 0.55 + curParams.density * 0.52 + afterglow * 0.4 + eventFlash * 0.8 + cue.bloom * 0.4 + sizeStep * 0.46);
        
        ctx.fillStyle = `rgba(${r},${g},${b},${pointAlpha})`;
        ctx.beginPath();
        ctx.arc(px1, py1, radius, 0, Math.PI * 2);
        ctx.fill();
        
        if (afterglow > 0.06 || curParams.glow > 0.32 || eventFlash > 0.02) {
          const haloSize = radius * (4.5 + glow * 2.2);
          const haloGradient = ctx.createRadialGradient(px1, py1, 0, px1, py1, haloSize);
          haloGradient.addColorStop(0, `rgba(${r},${g},${b},${pointAlpha * (0.26 + afterglow * 0.42 + eventFlash * 0.4)})`);
          haloGradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
          ctx.fillStyle = haloGradient;
          ctx.beginPath();
          ctx.arc(px1, py1, haloSize, 0, Math.PI * 2);
          ctx.fill();
        }
        
        ctx.fillStyle = `rgba(${r},${g},${b},${pointAlpha * 0.86})`;
        ctx.beginPath();
        ctx.arc(px2, py2, radius * 0.78, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    },

    onEvent(event: VisualEvent) {
      eventFlash = Math.min(1, eventFlash + event.intensity * 0.45);
      cue.handle(event, palette);
      if (event.type === 'section-cue') {
        sectionCueCount += 1;
        growthTarget = Math.max(growthTarget, Math.min(1, 0.2 + sectionCueCount * 0.16));
      }
      if (event.type === 'density-surge' || event.type === 'motion-drift' || event.type === 'storm-release') {
        growthTarget = Math.max(growthTarget, Math.min(1, 0.38 + event.intensity * 0.5));
      }
      if (event.type === 'grain-bloom' || event.type === 'glow-pulse' || event.type === 'spark-burst') {
        growthTarget = Math.max(growthTarget, Math.min(1, 0.3 + event.intensity * 0.38));
      }
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      buildPairs();
    },

    destroy() {
      // No persistent resources to clean
    },
  };
}
