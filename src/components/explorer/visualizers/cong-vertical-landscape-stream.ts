import type { AudioSignal } from '../audio-signal';
import { computeExclusion } from '../exclusion';
import type { Palette } from '../palette';
import { resolveCongVerticalLandscapeStreamTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { createCueEventState } from './cue-event-state';
import { clamp01, createSeededRandom, hasReducedMotion, mix } from './cong-particle-primitives';

interface StreamParticle {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  depth: number;
  size: number;
  speed: number;
  seed: number;
  phase: number;
  lane: number;
  shimmerSeed: number;
}

interface DownpourPulse {
  x: number;
  y: number;
  age: number;
  life: number;
  radius: number;
  strength: number;
}

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function terrainHeight(width: number, height: number, x: number, time: number, lift: number): number {
  const nx = width > 0 ? x / width : 0;
  const low = Math.sin(nx * Math.PI * 2.1 + time * 0.11) * 0.035;
  const mid = Math.sin(nx * Math.PI * 5.4 - time * 0.075) * 0.018;
  const high = Math.sin(nx * Math.PI * 9.2 + time * 0.05) * 0.01;
  return height * (0.66 + low + mid + high - lift * 0.045);
}

function tonalJitter(color: [number, number, number], seed: number, range: number): [number, number, number] {
  const unit = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  const jitter = (unit - Math.floor(unit) - 0.5) * range;
  const clampChannel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  return [
    clampChannel(color[0] + jitter),
    clampChannel(color[1] + jitter * 0.84),
    clampChannel(color[2] + jitter * 0.68),
  ];
}

export function createCongVerticalLandscapeStream(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let particles: StreamParticle[] = [];
  let pulses: DownpourPulse[] = [];
  let random = createSeededRandom(1);
  let tuning = resolveCongVerticalLandscapeStreamTuning();
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };
  let sectionCueCount = 0;
  let densityLift = 0;
  let densityLiftTarget = 0;
  let speedLift = 0;
  let speedLiftTarget = 0;
  let horizonLift = 0;
  let horizonLiftTarget = 0;
  let sheetLift = 0;
  let sheetLiftTarget = 0;
  let sizeLift = 0;
  let sizeLiftTarget = 0;
  let streakLift = 0;
  let streakLiftTarget = 0;
  let ridgeLift = 0;
  let ridgeLiftTarget = 0;
  let warmTurn = 0;
  let warmTurnTarget = 0;
  let cue = createCueEventState();

  function resetParticle(particle: StreamParticle, fromTop = true): void {
    const laneRatio = (particle.lane + 0.5) / Math.max(1, tuning.laneCount);
    const laneCenter = w * laneRatio;
    const laneWidth = w / Math.max(1, tuning.laneCount);
    particle.x = laneCenter + (random() - 0.5) * laneWidth * (1.3 + particle.depth * 0.8);
    particle.y = fromTop ? -40 - random() * h * 0.22 : random() * h;
    particle.px = particle.x;
    particle.py = particle.y;
    particle.vx = (random() - 0.5) * 0.22;
    particle.vy = 0.82 + random() * 0.34 + particle.depth * 0.54;
    particle.phase = random() * Math.PI * 2;
    particle.shimmerSeed = random() * 1000;
  }

  function buildParticles(): void {
    random = createSeededRandom(tuning.seed + Math.round(w * 0.37 + h * 0.61));
    particles = Array.from({ length: tuning.particleCount }, (_, index) => {
      const depth = Math.pow(random(), 0.72);
      const particle: StreamParticle = {
        x: 0,
        y: 0,
        px: 0,
        py: 0,
        vx: 0,
        vy: 1,
        depth,
        size: tuning.pointSize * (0.36 + depth * 2.65) * (0.74 + random() * tuning.sizeJitter),
        speed: tuning.speed * (0.42 + depth * 1.7 + random() * 0.34),
        seed: random() * 1000 + index * 0.19,
        phase: 0,
        lane: index % Math.max(1, tuning.laneCount),
        shimmerSeed: 0,
      };
      resetParticle(particle, false);
      return particle;
    });
  }

  function pushPulse(x: number, y: number, intensity: number): void {
    if (pulses.length >= tuning.maxPulses) pulses.shift();
    pulses.push({
      x,
      y,
      age: 0,
      life: 0.9 + intensity * 1.4,
      radius: Math.max(w, h) * (0.06 + intensity * 0.18),
      strength: 0.12 + intensity * 0.42,
    });
  }

  function applySectionCue(intensity: number): void {
    sectionCueCount += 1;
    const step = Math.min(1, sectionCueCount / 5);
    densityLiftTarget = Math.max(densityLiftTarget, 0.18 + step * 0.64 + intensity * 0.12);
    speedLiftTarget = Math.max(speedLiftTarget, 0.14 + step * 0.52 + intensity * 0.22);
    horizonLiftTarget = Math.max(horizonLiftTarget, 0.12 + step * 0.58);
    sheetLiftTarget = Math.max(sheetLiftTarget, step * 0.42);
    sizeLiftTarget = Math.max(sizeLiftTarget, 0.1 + step * 0.32 + intensity * 0.18);
    streakLiftTarget = Math.max(streakLiftTarget, 0.18 + step * 0.46 + intensity * 0.24);
    ridgeLiftTarget = Math.max(ridgeLiftTarget, 0.16 + step * 0.58);
    if (sectionCueCount >= 4) warmTurnTarget = Math.max(warmTurnTarget, 0.36 + intensity * 0.38);
    pushPulse(w * (0.18 + random() * 0.64), h * (0.12 + random() * 0.36), intensity);
  }

  return {
    setup(_q, _w, _h, _palette, _tuning) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      tuning = resolveCongVerticalLandscapeStreamTuning(_tuning);
      time = 0;
      pulses = [];
      cue = createCueEventState();
      sectionCueCount = 0;
      densityLift = 0;
      densityLiftTarget = 0;
      speedLift = 0;
      speedLiftTarget = 0;
      horizonLift = 0;
      horizonLiftTarget = 0;
      sheetLift = 0;
      sheetLiftTarget = 0;
      sizeLift = 0;
      sizeLiftTarget = 0;
      streakLift = 0;
      streakLiftTarget = 0;
      ridgeLift = 0;
      ridgeLiftTarget = 0;
      warmTurn = 0;
      warmTurnTarget = 0;
      buildParticles();
    },

    update(dt, params, audio, exclusion) {
      curParams = params;
      curAudio = audio;
      curExclusion = exclusion;
      cue.update(dt);
      if (hasReducedMotion()) return;

      const damp = 1 - Math.pow(0.001, dt);
      densityLift = mix(densityLift, densityLiftTarget, damp);
      speedLift = mix(speedLift, speedLiftTarget, damp);
      horizonLift = mix(horizonLift, horizonLiftTarget, damp);
      sheetLift = mix(sheetLift, sheetLiftTarget, damp);
      sizeLift = mix(sizeLift, sizeLiftTarget, damp);
      streakLift = mix(streakLift, streakLiftTarget, damp);
      ridgeLift = mix(ridgeLift, ridgeLiftTarget, damp);
      warmTurn = mix(warmTurn, warmTurnTarget, damp);
      densityLiftTarget = Math.max(0, densityLiftTarget - dt * 0.045);
      speedLiftTarget = Math.max(0, speedLiftTarget - dt * 0.055);
      sheetLiftTarget = Math.max(0, sheetLiftTarget - dt * 0.05);
      sizeLiftTarget = Math.max(0, sizeLiftTarget - dt * 0.045);
      streakLiftTarget = Math.max(0, streakLiftTarget - dt * 0.05);
      ridgeLiftTarget = Math.max(0, ridgeLiftTarget - dt * 0.04);
      warmTurnTarget = Math.max(0, warmTurnTarget - dt * 0.035);

      time += dt * (0.5 + params.drift * 0.72 + audio.energy * 0.32 + speedLift * 0.26);
      const flowScale = tuning.flowScale * (0.76 + params.turbulence * 1.15 + densityLift * 0.36);
      const speedScale = 0.26 + params.drift * 0.72 + speedLift * 0.7 + audio.bass * 0.26 + audio.energy * 0.18;
      const shear = tuning.shear * (0.5 + params.turbulence * 0.72 + audio.mids * 0.34 + sheetLift * 0.26);

      for (const particle of particles) {
        particle.px = particle.x;
        particle.py = particle.y;

        const terrain = terrainHeight(w, h, particle.x, time, horizonLift);
        const terrainProximity = smoothstep(1 - Math.abs(particle.y - terrain) / (h * 0.28));
        const noise = q.noise(
          particle.x * flowScale,
          particle.y * flowScale,
          particle.seed * 0.01 + time * 0.13,
        );
        const laneWave = Math.sin(time * (0.33 + particle.depth * 0.22) + particle.phase + particle.lane * 0.57);
        const bend = (noise - 0.5) * tuning.curlStrength * (0.6 + params.turbulence * 1.4);
        const terrainSlide = terrainProximity * (particle.x < w * 0.5 ? -1 : 1) * (0.08 + horizonLift * 0.22);
        const targetVx = bend + laneWave * 0.16 + terrainSlide + Math.sin(time * 0.16 + particle.y * 0.002) * 0.06;
        const targetVy = 0.82 + particle.depth * 0.58 + sheetLift * 0.34 + terrainProximity * (0.08 + densityLift * 0.2);

        particle.vx = mix(particle.vx, targetVx, 0.038 + particle.depth * 0.028);
        particle.vy = mix(particle.vy, targetVy, 0.045 + particle.depth * 0.03);
        particle.x += (particle.vx * shear + Math.sin(time * 0.2 + particle.phase) * 4) * dt * (28 + particle.depth * 34);
        particle.y += particle.vy * particle.speed * speedScale * dt;

        if (particle.y > h + 80 || particle.x < -100 || particle.x > w + 100) resetParticle(particle, true);
      }

      for (let index = pulses.length - 1; index >= 0; index -= 1) {
        pulses[index].age += dt;
        if (pulses[index].age >= pulses[index].life) pulses.splice(index, 1);
      }

      if (audio.transient > 0.3 && random() < audio.transient * 0.12) {
        sheetLiftTarget = Math.max(sheetLiftTarget, 0.34 + audio.transient * 0.46);
        pushPulse(w * random(), h * (0.08 + random() * 0.42), audio.transient);
      }
    },

    draw(_q, ctx) {
      const [br, bg, bb] = palette.bgDark;
      const [ar, ag, ab] = palette.accentGlow;
      const [wr, wg, wb] = palette.accentWarm;
      ctx.fillStyle = `rgba(${br},${bg},${bb},${Math.max(0.026, tuning.trailAlpha - densityLift * 0.01)})`;
      ctx.fillRect(0, 0, w, h);

      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, `rgba(${ar},${ag},${ab},${0.045 + curParams.glow * 0.035 + sheetLift * 0.025})`);
      sky.addColorStop(0.42, `rgba(${ar},${ag},${ab},${0.01 + densityLift * 0.018})`);
      sky.addColorStop(0.78, `rgba(${wr},${wg},${wb},${0.008 + warmTurn * 0.03 + horizonLift * 0.018})`);
      sky.addColorStop(1, `rgba(${br},${bg},${bb},0)`);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      for (let ridge = 0; ridge < tuning.ridgeCount; ridge += 1) {
        const ridgeDepth = ridge / Math.max(1, tuning.ridgeCount - 1);
        const yOffset = h * (ridgeDepth * 0.065 + Math.sin(time * 0.09 + ridge) * 0.006);
        const alpha = tuning.ridgeAlpha * (0.22 + ridgeDepth * 0.72 + horizonLift * 0.7 + ridgeLift * 0.62 + curParams.glow * 0.32);
        ctx.strokeStyle = `rgba(${ar},${ag},${ab},${alpha})`;
        ctx.lineWidth = 0.7 + ridgeDepth * 1.2 + ridgeLift * 1.4;
        ctx.beginPath();
        for (let x = -20; x <= w + 20; x += 22) {
          const y = terrainHeight(w, h, x, time + ridge * 1.7, horizonLift) + yOffset;
          if (x <= -20) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      const visibleDensity = clamp01(0.28 + curParams.density * 0.62 + densityLift * 0.68);
      const particleScale = 0.52 + visibleDensity * 0.72 + curAudio.highs * 0.12;
      for (const particle of particles) {
        const eventDensity = cue.densityProgress(particle.seed);
        const localDensity = clamp01(visibleDensity + eventDensity * 0.34);
        if (particle.depth > localDensity + 0.36 && eventDensity < 0) continue;
        const exclusion = computeExclusion(particle.x, particle.y, curExclusion);
        if (exclusion.density < 0.24 && particle.depth > 0.56) continue;

        const terrain = terrainHeight(w, h, particle.x, time, horizonLift);
        const terrainProximity = smoothstep(1 - Math.abs(particle.y - terrain) / (h * 0.24));
        const depthAlpha = 0.18 + particle.depth * 0.95;
        const tint = clamp01(0.16 + particle.depth * 0.44 + curParams.glow * 0.24 + terrainProximity * 0.18);
        const warmMix = warmTurn * (0.08 + particle.depth * 0.18) + curAudio.highs * 0.08 + terrainProximity * 0.08;
        const baseColor: [number, number, number] = [
          Math.round(mix(mix(palette.dotColor[0], ar, tint), wr, warmMix)),
          Math.round(mix(mix(palette.dotColor[1], ag, tint), wg, warmMix)),
          Math.round(mix(mix(palette.dotColor[2], ab, tint), wb, warmMix)),
        ];
        const [red, green, blue] = tonalJitter(baseColor, particle.shimmerSeed, tuning.colorJitter);
        const alpha = tuning.particleAlpha
          * (0.018 + visibleDensity * 0.06 + particle.depth * 0.052 + curParams.shimmer * 0.018 + sheetLift * 0.018)
          * depthAlpha
          * exclusion.alpha
          * clamp01(0.62 + localDensity * 0.56);
        const size = particle.size * particleScale * (0.8 + terrainProximity * 0.24 + sizeLift * 0.5) * (1 + cue.sizeProgress(particle.seed) * 0.46);
        const streak = tuning.streakLength * (0.4 + particle.depth * 1.22 + speedLift * 0.45 + sheetLift * 0.55 + streakLift * 0.72);

        ctx.strokeStyle = `rgba(${red},${green},${blue},${alpha * tuning.lineAlpha})`;
        ctx.lineWidth = Math.max(0.32, size * (0.14 + particle.depth * 0.18));
        ctx.beginPath();
        ctx.moveTo(particle.px, particle.py);
        ctx.lineTo(particle.x + particle.vx * streak * 0.18, particle.y + streak);
        ctx.stroke();

        ctx.fillStyle = `rgba(${red},${green},${blue},${alpha * 0.86})`;
        ctx.beginPath();
        ctx.ellipse(particle.x, particle.y, size * 0.62, size * (1.5 + particle.depth * 0.42), Math.atan2(particle.vy, particle.vx) - Math.PI / 2, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const pulse of pulses) {
        const progress = clamp01(pulse.age / pulse.life);
        const alpha = (1 - progress) * pulse.strength;
        const radius = pulse.radius * (0.7 + progress * 2.8);
        const glow = ctx.createRadialGradient(pulse.x, pulse.y, 0, pulse.x, pulse.y, radius);
        glow.addColorStop(0, `rgba(${wr},${wg},${wb},${alpha * 0.08})`);
        glow.addColorStop(0.5, `rgba(${ar},${ag},${ab},${alpha * 0.022})`);
        glow.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(pulse.x - radius, pulse.y - radius, radius * 2, radius * 2);
      }

      ctx.restore();
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      const intensity = event.intensity ?? 0.5;
      if (event.type === 'section-cue') applySectionCue(intensity);
      if (event.type === 'density-surge' || event.type === 'storm-release') {
        densityLiftTarget = Math.max(densityLiftTarget, 0.54 + intensity * 0.4);
        speedLiftTarget = Math.max(speedLiftTarget, 0.42 + intensity * 0.42);
        sheetLiftTarget = Math.max(sheetLiftTarget, 0.44 + intensity * 0.38);
        sizeLiftTarget = Math.max(sizeLiftTarget, 0.28 + intensity * 0.36);
        streakLiftTarget = Math.max(streakLiftTarget, 0.36 + intensity * 0.48);
      }
      if (event.type === 'motion-drift' || event.type === 'veil-sweep') {
        speedLiftTarget = Math.max(speedLiftTarget, 0.32 + intensity * 0.44);
        horizonLiftTarget = Math.max(horizonLiftTarget, 0.26 + intensity * 0.48);
        streakLiftTarget = Math.max(streakLiftTarget, 0.26 + intensity * 0.36);
      }
      if (event.type === 'color-morph' || event.type === 'palette-morph' || event.type === 'glow-pulse' || event.type === 'bloom-flash') {
        horizonLiftTarget = Math.max(horizonLiftTarget, 0.28 + intensity * 0.5);
        ridgeLiftTarget = Math.max(ridgeLiftTarget, 0.32 + intensity * 0.52);
        sizeLiftTarget = Math.max(sizeLiftTarget, 0.2 + intensity * 0.26);
        warmTurnTarget = Math.max(warmTurnTarget, 0.24 + intensity * 0.58);
      }
      if (event.type === 'spark-burst' || event.type === 'grain-bloom') {
        sizeLiftTarget = Math.max(sizeLiftTarget, 0.32 + intensity * 0.4);
        streakLiftTarget = Math.max(streakLiftTarget, 0.28 + intensity * 0.34);
      }
      if (event.type !== 'section-cue') {
        pushPulse(w * (0.12 + random() * 0.76), h * (0.08 + random() * 0.5), intensity);
      }
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      buildParticles();
    },

    destroy() {
      particles = [];
      pulses = [];
    },
  };
}
