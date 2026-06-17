import type { AudioSignal } from '../audio-signal';
import { computeExclusion } from '../exclusion';
import type { Palette } from '../palette';
import { resolveCongLandscapeFlowTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { createCueEventState } from './cue-event-state';

interface FlowParticle {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  depth: number;
  seed: number;
  lane: 0 | 1 | 2;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function createCongLandscapeFlow(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let eventBoost = 0;
  let particles: FlowParticle[] = [];
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };
  let tuning = resolveCongLandscapeFlowTuning();
  let cue = createCueEventState();
  let phase = 0;

  function respawnParticle(particle: FlowParticle, fromLeft = true) {
    particle.x = fromLeft ? -20 - Math.random() * w * 0.12 : Math.random() * w;
    particle.y = Math.random() * h;
    particle.prevX = particle.x;
    particle.prevY = particle.y;
    particle.seed = Math.random() * 1000;
  }

  function buildParticles() {
    particles = [];
    for (let index = 0; index < tuning.particleCount; index += 1) {
      const particle: FlowParticle = {
        x: 0,
        y: 0,
        prevX: 0,
        prevY: 0,
        depth: Math.random(),
        seed: Math.random() * 1000,
        lane: index % 3 === 0 ? 0 : index % 3 === 1 ? 1 : 2,
      };
      respawnParticle(particle);
      particles.push(particle);
    }
  }

  return {
    setup(_q, _w, _h, _palette, _tuning) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      tuning = resolveCongLandscapeFlowTuning(_tuning);
      time = 0;
      eventBoost = 0;
      cue = createCueEventState();
      phase = 0;
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

      time += dt * (0.34 + params.drift * 0.7 + audio.energy * 0.16);
      eventBoost *= Math.exp(-dt * 2.8);

      const travel = tuning.speed * (0.62 + params.drift * 1.15 + audio.energy * 0.55 + audio.bass * 0.24 + eventBoost * 0.35);
      const verticalSwing = 18 + params.turbulence * 28 + audio.mids * 18;

      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index];
        if ((phase <= 0 && particle.lane !== 0) || (phase < 3 && particle.lane === 2)) continue;
        particle.prevX = particle.x;
        particle.prevY = particle.y;

        const field = q.noise(
          particle.x * tuning.noiseScale + particle.seed,
          particle.y * tuning.noiseScale + particle.seed * 0.3,
          time * (0.8 + particle.depth * 0.6),
        );
        const bias = particle.lane === 2
          ? (Math.sin(particle.seed + time) - 0.5) * Math.PI
          : (particle.lane === 0 ? -0.35 : 0.35) * (phase >= 2 ? 1.8 : 1);
        const angle = field * Math.PI * 2 + bias;
        const phaseSpeed = phase <= 0 ? 0.5 : phase >= 2 ? 1.4 : 1;
        particle.x += Math.cos(angle) * (travel * 0.3 + tuning.driftX * (0.5 + particle.depth)) * dt * phaseSpeed + travel * dt * phaseSpeed;
        particle.y += Math.sin(angle) * verticalSwing * dt;

        if (particle.x > w + 40 || particle.y < -40 || particle.y > h + 40) {
          respawnParticle(particle);
        }
      }
    },

    draw(_q, ctx) {
      const [br, bg, bb] = palette.bgDark;
      const [ar, ag, ab] = palette.accentGlow;
      const [wr, wg, wb] = palette.accentWarm;
      const [dr, dg, db] = palette.dotColor;

      ctx.fillStyle = `rgba(${br},${bg},${bb},${tuning.baseFillAlpha})`;
      ctx.fillRect(0, 0, w, h);

      const haze = ctx.createLinearGradient(0, h * 0.45, w, h * 0.62);
      haze.addColorStop(0, `rgba(${ar},${ag},${ab},${tuning.glowAlpha * 0.55})`);
      haze.addColorStop(0.5, `rgba(${wr},${wg},${wb},${tuning.glowAlpha * 0.32})`);
      haze.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, w, h);

      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index];
        if ((phase <= 0 && particle.lane !== 0) || (phase < 3 && particle.lane === 2)) continue;
        const x = particle.x;
        const y = particle.y;
        const exclusion = computeExclusion(x, y, curExclusion);
        if (exclusion.density < 0.22 && particle.depth > 0.5) continue;

        const tint = particle.lane === 0
          ? clamp01(0.2 + particle.depth * 0.5 + curParams.glow * 0.25)
          : clamp01(0.15 + particle.depth * 0.4 + curAudio.highs * 0.2);
        const unity = phase >= 4 ? [210, 244, 255] as const : null;
        const target = unity ?? (particle.lane === 0 ? [ar, ag, ab] : particle.lane === 1 ? [wr, wg, wb] : [ar, wg, 255] as const);
        const [red, green, blue] = cue.mixParticleColor([
          Math.round(mix(dr, target[0], tint)),
          Math.round(mix(dg, target[1], tint)),
          Math.round(mix(db, target[2], tint)),
        ], particle.seed);
        const alpha = (tuning.strokeAlpha * (0.45 + particle.depth * 0.9 + curParams.density * 0.3 + eventBoost * 0.18)) * exclusion.alpha;

        ctx.strokeStyle = `rgba(${red},${green},${blue},${alpha})`;
        ctx.lineWidth = 0.7 + particle.depth * 1.35 + curAudio.transient * 0.45;
        ctx.beginPath();
        ctx.moveTo(particle.prevX, particle.prevY);
        ctx.lineTo(
          particle.x + (particle.x - particle.prevX) * (0.5 + tuning.lineLength * 0.02),
          particle.y + (particle.y - particle.prevY) * (0.5 + tuning.lineLength * 0.02),
        );
        ctx.stroke();

        if (particle.depth > 0.72) {
          ctx.fillStyle = `rgba(${red},${green},${blue},${alpha * 0.8})`;
          ctx.beginPath();
          ctx.arc(x, y, 0.8 + particle.depth * 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      eventBoost = Math.max(eventBoost, event.intensity);
      if (event.type === 'section-cue') phase = Math.max(0, event.sectionIndex ?? phase + 1);
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      buildParticles();
    },

    destroy() {
      q = null;
      particles = [];
    },
  };
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
