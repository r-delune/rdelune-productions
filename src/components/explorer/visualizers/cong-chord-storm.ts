import type { AudioSignal } from '../audio-signal';
import { computeExclusion } from '../exclusion';
import type { Palette } from '../palette';
import { resolveCongChordStormTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import {
  buildParticles,
  createSeededRandom,
  drawBurstGlows,
  drawMirroredParticle,
  hasReducedMotion,
  moveOrbitalParticle,
  pushBurst,
  updateBursts,
  type CongBurst,
  type CongParticle,
} from './cong-particle-primitives';

interface Chord {
  a: number;
  b: number;
  radius: number;
  age: number;
  life: number;
  alpha: number;
}

export function createCongChordStorm(): Visualizer {
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let particles: CongParticle[] = [];
  let bursts: CongBurst[] = [];
  let chords: Chord[] = [];
  let ghostChords: Chord[] = [];
  let random = createSeededRandom(11209);
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };
  let tuning = resolveCongChordStormTuning();

  function center() {
    return {
      x: w * (tuning.centerX + Math.sin(time * 0.21) * 0.04 + curAudio.bass * 0.018),
      y: h * (tuning.centerY + Math.cos(time * 0.13) * 0.035),
    };
  }

  function buildField() {
    random = createSeededRandom(11209 + Math.round(w + h * 0.6));
    particles = buildParticles(tuning.particleCount, w, h, 21209);
    chords = [];
    ghostChords = [];
  }

  function addChord(intensity: number) {
    if (chords.length > 10) chords.shift();
    const chord = {
      a: random() * Math.PI * 2,
      b: random() * Math.PI * 2,
      radius: Math.min(w, h) * (0.12 + random() * 0.34 + intensity * 0.08),
      age: 0,
      life: 0.7 + intensity * 0.9,
      alpha: tuning.chordAlpha * (0.6 + intensity),
    };
    chords.push(chord);
    ghostChords.push({ ...chord });
    if (ghostChords.length > 2) ghostChords.shift();
  }

  return {
    setup(_q, _w, _h, _palette, _tuning) {
      w = _w;
      h = _h;
      palette = _palette;
      tuning = resolveCongChordStormTuning(_tuning);
      time = 0;
      bursts = [];
      buildField();
    },

    update(dt, params, audio, exclusion) {
      curParams = params;
      curAudio = audio;
      curExclusion = exclusion;
      if (hasReducedMotion()) return;

      time += dt * (0.36 + params.drift * 0.8 + audio.energy * 0.28);
      const c = center();
      const radiusScale = tuning.radiusScale * (0.82 + params.density * 0.28 + audio.bass * 0.24);
      const speedScale = tuning.speed * (0.62 + params.drift * 0.92 + audio.energy * 0.3);

      for (let index = 0; index < particles.length; index += 1) {
        moveOrbitalParticle(particles[index], dt, c.x, c.y, time, radiusScale, speedScale, 0.74);
      }

      updateBursts(bursts, dt);
      for (let index = chords.length - 1; index >= 0; index -= 1) {
        chords[index].age += dt;
        if (chords[index].age >= chords[index].life) chords.splice(index, 1);
      }

      if (audio.transient > 0.22 && random() < 0.22 + audio.transient * 0.3) {
        addChord(audio.transient);
      }
    },

    draw(_q, ctx) {
      const [br, bg, bb] = palette.bgDark;
      const [ar, ag, ab] = palette.accentGlow;
      const [wr, wg, wb] = palette.accentWarm;
      const c = center();

      ctx.fillStyle = `rgba(${br},${bg},${bb},${tuning.trailAlpha})`;
      ctx.fillRect(0, 0, w, h);

      for (let index = 0; index < particles.length; index += 1) {
        drawMirroredParticle(ctx, particles[index], h, palette, curParams, curAudio, curExclusion, 0.66);
      }

      ctx.save();
      for (let index = 0; index < chords.length; index += 1) {
        const chord = chords[index];
        const progress = chord.age / chord.life;
        const x1 = c.x + Math.cos(chord.a + time * 0.12) * chord.radius;
        const y1 = c.y + Math.sin(chord.a + time * 0.1) * chord.radius * 0.62;
        const x2 = c.x + Math.cos(chord.b - time * 0.1) * chord.radius;
        const y2 = c.y + Math.sin(chord.b - time * 0.12) * chord.radius * 0.62;
        const factors = computeExclusion((x1 + x2) * 0.5, (y1 + y2) * 0.5, curExclusion);
        if (factors.contrast < 0.36) continue;

        ctx.strokeStyle = `rgba(${index % 2 ? wr : ar},${index % 2 ? wg : ag},${index % 2 ? wb : ab},${(1 - progress) * chord.alpha * factors.alpha})`;
        ctx.lineWidth = 0.8 + (1 - progress) * 1.8 + curAudio.transient;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      for (let index = 0; index < ghostChords.length; index += 1) {
        const chord = ghostChords[index];
        if (chords.some((activeChord) => activeChord.a === chord.a && activeChord.b === chord.b)) continue;
        const x1 = c.x + Math.cos(chord.a + time * 0.12) * chord.radius;
        const y1 = c.y + Math.sin(chord.a + time * 0.1) * chord.radius * 0.62;
        const x2 = c.x + Math.cos(chord.b - time * 0.1) * chord.radius;
        const y2 = c.y + Math.sin(chord.b - time * 0.12) * chord.radius * 0.62;
        const factors = computeExclusion((x1 + x2) * 0.5, (y1 + y2) * 0.5, curExclusion);
        if (factors.contrast < 0.36) continue;

        ctx.strokeStyle = `rgba(${index % 2 ? wr : ar},${index % 2 ? wg : ag},${index % 2 ? wb : ab},${chord.alpha * 0.25 * factors.alpha})`;
        ctx.lineWidth = 0.8 + curAudio.transient * 0.45;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.restore();

      const halo = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, Math.max(w, h) * 0.36);
      halo.addColorStop(0, `rgba(${ar},${ag},${ab},${0.06 + curParams.glow * 0.09 + curAudio.energy * 0.05})`);
      halo.addColorStop(0.58, `rgba(${wr},${wg},${wb},${0.012 + curAudio.bass * 0.024})`);
      halo.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);

      drawBurstGlows(ctx, bursts, palette, curExclusion);
    },

    onEvent(event: VisualEvent) {
      const c = center();
      addChord(event.intensity);
      pushBurst(bursts, c.x, c.y, event.intensity, tuning.maxBursts);
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      buildField();
    },

    destroy() {
      particles = [];
      bursts = [];
      chords = [];
      ghostChords = [];
    },
  };
}
