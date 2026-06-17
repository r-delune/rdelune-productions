import type { AudioSignal } from '../audio-signal';
import type { Palette } from '../palette';
import { resolveCongWaterlineShimmerTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { createCueEventState } from './cue-event-state';
import { clamp01, createSeededRandom, hasReducedMotion, mix } from './cong-particle-primitives';

interface CongParticle {
  x: number;
  y: number;
  px: number;
  py: number;
  lane: 0 | 1;
  depth: number;
  speed: number;
  size: number;
  seed: number;
  age: number;
  life: number;
  burst: number;
}

export function createCongWaterlineShimmer(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let particles: CongParticle[] = [];
  let random = createSeededRandom(7801);
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };
  let cue = createCueEventState();
  let eventFlash = 0;
  let sectionLift = 0;
  let sectionLiftTarget = 0;

  let config = {
    lineCount: 56,
    baseAlpha: 0.05,
    verticalSpread: 0.78,
    particleCount: 900,
    particleAlpha: 0.14,
    particleSpeed: 38,
  };

  function resetParticle(particle: CongParticle, fromLeft = true): void {
    const lane = random() > 0.5 ? 1 : 0;
    const depth = Math.pow(random(), 0.72);
    const spread = 0.18 + config.verticalSpread * 0.74;
    const laneCenter = lane === 0 ? h * 0.42 : h * 0.62;
    const y = laneCenter + (random() - 0.5) * h * spread;
    const startX = fromLeft ? -random() * w * 0.12 : random() * w;

    particle.x = startX;
    particle.y = Math.max(-20, Math.min(h + 20, y));
    particle.px = particle.x;
    particle.py = particle.y;
    particle.lane = lane;
    particle.depth = depth;
    particle.speed = config.particleSpeed * (0.42 + depth * 1.35 + random() * 0.48);
    particle.size = 0.42 + depth * 2.4 + random() * 1.8;
    particle.seed = random() * 10000;
    particle.age = random() * 3;
    particle.life = 5 + random() * 10;
    particle.burst = 0;
  }

  function buildParticles(): void {
    random = createSeededRandom(7801 + Math.round(w * 0.31 + h * 0.73));
    particles = Array.from({ length: config.particleCount }, () => {
      const particle: CongParticle = {
        x: 0,
        y: 0,
        px: 0,
        py: 0,
        lane: 0,
        depth: 0,
        speed: 0,
        size: 1,
        seed: 0,
        age: 0,
        life: 1,
        burst: 0,
      };
      resetParticle(particle, false);
      return particle;
    });
  }

  function isInsideExclusion(x: number, y: number, pad = 0): boolean {
    return x > curExclusion.left - pad
      && x < curExclusion.right + pad
      && y > curExclusion.top - pad
      && y < curExclusion.bottom + pad;
  }

  function congColor(seed: number, lift: number, warmBias: number): [number, number, number] {
    const yellow = 160 + Math.floor(q.noise(seed, time * 0.16, 0) * 95);
    const acid = 70 + Math.floor(q.noise(seed + 20, time * 0.11, 0) * 160);
    const ember = 20 + Math.floor(q.noise(seed + 40, time * 0.13, 0) * 90);
    const [wr, wg, wb] = palette.accentWarm;
    const [gr, gg, gb] = palette.accentGlow;
    const raw: [number, number, number] = warmBias > 0.52
      ? [yellow, Math.max(38, acid * 0.55), ember]
      : [Math.max(40, yellow * 0.72), acid, Math.max(8, ember * 0.36)];
    const glowMix = clamp01(lift * 0.28 + curParams.glow * 0.18);
    const warmMix = clamp01(warmBias * 0.16 + eventFlash * 0.2);
    return cue.mixForegroundColor([
      Math.round(mix(mix(raw[0], gr, glowMix), wr, warmMix)),
      Math.round(mix(mix(raw[1], gg, glowMix), wg, warmMix)),
      Math.round(mix(mix(raw[2], gb, glowMix), wb, warmMix)),
    ], seed);
  }

  return {
    setup(_q, _w, _h, _palette, _tuning) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      const tuning = resolveCongWaterlineShimmerTuning(_tuning);
      config = {
        lineCount: tuning.lineCount,
        baseAlpha: tuning.baseAlpha,
        verticalSpread: tuning.verticalSpread,
        particleCount: Math.max(240, tuning.particleCount),
        particleAlpha: tuning.particleAlpha,
        particleSpeed: tuning.particleSpeed,
      };
      time = 0;
      cue = createCueEventState();
      eventFlash = 0;
      sectionLift = 0;
      sectionLiftTarget = 0;
      buildParticles();
    },

    update(dt, params, audio, exclusion) {
      curParams = params;
      curAudio = audio;
      curExclusion = exclusion;
      cue.update(dt);

      eventFlash = Math.max(0, eventFlash - dt * 1.85);
      sectionLift += (sectionLiftTarget - sectionLift) * Math.min(1, dt * 1.8);
      sectionLiftTarget *= Math.exp(-dt * 0.18);
      if (hasReducedMotion()) return;

      const activity = audio.activity ?? audio.energy;
      time += dt * (0.55 + params.drift * 1.2 + activity * 0.55 + eventFlash * 0.32 + cue.motion * 0.46);

      const flow = config.particleSpeed * (0.34 + params.drift * 1.15 + audio.bass * 0.55 + activity * 0.32 + sectionLift * 0.34);
      const curl = 0.9 + params.turbulence * 2.7 + audio.mids * 1.25 + eventFlash * 1.2;
      const verticalPull = (audio.highs - 0.18) * 18 + Math.sin(time * 0.3) * 5;

      for (const particle of particles) {
        particle.age += dt;
        particle.px = particle.x;
        particle.py = particle.y;

        const noise = q.noise(
          particle.x * 0.0045,
          particle.y * 0.0045 + particle.lane * 20,
          particle.seed * 0.002 + time * 0.09,
        );
        const angle = (noise - 0.5) * Math.PI * curl + Math.sin(time * 0.5 + particle.seed) * 0.22;
        const lanePush = particle.lane === 0 ? -1 : 1;
        const burstLift = particle.burst * (0.65 + audio.transient);

        particle.x += (flow * (0.42 + particle.depth * 0.92) + Math.cos(angle) * 26 * curl + burstLift * 38) * dt;
        particle.y += (
          Math.sin(angle) * 32 * (0.28 + particle.depth)
          + lanePush * Math.sin(time * 0.37 + particle.seed) * 8
          + verticalPull
          + burstLift * (random() - 0.5) * 30
        ) * dt;
        particle.burst = Math.max(0, particle.burst - dt * 1.6);

        if (particle.age > particle.life || particle.x > w + 80 || particle.y < -80 || particle.y > h + 80) {
          resetParticle(particle, true);
        }
      }
    },

    draw(_q, ctx) {
      const [br, bg, bb] = palette.bgDark;
      const fadeAlpha = Math.max(0.035, config.baseAlpha * (0.62 + curAudio.energy * 0.42));
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(${br},${bg},${bb},${fadeAlpha})`;
      ctx.fillRect(0, 0, w, h);

      const activity = curAudio.activity ?? curAudio.energy;
      const density = clamp01(0.38 + curParams.density * 0.52 + activity * 0.24 + sectionLift * 0.2);
      const strokeLift = 0.52 + curAudio.bass * 2.6 + curAudio.mids * 0.9 + curParams.shimmer * 0.7 + eventFlash * 1.2;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';

      for (let i = 0; i < particles.length; i += 1) {
        const particle = particles[i];
        const eventDensity = cue.densityProgress(particle.seed);
        const localDensity = clamp01(density + eventDensity * 0.34);
        if (particle.depth > localDensity + 0.3 && i % 3 !== 0) continue;
        const hidden = isInsideExclusion(particle.x, particle.y, 22) ? 0.16 : 1;
        if (hidden < 0.2 && particle.depth < 0.7) continue;

        const warmBias = q.noise(particle.seed + 80, time * 0.18, 0);
        const [r, g, b] = congColor(particle.seed, particle.depth + activity + sectionLift, warmBias);
        const flicker = q.noise(particle.seed + 120, time * 0.32, 0);
        const alpha = config.particleAlpha
          * hidden
          * (0.22 + particle.depth * 0.95)
          * (0.48 + flicker * 0.72 + eventFlash * 0.5)
          * (0.72 + curParams.glow * 0.46 + cue.focus * 0.24)
          * clamp01(0.58 + localDensity * 0.62);
        const size = particle.size * (0.6 + strokeLift * 0.34 + particle.burst * 0.9) * (1 + cue.sizeProgress(particle.seed) * 0.58);

        if (i % 3 !== 0 || curAudio.highs > 0.12 || eventFlash > 0.1) {
          ctx.strokeStyle = `rgba(${r},${g},${b},${alpha * 0.74})`;
          ctx.lineWidth = Math.max(0.35, size * 0.42);
          ctx.beginPath();
          ctx.moveTo(particle.px, particle.py);
          ctx.lineTo(particle.x, particle.y);
          ctx.stroke();
        }

        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, Math.max(0.35, size * (0.34 + flicker * 0.28)), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    },

    onEvent(event: VisualEvent) {
      eventFlash = Math.min(1, eventFlash + event.intensity * 0.55);
      cue.handle(event, palette);
      if (event.type === 'section-cue') {
        sectionLiftTarget = Math.min(1, sectionLiftTarget + 0.22 + event.intensity * 0.24);
      }
      if (event.type === 'density-surge' || event.type === 'motion-drift' || event.type === 'storm-release') {
        sectionLiftTarget = Math.min(1, sectionLiftTarget + 0.34 + event.intensity * 0.42);
        for (let i = 0; i < Math.min(particles.length, 60); i += 1) {
          particles[Math.floor(random() * particles.length)].burst = 1;
        }
      }
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      buildParticles();
    },

    destroy() {
      particles = [];
    },
  };
}
