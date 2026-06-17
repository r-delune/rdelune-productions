import type { AudioSignal } from '../audio-signal';
import { computeExclusion } from '../exclusion';
import type { Palette } from '../palette';
import { resolveCongCloudOrbitTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { createCueEventState } from './cue-event-state';

interface CloudParticle {
  angle: number;
  radius: number;
  orbitSpeed: number;
  fallSpeed: number;
  baseSize: number;
  depth: number;
  wobble: number;
  seed: number;
}

interface CloudBurst {
  age: number;
  life: number;
  radius: number;
  strength: number;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function mixColor(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(mix(a[0], b[0], t)),
    Math.round(mix(a[1], b[1], t)),
    Math.round(mix(a[2], b[2], t)),
  ];
}

export function createCongCloudOrbit(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let particles: CloudParticle[] = [];
  let bursts: CloudBurst[] = [];
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };
  let tuning = resolveCongCloudOrbitTuning();
  let growth = 0;
  let growthTarget = 0;
  let particleScale = 1;
  let particleScaleTarget = 1;
  let orbitLift = 0;
  let orbitLiftTarget = 0;
  let veilLift = 0;
  let veilLiftTarget = 0;
  let ringLift = 0;
  let ringLiftTarget = 0;
  let colorTarget: [number, number, number] | null = null;
  let colorProgress = 0;
  let colorDuration = 1;
  let sectionCueCount = 0;
  let cue = createCueEventState();
  let phase = 0;
  let phaseAge = 0;

  function resetEventState(): void {
    growth = 0;
    growthTarget = 0;
    particleScale = tuning.initialParticleScale ?? 1;
    particleScaleTarget = particleScale;
    orbitLift = 0;
    orbitLiftTarget = 0;
    veilLift = 0;
    veilLiftTarget = 0;
    ringLift = 0;
    ringLiftTarget = 0;
    colorTarget = null;
    colorProgress = 0;
    colorDuration = 1;
    sectionCueCount = 0;
    phase = 0;
    phaseAge = 0;
  }

  function eventTint(color: [number, number, number], seed?: number): [number, number, number] {
    if (!colorTarget) return color;
    if (seed == null) return mixColor(color, colorTarget, smoothstep(colorProgress) * 0.68);
    const threshold = (Math.sin((seed + 211.5) * 12.9898) * 43758.5453 % 1 + 1) % 1 * 0.72;
    return mixColor(color, colorTarget, smoothstep((colorProgress - threshold) / 0.28) * 0.68);
  }

  function tonalJitter(color: [number, number, number], seed: number, depth: number): [number, number, number] {
    const range = (tuning.particleColorJitter ?? 0) * (0.5 + depth * 0.55);
    if (range <= 0) return color;
    const tonal = (Math.sin(seed * 12.9898) * 43758.5453 % 1) * range - range * 0.5;
    const clampChannel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
    return [
      clampChannel(color[0] + tonal),
      clampChannel(color[1] + tonal * 0.9),
      clampChannel(color[2] + tonal * 0.78),
    ];
  }

  function buildParticles() {
    const maxRadius = Math.max(w, h) * (tuning.maxRadiusScale + 0.12);
    particles = [];
    for (let index = 0; index < tuning.particleCount; index += 1) {
      const depth = Math.random();
      particles.push({
        angle: Math.random() * Math.PI * 2,
        radius: 18 + Math.pow(depth, 0.72) * maxRadius,
        orbitSpeed: 0.07 + depth * 0.42,
        fallSpeed: 0.12 + depth * 0.5,
        baseSize: 0.8 + depth * 4.6,
        depth,
        wobble: 8 + depth * 26,
        seed: Math.random() * 1000,
      });
    }
  }

  return {
    setup(_q, _w, _h, _palette, _tuning) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      tuning = resolveCongCloudOrbitTuning(_tuning);
      time = 0;
      bursts = [];
      cue = createCueEventState();
      resetEventState();
      buildParticles();
    },

    update(dt, params, audio, exclusion) {
      curParams = params;
      curAudio = audio;
      curExclusion = exclusion;

      const reduced = typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) return;

      time += dt * (0.28 + params.drift * 0.9 + audio.energy * 0.18);
      phaseAge += dt;
      growth = mix(growth, growthTarget, 1 - Math.pow(0.001, dt));
      particleScale = mix(particleScale, particleScaleTarget, 1 - Math.pow(0.001, dt));
      orbitLift = mix(orbitLift, orbitLiftTarget, 1 - Math.pow(0.001, dt));
      veilLift = mix(veilLift, veilLiftTarget, 1 - Math.pow(0.001, dt));
      ringLift = mix(ringLift, ringLiftTarget, 1 - Math.pow(0.001, dt));
      if (colorTarget) colorProgress = Math.min(1, colorProgress + dt / colorDuration);
      cue.update(dt);

      for (let index = bursts.length - 1; index >= 0; index -= 1) {
        bursts[index].age += dt;
        if (bursts[index].age >= bursts[index].life) bursts.splice(index, 1);
      }

      const burstChance = phase <= 1 ? 0.02 : phase === 2 ? 0.35 : phase >= 4 ? 1.5 : 0.48;
      if (audio.transient > tuning.burstThreshold && bursts.length < tuning.maxBursts && Math.random() < audio.transient * tuning.burstChanceScale * burstChance) {
        bursts.push({
          age: 0,
          life: 1.2 + audio.transient * 0.8,
          radius: Math.min(w, h) * (0.09 + audio.bass * 0.06),
          strength: 0.28 + audio.transient * 0.6,
        });
      }
    },

    draw(_q, ctx) {
      const [br, bg, bb] = cue.mixBackgroundColor(palette.bgDark);
      ctx.fillStyle = `rgba(${br},${bg},${bb},${tuning.baseFillAlpha})`;
      ctx.fillRect(0, 0, w, h);

      const centerX = w * (tuning.centerX + Math.sin(time * 0.31) * tuning.centerXMotion + curAudio.bass * 0.015);
      const centerY = h * (tuning.centerY + Math.cos(time * 0.24) * tuning.centerYMotion - curAudio.mids * 0.02);
      const [ar, ag, ab] = eventTint(palette.accentGlow);
      const [wr, wg, wb] = eventTint(palette.accentWarm);

      const bloomRadius = Math.max(w, h) * (0.16 + growth * 0.08 + curParams.glow * 0.08 + curAudio.energy * 0.05 + (phase >= 4 ? 0.08 : 0));
      const bloom = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, bloomRadius);
      bloom.addColorStop(0, `rgba(${ar},${ag},${ab},${tuning.bloomAlpha + growth * 0.05 + curParams.glow * 0.1 + curAudio.energy * 0.1})`);
      bloom.addColorStop(0.5, `rgba(${ar},${ag},${ab},${0.02 + veilLift * 0.03 + curParams.glow * 0.035})`);
      bloom.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
      ctx.fillStyle = bloom;
      ctx.fillRect(0, 0, w, h);

      if (phase === 3) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let index = 0; index < 16; index += 1) {
          const cycle = (phaseAge * (0.18 + (index % 4) * 0.035) + index / 16) % 1;
          const angle = index * 2.399 + time * 0.05;
          const distance = Math.min(w, h) * (0.04 + cycle * 0.42);
          const x = centerX + Math.cos(angle) * distance;
          const y = centerY + Math.sin(angle) * distance * 0.68;
          const size = Math.min(w, h) * (0.035 + cycle * 0.06);
          const diffuse = ctx.createRadialGradient(x, y, 0, x, y, size);
          diffuse.addColorStop(0, `rgba(${ar},${ag},${ab},${(1 - cycle) * 0.065})`);
          diffuse.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
          ctx.fillStyle = diffuse;
          ctx.fillRect(x - size, y - size, size * 2, size * 2);
        }
        ctx.restore();
      }

      const ringAlpha = ((tuning.ringAlpha ?? 0) + ringLift * 0.08 + curParams.shimmer * 0.018) * (phase <= 1 ? 0.36 : 1);
      if (ringAlpha > 0.005) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.lineCap = 'round';
        const ringCount = phase <= 1 ? 2 : phase === 2 ? 5 : 6;
        ctx.globalCompositeOperation = phase >= 3 ? 'screen' : 'source-over';
        for (let ring = 0; ring < ringCount; ring += 1) {
          const progress = ring / Math.max(ringCount - 1, 1);
          const radius = Math.max(w, h) * (0.08 + progress * (0.22 + orbitLift * 0.12) + Math.sin(time * 0.22 + ring) * 0.006);
          ctx.strokeStyle = `rgba(${wr},${wg},${wb},${ringAlpha * (1 - progress * 0.55)})`;
          ctx.lineWidth = 0.65 + progress * 1.1 + ringLift * 1.8;
          ctx.beginPath();
          ctx.ellipse(centerX, centerY, radius * (1.2 + orbitLift * 0.12), radius * (0.42 + progress * 0.15), time * 0.06 + ring * 0.18, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      for (let index = 0; index < bursts.length; index += 1) {
        const burst = bursts[index];
        const progress = clamp01(burst.age / burst.life);
        const radius = burst.radius * (2.2 + progress * 3.4);
        const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        glow.addColorStop(0, `rgba(${wr},${wg},${wb},${(1 - progress) * burst.strength * 0.045})`);
        glow.addColorStop(0.5, `rgba(${wr},${wg},${wb},${(1 - progress) * burst.strength * 0.012})`);
        glow.addColorStop(1, `rgba(${wr},${wg},${wb},0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
      }

      const orbitScale = 0.78 + growth * 0.22 + orbitLift * 0.28 + curParams.density * 0.42 + curParams.turbulence * 0.26;
      const fallTravel = h + 120;

      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index];
        const escape = phase >= 4 ? smoothstep((particle.depth - 0.2) / 0.8) : 0;
        const orbit = particle.angle + time * particle.orbitSpeed * (phase <= 1 ? 0.35 : 0.7 + curParams.drift * 1.1);
        const noiseWobble = (q.noise(particle.seed, time * 0.18, particle.depth * 3) - 0.5) * (20 + curParams.turbulence * 70);
        const orbitRadius = particle.radius * orbitScale + noiseWobble;
        const sceneBiasX = Math.sin(particle.seed * 0.017) * w * 0.26;
        const sceneBiasY = Math.cos(particle.seed * 0.021) * h * 0.18;
        const x = centerX
          + sceneBiasX
          + Math.cos(orbit) * orbitRadius * (0.82 + particle.depth * 0.46)
          + Math.cos(particle.angle + Math.PI * 0.5) * phaseAge * 40 * escape
          + Math.sin(time * 0.5 + particle.seed) * particle.wobble * 0.3;
        const fallOffset = ((time * particle.fallSpeed * 120) + particle.seed * 0.37) % fallTravel;
        const y = centerY
          + sceneBiasY
          + Math.sin(orbit * 0.82 + particle.seed * 0.01) * orbitRadius * 0.48
          + fallOffset
          + Math.sin(particle.angle + Math.PI * 0.5) * phaseAge * 40 * escape
          - fallTravel * 0.5;

        const exclusion = computeExclusion(x, y, curExclusion);
        if (exclusion.density < 0.42 && particle.depth > 0.6) continue;
        const eventDensity = cue.densityProgress(particle.seed);
        if (particle.depth > curParams.density + growth + eventDensity * 0.38 + 0.52 && eventDensity < 0) continue;

        const sizeJitter = 1 + Math.sin(particle.seed * 0.033) * (tuning.particleSizeJitter ?? 0) * 0.35;
        const size = particle.baseSize * (phase === 3 ? 2.4 : 1)
          * particleScale
          * sizeJitter
          * (1 + cue.sizeProgress(particle.seed) * 0.52)
          * (0.72 + particle.depth * 0.62 + growth * 0.22 + curParams.glow * 0.45 + curParams.impulse * 0.35 + curAudio.transient * 0.3);
        const tint = clamp01(0.2 + particle.depth * 0.55 + curParams.glow * 0.35);
        const particleColor = tonalJitter(cue.mixParticleColor(eventTint([
          Math.round(mix(palette.dotColor[0], ar, tint)),
          Math.round(mix(palette.dotColor[1], ag, tint)),
          Math.round(mix(palette.dotColor[2], ab, tint)),
        ], particle.seed), particle.seed), particle.seed, particle.depth);
        const [red, green, blue] = particleColor;
        const releaseFade = phase >= 4 ? 1 - clamp01(phaseAge / 2) * escape : 1;
        const alpha = (0.012 + particle.depth * 0.04 + growth * 0.025 + curParams.density * 0.08 + curParams.shimmer * 0.03) * exclusion.alpha * clamp01(1 + eventDensity * 0.62) * (phase <= 1 ? 0.54 : 1) * releaseFade;

        ctx.fillStyle = `rgba(${red},${green},${blue},${alpha})`;
        ctx.beginPath();
        ctx.ellipse(x, y, size * (1.2 + particle.depth * 0.4), size, orbit * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      const duration = Math.max(0.12, (event.durationMs ?? 4200) / 1000);
      if (event.type === 'section-cue') {
        const nextPhase = Math.max(0, event.sectionIndex ?? sectionCueCount + 1);
        if (nextPhase !== phase) phaseAge = 0;
        phase = nextPhase;
        sectionCueCount = phase;
        const nextGrowth = clamp01(0.16 + sectionCueCount * 0.16);
        growthTarget = Math.max(growthTarget, nextGrowth);
        particleScaleTarget = Math.max(particleScaleTarget, (tuning.initialParticleScale ?? 1) + nextGrowth * 0.78);
        orbitLiftTarget = Math.max(orbitLiftTarget, nextGrowth * 0.78);
        veilLiftTarget = Math.max(veilLiftTarget, nextGrowth * 0.62);
      }

      if (event.type === 'storm-release' || event.type === 'density-surge') {
        growthTarget = Math.max(growthTarget, 0.42 + event.intensity * 0.5);
        particleScaleTarget = Math.max(particleScaleTarget, 0.72 + event.intensity * 0.58);
        orbitLiftTarget = Math.max(orbitLiftTarget, 0.34 + event.intensity * 0.52);
      }

      if (event.type === 'motion-drift' || event.type === 'veil-sweep') {
        orbitLiftTarget = Math.max(orbitLiftTarget, 0.3 + event.intensity * 0.6);
        veilLiftTarget = Math.max(veilLiftTarget, 0.36 + event.intensity * 0.52);
        ringLiftTarget = Math.max(ringLiftTarget, event.intensity * 0.7);
      }

      if (event.type === 'grain-bloom' || event.type === 'spark-burst' || event.type === 'glow-pulse' || event.type === 'bloom-flash') {
        ringLiftTarget = Math.max(ringLiftTarget, 0.24 + event.intensity * 0.72);
        particleScaleTarget = Math.max(particleScaleTarget, 0.66 + event.intensity * 0.42);
      }

      if ((event.type === 'color-morph' || event.type === 'palette-morph') && event.color) {
        colorTarget = event.color;
        colorProgress = 0;
        colorDuration = duration;
        veilLiftTarget = Math.max(veilLiftTarget, 0.35 + event.intensity * 0.32);
      }

      if (bursts.length >= tuning.maxBursts) bursts.shift();
      bursts.push({
        age: 0,
        life: 1.4,
        radius: Math.min(w, h) * (0.1 + event.intensity * 0.08),
        strength: 0.24 + event.intensity * 0.36,
      });
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      buildParticles();
    },

    destroy() {
      particles = [];
      bursts = [];
    },
  };
}
