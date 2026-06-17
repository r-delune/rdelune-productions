import type { AudioSignal } from '../audio-signal';
import type { Palette } from '../palette';
import { resolveCongTopBottomStormTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import {
  buildParticles,
  createSeededRandom,
  drawBurstGlows,
  drawMirroredParticle,
  drawSoftParticle,
  hasReducedMotion,
  moveVerticalParticle,
  pushBurst,
  updateBursts,
  type CongBurst,
  type CongParticle,
} from './cong-particle-primitives';

interface Seam {
  strength: number;
  age: number;
  life: number;
}

export function createCongTopBottomStorm(): Visualizer {
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let particles: CongParticle[] = [];
  let bursts: CongBurst[] = [];
  let random = createSeededRandom(13127);
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };
  let tuning = resolveCongTopBottomStormTuning();
  // Section evolution
  let sectionCueCount = 0;
  let sectionAge = 0;
  let developmentLevel = 0;
  let developmentLevelTarget = 0;
  let collisionFlash = 0;
  let seams: Seam[] = [];

  function buildField() {
    random = createSeededRandom(13127 + Math.round(w * 0.5 + h));
    particles = buildParticles(tuning.particleCount, w, h, 23127);
    for (let index = 0; index < particles.length; index += 1) {
      particles[index].y = random() * h;
      particles[index].x = random() * w * 0.92;
      particles[index].speed *= 0.82 + random() * 0.48;
      // ~45% of particles flow upward — creates two opposing storm currents
      if (particles[index].depth < 0.45) particles[index].speed *= -1;
    }
  }

  return {
    setup(_q, _w, _h, _palette, _tuning) {
      w = _w;
      h = _h;
      palette = _palette;
      tuning = resolveCongTopBottomStormTuning(_tuning);
      time = 0;
      bursts = [];
      sectionCueCount = 0;
      sectionAge = 0;
      developmentLevel = 0;
      developmentLevelTarget = 0;
      collisionFlash = 0;
      seams = [];
      buildField();
    },

    update(dt, params, audio, exclusion) {
      curParams = params;
      curAudio = audio;
      curExclusion = exclusion;
      if (hasReducedMotion()) return;

      time += dt * (0.58 + params.drift * 0.92 + audio.energy * 0.28);
      const speedScale = tuning.speed * (0.52 + params.drift * 0.8 + audio.bass * 0.4 + audio.energy * 0.24);
      const sway = tuning.sway * (0.5 + params.turbulence * 0.9 + audio.mids * 0.5);

      for (let index = 0; index < particles.length; index += 1) {
        moveVerticalParticle(particles[index], dt, w, h, time, speedScale, sway);
        // Wrap upward-moving particles at the top boundary
        if (particles[index].y < -40) {
          particles[index].y = h + 30;
          particles[index].x = ((particles[index].x + w * 0.37) % (w + 80)) - 40;
        }
      }

      updateBursts(bursts, dt);
      if (audio.transient > 0.34 && random() < audio.transient * 0.18) {
        pushBurst(bursts, w * (0.18 + random() * 0.44), h * (0.18 + random() * 0.64), audio.transient, tuning.maxBursts);
      }

      // Section state evolution
      sectionAge += dt;
      collisionFlash *= Math.exp(-dt / 0.5);
      developmentLevel += (developmentLevelTarget - developmentLevel) * (1 - Math.pow(0.25, dt));
      for (let i = seams.length - 1; i >= 0; i--) {
        seams[i].age += dt;
        if (seams[i].age >= seams[i].life) seams.splice(i, 1);
      }
    },

    draw(_q, ctx) {
      const [br, bg, bb] = palette.bgDark;
      const [ar, ag, ab] = palette.accentGlow;
      const [wr, wg, wb] = palette.accentWarm;

      // 1. Trail fade
      ctx.fillStyle = `rgba(${br},${bg},${bb},${tuning.trailAlpha})`;
      ctx.fillRect(0, 0, w, h);

      // 2. Edge glows — top and bottom 12%, no centred blob
      const edgeAlpha = 0.018 + curAudio.bass * 0.018 + developmentLevel * 0.012;
      const edgeGlow = ctx.createLinearGradient(0, 0, 0, h);
      edgeGlow.addColorStop(0,    `rgba(${ar},${ag},${ab},${edgeAlpha})`);
      edgeGlow.addColorStop(0.12, `rgba(${ar},${ag},${ab},0)`);
      edgeGlow.addColorStop(0.88, `rgba(${ar},${ag},${ab},0)`);
      edgeGlow.addColorStop(1,    `rgba(${ar},${ag},${ab},${edgeAlpha})`);
      ctx.fillStyle = edgeGlow;
      ctx.fillRect(0, 0, w, h);

      // 3. Atmospheric drifting bands — slow horizontal aurora-like depth layers
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let b = 0; b < 6; b++) {
        const bandY = h * (0.15 + b * 0.14 + Math.sin(time * (0.08 + b * 0.03) + b * 1.3) * 0.06);
        const bandAlpha = (0.006 + developmentLevel * 0.004) * (b % 2 === 0 ? 1 : 0.6);
        const [pr, pg, pb] = b % 3 === 1 ? [wr, wg, wb] : [ar, ag, ab];
        const band = ctx.createLinearGradient(0, bandY - 40, 0, bandY + 40);
        band.addColorStop(0,   `rgba(${pr},${pg},${pb},0)`);
        band.addColorStop(0.5, `rgba(${pr},${pg},${pb},${bandAlpha})`);
        band.addColorStop(1,   `rgba(${pr},${pg},${pb},0)`);
        ctx.fillStyle = band;
        ctx.fillRect(0, bandY - 40, w, 80);
      }
      ctx.restore();

      // 4. Horizontal seam flash at collision midline
      if (collisionFlash > 0.02 || seams.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const seamAlpha = collisionFlash * (0.08 + curAudio.bass * 0.04);
        const seamGrad = ctx.createLinearGradient(0, h * 0.5 - 12, 0, h * 0.5 + 12);
        seamGrad.addColorStop(0,   `rgba(${wr},${wg},${wb},0)`);
        seamGrad.addColorStop(0.5, `rgba(${wr},${wg},${wb},${seamAlpha})`);
        seamGrad.addColorStop(1,   `rgba(${wr},${wg},${wb},0)`);
        ctx.fillStyle = seamGrad;
        ctx.fillRect(0, h * 0.5 - 12, w, 24);
        // Seams from events
        for (const s of seams) {
          const t = s.age / s.life;
          const sAlpha = s.strength * (1 - t) * (1 - t) * 0.1;
          const halfH = 6 + (1 - t) * 18;
          const sg = ctx.createLinearGradient(0, h * 0.5 - halfH, 0, h * 0.5 + halfH);
          sg.addColorStop(0,   `rgba(${wr},${wg},${wb},0)`);
          sg.addColorStop(0.5, `rgba(${wr},${wg},${wb},${sAlpha})`);
          sg.addColorStop(1,   `rgba(${wr},${wg},${wb},0)`);
          ctx.fillStyle = sg;
          ctx.fillRect(0, h * 0.5 - halfH, w, halfH * 2);
        }
        ctx.restore();
      }

      // 5. Particles
      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index];
        if (particle.depth > 0.52) {
          drawMirroredParticle(ctx, particle, h, palette, curParams, curAudio, curExclusion, 0.52);
        } else {
          drawSoftParticle(ctx, particle, palette, curParams, curAudio, curExclusion, 0.58);
        }
      }

      // 6. Audio transient diagonal lines
      if (curAudio.transient > 0.03 || curParams.impulse > 0.03) {
        ctx.save();
        ctx.strokeStyle = `rgba(${wr},${wg},${wb},${0.025 + curAudio.transient * 0.08 + curParams.impulse * 0.06})`;
        ctx.lineWidth = 1 + curAudio.transient * 2;
        for (let index = 0; index < 4; index += 1) {
          const y = h * (0.18 + index * 0.2 + Math.sin(time * 0.4 + index) * 0.025);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w * (0.62 + curAudio.bass * 0.08), h - y * 0.42);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 7. Burst glows — only for audio transients, not section events
      drawBurstGlows(ctx, bursts, palette, curExclusion);
    },

    onEvent(event: VisualEvent) {
      if (event.type === 'section-cue') {
        sectionCueCount++;
        sectionAge = 0;
        developmentLevelTarget = Math.min(1, sectionCueCount / 7);
        collisionFlash = Math.max(collisionFlash, 0.5 + event.intensity * 0.4);
        seams.push({ strength: 0.4 + event.intensity * 0.3, age: 0, life: 1.4 });
      } else if (event.type === 'storm-release') {
        collisionFlash = Math.max(collisionFlash, 0.75 + event.intensity * 0.25);
        seams.push({ strength: 0.7 + event.intensity * 0.3, age: 0, life: 2.2 });
      } else {
        // Other events (bloom-flash, density-surge, etc.) — radial burst glows
        pushBurst(bursts, w * (0.22 + random() * 0.56), h * (0.18 + random() * 0.62), event.intensity * 0.55, tuning.maxBursts);
      }
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
