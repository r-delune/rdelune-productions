import type { AudioSignal } from '../audio-signal';
import { computeExclusion } from '../exclusion';
import type { Palette } from '../palette';
import { resolveCongMistFieldTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { createCueEventState } from './cue-event-state';
import { clamp01, createSeededRandom, hasReducedMotion, mix } from './cong-particle-primitives';

interface MistLayer {
  y: number;
  height: number;
  alpha: number;
  speed: number;
  noiseOffset: number;
  seed: number;
  depth: number;
}

interface MistMote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  depth: number;
  size: number;
  seed: number;
  phase: number;
}

interface Ridge {
  y: number;
  amplitude: number;
  speed: number;
  seed: number;
  depth: number;
}

export function createCongMistField(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let layers: MistLayer[] = [];
  let motes: MistMote[] = [];
  let ridges: Ridge[] = [];
  let cue = createCueEventState();
  let random = createSeededRandom(9011);
  let tuning = resolveCongMistFieldTuning();
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };
  let valleyLift = 0;
  let valleyLiftTarget = 0;
  let moteLift = 0;
  let moteLiftTarget = 0;
  let sectionCueCount = 0;

  function buildScene(): void {
    random = createSeededRandom(9011 + Math.round(w * 0.3 + h * 0.7));
    layers = [];
    ridges = [];
    motes = [];

    for (let i = 0; i < tuning.layerCount; i += 1) {
      const depth = i / Math.max(1, tuning.layerCount - 1);
      layers.push({
        y: h * (0.18 + depth * 0.68),
        height: h * (0.16 + depth * 0.24),
        alpha: tuning.baseAlpha * (0.72 + depth * 1.28),
        speed: 0.05 + depth * 0.22,
        noiseOffset: random() * 1000,
        seed: random() * 1000,
        depth,
      });
    }

    for (let i = 0; i < tuning.ridgeCount; i += 1) {
      const depth = i / Math.max(1, tuning.ridgeCount - 1);
      ridges.push({
        y: h * (0.48 + depth * 0.32),
        amplitude: h * (0.018 + depth * 0.045),
        speed: 0.045 + depth * 0.06,
        seed: random() * 1000,
        depth,
      });
    }

    for (let i = 0; i < tuning.moteCount; i += 1) {
      const depth = Math.pow(random(), 0.7);
      motes.push({
        x: random() * w,
        y: random() * h,
        vx: (random() - 0.5) * tuning.driftStrength * (0.3 + depth),
        vy: (random() - 0.5) * 4,
        depth,
        size: 0.45 + depth * 2.8 + random() * 1.6,
        seed: random() * 1000,
        phase: random() * Math.PI * 2,
      });
    }
  }

  function resetMote(mote: MistMote, fromLeft = false): void {
    mote.x = fromLeft ? -30 - random() * 120 : random() * w;
    mote.y = h * (0.18 + random() * 0.74);
    mote.vx = (0.18 + random() * 0.82) * tuning.driftStrength * (0.42 + mote.depth);
    mote.vy = (random() - 0.5) * 7;
    mote.phase = random() * Math.PI * 2;
  }

  return {
    setup(_q, _w, _h, _palette, _tuning) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      tuning = resolveCongMistFieldTuning(_tuning);
      time = 0;
      cue = createCueEventState();
      valleyLift = 0;
      valleyLiftTarget = 0;
      moteLift = 0;
      moteLiftTarget = 0;
      sectionCueCount = 0;
      buildScene();
    },

    update(dt, params, audio, exclusion) {
      curParams = params;
      curAudio = audio;
      curExclusion = exclusion;
      cue.update(dt);

      const damp = 1 - Math.pow(0.001, dt);
      valleyLift = mix(valleyLift, valleyLiftTarget, damp);
      moteLift = mix(moteLift, moteLiftTarget, damp);
      valleyLiftTarget = Math.max(0, valleyLiftTarget - dt * 0.05);
      moteLiftTarget = Math.max(0, moteLiftTarget - dt * 0.08);

      if (hasReducedMotion()) return;

      time += dt * (0.16 + params.drift * 0.48 + audio.energy * 0.14 + cue.motion * 0.2 + valleyLift * 0.08);
      const drift = tuning.driftStrength * (0.26 + params.drift * 0.78 + audio.mids * 0.22 + moteLift * 0.36);

      for (const mote of motes) {
        const swirl = q.noise(mote.x * tuning.noiseScale, mote.y * tuning.noiseScale, mote.seed + time * 0.08) - 0.5;
        mote.x += (mote.vx + drift * (0.28 + mote.depth) + swirl * 18 * curParams.turbulence) * dt;
        mote.y += (mote.vy + Math.sin(time * (0.32 + mote.depth * 0.3) + mote.phase) * 6) * dt;
        if (mote.x > w + 60 || mote.y < -60 || mote.y > h + 60) resetMote(mote, true);
      }
    },

    draw(_q, ctx) {
      const [br, bg, bb] = palette.bgDark;
      const [ar, ag, ab] = palette.accentGlow;
      const [dr, dg, db] = palette.dotColor;
      const [wr, wg, wb] = palette.accentWarm;

      ctx.fillStyle = `rgba(${br},${bg},${bb},0.064)`;
      ctx.fillRect(0, 0, w, h);

      const valleyGlow = ctx.createLinearGradient(0, h * 0.12, 0, h);
      valleyGlow.addColorStop(0, `rgba(${ar},${ag},${ab},${0.012 + curParams.glow * 0.016})`);
      valleyGlow.addColorStop(0.58, `rgba(${dr},${dg},${db},${0.016 + valleyLift * 0.028 + curAudio.mids * 0.012})`);
      valleyGlow.addColorStop(1, `rgba(${wr},${wg},${wb},${0.01 + valleyLift * 0.02})`);
      ctx.fillStyle = valleyGlow;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      for (const ridge of ridges) {
        const ridgeAlpha = tuning.ridgeAlpha * (0.55 + ridge.depth * 0.9 + valleyLift * 0.65);
        ctx.fillStyle = `rgba(${br},${bg},${bb},${ridgeAlpha})`;
        ctx.beginPath();
        ctx.moveTo(-40, h + 40);
        ctx.lineTo(-40, ridge.y);
        for (let x = -40; x <= w + 40; x += 28) {
          const nx = x / Math.max(1, w);
          const noise = q.noise(ridge.seed, nx * 2.4, time * ridge.speed);
          const y = ridge.y
            + Math.sin(nx * Math.PI * (2.2 + ridge.depth * 3.2) + ridge.seed + time * ridge.speed) * ridge.amplitude
            + (noise - 0.5) * ridge.amplitude * (1.2 + curParams.turbulence);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w + 40, h + 40);
        ctx.closePath();
        ctx.fill();
      }

      ctx.globalCompositeOperation = 'screen';
      for (const layer of layers) {
        const tint = clamp01(0.18 + layer.depth * 0.24 + curParams.glow * 0.34 + curAudio.mids * 0.22 + valleyLift * 0.18);
        const [r, g, b] = cue.mixMistColor([
          Math.round(mix(dr, ar, tint)),
          Math.round(mix(dg, ag, tint)),
          Math.round(mix(db, ab, tint)),
        ], layer.seed);
        const densityStep = cue.densityProgress(layer.seed);
        const alpha = layer.alpha * (0.76 + curParams.density * 0.84 + curParams.shimmer * 0.24 + cue.focus * 0.38 + cue.grain * 0.22 + valleyLift * 0.5) * clamp01(1 + densityStep * 0.48);
        const step = 22;

        for (let x = -80; x <= w + 80; x += step) {
          const noiseX = x * tuning.noiseScale + layer.noiseOffset;
          const noiseY = time * layer.speed + layer.seed;
          const offset = (q.noise(noiseX, noiseY, layer.seed) - 0.5) * h * (0.055 + layer.depth * 0.035);
          const yPos = layer.y + offset + Math.sin(time * layer.speed + x * 0.006 + layer.seed) * h * 0.012;
          const exclusion = computeExclusion(x, yPos, curExclusion);
          const localAlpha = alpha * (0.18 + exclusion.alpha * 0.82);
          const widthVar = 120 + q.noise(layer.seed, noiseX, noiseY) * 140 + layer.depth * 110;
          const height = layer.height * (0.24 + layer.depth * 0.2);

          const fog = ctx.createRadialGradient(x, yPos, 0, x, yPos, widthVar);
          fog.addColorStop(0, `rgba(${r},${g},${b},${localAlpha})`);
          fog.addColorStop(0.58, `rgba(${r},${g},${b},${localAlpha * 0.32})`);
          fog.addColorStop(1, `rgba(${r},${g},${b},0)`);
          ctx.fillStyle = fog;
          ctx.beginPath();
          ctx.ellipse(x, yPos, widthVar, height, Math.sin(layer.seed) * 0.08, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const moteDensity = clamp01(0.34 + curParams.density * 0.5 + curParams.shimmer * 0.28 + moteLift * 0.5 + curAudio.highs * 0.2);
      for (const mote of motes) {
        const exclusion = computeExclusion(mote.x, mote.y, curExclusion);
        if (exclusion.density < 0.22 && mote.depth > 0.48) continue;
        const twinkle = q.noise(mote.seed, time * 0.22, 0);
        const warm = clamp01(mote.depth * 0.12 + curAudio.highs * 0.16 + moteLift * 0.14);
        const red = Math.round(mix(ar, wr, warm));
        const green = Math.round(mix(ag, wg, warm));
        const blue = Math.round(mix(ab, wb, warm));
        const size = mote.size * (0.72 + curParams.shimmer * 0.42 + twinkle * 0.36);
        const alpha = tuning.moteAlpha * moteDensity * (0.28 + mote.depth * 0.72 + twinkle * 0.22) * exclusion.alpha;
        ctx.fillStyle = `rgba(${red},${green},${blue},${alpha})`;
        ctx.beginPath();
        ctx.ellipse(mote.x, mote.y, size * (1.2 + mote.depth * 0.5), size, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      if (event.type === 'section-cue') {
        sectionCueCount += 1;
        valleyLiftTarget = Math.max(valleyLiftTarget, Math.min(1, 0.16 + sectionCueCount * 0.12 + event.intensity * 0.22));
        moteLiftTarget = Math.max(moteLiftTarget, 0.24 + event.intensity * 0.44);
      }
      if (event.type === 'density-surge' || event.type === 'motion-drift' || event.type === 'veil-sweep') {
        valleyLiftTarget = Math.max(valleyLiftTarget, 0.28 + event.intensity * 0.5);
        moteLiftTarget = Math.max(moteLiftTarget, 0.3 + event.intensity * 0.52);
      }
      if (event.type === 'glow-pulse' || event.type === 'bloom-flash' || event.type === 'grain-bloom') {
        moteLiftTarget = Math.max(moteLiftTarget, 0.28 + event.intensity * 0.58);
      }
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      buildScene();
    },

    destroy() {
      layers = [];
      motes = [];
      ridges = [];
    },
  };
}
