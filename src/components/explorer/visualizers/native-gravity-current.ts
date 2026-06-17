import type { AudioSignal } from '../audio-signal';
import { computeExclusion } from '../exclusion';
import type { Palette } from '../palette';
import { getQualityScale } from '../render-quality';
import { resolveNativeGravityCurrentTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { clamp01, createSeededRandom, getParticleBudget, hasReducedMotion, mix } from './cong-particle-primitives';
import { createCueEventState } from './cue-event-state';

/* ── Native Gravity Current ──────────────────────────────────
   Sparse long-trail particles braiding through invisible gravity
   wells that wander slowly across the field. Softened pull plus
   a tangential swirl turns infall into slow orbital currents; a
   persistent trail buffer accumulates the braids into filament
   webs. Sections reveal and deepen wells; bass onsets send slow
   ripples that push particles along their currents.
──────────────────────────────────────────────────────────────── */

const WELL_CAPACITY = 4;
const RIPPLE_CAPACITY = 3;
const TIER_COUNT = 3;

interface GravityWell {
  x: number;
  y: number;
  seed: number;
  reveal: number;
  revealTarget: number;
}

interface CurrentRipple {
  x: number;
  y: number;
  radius: number;
  strength: number;
  active: boolean;
}

export function createNativeGravityCurrent(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let capacity = 0;
  let px: Float32Array | null = null;
  let py: Float32Array | null = null;
  let pvx: Float32Array | null = null;
  let pvy: Float32Array | null = null;
  let prevX: Float32Array | null = null;
  let prevY: Float32Array | null = null;
  let pDepth: Float32Array | null = null;
  let pFlowAngle: Float32Array | null = null;
  let flowParity = 0;
  let trail: HTMLCanvasElement | null = null;
  let trailCtx: CanvasRenderingContext2D | null = null;
  // Well haze pre-rendered as a normalized radial sprite (one per warmth
  // parity class); per-frame alpha rides on globalAlpha at draw time.
  const HAZE_SPRITE_SIZE = 256;
  const hazeSprites: (HTMLCanvasElement | null)[] = [null, null];
  const hazeSpriteKeys = [-1, -1];
  let cue = createCueEventState();
  let random = createSeededRandom(60917);
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };
  let tuning = resolveNativeGravityCurrentTuning();
  let sectionCueCount = 0;
  // Persistent 0..1 progression base — never decays, so the braids keep
  // tightening and brightening section over section.
  let sectionProgress = 0;
  let activeFraction = 0.7;
  let activeFractionTarget = 0.7;
  let strengthLift = 0;
  let strengthLiftTarget = 0;
  let swirlLift = 0;
  let swirlLiftTarget = 0;
  let warmTurn = 0;
  let warmTurnTarget = 0;
  let trailGlow = 0;
  let trailGlowTarget = 0;
  let hazeBloom = 0;
  let hazeBloomTarget = 0;
  let onsetCooldown = 0;
  const wells: GravityWell[] = [];
  const ripples: CurrentRipple[] = [];

  function applyWellReveals(): void {
    for (let index = 0; index < wells.length; index += 1) {
      if (index < tuning.wellCountBase) {
        wells[index].revealTarget = 1;
      } else {
        const extra = index - tuning.wellCountBase;
        if (sectionCueCount >= extra * 2 + 1) wells[index].revealTarget = 1;
      }
    }
  }

  function wanderWells(): void {
    const margin = 0.16;
    for (const well of wells) {
      well.x = w * (margin + (1 - margin * 2) * q.noise(well.seed, time * 0.03, 3.7));
      well.y = h * (margin + (1 - margin * 2) * q.noise(well.seed * 1.7, time * 0.026, 9.1));

      // Nudge wells away from the player panel so the densest braids never
      // gather underneath the UI.
      const rectCx = (curExclusion.left + curExclusion.right) / 2;
      const rectCy = (curExclusion.top + curExclusion.bottom) / 2;
      const rectSpan = Math.max(curExclusion.right - curExclusion.left, curExclusion.bottom - curExclusion.top);
      if (rectSpan > 0) {
        const dx = well.x - rectCx;
        const dy = well.y - rectCy;
        const dist = Math.hypot(dx, dy);
        const safe = rectSpan * 0.7;
        if (dist < safe && dist > 0.001) {
          const push = (safe - dist) / safe;
          well.x += (dx / dist) * push * rectSpan * 0.4;
          well.y += (dy / dist) * push * rectSpan * 0.4;
        }
      }
    }
  }

  function placeParticles(): void {
    if (!px || !py || !pvx || !pvy || !prevX || !prevY || !pDepth) return;
    for (let index = 0; index < capacity; index += 1) {
      // Seed along loose orbits around the base wells so even the very first
      // frames (and reduced motion) show currents rather than scattered dust.
      const well = wells[index % Math.max(tuning.wellCountBase, 1)];
      const angle = random() * Math.PI * 2;
      const radius = (0.1 + random() * 0.5) * Math.min(w, h);
      px[index] = well.x + Math.cos(angle) * radius;
      py[index] = well.y + Math.sin(angle) * radius * 0.8;
      prevX[index] = px[index];
      prevY[index] = py[index];
      pvx[index] = -Math.sin(angle) * 20;
      pvy[index] = Math.cos(angle) * 20;
      pDepth[index] = random();
    }
  }

  function buildParticles(): void {
    capacity = getParticleBudget(tuning.particleCount, w);
    px = new Float32Array(capacity);
    py = new Float32Array(capacity);
    pvx = new Float32Array(capacity);
    pvy = new Float32Array(capacity);
    prevX = new Float32Array(capacity);
    prevY = new Float32Array(capacity);
    pDepth = new Float32Array(capacity);
    pFlowAngle = new Float32Array(capacity);
    placeParticles();
  }

  function buildTrail(): void {
    trail = document.createElement('canvas');
    trail.width = w;
    trail.height = h;
    trailCtx = trail.getContext('2d');
    if (trailCtx) {
      const [br, bg, bb] = palette.bgDark;
      trailCtx.fillStyle = `rgb(${br},${bg},${bb})`;
      trailCtx.fillRect(0, 0, w, h);
    }
  }

  function strokeSegments(targetCtx: CanvasRenderingContext2D, drawCount: number): void {
    if (!px || !py || !prevX || !prevY || !pDepth) return;
    const [dr, dg, db] = palette.dotColor;
    const [ar, ag, ab] = palette.accentGlow;
    const [wr, wg, wb] = palette.accentWarm;

    for (let tier = 0; tier < TIER_COUNT; tier += 1) {
      const tierDepth = (tier + 0.5) / TIER_COUNT;
      const path = new Path2D();
      let hasSegments = false;
      for (let index = 0; index < drawCount; index += 1) {
        if (Math.min(TIER_COUNT - 1, Math.floor(pDepth[index] * TIER_COUNT)) !== tier) continue;
        const midX = (px[index] + prevX[index]) / 2;
        const midY = (py[index] + prevY[index]) / 2;
        const span = Math.abs(px[index] - prevX[index]) + Math.abs(py[index] - prevY[index]);
        if (span > 60) continue; // skip wrap jumps
        if (computeExclusion(midX, midY, curExclusion).alpha < 0.3) continue;
        path.moveTo(prevX[index], prevY[index]);
        path.lineTo(px[index], py[index]);
        hasSegments = true;
      }
      if (!hasSegments) continue;

      const warmTint = warmTurn * (tier === TIER_COUNT - 1 ? 0.38 : 0.08);
      const tint = clamp01(0.22 + tierDepth * 0.5 + curParams.glow * 0.3 + curAudio.highs * 0.2 * tierDepth);
      const [sr, sg, sb] = cue.mixParticleColor([
        Math.round(mix(mix(dr, ar, tint), wr, warmTint)),
        Math.round(mix(mix(dg, ag, tint), wg, warmTint)),
        Math.round(mix(mix(db, ab, tint), wb, warmTint)),
      ], tier * 23.9);
      const alpha = clamp01(tuning.segmentAlpha
        * (0.45 + tierDepth * 0.65 + curParams.density * 0.4 + sectionProgress * 0.35 + trailGlow * 0.5 + cue.densityProgress(tier * 7.7) * 0.4));
      targetCtx.strokeStyle = `rgba(${sr},${sg},${sb},${alpha})`;
      targetCtx.lineWidth = 0.6 + tierDepth * 1.1;
      targetCtx.lineCap = 'round';
      targetCtx.stroke(path);
    }
  }

  return {
    setup(_q, _w, _h, _palette, _tuning) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      tuning = resolveNativeGravityCurrentTuning(_tuning);
      time = 0;
      sectionCueCount = 0;
      sectionProgress = 0;
      activeFraction = 0.7;
      activeFractionTarget = 0.7;
      strengthLift = 0;
      strengthLiftTarget = 0;
      swirlLift = 0;
      swirlLiftTarget = 0;
      warmTurn = 0;
      warmTurnTarget = 0;
      trailGlow = 0;
      trailGlowTarget = 0;
      hazeBloom = 0;
      hazeBloomTarget = 0;
      onsetCooldown = 0;
      random = createSeededRandom(60917 + Math.round(w + h * 5));
      cue = createCueEventState();
      wells.length = 0;
      for (let index = 0; index < WELL_CAPACITY; index += 1) {
        wells.push({ x: w / 2, y: h / 2, seed: random() * 100, reveal: 0, revealTarget: 0 });
      }
      ripples.length = 0;
      for (let index = 0; index < RIPPLE_CAPACITY; index += 1) {
        ripples.push({ x: 0, y: 0, radius: 0, strength: 0, active: false });
      }
      applyWellReveals();
      for (const well of wells) well.reveal = well.revealTarget;
      wanderWells();
      buildParticles();
      buildTrail();
      // Stroke one orbit pass so reduced-motion users (and the first frames)
      // get a stable filament tableau instead of a blank buffer.
      if (trailCtx) strokeSegments(trailCtx, capacity);
    },

    update(dt, params, audio, exclusion) {
      curParams = params;
      curAudio = audio;
      curExclusion = exclusion;
      cue.update(dt);

      const damp = 1 - Math.pow(0.001, dt);
      activeFraction = mix(activeFraction, activeFractionTarget, damp * 0.5);
      strengthLift = mix(strengthLift, strengthLiftTarget, damp);
      swirlLift = mix(swirlLift, swirlLiftTarget, damp);
      warmTurn = mix(warmTurn, warmTurnTarget, damp);
      trailGlow = mix(trailGlow, trailGlowTarget, damp);
      hazeBloom = mix(hazeBloom, hazeBloomTarget, damp);
      strengthLiftTarget = Math.max(0, strengthLiftTarget - dt * 0.03);
      swirlLiftTarget = Math.max(0, swirlLiftTarget - dt * 0.03);
      warmTurnTarget = Math.max(0, warmTurnTarget - dt * 0.03);
      trailGlowTarget = Math.max(0, trailGlowTarget - dt * 0.035);
      hazeBloomTarget = Math.max(0, hazeBloomTarget - dt * 0.03);

      if (hasReducedMotion()) return;
      if (!px || !py || !pvx || !pvy || !prevX || !prevY || !pDepth || !pFlowAngle) return;
      time += dt;
      onsetCooldown = Math.max(0, onsetCooldown - dt);

      const revealDamp = 1 - Math.pow(0.05, dt * 0.3);
      for (const well of wells) well.reveal = mix(well.reveal, well.revealTarget, revealDamp);
      wanderWells();

      if ((audio.bassOnset ?? 0) > 0.55 && onsetCooldown <= 0) {
        for (const ripple of ripples) {
          if (ripple.active) continue;
          const origin = wells[Math.floor(random() * tuning.wellCountBase)];
          ripple.active = true;
          ripple.x = origin.x;
          ripple.y = origin.y;
          ripple.radius = 0;
          ripple.strength = 0.5 + audio.bass * 0.6;
          onsetCooldown = 0.7;
          break;
        }
      }
      const maxRippleRadius = Math.hypot(w, h) * 0.7;
      for (const ripple of ripples) {
        if (!ripple.active) continue;
        ripple.radius += tuning.rippleSpeed * dt;
        if (ripple.radius > maxRippleRadius) ripple.active = false;
      }

      const pullScale = tuning.wellStrength
        * (0.7 + sectionProgress * 0.5 + strengthLift * 0.7 + curParams.turbulence * 0.3)
        * (1 + curAudio.bass * 0.45);
      const swirl = tuning.swirl * (1 + sectionProgress * 0.4 + swirlLift * 0.5);
      const speedScale = 0.75 + curParams.drift * 0.6 + sectionProgress * 0.25 + curAudio.energy * 0.3 + cue.motion * 0.2;
      const jitter = curAudio.transient * 6;
      const damping = Math.exp(-dt * 0.9);
      // Quality scale bounds the simulation to the particles that can be
      // drawn (frame-local read, identical behavior at scale 1.0).
      const active = Math.round(capacity * clamp01(activeFraction) * getQualityScale());
      flowParity ^= 1;

      for (let index = 0; index < active; index += 1) {
        prevX[index] = px[index];
        prevY[index] = py[index];
        const depth = pDepth[index];

        // The flow field morphs at time*0.06, so refreshing each particle's
        // angle on alternating frames is invisible and halves the noise cost.
        if ((index & 1) === flowParity) {
          pFlowAngle[index] = q.noise(px[index] * tuning.flowScale, py[index] * tuning.flowScale, depth * 3 + time * 0.06) * Math.PI * 4.8;
        }
        const flowAngle = pFlowAngle[index];
        let ax = Math.cos(flowAngle) * 22;
        let ay = Math.sin(flowAngle) * 22;

        for (const well of wells) {
          if (well.reveal < 0.02) continue;
          const dx = well.x - px[index];
          const dy = well.y - py[index];
          const dist = Math.sqrt(dx * dx + dy * dy) + 24;
          const falloff = (pullScale * well.reveal) / (1 + dist * 0.011);
          ax += (dx / dist) * falloff;
          ay += (dy / dist) * falloff;
          // Tangential component bends infall into slow orbital braids.
          ax += (-dy / dist) * falloff * swirl;
          ay += (dx / dist) * falloff * swirl;
        }

        for (const ripple of ripples) {
          if (!ripple.active) continue;
          const rdx = px[index] - ripple.x;
          const rdy = py[index] - ripple.y;
          const dist = Math.sqrt(rdx * rdx + rdy * rdy);
          const band = (dist - ripple.radius) / 60;
          if (band > 2 || band < -2) continue;
          const wave = Math.exp(-band * band) * ripple.strength;
          // Push along the existing current rather than radially: the wave
          // surges the braid instead of drawing a circle.
          ax += pvx[index] * wave * 2.4;
          ay += pvy[index] * wave * 2.4;
        }

        if (jitter > 0.3) {
          ax += (q.noise(depth * 91, time * 2.1, index * 0.13) - 0.5) * jitter;
          ay += (q.noise(depth * 47, time * 1.9, index * 0.17) - 0.5) * jitter;
        }

        pvx[index] = pvx[index] * damping + ax * dt * (0.5 + depth * 0.8);
        pvy[index] = pvy[index] * damping + ay * dt * (0.5 + depth * 0.8);
        const speed = Math.sqrt(pvx[index] * pvx[index] + pvy[index] * pvy[index]);
        const maxSpeed = 46 + depth * 50;
        if (speed > maxSpeed) {
          pvx[index] = (pvx[index] / speed) * maxSpeed;
          pvy[index] = (pvy[index] / speed) * maxSpeed;
        }
        px[index] += pvx[index] * speedScale * dt * (0.6 + depth * 0.9);
        py[index] += pvy[index] * speedScale * dt * (0.6 + depth * 0.9);

        if (px[index] < -30) { px[index] = w + 30; prevX[index] = px[index]; }
        if (px[index] > w + 30) { px[index] = -30; prevX[index] = px[index]; }
        if (py[index] < -30) { py[index] = h + 30; prevY[index] = py[index]; }
        if (py[index] > h + 30) { py[index] = -30; prevY[index] = py[index]; }
      }

      // Trail buffer: constant fade keeps persistence stable while quality
      // scaling caps how many particles are simulated and drawn (already
      // folded into `active`), never the fade itself.
      if (trailCtx) {
        const [br, bg, bb] = palette.bgDark;
        trailCtx.fillStyle = `rgba(${br},${bg},${bb},${tuning.trailFade})`;
        trailCtx.fillRect(0, 0, w, h);
        strokeSegments(trailCtx, active);
      }
    },

    draw(_q, ctx) {
      if (!trail) return;
      ctx.drawImage(trail, 0, 0);

      // Soft haze where each well sits — a glow, never a ring. Rendered from
      // a cached radial sprite per warmth parity; the smooth gradient
      // upscales invisibly and the per-well alpha rides on globalAlpha.
      const [ar, ag, ab] = palette.accentGlow;
      const [wr, wg, wb] = palette.accentWarm;
      const radius = h * 0.3;
      for (let index = 0; index < wells.length; index += 1) {
        const well = wells[index];
        if (well.reveal < 0.03) continue;
        const alpha = clamp01((0.018 + curParams.glow * 0.014 + sectionProgress * 0.014 + hazeBloom * 0.022 + cue.bloom * 0.012) * well.reveal);
        const warmth = warmTurn * (index % 2 ? 0.6 : 0.2);
        const red = Math.round(mix(ar, wr, warmth));
        const green = Math.round(mix(ag, wg, warmth));
        const blue = Math.round(mix(ab, wb, warmth));
        const parity = index % 2;
        const spriteKey = (red << 16) | (green << 8) | blue;
        let sprite = hazeSprites[parity];
        if (!sprite || spriteKey !== hazeSpriteKeys[parity]) {
          sprite = hazeSprites[parity] ?? document.createElement('canvas');
          sprite.width = HAZE_SPRITE_SIZE;
          sprite.height = HAZE_SPRITE_SIZE;
          const spriteCtx = sprite.getContext('2d');
          if (spriteCtx) {
            const half = HAZE_SPRITE_SIZE / 2;
            spriteCtx.clearRect(0, 0, HAZE_SPRITE_SIZE, HAZE_SPRITE_SIZE);
            const haze = spriteCtx.createRadialGradient(half, half, 0, half, half, half);
            haze.addColorStop(0, `rgba(${red},${green},${blue},1)`);
            haze.addColorStop(1, `rgba(${red},${green},${blue},0)`);
            spriteCtx.fillStyle = haze;
            spriteCtx.fillRect(0, 0, HAZE_SPRITE_SIZE, HAZE_SPRITE_SIZE);
          }
          hazeSprites[parity] = sprite;
          hazeSpriteKeys[parity] = spriteKey;
        }
        ctx.globalAlpha = alpha;
        ctx.drawImage(sprite, well.x - radius, well.y - radius, radius * 2, radius * 2);
        ctx.globalAlpha = 1;
      }
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      const intensity = clamp01(event.intensity ?? 0.5);
      if (event.type === 'section-cue') {
        sectionCueCount = Math.max(sectionCueCount + 1, event.sectionIndex ?? 0);
        sectionProgress = Math.min(1, sectionCueCount / 5);
        const step = sectionProgress;
        trailGlowTarget = Math.max(trailGlowTarget, 0.16 + step * 0.4 + intensity * 0.14);
        if (sectionCueCount >= 2) {
          strengthLiftTarget = Math.max(strengthLiftTarget, 0.24 + step * 0.44);
          warmTurnTarget = Math.max(warmTurnTarget, 0.22 + step * 0.4);
          activeFractionTarget = Math.min(1, 0.7 + step * 0.3);
        }
        if (sectionCueCount >= 3) {
          swirlLiftTarget = Math.max(swirlLiftTarget, 0.3 + step * 0.5);
          hazeBloomTarget = Math.max(hazeBloomTarget, 0.3 + step * 0.5);
        }
        applyWellReveals();
      }
      if (event.type === 'density-surge' || event.type === 'grain-bloom') {
        activeFractionTarget = Math.min(1, activeFractionTarget + 0.08 + intensity * 0.14);
        trailGlowTarget = Math.max(trailGlowTarget, 0.24 + intensity * 0.3);
      }
      if (event.type === 'motion-drift' || event.type === 'veil-sweep') {
        strengthLiftTarget = Math.max(strengthLiftTarget, 0.3 + intensity * 0.4);
        swirlLiftTarget = Math.max(swirlLiftTarget, 0.2 + intensity * 0.3);
      }
      if (event.type === 'color-morph' || event.type === 'palette-morph') {
        warmTurnTarget = Math.max(warmTurnTarget, 0.32 + intensity * 0.48);
      }
      if (event.type === 'glow-pulse' || event.type === 'spark-burst' || event.type === 'bloom-flash') {
        hazeBloomTarget = Math.max(hazeBloomTarget, 0.3 + intensity * 0.42);
        trailGlowTarget = Math.max(trailGlowTarget, 0.2 + intensity * 0.3);
      }
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      wanderWells();
      buildParticles();
      buildTrail();
      if (trailCtx) strokeSegments(trailCtx, capacity);
    },

    destroy() {
      px = null;
      py = null;
      pvx = null;
      pvy = null;
      prevX = null;
      prevY = null;
      pDepth = null;
      pFlowAngle = null;
      trail = null;
      trailCtx = null;
      hazeSprites[0] = null;
      hazeSprites[1] = null;
      wells.length = 0;
      ripples.length = 0;
    },
  };
}
