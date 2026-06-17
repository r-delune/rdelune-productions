import type { AudioSignal } from '../audio-signal';
import { computeExclusion } from '../exclusion';
import type { Palette } from '../palette';
import { resolveCongPlanetCoreTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { createCueEventState } from './cue-event-state';

interface CurrentSpark {
  angle: number;
  radius: number;
  orbitSpeed: number;
  size: number;
  depth: number;
  eccentricity: number;
  centerOffsetX: number;
  centerOffsetY: number;
  radialWarp: number;
  tangentialWarp: number;
  direction: number;
  phase: number;
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

export function createCongPlanetCore(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let sparks: CurrentSpark[] = [];
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };
  let tuning = resolveCongPlanetCoreTuning();
  let cue = createCueEventState();
  let growth = 0;
  let growthTarget = 0.12;
  let coreScale = 0.82;
  let coreScaleTarget = 0.82;
  let sectionCueCount = 0;
  let development = 0;
  let developmentTarget = 0;
  let distortionLift = 0;
  let spreadLift = 0;
  let velocityLift = 0;
  let burstLift = 0;
  // Evolution
  let sectionAge = 0;
  let ringPresence = 0;
  let ringPresenceTarget = 0;
  let activeSparkCount = 0;
  let activeSparkTarget = 0;
  // Crescendo
  let coronaFlare = 0;
  let shockwaveR = 0;
  let shockwaveActive = false;
  let shockwaveAge = 0;
  // BPM pulse
  let beatLift = 0;
  let prevBeatPulse = 0;
  // Spark color wave stagger
  let sparkColorWave = 0;
  let sparkColorWaveDuration = 3.2;

  function buildSparks() {
    const maxRadius = Math.min(w, h) * 0.54;
    sparks = [];
    for (let index = 0; index < tuning.sparkCount; index += 1) {
      const depth = Math.random();
      sparks.push({
        angle: Math.random() * Math.PI * 2,
        radius: 16 + Math.pow(depth, 0.68) * maxRadius,
        orbitSpeed: 0.12 + depth * 0.48 + Math.random() * 0.2,
        size: 0.8 + depth * 2.8,
        depth,
        eccentricity: 0.38 + Math.random() * 0.46,
        centerOffsetX: (Math.random() - 0.5) * w * 0.24,
        centerOffsetY: (Math.random() - 0.5) * h * 0.18,
        radialWarp: 0.09 + Math.random() * 0.24,
        tangentialWarp: Math.min(w, h) * (0.018 + Math.random() * 0.075),
        direction: Math.random() > 0.22 ? 1 : -1,
        phase: Math.random() * 1000,
      });
    }
  }

  function planetCenter() {
    return {
      x: w * (0.42 + Math.sin(time * 0.17) * 0.08 + curAudio.bass * 0.02),
      y: h * (0.45 + Math.cos(time * 0.17) * 0.03 - curAudio.mids * 0.018),
    };
  }

  return {
    setup(_q, _w, _h, _palette, _tuning) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      tuning = resolveCongPlanetCoreTuning(_tuning);
      time = 0;
      cue = createCueEventState();
      growth = 0;
      growthTarget = 0.12;
      coreScale = 0.82;
      coreScaleTarget = 0.82;
      sectionCueCount = 0;
      development = 0;
      developmentTarget = 0;
      distortionLift = 0;
      spreadLift = 0;
      velocityLift = 0;
      burstLift = 0;
      sectionAge = 0;
      ringPresence = 0;
      ringPresenceTarget = 0;
      activeSparkCount = Math.round(tuning.sparkCount * 0.3);
      activeSparkTarget = Math.round(tuning.sparkCount * 0.3);
      coronaFlare = 0;
      shockwaveR = 0;
      shockwaveActive = false;
      shockwaveAge = 0;
      beatLift = 0;
      prevBeatPulse = 0;
      sparkColorWave = 0;
      sparkColorWaveDuration = 3.2;
      buildSparks();
    },

    update(dt, params, audio, exclusion) {
      curParams = params;
      curAudio = audio;
      curExclusion = exclusion;
      cue.update(dt);
      growth = mix(growth, growthTarget, 1 - Math.pow(0.001, dt));
      coreScale = mix(coreScale, coreScaleTarget, 1 - Math.pow(0.001, dt));
      development = mix(development, developmentTarget, 1 - Math.pow(0.01, dt));
      distortionLift *= Math.exp(-dt / 4.4);
      spreadLift *= Math.exp(-dt / 5.2);
      velocityLift *= Math.exp(-dt / 3.2);
      burstLift *= Math.exp(-dt / 0.72);
      // Evolution
      sectionAge += dt;
      ringPresence = mix(ringPresence, ringPresenceTarget, 1 - Math.pow(0.001, dt));
      if (activeSparkCount < activeSparkTarget && Math.random() < 0.08 * dt * 60) activeSparkCount += 1;
      // Crescendo
      coronaFlare *= Math.exp(-dt / 1.6);
      // BPM-locked pulse
      const bp = curAudio.beatPulse ?? 0;
      if (bp > 0.68 && prevBeatPulse <= 0.68) beatLift = Math.max(beatLift, 0.5 + bp * 0.5);
      beatLift = Math.max(0, beatLift - dt * 3.4);
      prevBeatPulse = bp;
      // Spark color wave advance
      if (sparkColorWave < 1) sparkColorWave = Math.min(1, sparkColorWave + dt / sparkColorWaveDuration);
      if (shockwaveActive) {
        shockwaveAge += dt;
        shockwaveR += dt * Math.min(w, h) * 0.38;
        if (shockwaveR > Math.max(w, h)) shockwaveActive = false;
      }

      const reduced = typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) return;

      const intraRamp = smoothstep(Math.min(1, sectionAge / 6)) * 0.18 * development;
      time += dt * (
        0.32
        + params.drift * 0.86
        + audio.energy * 0.18
        + cue.motion * 0.22
        + growth * 0.1
        + velocityLift * 0.44
        + burstLift * 0.26
        + intraRamp * 0.38
      );

    },

    draw(_q, ctx) {
      const { x: centerX, y: centerY } = planetCenter();
      const [ar, ag, ab] = palette.accentGlow;
      const [wr, wg, wb] = palette.accentWarm;
      const [dr, dg, db] = palette.dotColor;
      const [br, bg, bb] = palette.bgDark;

      ctx.fillStyle = `rgba(${br},${bg},${bb},${tuning.baseFillAlpha})`;
      ctx.fillRect(0, 0, w, h);

      const [car, cag, cab] = cue.mixCenterColor([ar, ag, ab]);
      const [cwr, cwg, cwb] = cue.mixCenterColor([wr, wg, wb]);
      const haloRadius = Math.min(w, h) * (0.16 + growth * 0.07 + curParams.glow * 0.12 + curAudio.energy * 0.03 + beatLift * 0.07 + cue.focus * 0.03);
      const halo = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, haloRadius * 2.6);
      halo.addColorStop(0, `rgba(${car},${cag},${cab},${tuning.haloAlpha + growth * 0.07 + curParams.glow * 0.2 + curAudio.energy * 0.1 + cue.focus * 0.12})`);
      halo.addColorStop(0.42, `rgba(${car},${cag},${cab},${0.045 + curParams.glow * 0.08 + cue.focus * 0.04})`);
      halo.addColorStop(1, `rgba(${car},${cag},${cab},0)`);
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);

      const warmHalo = ctx.createRadialGradient(centerX, centerY + haloRadius * 0.18, 0, centerX, centerY + haloRadius * 0.18, haloRadius * 1.8);
      warmHalo.addColorStop(0, `rgba(${cwr},${cwg},${cwb},${tuning.warmHaloAlpha + curAudio.bass * 0.08 + curParams.impulse * 0.1 + cue.bloom * 0.05})`);
      warmHalo.addColorStop(0.5, `rgba(${cwr},${cwg},${cwb},${0.02 + curAudio.bass * 0.03})`);
      warmHalo.addColorStop(1, `rgba(${cwr},${cwg},${cwb},0)`);
      ctx.fillStyle = warmHalo;
      ctx.fillRect(0, 0, w, h);

      const currentDistortion = 0.1 + development * 0.22 + distortionLift * 0.34 + curParams.turbulence * 0.1 + cue.motion * 0.08;
      const currentSpread = growth * 0.12 + development * 0.08 + spreadLift * 0.2 + burstLift * 0.05;
      for (let index = 0; index < Math.min(activeSparkCount, sparks.length); index += 1) {
        const spark = sparks[index];
        const orbitAngle = spark.angle + time * spark.orbitSpeed * spark.direction * (1 + velocityLift * 0.62 + burstLift * 0.44);
        const radialNoise = q.noise(spark.phase * 0.011, time * 0.11, development * 0.5) - 0.5;
        const tangentNoise = q.noise(spark.phase * 0.017 + 31, time * 0.09, growth * 0.4) - 0.5;
        const radialScale = 0.8 + currentSpread + radialNoise * (spark.radialWarp + currentDistortion);
        const radius = spark.radius * radialScale;
        const offsetScale = 0.72 + development * 0.48 + distortionLift * 0.2;
        const localCenterX = centerX + spark.centerOffsetX * offsetScale + Math.sin(time * 0.13 + spark.phase) * w * currentDistortion * 0.035;
        const localCenterY = centerY + spark.centerOffsetY * offsetScale + Math.cos(time * 0.1 + spark.phase) * h * currentDistortion * 0.026;
        const twist = orbitAngle + tangentNoise * (0.45 + currentDistortion * 1.4);
        const crossFlow = spark.tangentialWarp * (0.45 + currentDistortion * 1.8);
        const x = localCenterX + Math.cos(twist) * radius + Math.sin(orbitAngle * 1.7 + spark.phase) * crossFlow;
        const y = localCenterY
          + Math.sin(twist) * radius * (spark.eccentricity + development * 0.05)
          + Math.cos(orbitAngle * 1.31 + spark.phase) * crossFlow * 0.72;
        const exclusion = computeExclusion(x, y, curExclusion);
        if (exclusion.density < 0.24 && spark.depth > 0.55) continue;
        const currentBreak = Math.sin(orbitAngle * (1.4 + spark.depth * 1.5) + spark.phase * 0.03 + time * 0.16);
        if (currentBreak < -0.5 + development * 0.14 + burstLift * 0.1) continue;

        const tint = clamp01(spark.depth * 0.5 + curParams.glow * 0.3 + curAudio.highs * 0.22);
        let [red, green, blue] = cue.mixParticleColor([
          Math.round(mix(dr, ar, tint)),
          Math.round(mix(dg, ag, tint)),
          Math.round(mix(db, ab, tint)),
        ], spark.phase);
        // Spark color wave: one-by-one stagger toward accentWarm on crescendo
        if (sparkColorWave > 0.01) {
          const sparkThreshold = Math.abs(Math.sin(spark.phase * 31.7 + spark.depth * 23.1));
          if (sparkColorWave > sparkThreshold) {
            const waveBlend = Math.min(1, (sparkColorWave - sparkThreshold) / 0.22) * 0.72;
            red   = Math.round(mix(red,   wr, waveBlend));
            green = Math.round(mix(green, wg, waveBlend));
            blue  = Math.round(mix(blue,  wb, waveBlend));
          }
        }
        const size = spark.size * (0.68 + growth * 0.45 + curAudio.transient * 0.45 + curParams.shimmer * 0.4 + cue.bloom * 0.32 + burstLift * 0.38 + cue.sizeProgress(spark.phase) * 0.42);
        const alpha = (0.031 + growth * 0.028 + spark.depth * 0.088 + curAudio.energy * 0.044 + cue.focus * 0.02 + burstLift * 0.026) * exclusion.alpha * clamp01(1 + cue.densityProgress(spark.phase) * 0.5);

        ctx.fillStyle = `rgba(${red},${green},${blue},${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }

      const planetRadius = haloRadius * coreScale * (0.52 + curAudio.bass * 0.16 + curParams.impulse * 0.12 + cue.focus * 0.08);
      const exclusion = computeExclusion(centerX, centerY, curExclusion);
      const planet = ctx.createRadialGradient(
        centerX - planetRadius * 0.22,
        centerY - planetRadius * 0.28,
        0,
        centerX,
        centerY,
        planetRadius,
      );
      planet.addColorStop(0, `rgba(${cwr},${cwg},${cwb},${(0.32 + curParams.glow * 0.16 + curAudio.energy * 0.1 + cue.focus * 0.08) * exclusion.alpha})`);
      planet.addColorStop(0.38, `rgba(${car},${cag},${cab},${(0.22 + curParams.glow * 0.1 + curAudio.bass * 0.08 + cue.focus * 0.05) * exclusion.alpha})`);
      planet.addColorStop(0.82, `rgba(${br},${bg},${bb},${0.68 * exclusion.alpha})`);
      planet.addColorStop(1, `rgba(${br},${bg},${bb},0)`);
      ctx.fillStyle = planet;
      ctx.fillRect(centerX - planetRadius * 1.4, centerY - planetRadius * 1.2, planetRadius * 2.8, planetRadius * 2.4);

      // Evolution: orbital ring emerges from section 2 onward
      if (ringPresence > 0.01) {
        const ringR = planetRadius * 1.82 + curAudio.bass * planetRadius * 0.12;
        const ringAlpha = ringPresence * (0.06 + growth * 0.04 + curAudio.energy * 0.02);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.strokeStyle = `rgba(${car},${cag},${cab},${ringAlpha})`;
        ctx.lineWidth = 1.2 + development * 1.8;
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, ringR, ringR * 0.82, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Crescendo: expanding shockwave ring
      if (shockwaveActive && coronaFlare > 0.02) {
        const shockAlpha = coronaFlare * Math.max(0, 1 - shockwaveR / Math.max(w, h)) * 0.14;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.strokeStyle = `rgba(${cwr},${cwg},${cwb},${shockAlpha})`;
        ctx.lineWidth = 3 + coronaFlare * 5;
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, shockwaveR, shockwaveR * 0.82, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      // Crescendo: corona halo burst
      if (coronaFlare > 0.02) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const coronaR = haloRadius * (2 + coronaFlare * 1.4);
        const coronaGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, coronaR);
        coronaGrad.addColorStop(0, `rgba(${cwr},${cwg},${cwb},${coronaFlare * 0.22})`);
        coronaGrad.addColorStop(0.32, `rgba(${car},${cag},${cab},${coronaFlare * 0.08})`);
        coronaGrad.addColorStop(1, `rgba(${car},${cag},${cab},0)`);
        ctx.fillStyle = coronaGrad;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      const veil = ctx.createLinearGradient(0, centerY - planetRadius * 1.6, 0, centerY + planetRadius * 2.2);
      veil.addColorStop(0, 'rgba(255,255,255,0)');
      veil.addColorStop(0.45, `rgba(${wr},${wg},${wb},${(0.018 + curAudio.bass * 0.025 + curParams.glow * 0.018) * exclusion.alpha})`);
      veil.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = veil;
      ctx.fillRect(0, centerY - planetRadius * 1.8, w, planetRadius * 4);
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      if (event.type === 'section-cue') {
        sectionCueCount += 1;
        sectionAge = 0;
        growthTarget = Math.max(growthTarget, Math.min(1, 0.18 + sectionCueCount * 0.15));
        coreScaleTarget = Math.max(coreScaleTarget, 0.82 + sectionCueCount * 0.08);
        developmentTarget = Math.max(developmentTarget, Math.min(1, 0.16 + sectionCueCount * 0.14));
        distortionLift = Math.max(distortionLift, 0.14 + event.intensity * 0.18);
        spreadLift = Math.max(spreadLift, 0.1 + event.intensity * 0.12);
        // Evolution: ring and spark population
        if (sectionCueCount >= 2) ringPresenceTarget = Math.min(1, (sectionCueCount - 2) * 0.28);
        activeSparkTarget = Math.round(tuning.sparkCount * Math.min(1, 0.3 + sectionCueCount * 0.14));
        // Spark color stagger wave from section 3 onward
        if (sectionCueCount >= 3) { sparkColorWave = 0; sparkColorWaveDuration = 3.2; }
      }
      if (event.type === 'density-surge' || event.type === 'motion-drift') {
        growthTarget = Math.max(growthTarget, Math.min(1, 0.4 + event.intensity * 0.46));
        distortionLift = Math.max(distortionLift, 0.3 + event.intensity * 0.48);
        spreadLift = Math.max(spreadLift, 0.22 + event.intensity * 0.42);
        velocityLift = Math.max(velocityLift, 0.2 + event.intensity * 0.5);
      }
      if (event.type === 'storm-release') {
        growthTarget = Math.max(growthTarget, Math.min(1, 0.4 + event.intensity * 0.46));
        distortionLift = Math.max(distortionLift, 0.3 + event.intensity * 0.48);
        spreadLift = Math.max(spreadLift, 0.22 + event.intensity * 0.42);
        velocityLift = Math.max(velocityLift, 0.2 + event.intensity * 0.5);
        // Crescendo: shockwave + corona on storm-release in late sections
        if (sectionCueCount >= 4) {
          coronaFlare = Math.max(coronaFlare, 0.88 + event.intensity * 0.12);
          shockwaveR = Math.min(w, h) * 0.08;
          shockwaveActive = true;
          shockwaveAge = 0;
          burstLift = Math.max(burstLift, 0.88 + event.intensity * 0.12);
          velocityLift = Math.max(velocityLift, 0.72 + event.intensity * 0.28);
          growthTarget = Math.min(1, growthTarget + 0.18 + event.intensity * 0.22);
          sparkColorWave = 0;
          sparkColorWaveDuration = 2.4;
        }
      }
      if (event.type === 'color-morph' || event.type === 'palette-morph' || event.type === 'focus-shift') {
        coreScaleTarget = Math.max(coreScaleTarget, 1.04 + event.intensity * 0.28);
      }
      if (event.type === 'glow-pulse' || event.type === 'spark-burst' || event.type === 'bloom-flash') {
        coreScaleTarget = Math.max(coreScaleTarget, 1 + event.intensity * 0.24);
        growthTarget = Math.max(growthTarget, Math.min(1, 0.34 + event.intensity * 0.36));
        burstLift = Math.max(burstLift, 0.32 + event.intensity * 0.62);
        velocityLift = Math.max(velocityLift, 0.2 + event.intensity * 0.36);
      }
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      buildSparks();
    },

    destroy() {
      q = null;
      sparks = [];
    },
  };
}
