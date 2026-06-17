import type { AudioSignal } from '../audio-signal';
import { computeExclusion } from '../exclusion';
import type { Palette } from '../palette';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { createCueEventState } from './cue-event-state';
import { clamp01, hasReducedMotion, mix } from './cong-particle-primitives';

interface LandscapeParticle {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  r: number;
  g: number;
  b: number;
  targetR: number;
  targetG: number;
  targetB: number;
  seed: number;
  size: number;
}

const MIN_PARTICLES = 1200;
const MAX_PARTICLES = 1800;

function baseParticleColor(palette: Palette, glow: number): [number, number, number] {
  const amount = clamp01(0.12 + glow * 0.48);
  return [
    Math.round(mix(palette.dotColor[0], palette.accentGlow[0], amount)),
    Math.round(mix(palette.dotColor[1], palette.accentGlow[1], amount)),
    Math.round(mix(palette.dotColor[2], palette.accentGlow[2], amount)),
  ];
}

export function createCongParticleLandscape(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let particles: LandscapeParticle[] = [];
  let params: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let audio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let exclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };
  let cue = createCueEventState();
  let sectionLift = 0;
  let densityLift = 0;
  let motionLift = 0;
  let transientLift = 0;
  let previousTransient = 0;

  function createParticle(): LandscapeParticle {
    const color = baseParticleColor(palette, params.glow);
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      px: 0,
      py: 0,
      vx: 0,
      vy: 0,
      r: color[0],
      g: color[1],
      b: color[2],
      targetR: color[0],
      targetG: color[1],
      targetB: color[2],
      seed: Math.random() * 1000,
      size: 1 + Math.random() * 2.2,
    };
  }

  function buildParticles(count: number): void {
    particles = Array.from({ length: count }, () => {
      const particle = createParticle();
      particle.px = particle.x;
      particle.py = particle.y;
      return particle;
    });
  }

  function syncParticleCount(): void {
    const target = Math.round(MIN_PARTICLES + clamp01(params.density + densityLift * 0.35) * (MAX_PARTICLES - MIN_PARTICLES));
    while (particles.length < target) particles.push(createParticle());
    if (particles.length > target) particles.length = target;
  }

  return {
    setup(_q, _w, _h, _palette) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      time = 0;
      cue = createCueEventState();
      sectionLift = 0;
      densityLift = 0;
      motionLift = 0;
      transientLift = 0;
      previousTransient = 0;
      buildParticles(1500);
    },

    update(dt, nextParams, nextAudio, nextExclusion) {
      params = nextParams;
      audio = nextAudio;
      exclusion = nextExclusion;
      cue.update(dt);
      syncParticleCount();

      sectionLift *= Math.exp(-dt / 3.2);
      densityLift *= Math.exp(-dt / 2.1);
      motionLift *= Math.exp(-dt / 1.7);
      transientLift *= Math.exp(-dt / 0.18);
      if (audio.transient > 0.18 && audio.transient > previousTransient + 0.04) {
        transientLift = Math.max(transientLift, audio.transient);
      }
      previousTransient = audio.transient;

      const color = baseParticleColor(palette, params.glow);
      const colorBlend = 1 - Math.pow(1 - 0.008, dt * 60);
      if (hasReducedMotion()) return;

      time += dt * Math.max(0.3, 0.8 + params.drift * 0.5 + cue.motion * 0.3 + motionLift * 0.42);
      const step = dt * 60;
      const speed = (params.drift * 2.2 + audio.energy * 0.28) * (1 + cue.motion * 1.2 + motionLift * 1.5);

      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index];
        particle.px = particle.x;
        particle.py = particle.y;
        particle.vx = q.noise(particle.x * 0.003, particle.y * 0.003, time * 0.08 + particle.seed * 0.001) * 2 - 1;
        particle.vy = q.noise(particle.x * 0.003 + 130, particle.y * 0.003 + 67, time * 0.08 + particle.seed * 0.001) * 2 - 1;
        particle.x += particle.vx * speed * step;
        particle.y += particle.vy * speed * step;

        if (particle.x < 0) particle.x += w;
        if (particle.x >= w) particle.x -= w;
        if (particle.y < 0) particle.y += h;
        if (particle.y >= h) particle.y -= h;

        const nextColor = cue.mixParticleColor(color, particle.seed);
        particle.targetR = nextColor[0];
        particle.targetG = nextColor[1];
        particle.targetB = nextColor[2];
        particle.r = mix(particle.r, particle.targetR, colorBlend);
        particle.g = mix(particle.g, particle.targetG, colorBlend);
        particle.b = mix(particle.b, particle.targetB, colorBlend);
      }
    },

    draw(_q, ctx) {
      const [br, bg, bb] = palette.bgDark;
      ctx.fillStyle = `rgba(${br},${bg},${bb},${0.04 + audio.energy * 0.03})`;
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index];
        const factors = computeExclusion(particle.x, particle.y, exclusion);
        if (factors.density < 0.3 && particle.seed % 1 > factors.density) continue;
        const densityStep = cue.densityProgress(particle.seed);
        const alpha = (0.025 + params.density * 0.025 + sectionLift * 0.06 + densityLift * 0.028 + transientLift * 0.08)
          * factors.alpha
          * clamp01(1 + densityStep * 0.42);
        const bassBreath = 1 + audio.bass * 0.5;
        const size = particle.size
          * bassBreath
          * (0.7 + params.shimmer * 0.2 + transientLift * 0.9 + cue.sizeProgress(particle.seed) * 0.34);
        ctx.strokeStyle = `rgba(${Math.round(particle.r)},${Math.round(particle.g)},${Math.round(particle.b)},${alpha})`;
        ctx.lineWidth = Math.max(0.55, size * 0.62);
        ctx.beginPath();
        ctx.moveTo(particle.px, particle.py);
        ctx.lineTo(particle.x + particle.vx * size, particle.y + particle.vy * size);
        ctx.stroke();
      }

      ctx.restore();
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      const intensity = clamp01(event.intensity);
      if (event.type === 'section-cue') sectionLift = Math.max(sectionLift, 0.45 + intensity * 0.45);
      if (event.type === 'density-surge') densityLift = Math.max(densityLift, 0.4 + intensity * 0.55);
      if (event.type === 'motion-drift') motionLift = Math.max(motionLift, 0.35 + intensity * 0.6);
      if (event.type === 'spark-burst' || event.type === 'bloom-flash') {
        transientLift = Math.max(transientLift, 0.34 + intensity * 0.66);
      }
    },

    resize(_w, _h) {
      const oldW = Math.max(1, w);
      const oldH = Math.max(1, h);
      w = _w;
      h = _h;
      for (let index = 0; index < particles.length; index += 1) {
        particles[index].x = particles[index].x / oldW * w;
        particles[index].y = particles[index].y / oldH * h;
        particles[index].px = particles[index].x;
        particles[index].py = particles[index].y;
      }
    },

    destroy() {
      particles = [];
    },
  };
}
