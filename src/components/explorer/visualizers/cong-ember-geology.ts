import type { AudioSignal } from '../audio-signal';
import type { Palette } from '../palette';
import { resolveCongEmberGeologyTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { createCueEventState } from './cue-event-state';

interface TerrainLayer {
  baseY: number;
  amplitude: number;
  scale: number;
  speed: number;
  seed: number;
  alpha: number;
  depth: number;
}

interface MistParticle {
  x: number;
  y: number;
  px: number;
  py: number;
  seed: number;
  speed: number;
  depth: number;
  life: number;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function createCongEmberGeology(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let cueGlow = 0;
  let cue = createCueEventState();
  let terrain: TerrainLayer[] = [];
  let contours: TerrainLayer[] = [];
  let mist: MistParticle[] = [];
  let heatBeat = 0;
  let faultSweep = 0;
  let plateLift = 0;
  let plateLiftTarget = 0;
  let transientPulse = 0;
  let sectionCueCount = 0;
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };

  let config = {
    plateCount: 10,
    faultCount: 42,
    sparkCount: 120,
    baseAlpha: 0.095,
    heatAlpha: 0.28,
  };

  function insideExclusion(x: number, y: number, pad = 40): boolean {
    return x > curExclusion.left - pad
      && x < curExclusion.right + pad
      && y > curExclusion.top - pad
      && y < curExclusion.bottom + pad;
  }

  function terrainY(layer: TerrainLayer, x: number, t: number, turbulence: number): number {
    const nx = x * layer.scale;
    const slow = q.noise(layer.seed, nx, t * layer.speed) - 0.5;
    const detail = q.noise(layer.seed + 33.1, nx * 2.6, t * layer.speed * 1.4) - 0.5;
    return layer.baseY + slow * layer.amplitude + detail * layer.amplitude * (0.18 + turbulence * 0.26);
  }

  function resetMistParticle(p: MistParticle, keepY = false) {
    p.x = Math.random() * w;
    p.y = keepY ? p.y : h * (0.18 + Math.random() * 0.74);
    p.px = p.x;
    p.py = p.y;
    p.seed = Math.random() * 1000;
    p.speed = 0.22 + Math.random() * 0.72;
    p.depth = Math.random();
    p.life = Math.random();
  }

  function buildWorld() {
    terrain = [];
    contours = [];
    mist = [];

    for (let i = 0; i < config.plateCount; i += 1) {
      const depth = i / Math.max(1, config.plateCount - 1);
      terrain.push({
        baseY: h * (0.22 + depth * 0.68),
        amplitude: h * (0.025 + depth * 0.055),
        scale: 0.0014 + depth * 0.0022,
        speed: 0.05 + depth * 0.06,
        seed: Math.random() * 1000,
        alpha: config.baseAlpha * (0.36 + depth * 0.92),
        depth,
      });
    }

    for (let i = 0; i < config.faultCount; i += 1) {
      const depth = i / Math.max(1, config.faultCount - 1);
      contours.push({
        baseY: h * (0.18 + Math.pow(depth, 1.18) * 0.76),
        amplitude: h * (0.018 + depth * 0.055),
        scale: 0.002 + depth * 0.0038,
        speed: 0.035 + depth * 0.04,
        seed: Math.random() * 1000,
        alpha: 0.048 + depth * 0.11,
        depth,
      });
    }

    const mistCount = Math.max(80, Math.round(config.sparkCount * 1.5));
    for (let i = 0; i < mistCount; i += 1) {
      const particle: MistParticle = { x: 0, y: 0, px: 0, py: 0, seed: 0, speed: 0, depth: 0, life: 0 };
      resetMistParticle(particle);
      mist.push(particle);
    }

  }

  return {
    setup(_q, _w, _h, _palette, _tuning) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      config = resolveCongEmberGeologyTuning(_tuning);
      time = 0;
      cueGlow = 0;
      cue = createCueEventState();
      heatBeat = 0;
      faultSweep = 0;
      plateLift = 0;
      plateLiftTarget = 0;
      transientPulse = 0;
      sectionCueCount = 0;
      buildWorld();
    },

    update(dt, params, audio, exclusion) {
      curParams = params;
      curAudio = audio;
      curExclusion = exclusion;
      cue.update(dt);
      cueGlow = Math.max(0, cueGlow - dt * 0.85);
      faultSweep = Math.max(0, faultSweep - dt * 0.42);
      plateLift += (plateLiftTarget - plateLift) * Math.min(1, dt * 2.1);
      plateLiftTarget *= Math.exp(-dt * 0.22);
      transientPulse = Math.max(0, transientPulse - dt * 3.0);
      if (audio.transient > 0.15) {
        transientPulse = Math.max(transientPulse, audio.transient * 0.95);
      }
      const activity = audio.activity ?? audio.energy;
      const heatTarget = clamp01(audio.transient * 0.72 + audio.bass * 0.24 + activity * 0.18 + cueGlow * 0.28);
      heatBeat = mix(heatBeat, heatTarget, 1 - Math.pow(0.0008, dt));

      const reduced = typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!reduced) time += dt * (0.12 + params.drift * 0.28 + activity * 0.18 + audio.energy * 0.14 + cueGlow * 0.08 + heatBeat * 0.12 + cue.motion * 0.16 + plateLift * 0.1);

      const flowStrength = 0.34 + params.drift * 0.7 + activity * 0.18 + audio.mids * 0.26 + cueGlow * 0.2 + heatBeat * 0.24 + plateLift * 0.32 + cue.motion * 0.24;
      for (const p of mist) {
        p.px = p.x;
        p.py = p.y;
        const field = q.noise(p.x * 0.0024, p.y * 0.0024, time * 0.18 + p.seed);
        const curl = q.noise(p.x * 0.006 + 40, p.y * 0.006, time * 0.12 + p.seed) - 0.5;
        const angle = field * Math.PI * 2.4 + curl * (0.8 + params.turbulence * 1.4);
        const speed = p.speed * flowStrength * (0.45 + p.depth);
        p.x += Math.cos(angle) * speed;
        p.y += Math.sin(angle) * speed * 0.55 - (0.015 + p.depth * 0.035 + heatBeat * 0.035);
        p.life += dt * (0.03 + p.depth * 0.04);

        if (p.x < -40 || p.x > w + 40 || p.y < -40 || p.y > h + 40 || p.life > 1.6) {
          resetMistParticle(p);
        }
      }
    },

    draw(_q, ctx) {
      const [br, bg, bb] = cue.mixBackgroundColor(palette.bgDark);
      const [ar, ag, ab] = cue.mixForegroundColor(palette.accentGlow);
      const [wr, wg, wb] = cue.mixTerrainColor(palette.accentWarm);
      const [dr, dg, db] = palette.dotColor;
      const activity = curAudio.activity ?? curAudio.energy;
      const glow = clamp01(curParams.glow * 0.42 + curParams.shimmer * 0.18 + curAudio.highs * 0.22 + cueGlow * 0.38 + heatBeat * 0.26);
      const density = 0.58 + curParams.density * 0.9 + activity * 0.22 + curAudio.energy * 0.26 + heatBeat * 0.12 + plateLift * 0.22 + cue.bloom * 0.16;

      // 1. Dark atmospheric base with deep-ocean/alien valley falloff.
      ctx.fillStyle = `rgba(${br},${bg},${bb},0.18)`;
      ctx.fillRect(0, 0, w, h);
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, `rgba(${Math.round(br * 0.55)},${Math.round(bg * 0.62)},${Math.round(bb * 0.78)},0.58)`);
      sky.addColorStop(0.42, `rgba(${ar},${ag},${ab},${0.014 + glow * 0.018})`);
      sky.addColorStop(1, `rgba(${wr},${Math.round(wg * 0.48)},${Math.round(wb * 0.24)},${0.02 + glow * 0.022 + heatBeat * 0.018})`);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // 2. Parallax terrain silhouettes create the large-scale world depth.
      for (const layer of terrain) {
        const depthFade = 0.24 + layer.depth * 0.9;
        const [r, g, b] = cue.mixTerrainColor([
          Math.round(mix(dr, br, 0.38 + layer.depth * 0.32)),
          Math.round(mix(dg, bg, 0.44 + layer.depth * 0.28)),
          Math.round(mix(db, bb, 0.5 + layer.depth * 0.22)),
        ], layer.seed);
        const yOffset = Math.sin(time * layer.speed + layer.seed) * (2 + layer.depth * 9 + plateLift * 12);

        ctx.fillStyle = `rgba(${r},${g},${b},${layer.alpha * density * depthFade})`;
        ctx.beginPath();
        ctx.moveTo(-60, h + 40);
        for (let step = 0; step <= 34; step += 1) {
          const t = step / 34;
          const x = -60 + (w + 120) * t;
          const quake = Math.sin(time * 1.6 + layer.seed + t * Math.PI * 4) * (heatBeat + plateLift * 0.7) * layer.depth * 10;
          const y = terrainY(layer, x, time, curParams.turbulence) + yOffset + quake;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w + 60, h + 40);
        ctx.closePath();
        ctx.fill();
      }

      // 3. Beat-flash horizon halo — pulses warm glow on transients.
      if (transientPulse > 0.04) {
        const horizonY = h * 0.62;
        const haloRadius = Math.min(w, h) * (0.32 + transientPulse * 0.28 + curAudio.bass * 0.14);
        const beatHalo = ctx.createRadialGradient(w * 0.5, horizonY, 0, w * 0.5, horizonY, haloRadius);
        beatHalo.addColorStop(0, `rgba(${wr},${wg},${wb},${transientPulse * 0.12})`);
        beatHalo.addColorStop(1, `rgba(${wr},${wg},${wb},0)`);
        ctx.fillStyle = beatHalo;
        ctx.fillRect(0, horizonY - haloRadius, w, haloRadius * 2);
      }

      // 4. Flow-field mist gives the surface a living, slow-moving atmosphere.
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const p of mist) {
        if (insideExclusion(p.x, p.y, 45)) continue;
        const alpha = (0.016 + p.depth * 0.03) * density * (0.75 + curParams.shimmer * 0.6 + heatBeat * 0.38);
        const tint = 0.22 + p.depth * 0.42 + glow * 0.24;
        const [r, g, b] = cue.mixMistColor([
          Math.round(mix(dr, ar, tint)),
          Math.round(mix(dg, ag, tint)),
          Math.round(mix(db, ab, tint)),
        ], p.seed);
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.lineWidth = 0.5 + p.depth * 1.2;
        ctx.beginPath();
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      ctx.restore();

      // 5. Organic contour/ridge lines define the bioluminescent terrain structure.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const ridge of contours) {
        const ySample = ridge.baseY + Math.sin(time * ridge.speed + ridge.seed) * ridge.amplitude * 0.08;
        if (insideExclusion(w * 0.5, ySample, 70)) continue;
        const highlight = Math.pow(ridge.depth, 1.4);
        const alpha = ridge.alpha * (0.72 + curParams.shimmer * 0.75 + glow * 0.4 + heatBeat * 0.5 + faultSweep * 0.32 + transientPulse * 0.45) * (0.7 + highlight);
        const [r, g, b] = cue.mixRidgeColor([
          Math.round(mix(ar, wr, highlight * 0.34)),
          Math.round(mix(ag, wg, highlight * 0.26)),
          Math.round(mix(ab, wb, highlight * 0.16)),
        ], ridge.seed);

        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.lineWidth = 0.45 + ridge.depth * 1.15 + curParams.impulse * 0.7 + cue.sizeProgress(ridge.seed) * 0.8 + plateLift * 0.6 + transientPulse * 2.2;
        ctx.beginPath();
        for (let step = 0; step <= 52; step += 1) {
          const t = step / 52;
          const x = -40 + (w + 80) * t;
          const noiseY = terrainY(ridge, x, time, curParams.turbulence);
          const strand = Math.sin(t * Math.PI * (2.2 + ridge.depth * 5) + ridge.seed + time * (0.22 + heatBeat * 0.18)) * ridge.amplitude * (0.08 + heatBeat * 0.07);
          const y = noiseY + strand + Math.sin(t * Math.PI * 2 + faultSweep * 5 + ridge.seed) * faultSweep * ridge.depth * 8;
          if (step === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();

    },

    onEvent(event: VisualEvent) {
      const intensity = event.intensity ?? 0.5;
      cue.handle(event, palette);
      cueGlow = Math.min(1, cueGlow + intensity * 0.38);
      if (event.type === 'section-cue') {
        sectionCueCount += 1;
        faultSweep = Math.min(1, faultSweep + 0.24 + intensity * 0.36 + Math.min(sectionCueCount, 5) * 0.025);
        plateLiftTarget = Math.max(plateLiftTarget, 0.12 + Math.min(sectionCueCount, 5) * 0.08 + intensity * 0.18);
      }
      if (event.type === 'density-surge' || event.type === 'motion-drift' || event.type === 'glow-pulse' || event.type === 'bloom-flash' || event.type === 'grain-bloom') {
        faultSweep = Math.min(1, faultSweep + 0.22 + intensity * 0.5);
        plateLiftTarget = Math.max(plateLiftTarget, 0.18 + intensity * 0.34);
      }
      if (event.type === 'color-morph' || event.type === 'palette-morph') {
        faultSweep = Math.min(1, faultSweep + 0.18 + intensity * 0.34);
        plateLiftTarget = Math.max(plateLiftTarget, 0.22 + intensity * 0.42);
      }
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      buildWorld();
    },

    destroy() {
      mist = [];
    },
  };
}
