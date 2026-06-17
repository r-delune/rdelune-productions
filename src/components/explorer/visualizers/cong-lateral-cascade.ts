import type { AudioSignal } from '../audio-signal';
import { computeExclusion } from '../exclusion';
import type { Palette } from '../palette';
import { resolveCongLateralCascadeTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { createCueEventState } from './cue-event-state';
import { clamp01, createSeededRandom, hasReducedMotion, mix } from './cong-particle-primitives';

interface CascadeParticle {
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
  reveal: number;
  lane: number;
  colorDelay: number;
  eddySign: number;
}

interface CascadePulse {
  x: number;
  y: number;
  age: number;
  life: number;
  strength: number;
  warm: number;
}

interface CascadeSpark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  seed: number;
  size: number;
}

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function tonalJitter(color: [number, number, number], seed: number, range: number): [number, number, number] {
  if (range <= 0) return color;
  const unit = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  const tonal = (unit - Math.floor(unit) - 0.5) * range;
  const warmUnit = Math.sin(seed * 3.117 + 19.11) * 24634.6345;
  const warmth = (warmUnit - Math.floor(warmUnit) - 0.5) * range * 0.22;
  const clampChannel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  return [
    clampChannel(color[0] + tonal + warmth),
    clampChannel(color[1] + tonal * 0.82 + warmth * 0.2),
    clampChannel(color[2] + tonal * 0.7 - warmth * 0.3),
  ];
}

export function createCongLateralCascade(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let particles: CascadeParticle[] = [];
  let pulses: CascadePulse[] = [];
  let sparks: CascadeSpark[] = [];
  let random = createSeededRandom(1);
  let tuning = resolveCongLateralCascadeTuning();
  let cue = createCueEventState();
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };
  let sectionCueCount = 0;
  let release = 0.18;
  let releaseTarget = 0.18;
  let densityLift = 0;
  let densityLiftTarget = 0;
  let lineLift = 0;
  let lineLiftTarget = 0;
  let eddyLift = 0;
  let eddyLiftTarget = 0;
  let streakLift = 0;
  let streakLiftTarget = 0;
  let disperse = 0;
  let disperseTarget = 0;
  let afterglow = 0;
  let afterglowTarget = 0;
  let colorRipple = 0;
  let colorRippleTarget = 0;
  let warmTurn = 0;
  let warmTurnTarget = 0;

  function resetParticle(particle: CascadeParticle, fromLeft = true): void {
    const margin = 90 + particle.depth * 120;
    particle.x = fromLeft ? -margin - random() * w * 0.34 : random() * w;
    const laneRatio = (particle.lane + 0.5) / Math.max(1, tuning.laneCount);
    const laneY = h * (0.13 + laneRatio * 0.74);
    particle.y = laneY + (random() - 0.5) * h * (0.08 + particle.depth * 0.11);
    particle.px = particle.x;
    particle.py = particle.y;
    particle.vx = 0.84 + random() * 0.46;
    particle.vy = (random() - 0.5) * 0.22;
    particle.phase = random() * Math.PI * 2;
    particle.reveal = random();
    particle.colorDelay = random() * 0.72;
    particle.eddySign = random() < 0.5 ? -1 : 1;
  }

  function buildParticles(): void {
    random = createSeededRandom(tuning.seed);
    particles = Array.from({ length: tuning.particleCount }, (_, index) => {
      const depth = Math.pow(random(), 0.68);
      const particle: CascadeParticle = {
        x: 0,
        y: 0,
        px: 0,
        py: 0,
        vx: 1,
        vy: 0,
        depth,
        size: tuning.pointSize * (0.34 + depth * 2.45) * (0.74 + random() * tuning.sizeJitter),
        speed: tuning.speed * (0.42 + depth * 1.62 + random() * 0.44),
        seed: random() * 1000 + index * 0.31,
        phase: 0,
        reveal: 0,
        lane: index % Math.max(1, tuning.laneCount),
        colorDelay: 0,
        eddySign: 1,
      };
      resetParticle(particle, false);
      return particle;
    });
  }

  function pushPulse(x: number, y: number, intensity: number, warm = 0): void {
    if (pulses.length >= tuning.maxPulses) pulses.shift();
    pulses.push({
      x,
      y,
      age: 0,
      life: 1.1 + intensity * 1.8,
      strength: 0.14 + intensity * 0.46,
      warm,
    });
  }

  function pushSparks(x: number, y: number, intensity: number): void {
    const count = Math.round(tuning.sparkRate * (0.6 + intensity * 1.8));
    for (let index = 0; index < count; index += 1) {
      if (sparks.length > 220) sparks.shift();
      const angle = -0.3 + (random() - 0.5) * Math.PI * 0.72;
      const speed = 32 + random() * 140 + intensity * 80;
      sparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + (random() - 0.5) * 38,
        age: 0,
        life: 0.52 + random() * 0.72 + intensity * 0.35,
        seed: random() * 1000,
        size: 0.7 + random() * 2.4,
      });
    }
  }

  function applySectionCue(): void {
    sectionCueCount += 1;
    if (sectionCueCount <= 1) {
      releaseTarget = Math.max(releaseTarget, 0.22);
      densityLiftTarget = Math.max(densityLiftTarget, 0.06);
      return;
    }
    if (sectionCueCount === 2) {
      releaseTarget = Math.max(releaseTarget, 0.46);
      densityLiftTarget = Math.max(densityLiftTarget, 0.26);
      lineLiftTarget = Math.max(lineLiftTarget, 0.16);
      return;
    }
    if (sectionCueCount === 3) {
      releaseTarget = Math.max(releaseTarget, 0.72);
      densityLiftTarget = Math.max(densityLiftTarget, 0.52);
      lineLiftTarget = Math.max(lineLiftTarget, 0.38);
      colorRippleTarget = 1;
      cue.handle({
        t: time,
        type: 'color-morph',
        target: 'particles',
        intensity: 0.82,
        durationMs: tuning.colorRippleMs,
        palette: { hueShift: -24, saturation: 1.12, brightness: 1.06 },
        releaseMode: 'one-by-one',
      }, palette);
      return;
    }
    if (sectionCueCount === 4) {
      releaseTarget = Math.max(releaseTarget, 0.9);
      densityLiftTarget = Math.max(densityLiftTarget, 0.76);
      lineLiftTarget = Math.max(lineLiftTarget, 0.5);
      eddyLiftTarget = Math.max(eddyLiftTarget, 0.62);
      warmTurnTarget = Math.max(warmTurnTarget, 0.34);
      pushPulse(w * 0.34, h * 0.52, 0.72, 0.5);
      return;
    }
    if (sectionCueCount === 5) {
      releaseTarget = 1;
      densityLiftTarget = 0.92;
      lineLiftTarget = 0.72;
      eddyLiftTarget = 0.84;
      streakLiftTarget = 1;
      warmTurnTarget = 0.82;
      pushPulse(w * 0.26, h * 0.46, 0.92, 1);
      pushSparks(w * 0.22, h * 0.48, 0.92);
      return;
    }

    releaseTarget = 0.58;
    densityLiftTarget = 0.32;
    lineLiftTarget = 0.14;
    eddyLiftTarget = 0.24;
    streakLiftTarget = 0.2;
    disperseTarget = 0.8;
    afterglowTarget = 0.72;
    cue.handle({
      t: time,
      type: 'palette-morph',
      target: 'background',
      intensity: 0.54,
      durationMs: 9000,
      palette: { hueShift: 16, saturation: 0.88, brightness: 0.92 },
    }, palette);
  }

  return {
    setup(_q, _w, _h, _palette, _tuning) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      tuning = resolveCongLateralCascadeTuning(_tuning);
      time = 0;
      pulses = [];
      sparks = [];
      cue = createCueEventState();
      sectionCueCount = 0;
      release = 0.18;
      releaseTarget = 0.18;
      densityLift = 0;
      densityLiftTarget = 0;
      lineLift = 0;
      lineLiftTarget = 0;
      eddyLift = 0;
      eddyLiftTarget = 0;
      streakLift = 0;
      streakLiftTarget = 0;
      disperse = 0;
      disperseTarget = 0;
      afterglow = 0;
      afterglowTarget = 0;
      colorRipple = 0;
      colorRippleTarget = 0;
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
      release = mix(release, releaseTarget, damp);
      lineLift = mix(lineLift, lineLiftTarget, damp);
      eddyLift = mix(eddyLift, eddyLiftTarget, damp);
      streakLift = mix(streakLift, streakLiftTarget, damp);
      disperse = mix(disperse, disperseTarget, damp);
      afterglow = mix(afterglow, afterglowTarget, damp);
      colorRipple = mix(colorRipple, colorRippleTarget, damp);
      warmTurn = mix(warmTurn, warmTurnTarget, damp);
      lineLiftTarget = Math.max(0, lineLiftTarget - dt * 0.035);
      eddyLiftTarget = Math.max(0, eddyLiftTarget - dt * 0.02);
      streakLiftTarget = Math.max(0, streakLiftTarget - dt * 0.028);

      time += dt * (0.34 + params.drift * 0.86 + audio.energy * 0.3 + cue.motion * 0.32);

      const speedScale = (0.28 + params.drift * 0.76 + densityLift * 0.86 + audio.energy * 0.28 + cue.motion * 0.36)
        * (1 - afterglow * 0.22);
      const flowScale = tuning.flowScale * (0.76 + params.turbulence * 1.5 + densityLift * 0.42);
      const lateralBias = 0.42 + densityLift * 0.3 + audio.bass * 0.16;
      const eddyCenterX = w * (0.32 + Math.sin(time * 0.18) * 0.08);
      const eddyCenterY = h * (0.48 + Math.cos(time * 0.14) * 0.1);

      for (const particle of particles) {
        particle.px = particle.x;
        particle.py = particle.y;

        const laneWave = Math.sin(time * (0.42 + particle.depth * 0.28) + particle.phase + particle.lane * 0.62);
        const noise = q.noise(
          particle.x * flowScale,
          particle.y * flowScale,
          particle.seed * 0.01 + time * 0.18,
        );
        const angle = (noise - 0.5) * Math.PI * tuning.noiseStrength * (1.2 + params.turbulence * 1.7)
          + laneWave * (0.08 + lineLift * 0.08);
        let targetVx = lateralBias + Math.cos(angle) * 0.56;
        let targetVy = Math.sin(angle) * (0.34 + params.turbulence * 0.6 + densityLift * 0.24);

        if (eddyLift > 0.01) {
          const dx = particle.x - eddyCenterX;
          const dy = particle.y - eddyCenterY;
          const distance = Math.sqrt(dx * dx + dy * dy) + 0.001;
          const pull = Math.max(0, 1 - distance / (Math.min(w, h) * 0.64));
          const swirl = pull * eddyLift * tuning.eddyStrength * (0.45 + particle.depth);
          targetVx += (-dy / distance) * swirl * particle.eddySign + (eddyCenterX - particle.x) * 0.0002 * eddyLift;
          targetVy += (dx / distance) * swirl * particle.eddySign + (eddyCenterY - particle.y) * 0.00025 * eddyLift;
        }

        targetVy += Math.sin(time * 0.26 + particle.phase) * disperse * (0.2 + particle.depth * 0.32);
        particle.vx = mix(particle.vx, targetVx, 0.042 + particle.depth * 0.038);
        particle.vy = mix(particle.vy, targetVy, 0.04 + particle.depth * 0.032);
        particle.x += particle.vx * particle.speed * speedScale * dt;
        particle.y += particle.vy * particle.speed * speedScale * dt;
        particle.y += laneWave * (0.08 + densityLift * 0.12 + disperse * 0.16);

        if (particle.x > w + 140 || particle.y < -120 || particle.y > h + 120) resetParticle(particle, true);
      }

      for (let index = pulses.length - 1; index >= 0; index -= 1) {
        pulses[index].age += dt;
        if (pulses[index].age >= pulses[index].life) pulses.splice(index, 1);
      }

      for (let index = sparks.length - 1; index >= 0; index -= 1) {
        const spark = sparks[index];
        spark.age += dt;
        spark.x += spark.vx * dt;
        spark.y += spark.vy * dt;
        spark.vx *= Math.pow(0.2, dt);
        spark.vy += 18 * dt;
        if (spark.age >= spark.life) sparks.splice(index, 1);
      }

      if (audio.transient > 0.26 && random() < audio.transient * 0.035) {
        const x = w * (0.14 + random() * 0.26);
        const y = h * (0.18 + random() * 0.64);
        pushPulse(x, y, audio.transient, audio.bass);
        if (audio.highs > 0.38 || cue.bloom > 0.2) pushSparks(x, y, Math.max(audio.highs, audio.transient));
      }
    },

    draw(_q, ctx) {
      const [br, bg, bb] = cue.mixBackgroundColor(palette.bgDark, 4.7);
      const fillAlpha = tuning.trailAlpha + afterglow * 0.03 - Math.min(0.026, densityLift * 0.015);
      ctx.fillStyle = `rgba(${br},${bg},${bb},${Math.max(0.022, fillAlpha)})`;
      ctx.fillRect(0, 0, w, h);

      const [ar, ag, ab] = palette.accentGlow;
      const [wr, wg, wb] = palette.accentWarm;
      const bandY = h * (0.5 + Math.sin(time * 0.18) * (0.03 + eddyLift * 0.03));
      const bandRadius = Math.max(w, h) * (0.22 + densityLift * 0.32 + curParams.glow * 0.08);
      const bandColor = cue.mixForegroundColor([ar, ag, ab], 9.8);
      const band = ctx.createRadialGradient(w * 0.34, bandY, 0, w * 0.34, bandY, bandRadius);
      band.addColorStop(0, `rgba(${bandColor[0]},${bandColor[1]},${bandColor[2]},${0.016 + densityLift * 0.06 + curParams.glow * 0.035 + cue.bloom * 0.04})`);
      band.addColorStop(0.52, `rgba(${bandColor[0]},${bandColor[1]},${bandColor[2]},${0.004 + densityLift * 0.018})`);
      band.addColorStop(1, `rgba(${bandColor[0]},${bandColor[1]},${bandColor[2]},0)`);
      ctx.fillStyle = band;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const visibleDensity = clamp01(0.22 + curParams.density * 0.58 + densityLift * 0.7 + cue.motion * 0.2);
      const scale = 0.38 + densityLift * 1.08 + curParams.glow * 0.36 + cue.bloom * 0.32 + curAudio.transient * 0.12;
      const lineAlpha = tuning.lineAlpha * (0.18 + lineLift + streakLift * 0.54 + cue.sweep * 0.36);

      for (const particle of particles) {
        if (particle.reveal > release) continue;
        const eventDensity = cue.densityProgress(particle.seed);
        const localDensity = clamp01(visibleDensity + eventDensity * 0.36);
        if (particle.depth > localDensity + 0.34 && eventDensity < 0) continue;
        const exclusion = computeExclusion(particle.x, particle.y, curExclusion);
        if (exclusion.density < 0.25 && particle.depth > 0.54) continue;

        const depthAlpha = 0.18 + particle.depth * 0.92;
        const revealAlpha = smoothstep((release - particle.reveal) / 0.24);
        const tint = clamp01(0.14 + particle.depth * 0.5 + curParams.glow * 0.26 + densityLift * 0.18);
        const baseColor: [number, number, number] = [
          Math.round(mix(palette.dotColor[0], ar, tint)),
          Math.round(mix(palette.dotColor[1], ag, tint)),
          Math.round(mix(palette.dotColor[2], ab, tint)),
        ];
        const particleCue = cue.particleProgress(particle.seed);
        const warmMix = curAudio.highs * 0.12 + cue.focus * 0.14 + warmTurn * particleCue * (0.14 + particle.depth * 0.14);
        const mixedColor: [number, number, number] = [
          Math.round(mix(baseColor[0], wr, warmMix)),
          Math.round(mix(baseColor[1], wg, warmMix)),
          Math.round(mix(baseColor[2], wb, warmMix)),
        ];
        const cueColor = cue.mixParticleColor(mixedColor, particle.seed);
        const rippleProgress = smoothstep((colorRipple * Math.max(0.18, particleCue) - particle.colorDelay) / 0.28);
        const rippleColor: [number, number, number] = [
          Math.round(mix(cueColor[0], 216, rippleProgress * tuning.colorRippleRange)),
          Math.round(mix(cueColor[1], 86, rippleProgress * tuning.colorRippleRange * 0.86)),
          Math.round(mix(cueColor[2], 62, rippleProgress * tuning.colorRippleRange * 0.76)),
        ];
        const [red, green, blue] = tonalJitter(
          rippleColor,
          particle.seed,
          tuning.colorJitter * (0.42 + particle.depth * 0.56 + colorRipple * 0.2),
        );
        const alpha = tuning.particleAlpha
          * (0.026 + visibleDensity * 0.058 + particle.depth * 0.036 + curParams.shimmer * 0.018 + cue.bloom * 0.018)
          * depthAlpha
          * revealAlpha
          * exclusion.alpha
          * clamp01(0.6 + localDensity * 0.58)
          * (1 - afterglow * 0.16);
        const size = particle.size * scale * (0.78 + visibleDensity * 0.42 + particle.depth * 0.34) * (1 + cue.sizeProgress(particle.seed) * 0.5);

        if (lineAlpha > 0.002) {
          ctx.strokeStyle = `rgba(${red},${green},${blue},${alpha * lineAlpha * 10})`;
          ctx.lineWidth = Math.max(0.32, size * (0.16 + particle.depth * 0.18 + streakLift * 0.12));
          ctx.beginPath();
          ctx.moveTo(particle.px, particle.py);
          ctx.lineTo(
            particle.x + particle.vx * streakLift * (1.2 + particle.depth * 2.2),
            particle.y + particle.vy * streakLift * (1.2 + particle.depth * 2.2),
          );
          ctx.stroke();
        }

        ctx.fillStyle = `rgba(${red},${green},${blue},${alpha})`;
        ctx.beginPath();
        ctx.ellipse(
          particle.x,
          particle.y,
          size * (1.3 + particle.depth * 0.58 + streakLift * 0.32),
          size,
          Math.atan2(particle.vy, particle.vx),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }

      for (const spark of sparks) {
        const progress = clamp01(spark.age / spark.life);
        const sparkAlpha = (1 - progress) * (0.12 + cue.bloom * 0.08 + curParams.shimmer * 0.08);
        const sparkColor = tonalJitter([wr, wg, wb], spark.seed, tuning.colorJitter);
        ctx.fillStyle = `rgba(${sparkColor[0]},${sparkColor[1]},${sparkColor[2]},${sparkAlpha})`;
        ctx.beginPath();
        ctx.ellipse(spark.x, spark.y, spark.size * (1.6 - progress * 0.6), spark.size, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const pulse of pulses) {
        const progress = clamp01(pulse.age / pulse.life);
        const radius = Math.max(w, h) * (0.08 + progress * (0.32 + pulse.strength * 0.18));
        const alpha = (1 - progress) * pulse.strength;
        const red = Math.round(mix(ar, wr, pulse.warm));
        const green = Math.round(mix(ag, wg, pulse.warm));
        const blue = Math.round(mix(ab, wb, pulse.warm));
        const glow = ctx.createRadialGradient(pulse.x, pulse.y, 0, pulse.x, pulse.y, radius);
        glow.addColorStop(0, `rgba(${red},${green},${blue},${alpha * 0.1})`);
        glow.addColorStop(0.52, `rgba(${red},${green},${blue},${alpha * 0.022})`);
        glow.addColorStop(1, `rgba(${red},${green},${blue},0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(pulse.x - radius, pulse.y - radius, radius * 2, radius * 2);
      }
      ctx.restore();
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      if (event.type === 'section-cue') applySectionCue();
      if (event.type === 'storm-release') {
        releaseTarget = 1;
        densityLiftTarget = Math.max(densityLiftTarget, 0.68 + event.intensity * 0.26);
        streakLiftTarget = Math.max(streakLiftTarget, 0.45 + event.intensity * 0.38);
        warmTurnTarget = Math.max(warmTurnTarget, event.intensity * 0.74);
      }
      if (event.type === 'density-surge') {
        densityLiftTarget = Math.max(densityLiftTarget, 0.42 + event.intensity * 0.5);
        releaseTarget = Math.max(releaseTarget, 0.66 + event.intensity * 0.3);
        lineLiftTarget = Math.max(lineLiftTarget, event.intensity * 0.34);
      }
      if (event.type === 'motion-drift') {
        densityLiftTarget = Math.max(densityLiftTarget, 0.46 + event.intensity * 0.32);
        eddyLiftTarget = Math.max(eddyLiftTarget, 0.3 + event.intensity * 0.52);
        lineLiftTarget = Math.max(lineLiftTarget, event.intensity * 0.36);
      }
      if (event.type === 'color-morph' || event.type === 'palette-morph') {
        if (!event.target || event.target === 'particles' || event.target === 'foreground' || event.target === 'all') {
          colorRippleTarget = Math.max(colorRippleTarget, event.intensity);
          warmTurnTarget = Math.max(warmTurnTarget, event.intensity * 0.44);
        }
        if (event.target === 'background') afterglowTarget = Math.max(afterglowTarget, event.intensity * 0.48);
      }
      if (event.type === 'glow-pulse' || event.type === 'bloom-flash') {
        lineLiftTarget = Math.max(lineLiftTarget, 0.18 + event.intensity * 0.36);
        warmTurnTarget = Math.max(warmTurnTarget, event.intensity * 0.42);
      }
      if (event.type === 'spark-burst') {
        pushSparks(w * (0.16 + random() * 0.28), h * (0.22 + random() * 0.56), event.intensity);
      }
      if (event.type !== 'section-cue') {
        pushPulse(w * (0.14 + random() * 0.36), h * (0.2 + random() * 0.6), event.intensity, warmTurn);
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
      sparks = [];
    },
  };
}
