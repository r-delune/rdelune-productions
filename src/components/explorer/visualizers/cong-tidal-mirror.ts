import type { AudioSignal } from '../audio-signal';
import { computeExclusion } from '../exclusion';
import { hsbToRgb, rgbToHsb, type Palette } from '../palette';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import {
  buildParticles,
  clamp01,
  createLowResVectorField,
  createSeededRandom,
  drawBurstGlows,
  getSoftParticleColor,
  hasReducedMotion,
  mix,
  moveFlowParticle,
  pushBurst,
  updateBursts,
  type CongBurst,
  type CongParticle,
  type LowResVectorField,
} from './cong-particle-primitives';
import { createCueEventState } from './cue-event-state';

interface TidalArc {
  upperIndex: number;
  lowerIndex: number;
  age: number;
  life: number;
  alpha: number;
  radius: number;
  seed: number;
}

const PARTICLE_COUNT = 200;
const ARC_COUNT = 28;
const ARM_COUNT = 6;
const MAX_BURSTS = 8;

function shiftedColor(color: [number, number, number], hueShift: number): [number, number, number] {
  if (Math.abs(hueShift) < 0.01) return color;
  const hsb = rgbToHsb(color[0], color[1], color[2]);
  return hsbToRgb(hsb.h + hueShift, hsb.s, hsb.b);
}

export function createCongTidalMirror(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let symmetryAngle = 0;
  let growth = 0;
  let growthTarget = 0.2;
  let sectionCueCount = 0;
  let arcCooldown = 0;
  let horizonY = 0;
  let upperParticles: CongParticle[] = [];
  let lowerParticles: CongParticle[] = [];
  let arcs: TidalArc[] = [];
  let ghostArcs: TidalArc[] = [];
  let bursts: CongBurst[] = [];
  let cue = createCueEventState();
  let random = createSeededRandom(84191);
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };
  let flowField: LowResVectorField = createLowResVectorField(72);

  function centerX(): number {
    return w * 0.5;
  }

  function displayX(particle: CongParticle): number {
    return centerX() + (particle.x - centerX()) * (0.58 + growth * 0.42);
  }

  function upperY(particle: CongParticle): number {
    return horizonY - (h * 0.5 - particle.y);
  }

  function lowerY(particle: CongParticle): number {
    return horizonY * 2 - (h - particle.y);
  }

  function buildField(): void {
    random = createSeededRandom(84191 + Math.round(w * 0.7 + h));
    flowField.resize(w, h * 0.5);
    upperParticles = buildParticles(PARTICLE_COUNT, w, h * 0.5, 15431 + Math.round(w + h));
    lowerParticles = upperParticles.map((particle) => ({
      ...particle,
      y: h - particle.y,
      vx: particle.vx,
      vy: -particle.vy,
      phase: particle.phase + Math.PI,
      seed: particle.seed + 271.7,
    }));
    arcs = [];
    ghostArcs = [];
    for (let index = 0; index < ARC_COUNT; index += 1) {
      addArc(0.22 + random() * 0.38);
      arcs[index].age = random() * arcs[index].life * 0.46;
    }
  }

  function addArc(intensity: number): void {
    const arc: TidalArc = {
      upperIndex: Math.floor(random() * upperParticles.length),
      lowerIndex: Math.floor(random() * lowerParticles.length),
      age: 0,
      life: 1.1 + random() * 1.8 + intensity * 1.15,
      alpha: 0.028 + random() * 0.038 + intensity * 0.048,
      radius: 18 + random() * 42 + intensity * 46,
      seed: random() * 900,
    };
    if (arcs.length >= ARC_COUNT) {
      const expired = arcs.shift();
      if (expired) rememberArc(expired);
    }
    arcs.push(arc);
  }

  function rememberArc(arc: TidalArc): void {
    ghostArcs.push({ ...arc, age: arc.life });
    if (ghostArcs.length > 3) ghostArcs.shift();
  }

  function advanceParticle(particle: CongParticle, lower: boolean, dt: number, flowScale: number, baseSpeed: number): void {
    if (lower) {
      particle.y = h - particle.y;
      particle.vy *= -1;
    }
    const depthFromHorizon = Math.abs(h * 0.5 - particle.y) / Math.max(1, h * 0.5);
    const parallax = (0.38 + depthFromHorizon * 0.56) * (1 - particle.depth * 0.26);
    const driftX = (10 + curParams.drift * 27 + curAudio.energy * 16) * (lower ? -1 : 1);
    moveFlowParticle(particle, q, dt, w, h * 0.5, time, flowScale, baseSpeed * parallax, driftX, flowField);
    if (lower) {
      particle.y = h - particle.y;
      particle.vy *= -1;
    }
    const y = lower ? lowerY(particle) : upperY(particle);
    if (Math.abs(y - horizonY) < 60) {
      const pull = (1 - Math.abs(y - horizonY) / 60) * (0.45 + growth * 0.72);
      particle.vx += (centerX() - particle.x) / Math.max(1, w) * pull;
    }
  }

  function drawParticle(
    ctx: CanvasRenderingContext2D,
    particle: CongParticle,
    y: number,
    arm: number,
    lower: boolean,
  ): void {
    const x = displayX(particle);
    const factors = computeExclusion(x, y, curExclusion);
    if (factors.density < 0.24 && particle.depth > 0.62) return;

    const noise = q.noise(x * 0.0018, y * 0.0018, time * 0.04 + particle.seed);
    const shimmer = (noise - 0.5) * (curParams.shimmer * 0.72 + curAudio.highs * 0.68 + cue.grain * 0.22);
    const densityStep = cue.densityProgress(particle.seed);
    const sizeStep = cue.sizeProgress(particle.seed);
    const base = arm % 2 === 0 ? palette.accentGlow : palette.accentWarm;
    const soft = getSoftParticleColor(particle, palette, curParams, curAudio);
    const armColor = shiftedColor(base, curParams.hueShift);
    const blended: [number, number, number] = [
      Math.round(mix(soft[0], armColor[0], 0.34 + particle.depth * 0.3)),
      Math.round(mix(soft[1], armColor[1], 0.34 + particle.depth * 0.3)),
      Math.round(mix(soft[2], armColor[2], 0.34 + particle.depth * 0.3)),
    ];
    const [red, green, blue] = cue.mixParticleColor(blended, particle.seed);
    const alpha = clamp01(
      (0.014 + curParams.density * 0.036 + growth * 0.03 + particle.depth * 0.026 + shimmer * 0.028 + densityStep * 0.026)
      * factors.alpha
      * (lower ? 0.72 : 1),
    );
    const radius = particle.size
      * (0.38 + growth * 0.36 + curAudio.mids * 0.24 + curParams.shimmer * 0.18 + cue.bloom * 0.2 + sizeStep * 0.22);

    ctx.fillStyle = `rgba(${red},${green},${blue},${alpha})`;
    ctx.beginPath();
    ctx.ellipse(x, y, radius * (1.26 + particle.depth * 0.34), radius, particle.angle * 0.18, 0, Math.PI * 2);
    ctx.fill();

    if ((particle.seed % 4) < 0.8 && (curParams.glow > 0.08 || cue.bloom > 0.03 || curAudio.highs > 0.15)) {
      const glowRadius = radius * (2.8 + curParams.glow * 4.2 + cue.bloom * 2);
      const glow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
      glow.addColorStop(0, `rgba(${red},${green},${blue},${alpha * (0.3 + curParams.glow * 0.25)})`);
      glow.addColorStop(1, `rgba(${red},${green},${blue},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawArc(ctx: CanvasRenderingContext2D, arc: TidalArc, index: number, arm: number, ghost: boolean): void {
    const upper = upperParticles[arc.upperIndex];
    const lower = lowerParticles[arc.lowerIndex];
    if (!upper || !lower) return;

    const x1 = displayX(upper);
    const y1 = upperY(upper);
    const x2 = displayX(lower);
    const y2 = lowerY(lower);
    const midX = (x1 + x2) * 0.5;
    const midY = (y1 + y2) * 0.5;
    const factors = computeExclusion(midX, midY, curExclusion);
    if (factors.contrast < 0.32) return;

    const progress = clamp01(arc.age / arc.life);
    const arcNoise = q.noise(midX * 0.0022, midY * 0.0022, time * 0.12 + arc.seed);
    const arcRadius = arc.radius * (1 + curAudio.bass * 0.38);
    const bend = (arcNoise - 0.5) * (arcRadius + curParams.turbulence * 100);
    const bendX = midX + bend;
    const bendY = horizonY + Math.sin(time * 0.21 + arc.seed) * (5 + curParams.turbulence * 20);
    const tint = shiftedColor(arm % 2 === 0 ? palette.accentGlow : palette.accentWarm, curParams.hueShift);
    const [red, green, blue] = cue.mixForegroundColor(tint, arc.seed + index);
    const fade = ghost ? 0.2 : 1 - progress;
    const alpha = arc.alpha
      * fade
      * (0.5 + curParams.density * 0.8 + curAudio.mids * 0.78 + cue.sweep * 0.34)
      * factors.alpha;

    ctx.strokeStyle = `rgba(${red},${green},${blue},${alpha})`;
    ctx.lineWidth = 0.45 + curAudio.mids * 0.9 + curAudio.transient * 1.35 + (ghost ? 0 : (1 - progress) * 0.48);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(bendX, bendY, x2, y2);
    ctx.stroke();
  }

  return {
    setup(_q, _w, _h, _palette) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      time = 0;
      symmetryAngle = 0;
      growth = 0;
      growthTarget = 0.2;
      sectionCueCount = 0;
      arcCooldown = 0;
      horizonY = h * 0.5;
      bursts = [];
      cue = createCueEventState();
      buildField();
    },

    update(dt, params, audio, exclusion) {
      curParams = params;
      curAudio = audio;
      curExclusion = exclusion;
      cue.update(dt);
      growth = mix(growth, growthTarget, 1 - Math.pow(0.001, dt));
      time += dt * (0.3 + params.drift * 0.8 + audio.energy * 0.22 + cue.motion * 0.15);
      symmetryAngle += dt * (0.04 + params.drift * 0.06);
      horizonY = h * (0.5 + Math.sin(time * 0.07) * 0.018 + audio.bass * 0.022);
      arcCooldown = Math.max(0, arcCooldown - dt);
      updateBursts(bursts, dt);

      for (let index = arcs.length - 1; index >= 0; index -= 1) {
        arcs[index].age += dt;
        if (arcs[index].age >= arcs[index].life) {
          rememberArc(arcs[index]);
          arcs.splice(index, 1);
        }
      }
      while (arcs.length < ARC_COUNT) {
        addArc(0.08 + audio.mids * 0.18);
      }

      if (audio.transient > 0.2 && arcCooldown <= 0) {
        const intensity = clamp01(audio.transient + params.impulse * 0.32);
        addArc(intensity);
        pushBurst(bursts, centerX(), horizonY, intensity, MAX_BURSTS);
        arcCooldown = 0.08 + (1 - audio.transient) * 0.18;
      }

      if (hasReducedMotion()) return;

      const flowScale = 0.0014 + params.turbulence * 0.0008;
      const speedScale = 0.46
        + params.drift * 0.72
        + audio.energy * 0.38
        + cue.motion * 0.28
        + cue.sweep * 0.24;
      flowField.refresh(q, time, flowScale, { seed: 41.2 });
      for (let index = 0; index < upperParticles.length; index += 1) {
        advanceParticle(upperParticles[index], false, dt, flowScale, speedScale);
        advanceParticle(lowerParticles[index], true, dt, flowScale, speedScale);
      }
    },

    draw(_q, ctx) {
      const [br, bg, bb] = cue.mixBackgroundColor(palette.bgDark);
      const cx = centerX();
      const haloColor = cue.mixCenterColor(shiftedColor(palette.accentGlow, curParams.hueShift));
      const warmColor = cue.mixCenterColor(shiftedColor(palette.accentWarm, curParams.hueShift));
      const haloRadius = Math.min(w, h) * (0.28 + curAudio.bass * 0.18 + cue.bloom * 0.12 + growth * 0.22);
      const centerFactors = computeExclusion(cx, horizonY, curExclusion);

      ctx.fillStyle = `rgba(${br},${bg},${bb},0.07)`;
      ctx.fillRect(0, 0, w, h);

      const halo = ctx.createRadialGradient(
        cx,
        horizonY,
        haloRadius * (0.025 + (1 - cue.focus) * 0.095),
        cx,
        horizonY,
        haloRadius,
      );
      halo.addColorStop(0, `rgba(${haloColor[0]},${haloColor[1]},${haloColor[2]},${(0.035 + curParams.glow * 0.09 + cue.bloom * 0.07) * centerFactors.alpha})`);
      halo.addColorStop(0.38, `rgba(${warmColor[0]},${warmColor[1]},${warmColor[2]},${(0.014 + curParams.glow * 0.035 + curAudio.bass * 0.022) * centerFactors.alpha})`);
      halo.addColorStop(1, `rgba(${haloColor[0]},${haloColor[1]},${haloColor[2]},0)`);
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let arm = 0; arm < ARM_COUNT; arm += 1) {
        const armOffset = (Math.PI * 2 * arm) / ARM_COUNT;
        ctx.save();
        ctx.translate(cx, horizonY);
        ctx.rotate(symmetryAngle + armOffset);
        ctx.translate(-cx, -horizonY);

        for (let index = 0; index < ghostArcs.length; index += 1) {
          drawArc(ctx, ghostArcs[index], index, arm, true);
        }
        for (let index = 0; index < arcs.length; index += 1) {
          drawArc(ctx, arcs[index], index, arm, false);
        }
        if (!hasReducedMotion()) {
          for (let index = 0; index < upperParticles.length; index += 1) {
            drawParticle(ctx, upperParticles[index], upperY(upperParticles[index]), arm, false);
            drawParticle(ctx, lowerParticles[index], lowerY(lowerParticles[index]), arm, true);
          }
        }
        drawBurstGlows(ctx, bursts, palette, curExclusion);
        ctx.restore();
      }
      ctx.restore();
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      const impulse = clamp01(event.intensity * (0.65 + curParams.impulse * 0.75));

      if (event.type === 'section-cue') {
        sectionCueCount += 1;
        growthTarget = Math.max(growthTarget, Math.min(1, 0.18 + sectionCueCount * 0.13 + impulse * 0.12));
        addArc(impulse);
      }
      if (event.type === 'storm-release' || event.type === 'density-surge') {
        growthTarget = Math.max(growthTarget, Math.min(1, 0.4 + impulse * 0.48));
        pushBurst(bursts, centerX(), horizonY, impulse, MAX_BURSTS);
        addArc(impulse);
        addArc(impulse * 0.82);
      }
      if (event.type === 'spark-burst' || event.type === 'bloom-flash') {
        pushBurst(bursts, centerX(), horizonY, impulse, MAX_BURSTS);
        addArc(impulse);
      }
      if (event.type === 'glow-pulse' || event.type === 'grain-bloom') {
        cue.focus = Math.min(1, cue.focus + impulse * (event.type === 'grain-bloom' ? 0.42 : 0.14));
        growthTarget = Math.max(growthTarget, Math.min(1, 0.28 + impulse * 0.28));
      }
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      horizonY = h * 0.5;
      buildField();
    },

    destroy() {
      upperParticles = [];
      lowerParticles = [];
      arcs = [];
      ghostArcs = [];
      bursts = [];
      flowField.destroy();
      q = undefined;
    },
  };
}
