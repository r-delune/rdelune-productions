import type { AudioSignal } from '../audio-signal';
import { computeExclusion } from '../exclusion';
import type { Palette } from '../palette';
import { resolveCongRainShowerTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { createCueEventState } from './cue-event-state';
import { clamp01, hasReducedMotion } from './cong-particle-primitives';

interface RainDrop {
  baseX: number;
  y: number;
  speed: number;
  length: number;
  swing: number;
  thickness: number;
  phase: number;
  colorPhase: number;
  speedJitter: number;
  radius: number;
  depth: number;
  reverse: boolean;
}

interface RainPulse {
  x: number;
  y: number;
  age: number;
  life: number;
  radius: number;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function seededUnit(value: number): number {
  const x = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function createCongRainShower(): Visualizer {
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let drops: RainDrop[] = [];
  let pulses: RainPulse[] = [];
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };
  let tuning = resolveCongRainShowerTuning();
  let cue = createCueEventState();
  let sectionCueCount = 0;
  let densityLift = 0;
  let densityLiftTarget = 0;
  let speedLift = 0;
  let speedLiftTarget = 0;
  let lengthLift = 0;
  let lengthLiftTarget = 0;
  let thicknessLift = 0;
  let thicknessLiftTarget = 0;
  let warmTurn = 0;
  let warmTurnTarget = 0;
  let phase = 0;
  let orbPresence = 0;
  let orbPresenceTarget = 0;
  let orbGrowth = 0;
  let orbGrowthTarget = 0;
  // Evolution
  let sectionAge = 0;
  let phaseMomentum = 0;
  let orbitalReveal = 0;
  let phaseDropFloor = 0;
  let phaseDropFloorTarget = 0;
  // Crescendo
  let stormFlash = 0;
  let reverseStormActive = false;
  let reverseStormAge = 0;
  // Drop color wave stagger
  let dropColorWave = 0;
  let dropColorWaveDuration = 3.8;

  function buildDrops() {
    const orbitalWidth = w * tuning.orbitalWidthRatio;
    drops = [];
    for (let index = 0; index < tuning.dropCount; index += 1) {
      const depth = Math.random();
      drops.push({
        baseX: Math.random() * w,
        y: Math.random() * h,
        speed: 48 + depth * 150,
        length: 8 + depth * 26,
        swing: 4 + depth * 26,
        thickness: 0.4 + depth * 1.6,
        phase: Math.random() * Math.PI * 2,
        colorPhase: Math.random() * Math.PI * 2,
        speedJitter: 0.72 + Math.random() * 0.62,
        radius: (Math.random() - 0.5) * orbitalWidth,
        depth,
        reverse: false,
      });
    }
  }

  function recycleDrop(drop: RainDrop, fromTop: boolean) {
    drop.baseX = Math.random() * w;
    drop.y = fromTop ? -20 - Math.random() * h * 0.2 : h + 20 + Math.random() * h * 0.2;
    drop.phase = Math.random() * Math.PI * 2;
    drop.colorPhase = Math.random() * Math.PI * 2;
    drop.speedJitter = 0.72 + Math.random() * 0.62;
    drop.reverse = phase >= 4 && Math.random() < 0.2;
    if (phase >= 4) drop.y = Math.random() * h;
  }

  return {
    setup(_q, _w, _h, _palette, _tuning) {
      w = _w;
      h = _h;
      palette = _palette;
      tuning = resolveCongRainShowerTuning(_tuning);
      time = 0;
      pulses = [];
      cue = createCueEventState();
      sectionCueCount = 0;
      densityLift = 0;
      densityLiftTarget = 0;
      speedLift = 0;
      speedLiftTarget = 0;
      lengthLift = 0;
      lengthLiftTarget = 0;
      thicknessLift = 0;
      thicknessLiftTarget = 0;
      warmTurn = 0;
      warmTurnTarget = 0;
      phase = 0;
      orbPresence = 0;
      orbPresenceTarget = 0;
      orbGrowth = 0;
      orbGrowthTarget = 0;
      sectionAge = 0;
      phaseMomentum = 0;
      orbitalReveal = 0;
      phaseDropFloor = 0;
      phaseDropFloorTarget = 0;
      stormFlash = 0;
      reverseStormActive = false;
      reverseStormAge = 0;
      buildDrops();
    },

    update(dt, params, audio, exclusion) {
      curParams = params;
      curAudio = audio;
      curExclusion = exclusion;
      cue.update(dt);

      const damp = 1 - Math.pow(0.001, dt);
      densityLift = mix(densityLift, densityLiftTarget, damp);
      speedLift = mix(speedLift, speedLiftTarget, damp);
      lengthLift = mix(lengthLift, lengthLiftTarget, damp);
      thicknessLift = mix(thicknessLift, thicknessLiftTarget, damp);
      warmTurn = mix(warmTurn, warmTurnTarget, damp);
      orbPresence = mix(orbPresence, orbPresenceTarget, damp);
      orbGrowth = mix(orbGrowth, orbGrowthTarget, 1 - Math.pow(0.45, dt));
      densityLiftTarget = Math.max(0, densityLiftTarget - dt * 0.05);
      speedLiftTarget = Math.max(0, speedLiftTarget - dt * 0.06);
      lengthLiftTarget = Math.max(0, lengthLiftTarget - dt * 0.055);
      thicknessLiftTarget = Math.max(0, thicknessLiftTarget - dt * 0.05);
      warmTurnTarget = Math.max(0, warmTurnTarget - dt * 0.04);
      // Evolution
      sectionAge += dt;
      phaseMomentum = smoothstep(Math.min(1, sectionAge / 10));
      phaseDropFloor = mix(phaseDropFloor, phaseDropFloorTarget, damp);
      const targetOrbital = phase <= 0 ? 0 : phase === 1 ? 0.3 : 1;
      orbitalReveal = mix(orbitalReveal, targetOrbital, 1 - Math.pow(0.15, dt));
      // Crescendo
      stormFlash *= Math.exp(-dt / 0.8);
      if (dropColorWave < 1) dropColorWave = Math.min(1, dropColorWave + dt / dropColorWaveDuration);
      if (reverseStormActive) {
        reverseStormAge += dt;
        if (reverseStormAge >= 2.2) {
          reverseStormActive = false;
          for (const drop of drops) drop.reverse = false;
        }
      }

      if (hasReducedMotion()) return;

      time += dt * (0.42 + params.drift * 0.36 + cue.motion * 0.22);

      const speedScale = (tuning.rainSpeedScale ?? 1)
        * (0.42 + params.drift * 0.62 + audio.energy * 0.18 + audio.bass * 0.16 + cue.motion * 0.16 + speedLift * 0.38);
      const independence = tuning.dropIndependence ?? 0.5;
      for (let index = 0; index < drops.length; index += 1) {
        const drop = drops[index];
        const localMotion = mix(1, drop.speedJitter + Math.sin(time * (0.18 + drop.depth * 0.24) + drop.phase) * 0.18, independence);
        const stormScale = phase >= 3 ? 1.28 : 1;
        if (phase >= 3) {
          drop.baseX += (15 + audio.energy * 16) * dt;
          if (drop.baseX > w + 30) drop.baseX = -30;
        }
        drop.y += (drop.reverse ? -1 : 1) * drop.speed * speedScale * stormScale * localMotion * dt;
        if (drop.y - drop.length > h + 30 || drop.y + drop.length < -30) recycleDrop(drop, !drop.reverse);
      }

      for (let index = pulses.length - 1; index >= 0; index -= 1) {
        pulses[index].age += dt;
        if (pulses[index].age >= pulses[index].life) pulses.splice(index, 1);
      }
    },

    draw(_q, ctx) {
      const [br, bg, bb] = palette.bgDark;
      ctx.fillStyle = `rgba(${br},${bg},${bb},${tuning.fillAlpha})`;
      ctx.fillRect(0, 0, w, h);

      const centerX = w * (tuning.centerX + Math.sin(time * 0.28) * 0.04);
      const orbitalRange = w * (0.12 + curParams.turbulence * 0.1 + curAudio.bass * 0.04);
      const slant = phase >= 3 ? 34 + curParams.drift * 16 + curAudio.energy * 12 : tuning.slantBase + curParams.drift * 10 + curAudio.energy * 7;
      const [ar, ag, ab] = palette.accentGlow;
      const [wr, wg, wb] = palette.accentWarm;
      const [dr, dg, db] = palette.dotColor;

      // Crescendo: white flash before drop loop
      if (stormFlash > 0.02) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = `rgba(255,255,255,${stormFlash * 0.22})`;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      for (let index = 0; index < drops.length; index += 1) {
        const drop = drops[index];
        const independence = tuning.dropIndependence ?? 0.5;
        const orbitX = Math.sin(time * (0.28 + drop.depth * 0.42) + drop.phase) * drop.radius * (0.72 + independence * 0.34) * orbitalReveal;
        const sway = Math.sin(time * (0.42 + drop.depth * 0.72) + drop.phase + drop.y * 0.006) * drop.swing * (0.8 + independence * 0.28) * orbitalReveal;
        const noiseShift = Math.sin(drop.phase * 2 + time * (0.36 + drop.speedJitter * 0.18)) * orbitalRange * 0.1;
        const x = drop.baseX + orbitX + sway + noiseShift + (centerX - w * 0.5) * drop.depth * 0.18;
        const y = drop.y;
        const seed = drop.phase * 1000;
        const eventDensity = cue.densityProgress(seed);
        const localDensity = clamp01(curParams.density * (phase <= 0 ? 0.4 : 1) + densityLift * 0.45 + eventDensity * 0.36 + (phase >= 2 ? 0.2 : 0));
        if (drop.depth > localDensity + 0.48 - phaseDropFloor && eventDensity < 0) continue;
        const exclusion = computeExclusion(x, y, curExclusion);
        if (exclusion.density < 0.3 && drop.depth > 0.55) continue;

        const localTurn = warmTurn * smoothstep((warmTurn + eventDensity * 0.24 - seededUnit(drop.colorPhase) * 0.68) / 0.34);
        const tint = drop.depth * 0.5 + curParams.glow * 0.35 + curAudio.highs * 0.2 + densityLift * 0.14 + Math.sin(drop.colorPhase + time * 0.12) * 0.045;
        const warmTint = phase >= 4 ? -0.12 : localTurn * (0.08 + drop.depth * 0.18);
        let [red, green, blue] = cue.mixForegroundColor([
          Math.round(mix(mix(dr, ar, tint), wr, warmTint)),
          Math.round(mix(mix(dg, ag, tint), wg, warmTint)),
          Math.round(mix(mix(db, ab, tint), wb, warmTint)),
        ], seed);
        // Drop color wave: one-by-one stagger toward accentGlow on crescendo
        if (dropColorWave > 0.01) {
          const dropThreshold = drop.colorPhase / (Math.PI * 2);
          if (dropColorWave > dropThreshold) {
            const waveBlend = Math.min(1, (dropColorWave - dropThreshold) / 0.2) * 0.6;
            red   = Math.round(mix(red,   ar, waveBlend));
            green = Math.round(mix(green, ag, waveBlend));
            blue  = Math.round(mix(blue,  ab, waveBlend));
          }
        }
        const alpha = (0.03 + drop.depth * 0.09 + curParams.density * 0.05 + densityLift * 0.045 + cue.focus * 0.025 + (phase >= 4 ? 0.06 : 0) + phaseMomentum * 0.022) * exclusion.alpha * clamp01(0.66 + localDensity * 0.56);
        const length = drop.length * (0.8 + curParams.drift * 0.44 + curAudio.energy * 0.22 + cue.sweep * 0.22 + lengthLift * 0.52) * (0.86 + drop.speedJitter * 0.16) * (1 + phaseMomentum * phase * 0.1);

        ctx.strokeStyle = `rgba(${red},${green},${blue},${alpha})`;
        ctx.lineWidth = drop.thickness * (0.8 + curAudio.transient * 0.6 + thicknessLift * 0.72) * (1 + cue.sizeProgress(seed) * 0.42);
        ctx.beginPath();
        ctx.moveTo(x, y);
        const verticalDirection = drop.reverse ? -1 : 1;
        ctx.lineTo(x + slant * exclusion.motion * verticalDirection, y + length * exclusion.motion * verticalDirection);
        ctx.stroke();

        if (drop.depth > 0.7) {
          if (phase >= 2) {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const glowRadius = drop.thickness * (3 + curAudio.transient * 4 + thicknessLift * 3) * (1 + phaseMomentum * 0.4);
            const glow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
            glow.addColorStop(0, `rgba(${red},${green},${blue},${alpha * 0.9})`);
            glow.addColorStop(1, `rgba(${red},${green},${blue},0)`);
            ctx.fillStyle = glow;
            ctx.fillRect(x - glowRadius, y - glowRadius, glowRadius * 2, glowRadius * 2);
            ctx.restore();
          }
          ctx.fillStyle = `rgba(${red},${green},${blue},${alpha * 0.6})`;
          ctx.beginPath();
          ctx.ellipse(x, y, drop.thickness * 1.6, drop.thickness * 2.2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (tuning.orbAlpha > 0.001 && orbPresence > 0.004) {
        const orbColorT = clamp01(orbGrowth * 0.7);
        const orbBase: [number, number, number] = [
          Math.round(mix(wr, ar, orbColorT)),
          Math.round(mix(wg, ag, orbColorT)),
          Math.round(mix(wb, ab, orbColorT)),
        ];
        const [or, og, ob] = cue.mixCenterColor(orbBase);
        const orbRadius = Math.max(30, Math.min(w, h) * (0.04 + curAudio.bass * 0.05));
        const orbGlowRadius = Math.min(w, h) * (0.18 + orbGrowth * 0.62) + orbRadius * 0.5;
        const orbAlpha = (tuning.orbAlpha + curParams.glow * 0.04 + curAudio.energy * 0.03 + cue.focus * 0.06) * orbPresence;
        const orb = ctx.createRadialGradient(centerX, h * 0.5, 0, centerX, h * 0.5, orbGlowRadius);
        orb.addColorStop(0,   `rgba(${or},${og},${ob},${orbAlpha})`);
        orb.addColorStop(0.5, `rgba(${or},${og},${ob},${orbAlpha * 0.38})`);
        orb.addColorStop(1,   `rgba(${or},${og},${ob},0)`);
        ctx.fillStyle = orb;
        ctx.fillRect(0, 0, w, h);
      }

    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      const intensity = event.intensity ?? 0.5;
      if (event.type === 'section-cue') {
        phase = Math.max(0, event.sectionIndex ?? sectionCueCount + 1);
        sectionCueCount = phase;
        sectionAge = 0;
        phaseMomentum = 0;
        const step = Math.min(1, sectionCueCount / 5);
        densityLiftTarget = Math.max(densityLiftTarget, 0.16 + step * 0.52 + intensity * 0.18);
        speedLiftTarget = Math.max(speedLiftTarget, 0.1 + step * 0.28 + intensity * 0.12);
        lengthLiftTarget = Math.max(lengthLiftTarget, 0.12 + step * 0.42);
        if (sectionCueCount >= 4) warmTurnTarget = Math.max(warmTurnTarget, 0.3 + intensity * 0.34);
        if (sectionCueCount >= 3) { dropColorWave = 0; dropColorWaveDuration = 4.0; }
        if (sectionCueCount >= 2) {
          orbPresenceTarget = Math.min(1, 0.28 + (sectionCueCount - 2) * 0.24);
        }
        orbGrowthTarget = Math.min(1, sectionCueCount / 6);
        // Evolution: density floor rises with phase
        phaseDropFloorTarget = smoothstep(phase / 5) * 0.42;
      }
      if (event.type === 'density-surge') {
        densityLiftTarget = Math.max(densityLiftTarget, 0.5 + intensity * 0.42);
        speedLiftTarget = Math.max(speedLiftTarget, 0.22 + intensity * 0.24);
        lengthLiftTarget = Math.max(lengthLiftTarget, 0.36 + intensity * 0.48);
      }
      if (event.type === 'storm-release') {
        densityLiftTarget = Math.max(densityLiftTarget, 0.5 + intensity * 0.42);
        speedLiftTarget = Math.max(speedLiftTarget, 0.22 + intensity * 0.24);
        lengthLiftTarget = Math.max(lengthLiftTarget, 0.36 + intensity * 0.48);
        // Crescendo: reverse storm in late sections
        if (phase >= 4) {
          dropColorWave = 0;
          dropColorWaveDuration = 2.8;
          stormFlash = Math.max(stormFlash, 0.78 + intensity * 0.22);
          reverseStormActive = true;
          reverseStormAge = 0;
          for (const drop of drops) { if (Math.random() < 0.76) drop.reverse = true; }
          lengthLiftTarget = Math.max(lengthLiftTarget, 2.0 + intensity * 0.8);
          thicknessLiftTarget = Math.max(thicknessLiftTarget, 2.8 + intensity * 0.8);
          speedLiftTarget = Math.max(speedLiftTarget, 0.72 + intensity * 0.32);
          orbPresenceTarget = 1;
          orbGrowthTarget = 1;
        }
      }
      if (event.type === 'motion-drift' || event.type === 'veil-sweep') {
        speedLiftTarget = Math.max(speedLiftTarget, 0.18 + intensity * 0.22);
        lengthLiftTarget = Math.max(lengthLiftTarget, 0.26 + intensity * 0.32);
      }
      if (event.type === 'color-morph' || event.type === 'palette-morph') {
        warmTurnTarget = Math.max(warmTurnTarget, 0.32 + intensity * 0.5);
      }
      if (event.type === 'glow-pulse' || event.type === 'spark-burst' || event.type === 'bloom-flash' || event.type === 'grain-bloom') {
        thicknessLiftTarget = Math.max(thicknessLiftTarget, 0.28 + intensity * 0.48);
        warmTurnTarget = Math.max(warmTurnTarget, 0.18 + intensity * 0.38);
      }
      if (pulses.length >= tuning.maxPulses) pulses.shift();
      pulses.push({
        x: w * (0.3 + Math.random() * 0.26),
        y: h * (0.28 + Math.random() * 0.46),
        age: 0,
        life: 0.9 + intensity * 0.5,
        radius: Math.min(w, h) * (0.03 + intensity * 0.04),
      });
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      buildDrops();
    },

    destroy() {
      drops = [];
      pulses = [];
    },
  };
}
