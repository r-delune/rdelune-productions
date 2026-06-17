import type { AudioSignal } from '../audio-signal';
import { computeExclusion } from '../exclusion';
import type { Palette } from '../palette';
import { resolveCongGreenGalaxyTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { createCueEventState } from './cue-event-state';
import {
  buildParticles,
  clamp01,
  createSeededRandom,
  drawBurstGlows,
  drawSoftParticle,
  getSoftParticleColor,
  hasReducedMotion,
  mix,
  moveOrbitalParticle,
  pushBurst,
  updateBursts,
  type CongBurst,
  type CongParticle,
} from './cong-particle-primitives';

export function createCongGreenGalaxy(): Visualizer {
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let particles: CongParticle[] = [];
  let bursts: CongBurst[] = [];
  let random = createSeededRandom(9203);
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };
  let tuning = resolveCongGreenGalaxyTuning();
  let cue = createCueEventState();

  function center() {
    return {
      x: w * (tuning.centerX + Math.sin(time * 0.19) * 0.045 + curAudio.bass * 0.018),
      y: h * (tuning.centerY + Math.cos(time * 0.16) * 0.035 - curAudio.mids * 0.018),
    };
  }

  function buildField() {
    random = createSeededRandom(9203 + Math.round(w * 0.7 + h));
    particles = buildParticles(tuning.particleCount, w, h, 19203);
  }

  return {
    setup(_q, _w, _h, _palette, _tuning) {
      w = _w;
      h = _h;
      palette = _palette;
      tuning = resolveCongGreenGalaxyTuning(_tuning);
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

      time += dt * (0.3 + params.drift * 0.72 + audio.energy * 0.2);
      const c = center();
      const radiusScale = tuning.radiusScale * (0.78 + params.density * 0.32 + audio.bass * 0.18);
      const speedScale = tuning.speed * (0.72 + params.drift * 0.82 + audio.energy * 0.22);

      for (let index = 0; index < particles.length; index += 1) {
        moveOrbitalParticle(particles[index], dt, c.x, c.y, time, radiusScale, speedScale, 0.62);
      }

      updateBursts(bursts, dt);
    },

    draw(_q, ctx) {
      const [br, bg, bb] = palette.bgDark;
      const [ar, ag, ab] = palette.accentGlow;
      const [wr, wg, wb] = palette.accentWarm;
      const c = center();

      ctx.fillStyle = `rgba(${br},${bg},${bb},${tuning.trailAlpha})`;
      ctx.fillRect(0, 0, w, h);

      const haloRadius = Math.max(w, h) * (0.18 + curParams.glow * 0.08 + curAudio.energy * 0.05);
      const halo = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, haloRadius);
      halo.addColorStop(0, `rgba(${ar},${ag},${ab},${0.1 + curParams.glow * 0.12 + curAudio.energy * 0.08})`);
      halo.addColorStop(0.5, `rgba(${ar},${ag},${ab},${0.02 + curParams.glow * 0.03})`);
      halo.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.lineWidth = 1;
      const gridStep = Math.max(42, Math.min(w, h) * 0.08);
      const rayAlpha = tuning.rayAlpha + curAudio.mids * 0.035 + curParams.shimmer * 0.03;
      for (let x = gridStep; x < w - gridStep; x += gridStep) {
        const factors = computeExclusion(x, h * 0.54, curExclusion);
        if (factors.contrast < 0.45) continue;
        const wobble = Math.sin(time * 0.42 + x * 0.012) * (18 + curParams.turbulence * 28);
        ctx.strokeStyle = `rgba(${wr},${wg},${wb},${rayAlpha * 0.34 * factors.alpha})`;
        ctx.beginPath();
        ctx.moveTo(x + wobble, h * 0.08);
        ctx.lineTo(c.x, c.y);
        ctx.stroke();
      }
      ctx.restore();

      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index];
        const color = cue.mixParticleColor(getSoftParticleColor(particle, palette, curParams, curAudio), particle.seed);
        drawSoftParticle(ctx, particle, palette, curParams, curAudio, curExclusion, 0.72, color);
      }

      const coreSize = Math.min(w, h) * (0.025 + curAudio.bass * 0.025 + curParams.impulse * 0.028);
      const coreExclusion = computeExclusion(c.x, c.y, curExclusion);
      const tint = clamp01(0.42 + curParams.glow * 0.3 + curAudio.highs * 0.2);
      const red = Math.round(mix(wr, ar, tint));
      const green = Math.round(mix(wg, ag, tint));
      const blue = Math.round(mix(wb, ab, tint));
      ctx.fillStyle = `rgba(${red},${green},${blue},${(0.16 + curAudio.energy * 0.1 + curParams.glow * 0.08) * coreExclusion.alpha})`;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, coreSize * 1.28, coreSize, Math.sin(time * 0.2) * 0.4, 0, Math.PI * 2);
      ctx.fill();

      drawBurstGlows(ctx, bursts, palette, curExclusion);
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      const c = center();
      pushBurst(bursts, c.x + (random() - 0.5) * w * 0.14, c.y + (random() - 0.5) * h * 0.12, event.intensity, tuning.maxBursts);
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      buildField();
    },

    destroy() {
      particles = [];
      bursts = [];
    },
  };
}
