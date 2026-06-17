import type { AudioSignal } from '../audio-signal';
import { computeExclusion } from '../exclusion';
import type { Palette } from '../palette';
import { resolveCongGrainErosionTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { createCueEventState } from './cue-event-state';

interface SedimentParticle {
  x: number;
  y: number;
  px: number;
  py: number;
  size: number;
  alpha: number;
  seed: number;
  depth: number;
  erosion: number;
}

interface ForegroundSpore {
  x: number;
  y: number;
  seed: number;
  radius: number;
  depth: number;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function createCongGrainErosion(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let sediment: SedimentParticle[] = [];
  let spores: ForegroundSpore[] = [];
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };
  let cue = createCueEventState();
  let erosionLift = 0;
  let erosionLiftTarget = 0.12;
  let bloomLift = 0;
  let bloomLiftTarget = 0;
  let sectionCueCount = 0;
  let config = {
    gridSize: 18,
    baseAlpha: 0.045,
  };

  function buildScene() {
    sediment = [];
    spores = [];

    const particleCount = Math.max(520, Math.round((w * h) / Math.max(1200, config.gridSize * 128)));
    for (let i = 0; i < particleCount; i++) {
      const depth = Math.random();
      const x = Math.random() * w;
      const y = h * (0.22 + Math.random() * 0.76);
      sediment.push({
        x,
        y,
        px: x,
        py: y,
        size: 0.9 + depth * 3.8,
        alpha: config.baseAlpha * (0.4 + depth * 1.55),
        seed: Math.random() * 1000,
        depth,
        erosion: Math.random(),
      });
    }

    const sporeCount = Math.max(180, Math.round((w * h) / Math.max(2400, config.gridSize * 180)));
    for (let i = 0; i < sporeCount; i++) {
      const depth = Math.random();
      spores.push({
        x: Math.random() * w,
        y: h * (0.48 + Math.random() * 0.46),
        seed: Math.random() * 1000,
        radius: 0.7 + depth * 3.6,
        depth,
      });
    }
  }

  function resetParticle(particle: SedimentParticle) {
    particle.x = Math.random() * w;
    particle.y = h * (0.28 + Math.random() * 0.7);
    particle.px = particle.x;
    particle.py = particle.y;
    particle.erosion = Math.random();
  }

  function updateSedimentParticle(particle: SedimentParticle, dt: number) {
    particle.px = particle.x;
    particle.py = particle.y;
    const flow = q.noise(particle.x * 0.0022, particle.y * 0.0022, time * 0.11 + particle.seed * 0.01);
    const strata = q.noise(particle.y * 0.004 + 11, time * 0.06, particle.seed * 0.02);
    const angle = -0.35 + flow * Math.PI * 1.4 + Math.sin(time * 0.07 + strata * 4) * 0.22;
    const speed = (8 + particle.depth * 36) * (0.4 + curParams.drift * 0.8 + curAudio.energy * 0.28 + cue.motion * 0.72);
    particle.x += Math.cos(angle) * speed * dt;
    particle.y += (Math.sin(angle) * speed * 0.35 - 5 * particle.depth + (strata - 0.5) * 12) * dt;
    if (particle.x < -60 || particle.x > w + 60 || particle.y < -80 || particle.y > h + 80) resetParticle(particle);
  }

  function drawTerrainSilhouette(ctx: CanvasRenderingContext2D, layer: number) {
    const [br, bg, bb] = palette.bgDark;
    const [ar, ag, ab] = cue.mixTerrainColor(cue.mixBackgroundColor(palette.accentGlow, layer), layer);
    const depth = layer / 3;
    const baseY = h * (0.36 + depth * 0.14);
    const amp = h * (0.09 + depth * 0.1);

    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w + 20; x += 16) {
      const n = q.noise(x * (0.0014 + depth * 0.0007), layer * 18.5, time * (0.016 + depth * 0.015));
      const y = baseY + (n - 0.46) * amp + Math.sin(x * 0.006 + time * 0.04 + layer) * amp * 0.08;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();

    const alpha = 0.15 - depth * 0.025;
    const gradient = ctx.createLinearGradient(0, baseY - amp, 0, h);
    gradient.addColorStop(0, `rgba(${ar},${ag},${ab},${alpha * 0.28})`);
    gradient.addColorStop(0.52, `rgba(${br + 14},${bg + 16},${bb + 16},${alpha})`);
    gradient.addColorStop(1, `rgba(${br},${bg},${bb},${0.3})`);
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  function drawErodedContours(ctx: CanvasRenderingContext2D) {
    const [ar, ag, ab] = cue.mixRidgeColor(palette.accentGlow, 13);
    const [wr, wg, wb] = cue.mixRidgeColor(palette.accentWarm, 21);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let row = 0; row < 22; row++) {
      const depth = row / 21;
      const yBase = h * (0.32 + depth * 0.62);
      const erosionGate = (time * (0.035 + curParams.impulse * 0.03 + cue.motion * 0.04) + row * 0.071) % 1;
      const alpha = (0.012 + depth * 0.035 + curParams.shimmer * 0.018 + cue.focus * 0.026) * (0.65 + Math.sin(erosionGate * Math.PI) * 0.35);
      ctx.strokeStyle = `rgba(${Math.round(mix(ar, wr, depth * 0.58))},${Math.round(mix(ag, wg, depth * 0.58))},${Math.round(mix(ab, wb, depth * 0.58))},${alpha})`;
      ctx.lineWidth = 0.55 + depth * 1.35 + cue.bloom * 0.75;
      ctx.beginPath();
      for (let x = -20; x <= w + 20; x += 10) {
        const n = q.noise(x * 0.0033, row * 0.19, time * 0.04);
        const y = yBase
          + (n - 0.5) * (26 + curParams.turbulence * 44 + cue.motion * 18)
          + Math.sin(x * (0.009 + depth * 0.004) + row + time * 0.16) * (8 + depth * 22);
        if (x <= -20) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawAtmosphericHaze(ctx: CanvasRenderingContext2D) {
    const [ar, ag, ab] = cue.mixBackgroundColor(palette.accentGlow, 5);
    const [dr, dg, db] = palette.dotColor;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let band = 0; band < 6; band++) {
      const y = h * (0.22 + band * 0.13 + Math.sin(time * 0.04 + band) * 0.02);
      const radius = h * (0.16 + band * 0.02);
      const alpha = 0.015 + curParams.glow * 0.012 + cue.focus * 0.025;
      const gradient = ctx.createRadialGradient(w * (0.28 + band * 0.1), y, 0, w * (0.28 + band * 0.1), y, radius);
      gradient.addColorStop(0, `rgba(${Math.round(mix(dr, ar, 0.5))},${Math.round(mix(dg, ag, 0.5))},${Math.round(mix(db, ab, 0.5))},${alpha})`);
      gradient.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, y - radius, w, radius * 2);
    }
    ctx.restore();
  }

  return {
    setup(_q, _w, _h, _palette, _tuning) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      const tuning = resolveCongGrainErosionTuning(_tuning);
      config = {
        gridSize: Math.max(8, tuning.gridSize),
        baseAlpha: tuning.baseAlpha,
      };
      time = 0;
      cue = createCueEventState();
      erosionLift = 0;
      erosionLiftTarget = 0.12;
      bloomLift = 0;
      bloomLiftTarget = 0;
      sectionCueCount = 0;
      buildScene();
    },

    update(dt, params, audio, exclusion) {
      curParams = params;
      curAudio = audio;
      curExclusion = exclusion;
      cue.update(dt);
      erosionLift = mix(erosionLift, erosionLiftTarget, 1 - Math.pow(0.001, dt));
      bloomLift = mix(bloomLift, bloomLiftTarget, 1 - Math.pow(0.001, dt));

      const reduced = typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) return;

      time += dt * (0.12 + params.drift * 0.42 + audio.energy * 0.1 + cue.motion * 0.2 + erosionLift * 0.12);
      for (let i = 0; i < sediment.length; i++) updateSedimentParticle(sediment[i], dt);
    },

    draw(_q, ctx) {
      const [br, bg, bb] = palette.bgDark;
      const [ar, ag, ab] = palette.accentGlow;
      const [dr, dg, db] = palette.dotColor;
      const [wr, wg, wb] = palette.accentWarm;

      ctx.fillStyle = `rgba(${br},${bg},${bb},0.13)`;
      ctx.fillRect(0, 0, w, h);

      // 1. Layered noisy silhouettes give the eroded surface a horizon and depth.
      for (let layer = 0; layer < 4; layer++) drawTerrainSilhouette(ctx, layer);

      // 2. Atmospheric haze separates background, midground, and foreground.
      drawAtmosphericHaze(ctx);

      // 3. Topographic contour ridges describe the organic eroding terrain.
      drawErodedContours(ctx);

      // 4. Flow-field sediment particles add living granular motion and trails.
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < sediment.length; i++) {
        const particle = sediment[i];
        const factors = computeExclusion(particle.x, particle.y, curExclusion);
        if (factors.density < 0.24 && particle.depth > 0.52) continue;
        const erosionWave = (time * (0.08 + curParams.impulse * 0.08 + cue.grain * 0.08) + particle.erosion) % 1;
        const reveal = clamp01(Math.sin(erosionWave * Math.PI));
        const tint = q.noise(particle.seed * 0.08, time * 0.04, 0) * 0.34 + particle.depth * 0.32 + curParams.glow * 0.26;
        const color = cue.mixTerrainColor(cue.mixParticleColor([
          Math.round(mix(dr, ar, tint)),
          Math.round(mix(dg, ag, tint)),
          Math.round(mix(db, ab, tint)),
        ], particle.seed), particle.seed);
        const densityStep = cue.densityProgress(particle.seed);
        const alpha = particle.alpha * (0.38 + erosionLift * 0.42 + reveal * 0.92 + curParams.density * 0.8 + cue.grain * 0.48) * factors.alpha * clamp01(1 + densityStep * 0.6);
        const size = particle.size * (0.55 + erosionLift * 0.35 + reveal * 0.55 + curParams.shimmer * 0.25 + cue.bloom * 0.55 + cue.sizeProgress(particle.seed) * 0.44);
        ctx.strokeStyle = `rgba(${color[0]},${color[1]},${color[2]},${alpha * 0.75})`;
        ctx.lineWidth = Math.max(0.45, size * 0.35);
        ctx.beginPath();
        ctx.moveTo(particle.px, particle.py);
        ctx.lineTo(particle.x, particle.y);
        ctx.stroke();
        ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;
        ctx.beginPath();
        ctx.ellipse(particle.x, particle.y, size * 1.4, size, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // 5. Foreground bioluminescent dust makes cue changes readable up close.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const spore of spores) {
        const x = spore.x + Math.sin(time * (0.22 + spore.depth * 0.18) + spore.seed) * (8 + spore.depth * 24);
        const y = spore.y + Math.cos(time * (0.16 + spore.depth * 0.14) + spore.seed) * (4 + spore.depth * 18);
        const factors = computeExclusion(x, y, curExclusion);
        if (factors.density < 0.28 && spore.depth > 0.55) continue;
        const color = cue.mixForegroundColor([
          Math.round(mix(ar, wr, spore.depth * 0.5)),
          Math.round(mix(ag, wg, spore.depth * 0.5)),
          Math.round(mix(ab, wb, spore.depth * 0.5)),
        ], spore.seed);
        const pulse = Math.sin(time * (0.44 + spore.depth * 0.38) + spore.seed) * 0.5 + 0.5;
        const radius = spore.radius * (0.72 + bloomLift * 0.4 + pulse * 0.42 + cue.bloom * 0.72 + cue.sizeProgress(spore.seed) * 0.42);
        const alpha = (0.024 + bloomLift * 0.028 + spore.depth * 0.07 + curAudio.highs * 0.04 + cue.focus * 0.05) * factors.alpha * clamp01(1 + cue.densityProgress(spore.seed) * 0.55);
        const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 4.5);
        glow.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},${alpha})`);
        glow.addColorStop(1, `rgba(${color[0]},${color[1]},${color[2]},0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, radius * 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      if (event.type === 'section-cue') {
        sectionCueCount += 1;
        erosionLiftTarget = Math.max(erosionLiftTarget, Math.min(1, 0.16 + sectionCueCount * 0.14));
      }
      if (event.type === 'density-surge' || event.type === 'motion-drift' || event.type === 'storm-release') {
        erosionLiftTarget = Math.max(erosionLiftTarget, Math.min(1, 0.42 + event.intensity * 0.46));
      }
      if (event.type === 'grain-bloom' || event.type === 'glow-pulse' || event.type === 'spark-burst') {
        bloomLiftTarget = Math.max(bloomLiftTarget, Math.min(1, 0.36 + event.intensity * 0.54));
      }
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      buildScene();
    },

    destroy() {
      sediment = [];
      spores = [];
    },
  };
}
