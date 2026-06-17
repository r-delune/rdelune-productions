import type { AudioSignal } from '../audio-signal';
import { computeExclusion } from '../exclusion';
import type { Palette } from '../palette';
import { resolveCongLateralCurrentTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { createCueEventState } from './cue-event-state';
import { clamp01, createSeededRandom, mix } from './cong-particle-primitives';

interface LateralParticle {
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
}

interface CurrentPulse {
  x: number;
  y: number;
  age: number;
  life: number;
  strength: number;
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
  const warmth = (warmUnit - Math.floor(warmUnit) - 0.5) * range * 0.18;
  const clampChannel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  return [
    clampChannel(color[0] + tonal + warmth),
    clampChannel(color[1] + tonal * 0.9 + warmth * 0.3),
    clampChannel(color[2] + tonal * 0.78 - warmth * 0.22),
  ];
}

export function createCongLateralCurrent(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let particles: LateralParticle[] = [];
  let pulses: CurrentPulse[] = [];
  let random = createSeededRandom(1);
  let tuning = resolveCongLateralCurrentTuning();
  let cue = createCueEventState();
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };
  let sectionCueCount = 0;
  let growth = 0;
  let growthTarget = 0;
  let afterglow = 0;
  let afterglowTarget = 0;
  let release = 0.42;
  let releaseTarget = 0.42;
  let lineLift = 0;
  let lineLiftTarget = 0;
  let sectionGlow = 0;
  let sectionGlowTarget = 0;
  let currentBand = 0;
  let currentBandTarget = 0;
  let colorTurn = 0;
  let colorTurnTarget = 0;
  let sunPulse = 0;
  let sunPulseTarget = 0;

  function resetParticle(particle: LateralParticle, fromLeft = true): void {
    const margin = 80 + particle.depth * 80;
    particle.x = fromLeft ? -margin - random() * w * 0.28 : random() * w;
    particle.y = random() * h;
    particle.px = particle.x;
    particle.py = particle.y;
    particle.vx = 0.8 + random() * 0.4;
    particle.vy = (random() - 0.5) * 0.3;
    particle.phase = random() * Math.PI * 2;
    particle.reveal = random();
  }

  function buildParticles(): void {
    random = createSeededRandom(tuning.seed);
    particles = Array.from({ length: tuning.particleCount }, (_, index) => {
      const depth = Math.pow(random(), 0.72);
      const particle: LateralParticle = {
        x: 0,
        y: 0,
        px: 0,
        py: 0,
        vx: 1,
        vy: 0,
        depth,
        size: tuning.pointSize * (0.42 + depth * 2.8) * (0.72 + random() * tuning.sizeJitter),
        speed: tuning.speed * (0.45 + depth * 1.45 + random() * 0.35),
        seed: random() * 1000 + index * 0.37,
        phase: 0,
        reveal: 0,
      };
      resetParticle(particle, false);
      return particle;
    });
  }

  function pushPulse(x: number, y: number, intensity: number): void {
    if (pulses.length > 8) pulses.shift();
    pulses.push({
      x,
      y,
      age: 0,
      life: 1.4 + intensity * 1.6,
      strength: 0.16 + intensity * 0.34,
    });
  }

  function applySectionCue(): void {
    sectionCueCount += 1;
    if (sectionCueCount <= 1) {
      growthTarget = Math.max(growthTarget, 0.12);
      releaseTarget = Math.max(releaseTarget, 0.54);
      currentBandTarget = Math.max(currentBandTarget, 0.12);
      return;
    }
    if (sectionCueCount === 2) {
      growthTarget = Math.max(growthTarget, 0.42);
      releaseTarget = 0.78;
      currentBandTarget = Math.max(currentBandTarget, 0.32);
      sectionGlowTarget = Math.max(sectionGlowTarget, 0.18);
      return;
    }
    if (sectionCueCount === 3) {
      growthTarget = Math.max(growthTarget, 0.72);
      releaseTarget = 0.94;
      currentBandTarget = Math.max(currentBandTarget, 0.58);
      lineLiftTarget = Math.max(lineLiftTarget, 0.3);
      sectionGlowTarget = Math.max(sectionGlowTarget, 0.34);
      return;
    }
    if (sectionCueCount === 4) {
      growthTarget = 0.88;
      releaseTarget = 1;
      currentBandTarget = 0.82;
      lineLiftTarget = Math.max(lineLiftTarget, 0.5);
      sectionGlowTarget = 0.58;
      colorTurnTarget = 1;
      cue.handle({
        t: time,
        type: 'color-morph',
        target: 'particles',
        intensity: 0.85,
        durationMs: 7600,
        palette: { hueShift: -34, saturation: 1.12, brightness: 1.08 },
        releaseMode: 'one-by-one',
      }, palette);
      return;
    }

    growthTarget = 0.46;
    releaseTarget = 0.82;
    afterglowTarget = 0.78;
    currentBandTarget = 0.38;
    lineLiftTarget = 0.18;
    sectionGlowTarget = 0.26;
    cue.handle({
      t: time,
      type: 'palette-morph',
      target: 'background',
      intensity: 0.62,
      durationMs: 9000,
      palette: { hueShift: 18, saturation: 0.86, brightness: 0.9 },
    }, palette);
  }

  return {
    setup(_q, _w, _h, _palette, _tuning) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      tuning = resolveCongLateralCurrentTuning(_tuning);
      time = 0;
      pulses = [];
      cue = createCueEventState();
      sectionCueCount = 0;
      growth = 0;
      growthTarget = 0;
      afterglow = 0;
      afterglowTarget = 0;
      release = 0.42;
      releaseTarget = 0.42;
      lineLift = 0;
      lineLiftTarget = 0;
      sectionGlow = 0;
      sectionGlowTarget = 0;
      currentBand = 0;
      currentBandTarget = 0;
      colorTurn = 0;
      colorTurnTarget = 0;
      sunPulse = 0;
      sunPulseTarget = 0;
      buildParticles();
    },

    update(dt, params, audio, exclusion) {
      curParams = params;
      curAudio = audio;
      curExclusion = exclusion;
      cue.update(dt);

      const reduced = typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) return;

      growth = mix(growth, growthTarget, 1 - Math.pow(0.001, dt));
      afterglow = mix(afterglow, afterglowTarget, 1 - Math.pow(0.001, dt));
      release = mix(release, releaseTarget, 1 - Math.pow(0.001, dt));
      lineLift = mix(lineLift, lineLiftTarget, 1 - Math.pow(0.001, dt));
      sectionGlow = mix(sectionGlow, sectionGlowTarget, 1 - Math.pow(0.001, dt));
      currentBand = mix(currentBand, currentBandTarget, 1 - Math.pow(0.001, dt));
      colorTurn = mix(colorTurn, colorTurnTarget, 1 - Math.pow(0.001, dt));
      sunPulse = mix(sunPulse, sunPulseTarget, 1 - Math.pow(0.001, dt));
      lineLiftTarget = Math.max(0, lineLiftTarget - dt * 0.05);
      sunPulseTarget = Math.max(0, sunPulseTarget - dt * 0.06);
      time += dt * (0.36 + params.drift * 0.8 + audio.energy * 0.24 + cue.motion * 0.28);

      const speedScale = (0.32 + params.drift * 0.82 + growth * 0.78 + audio.energy * 0.22 + cue.motion * 0.34)
        * (1 - afterglow * 0.22);
      const flowScale = tuning.flowScale * (0.72 + params.turbulence * 1.45 + growth * 0.45);
      const lateralBias = 0.42 + growth * 0.26 + audio.bass * 0.12;

      for (const particle of particles) {
        particle.px = particle.x;
        particle.py = particle.y;

        const noise = q.noise(
          particle.x * flowScale,
          particle.y * flowScale,
          particle.seed * 0.01 + time * 0.16,
        );
        const angle = (noise - 0.5) * Math.PI * tuning.noiseStrength * (1.25 + params.turbulence * 1.6)
          + Math.sin(time * 0.4 + particle.phase) * 0.1;
        const targetVx = lateralBias + Math.cos(angle) * 0.58;
        const targetVy = Math.sin(angle) * (0.36 + params.turbulence * 0.62 + growth * 0.22);

        particle.vx = mix(particle.vx, targetVx, 0.045 + particle.depth * 0.035);
        particle.vy = mix(particle.vy, targetVy, 0.04 + particle.depth * 0.03);
        particle.x += particle.vx * particle.speed * speedScale * dt;
        particle.y += particle.vy * particle.speed * speedScale * dt;
        particle.y += Math.sin(time * (0.45 + particle.depth * 0.4) + particle.phase) * (0.08 + growth * 0.1);

        if (particle.x > w + 120 || particle.y < -100 || particle.y > h + 100) resetParticle(particle, true);
      }

      for (let index = pulses.length - 1; index >= 0; index -= 1) {
        pulses[index].age += dt;
        if (pulses[index].age >= pulses[index].life) pulses.splice(index, 1);
      }

      if (audio.transient > 0.3 && random() < audio.transient * 0.02) {
        pushPulse(w * (0.16 + random() * 0.18), h * (0.2 + random() * 0.6), audio.transient);
      }
    },

    draw(_q, ctx) {
      const [br, bg, bb] = cue.mixBackgroundColor(palette.bgDark, 3.1);
      const fillAlpha = tuning.trailAlpha + afterglow * 0.024 - Math.min(0.028, growth * 0.016);
      ctx.fillStyle = `rgba(${br},${bg},${bb},${Math.max(0.026, fillAlpha)})`;
      ctx.fillRect(0, 0, w, h);

      const [ar, ag, ab] = palette.accentGlow;
      const [wr, wg, wb] = palette.accentWarm;
      const bandY = h * (0.48 + Math.sin(time * 0.18) * (0.025 + currentBand * 0.025));
      const bandRadius = Math.max(w, h) * (0.2 + currentBand * 0.26 + growth * 0.12 + curParams.glow * 0.06);
      const bandColor = cue.mixForegroundColor([ar, ag, ab], 8.4);
      const band = ctx.createRadialGradient(w * 0.38, bandY, 0, w * 0.38, bandY, bandRadius);
      band.addColorStop(0, `rgba(${bandColor[0]},${bandColor[1]},${bandColor[2]},${0.018 + currentBand * 0.055 + curParams.glow * 0.035 + sectionGlow * 0.04})`);
      band.addColorStop(0.48, `rgba(${bandColor[0]},${bandColor[1]},${bandColor[2]},${0.004 + currentBand * 0.016 + growth * 0.006})`);
      band.addColorStop(1, `rgba(${bandColor[0]},${bandColor[1]},${bandColor[2]},0)`);
      ctx.fillStyle = band;
      ctx.fillRect(0, 0, w, h);

      const sunX = w * 0.72;
      const sunY = h * (0.28 + Math.sin(time * 0.08) * 0.012);
      const sunRadius = Math.max(58, Math.min(w, h) * tuning.sunRadius);
      const sunAlpha = tuning.sunAlpha * (0.82 + curParams.glow * 0.28 + sectionGlow * 0.24 + sunPulse * 0.36);
      const sunColor = cue.mixForegroundColor([
        Math.round(mix(wr, 255, 0.34)),
        Math.round(mix(wg, 158, 0.22)),
        Math.round(mix(wb, 72, 0.18)),
      ], 17.2);
      const sunGlow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius * 3.2);
      sunGlow.addColorStop(0, `rgba(${sunColor[0]},${sunColor[1]},${sunColor[2]},${sunAlpha * 0.52})`);
      sunGlow.addColorStop(0.22, `rgba(${sunColor[0]},${sunColor[1]},${sunColor[2]},${sunAlpha * 0.28})`);
      sunGlow.addColorStop(0.58, `rgba(${sunColor[0]},${sunColor[1]},${sunColor[2]},${sunAlpha * 0.08})`);
      sunGlow.addColorStop(1, `rgba(${sunColor[0]},${sunColor[1]},${sunColor[2]},0)`);
      ctx.fillStyle = sunGlow;
      ctx.fillRect(sunX - sunRadius * 3.2, sunY - sunRadius * 3.2, sunRadius * 6.4, sunRadius * 6.4);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const sunCore = ctx.createRadialGradient(sunX, sunY, sunRadius * 0.08, sunX, sunY, sunRadius);
      sunCore.addColorStop(0, `rgba(255,244,205,${sunAlpha * 0.62})`);
      sunCore.addColorStop(0.46, `rgba(${sunColor[0]},${sunColor[1]},${sunColor[2]},${sunAlpha * 0.42})`);
      sunCore.addColorStop(1, `rgba(${sunColor[0]},${sunColor[1]},${sunColor[2]},${sunAlpha * 0.08})`);
      ctx.fillStyle = sunCore;
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const linework = (curParams.strokeMode ?? 0) >= 0.5;
      const visibleDensity = clamp01(0.34 + curParams.density * 0.64 + growth * 0.58 + cue.motion * 0.24);
      const scale = 0.44 + growth * 0.98 + curParams.glow * 0.42 + cue.bloom * 0.28 + curAudio.transient * 0.12;
      const lineAlpha = (linework ? tuning.lineAlpha : tuning.lineAlpha * 0.16) * (0.34 + lineLift + cue.sweep * 0.45);

      for (const particle of particles) {
        if (particle.reveal > release) continue;
        const eventDensity = cue.densityProgress(particle.seed);
        const localDensity = clamp01(visibleDensity + eventDensity * 0.34);
        if (particle.depth > localDensity + 0.34 && eventDensity < 0) continue;
        const exclusion = computeExclusion(particle.x, particle.y, curExclusion);
        if (exclusion.density < 0.28 && particle.depth > 0.56) continue;

        const depthAlpha = 0.22 + particle.depth * 0.9;
        const revealAlpha = smoothstep((release - particle.reveal) / 0.28);
        const tint = clamp01(0.16 + particle.depth * 0.52 + curParams.glow * 0.28 + growth * 0.18);
        const baseColor: [number, number, number] = [
          Math.round(mix(palette.dotColor[0], ar, tint)),
          Math.round(mix(palette.dotColor[1], ag, tint)),
          Math.round(mix(palette.dotColor[2], ab, tint)),
        ];
        const warmMix = curAudio.highs * 0.12 + cue.focus * 0.15;
        const mixedColor: [number, number, number] = [
          Math.round(mix(baseColor[0], wr, warmMix)),
          Math.round(mix(baseColor[1], wg, warmMix)),
          Math.round(mix(baseColor[2], wb, warmMix)),
        ];
        const redTurnColor = cue.mixParticleColor(mixedColor, particle.seed);
        const colorTurnLocal = colorTurn * cue.particleProgress(particle.seed);
        const turnedColor: [number, number, number] = [
          Math.round(mix(redTurnColor[0], 224, colorTurnLocal * (0.55 + particle.depth * 0.25))),
          Math.round(mix(redTurnColor[1], 74, colorTurnLocal * (0.5 + particle.depth * 0.22))),
          Math.round(mix(redTurnColor[2], 54, colorTurnLocal * (0.46 + particle.depth * 0.18))),
        ];
        const [red, green, blue] = tonalJitter(
          turnedColor,
          particle.seed,
          tuning.colorJitter * (0.35 + particle.depth * 0.55),
        );
        const alpha = tuning.particleAlpha
          * (0.028 + visibleDensity * 0.054 + particle.depth * 0.038 + curParams.shimmer * 0.018 + sectionGlow * 0.024)
          * depthAlpha
          * revealAlpha
          * exclusion.alpha
          * clamp01(0.62 + localDensity * 0.54)
          * (1 - afterglow * 0.12);
        const size = particle.size * scale * (0.8 + visibleDensity * 0.42 + particle.depth * 0.36) * (1 + cue.sizeProgress(particle.seed) * 0.48);

        if (lineAlpha > 0.002) {
          ctx.strokeStyle = `rgba(${red},${green},${blue},${alpha * lineAlpha * 9})`;
          ctx.lineWidth = Math.max(0.35, size * (0.18 + particle.depth * 0.16));
          ctx.beginPath();
          ctx.moveTo(particle.px, particle.py);
          ctx.lineTo(particle.x, particle.y);
          ctx.stroke();
        }

        ctx.fillStyle = `rgba(${red},${green},${blue},${alpha})`;
        ctx.beginPath();
        ctx.ellipse(particle.x, particle.y, size * (1.45 + particle.depth * 0.5), size, Math.atan2(particle.vy, particle.vx), 0, Math.PI * 2);
        ctx.fill();
      }

      for (const pulse of pulses) {
        const progress = clamp01(pulse.age / pulse.life);
        const radius = Math.max(w, h) * (0.08 + progress * 0.34);
        const alpha = (1 - progress) * pulse.strength;
        const glow = ctx.createRadialGradient(pulse.x, pulse.y, 0, pulse.x, pulse.y, radius);
        glow.addColorStop(0, `rgba(${wr},${wg},${wb},${alpha * 0.08})`);
        glow.addColorStop(0.5, `rgba(${wr},${wg},${wb},${alpha * 0.018})`);
        glow.addColorStop(1, `rgba(${wr},${wg},${wb},0)`);
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
        growthTarget = Math.max(growthTarget, 0.45 + event.intensity * 0.32);
        currentBandTarget = Math.max(currentBandTarget, 0.24 + event.intensity * 0.24);
      }
      if (event.type === 'density-surge') {
        growthTarget = Math.max(growthTarget, 0.4 + event.intensity * 0.46);
        releaseTarget = Math.max(releaseTarget, 0.74 + event.intensity * 0.22);
        currentBandTarget = Math.max(currentBandTarget, 0.34 + event.intensity * 0.36);
        sectionGlowTarget = Math.max(sectionGlowTarget, event.intensity * 0.28);
      }
      if (event.type === 'motion-drift') {
        growthTarget = Math.max(growthTarget, 0.5 + event.intensity * 0.34);
        lineLiftTarget = Math.max(lineLiftTarget, event.intensity * 0.45);
        currentBandTarget = Math.max(currentBandTarget, 0.46 + event.intensity * 0.32);
      }
      if (event.type === 'glow-pulse' || event.type === 'grain-bloom' || event.type === 'veil-sweep') {
        lineLiftTarget = Math.max(lineLiftTarget, 0.16 + event.intensity * 0.34);
        sectionGlowTarget = Math.max(sectionGlowTarget, 0.2 + event.intensity * 0.44);
        sunPulseTarget = Math.max(sunPulseTarget, 0.22 + event.intensity * 0.42);
      }
      if (event.type === 'color-morph' || event.type === 'palette-morph') {
        if (!event.target || event.target === 'particles' || event.target === 'foreground' || event.target === 'all') {
          growthTarget = Math.max(growthTarget, 0.46 + event.intensity * 0.22);
          colorTurnTarget = Math.max(colorTurnTarget, event.intensity * 0.88);
        }
        if (event.target === 'background') {
          afterglowTarget = Math.max(afterglowTarget, event.intensity * 0.45);
          sunPulseTarget = Math.max(sunPulseTarget, event.intensity * 0.28);
        }
      }
      if (event.type !== 'section-cue') {
        pushPulse(w * (0.16 + random() * 0.32), h * (0.22 + random() * 0.56), event.intensity);
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
