import type { AudioSignal } from '../audio-signal';
import type { Palette } from '../palette';
import { resolveCongParticleCurrentTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { createCueEventState } from './cue-event-state';
import {
  buildParticles,
  createLowResVectorField,
  createSeededRandom,
  drawBurstGlows,
  drawSoftParticle,
  getSoftParticleColor,
  hasReducedMotion,
  moveFlowParticle,
  pushBurst,
  resetFlowParticle,
  updateBursts,
  type CongBurst,
  type CongParticle,
  type LowResVectorField,
} from './cong-particle-primitives';

export function createCongParticleCurrent(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let particles: CongParticle[] = [];
  let bursts: CongBurst[] = [];
  let random = createSeededRandom(7101);
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };
  let tuning = resolveCongParticleCurrentTuning();
  let cue = createCueEventState();
  let flowField: LowResVectorField = createLowResVectorField(72);

  function buildField() {
    random = createSeededRandom(7101 + Math.round(w + h));
    particles = buildParticles(tuning.particleCount, w, h, 17101);
    flowField.resize(w, h);
    for (let index = 0; index < particles.length; index += 1) {
      resetFlowParticle(particles[index], w, h, random);
    }
  }

  return {
    setup(_q, _w, _h, _palette, _tuning) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      tuning = resolveCongParticleCurrentTuning(_tuning);
      time = 0;
      bursts = [];
      cue = createCueEventState();
      buildField();
    },

    update(dt, params, audio, exclusion) {
      curParams = params;
      curAudio = audio;
      curExclusion = exclusion;
      cue.update(dt);
      if (hasReducedMotion()) return;

      time += dt * (0.44 + params.drift * 0.9 + audio.energy * 0.28);
      const speedScale = tuning.speed * (0.48 + params.drift * 0.85 + audio.bass * 0.44 + audio.energy * 0.24);
      const driftX = tuning.driftX * (0.2 + params.drift + audio.mids * 0.45);
      const flowScale = tuning.flowScale * (0.72 + params.turbulence * 0.9);
      flowField.refresh(q, time, flowScale, { seed: 17.1 });

      for (let index = 0; index < particles.length; index += 1) {
        moveFlowParticle(particles[index], q, dt, w, h, time, flowScale, speedScale, driftX, flowField);
      }

      updateBursts(bursts, dt);
      if (audio.transient > 0.28 && bursts.length < tuning.maxBursts && random() < audio.transient * 0.22) {
        pushBurst(bursts, w * (0.24 + random() * 0.32), h * (0.28 + random() * 0.44), audio.transient, tuning.maxBursts);
      }
    },

    draw(_q, ctx) {
      const [br, bg, bb] = palette.bgDark;
      const [ar, ag, ab] = palette.accentGlow;
      ctx.fillStyle = `rgba(${br},${bg},${bb},${tuning.trailAlpha})`;
      ctx.fillRect(0, 0, w, h);

      const glow = ctx.createRadialGradient(w * 0.28, h * 0.48, 0, w * 0.28, h * 0.48, Math.max(w, h) * 0.48);
      glow.addColorStop(0, `rgba(${ar},${ag},${ab},${tuning.accentAlpha + curParams.glow * 0.08 + curAudio.energy * 0.05})`);
      glow.addColorStop(0.56, `rgba(${ar},${ag},${ab},${0.018 + curParams.glow * 0.025})`);
      glow.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index];
        const color = cue.mixParticleColor(getSoftParticleColor(particle, palette, curParams, curAudio), particle.seed);
        drawSoftParticle(ctx, particle, palette, curParams, curAudio, curExclusion, 0.82, color);
      }
      drawBurstGlows(ctx, bursts, palette, curExclusion);
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      pushBurst(bursts, w * (0.22 + random() * 0.36), h * (0.22 + random() * 0.52), event.intensity, tuning.maxBursts);
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      buildField();
    },

    destroy() {
      particles = [];
      bursts = [];
      flowField.destroy();
    },
  };
}
