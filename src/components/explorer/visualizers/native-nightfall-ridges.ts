import type { AudioSignal } from '../audio-signal';
import { computeExclusion, type ExclusionFactors } from '../exclusion';
import type { Palette } from '../palette';
import { getQualityScale } from '../render-quality';
import { resolveNativeNightfallRidgesTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { clamp01, createSeededRandom, fbm, hasReducedMotion, mix } from './cong-particle-primitives';
import { createCueEventState } from './cue-event-state';

/* ── Native Nightfall Ridges ─────────────────────────────────
   Stacked parallax ridgelines under a dark valley sky. Layered
   fbm heightlines scroll laterally at depth-spread speeds with
   mist pooled between crests, low rim light separating the
   silhouettes, and distant glints surfacing on far ridges as
   sections deepen. Bass onsets send slow luminous swells along
   the nearest crest.
──────────────────────────────────────────────────────────────── */

const EDGE_MARGIN = 40;
const EXCLUSION_SAMPLE_STRIDE = 6;
const FULL_EXCLUSION: ExclusionFactors = { alpha: 1, motion: 1, density: 1, contrast: 1 };

interface RidgeLayer {
  depth: number;
  baseY: number;
  amp: number;
  freq: number;
  seed: number;
  scrollSpeed: number;
  scrollOffset: number;
  heightsOffset: number;
  reveal: number;
  revealTarget: number;
  heights: Float32Array | null;
  glintFracs: Float32Array | null;
  // Cached fills (per-frame alpha is applied via globalAlpha, so gradients
  // only rebuild when their quantized color/geometry key changes).
  bodyGrad: CanvasGradient | null;
  bodyColorKey: number;
  bodyCrestQ: number;
  fogGrad: CanvasGradient | null;
  fogColorKey: number;
  fogTopQ: number;
}

interface DistantLandscapeLayer {
  depth: number;
  baseY: number;
  amp: number;
  freq: number;
  seed: number;
  scrollSpeed: number;
  scrollOffset: number;
  heightsOffset: number;
  heights: Float32Array | null;
  hazeGrad: CanvasGradient | null;
  hazeColorKey: number;
}

interface CrestSwell {
  x: number;
  age: number;
  life: number;
  strength: number;
  speed: number;
  active: boolean;
}

interface ShootingStar {
  x: number;
  y: number;
  age: number;
  life: number;
  delay: number;
  angle: number;
  speed: number;
  length: number;
  seed: number;
  active: boolean;
}

export function createNativeNightfallRidges(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let layers: RidgeLayer[] = [];
  let distantLayers: DistantLandscapeLayer[] = [];
  let shootingStars: ShootingStar[] = [];
  let sampleCount = 0;
  let refreshCursor = 0;
  let distantRefreshCursor = 0;
  let skyGrad: CanvasGradient | null = null;
  let skyColorKey = -1;
  const GLINT_BUCKETS = 8;
  const glintPaths: (Path2D | null)[] = new Array(GLINT_BUCKETS + 1).fill(null);
  let exclusionAlphaSamples = new Float32Array(0);
  let exclusionMotionSamples = new Float32Array(0);
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };
  let tuning = resolveNativeNightfallRidgesTuning();
  let cue = createCueEventState();
  let sectionCueCount = 0;
  // Persistent 0..1 progression base — unlike the decaying lift accents, this
  // never falls back, so each section leaves the scene permanently deeper.
  let sectionProgress = 0;
  let ampLift = 0;
  let ampLiftTarget = 0;
  let warmTurn = 0;
  let warmTurnTarget = 0;
  let driftLift = 0;
  let driftLiftTarget = 0;
  let glintLift = 0;
  let glintLiftTarget = 0;
  let fogLift = 0;
  let fogLiftTarget = 0;
  let onsetCooldown = 0;
  const swells: CrestSwell[] = [
    { x: 0, age: 0, life: 3, strength: 0, speed: 0, active: false },
    { x: 0, age: 0, life: 3, strength: 0, speed: 0, active: false },
  ];

  function hasActiveExclusion(rect: ExclusionRect): boolean {
    return rect.right > rect.left && rect.bottom > rect.top && rect.pad > 0;
  }

  function ensureExclusionCapacity(count: number): void {
    if (exclusionAlphaSamples.length >= count) return;
    exclusionAlphaSamples = new Float32Array(count);
    exclusionMotionSamples = new Float32Array(count);
  }

  function buildExclusionSamples(count: number, yAtSample: (sample: number) => number): number {
    if (!hasActiveExclusion(curExclusion)) return 0;
    const anchorCount = Math.ceil((count - 1) / EXCLUSION_SAMPLE_STRIDE) + 1;
    ensureExclusionCapacity(anchorCount);
    for (let anchor = 0; anchor < anchorCount; anchor += 1) {
      const sample = Math.min(count - 1, anchor * EXCLUSION_SAMPLE_STRIDE);
      const x = sample * tuning.sampleStep - EDGE_MARGIN;
      const factors = computeExclusion(x, yAtSample(sample), curExclusion);
      exclusionAlphaSamples[anchor] = factors.alpha;
      exclusionMotionSamples[anchor] = factors.motion;
    }
    return anchorCount;
  }

  function sampleExclusion(anchorCount: number, sample: number): ExclusionFactors {
    if (anchorCount <= 0) return FULL_EXCLUSION;
    const position = sample / EXCLUSION_SAMPLE_STRIDE;
    const lower = Math.max(0, Math.min(anchorCount - 1, Math.floor(position)));
    const upper = Math.min(anchorCount - 1, lower + 1);
    const amount = clamp01(position - lower);
    return {
      alpha: mix(exclusionAlphaSamples[lower], exclusionAlphaSamples[upper], amount),
      motion: mix(exclusionMotionSamples[lower], exclusionMotionSamples[upper], amount),
      density: 1,
      contrast: 1,
    };
  }

  function refreshDistantLayer(layer: DistantLandscapeLayer): void {
    if (!layer.heights) return;
    const slow = time * 0.025 + layer.seed;
    for (let sample = 0; sample < sampleCount; sample += 1) {
      const worldX = (sample * tuning.sampleStep - EDGE_MARGIN) + layer.scrollOffset;
      const broad = fbm(q, worldX * layer.freq + layer.seed, layer.seed * 5.9, slow, 4);
      const detail = fbm(q, worldX * layer.freq * 2.4 + layer.seed * 2.1, layer.seed * 3.4, slow * 0.8, 2);
      layer.heights[sample] = ((broad - 0.5) * 1.7) + ((detail - 0.5) * 0.45);
    }
    layer.heightsOffset = layer.scrollOffset;
  }

  function refreshLayer(layer: RidgeLayer): void {
    if (!layer.heights) return;
    const octaves = layer.depth > 0.6 ? 4 : 3;
    const slow = time * 0.05 + layer.seed;
    for (let sample = 0; sample < sampleCount; sample += 1) {
      const worldX = (sample * tuning.sampleStep - EDGE_MARGIN) + layer.scrollOffset;
      const noise = fbm(q, worldX * layer.freq + layer.seed, layer.seed * 7.7, slow, octaves);
      layer.heights[sample] = (noise - 0.5) * 2;
    }
    layer.heightsOffset = layer.scrollOffset;
  }

  function applyReveals(): void {
    for (let index = 0; index < layers.length; index += 1) {
      const extra = index - tuning.ridgeCountBase;
      if (extra < 0) {
        layers[index].revealTarget = 1;
        layers[index].reveal = layers[index].reveal || 1;
      } else {
        // Extra ridges surface one by one as section cues accumulate.
        layers[index].revealTarget = sectionCueCount >= extra * 2 + 1 ? 1 : layers[index].revealTarget;
      }
    }
  }

  function buildLayers(): void {
    sampleCount = Math.ceil((w + EDGE_MARGIN * 2) / tuning.sampleStep) + 4;
    const random = createSeededRandom(48121 + Math.round(w * 7 + h * 3));
    layers = [];
    for (let index = 0; index < tuning.ridgeCountMax; index += 1) {
      const depth = index / Math.max(tuning.ridgeCountMax - 1, 1);
      const glintFracs = new Float32Array(tuning.glintDensity);
      for (let glint = 0; glint < tuning.glintDensity; glint += 1) glintFracs[glint] = random();
      const layer: RidgeLayer = {
        depth,
        baseY: h * (0.3 + depth * 0.55),
        amp: h * tuning.ridgeAmp * (0.25 + depth * 0.75),
        freq: 0.0014 + depth * 0.0022,
        seed: random() * 1000,
        scrollSpeed: 2 + Math.pow(depth, 1.4) * tuning.parallaxSpread,
        scrollOffset: random() * 4000,
        heightsOffset: 0,
        reveal: index < tuning.ridgeCountBase ? 1 : 0,
        revealTarget: index < tuning.ridgeCountBase ? 1 : 0,
        heights: new Float32Array(sampleCount),
        glintFracs,
        bodyGrad: null,
        bodyColorKey: -1,
        bodyCrestQ: -1,
        fogGrad: null,
        fogColorKey: -1,
        fogTopQ: -1,
      };
      layers.push(layer);
      refreshLayer(layer);
    }
    applyReveals();
    refreshCursor = 0;
  }

  function buildDistantLandscape(): void {
    const count = Math.max(0, Math.round(tuning.distantLayerCount));
    const random = createSeededRandom(73129 + Math.round(w * 5 + h * 11));
    distantLayers = [];
    for (let index = 0; index < count; index += 1) {
      const depth = count <= 1 ? 0 : index / (count - 1);
      const layer: DistantLandscapeLayer = {
        depth,
        baseY: h * (0.34 + depth * 0.16),
        amp: h * (0.018 + depth * 0.026),
        freq: 0.0007 + depth * 0.0008,
        seed: random() * 1000,
        scrollSpeed: 0.45 + depth * 0.9,
        scrollOffset: random() * 4000,
        heightsOffset: 0,
        heights: new Float32Array(sampleCount),
        hazeGrad: null,
        hazeColorKey: -1,
      };
      distantLayers.push(layer);
      refreshDistantLayer(layer);
    }
  }

  function resetShootingStars(): void {
    const count = Math.max(0, Math.round(tuning.shootingStarCount));
    const random = createSeededRandom(91817 + Math.round(w * 13 + h * 17));
    shootingStars = [];
    for (let index = 0; index < count; index += 1) {
      shootingStars.push({
        x: 0,
        y: 0,
        age: 0,
        life: 1,
        delay: 1.8 + random() * 10 + index * 0.7,
        angle: 0,
        speed: 0,
        length: 0,
        seed: random(),
        active: false,
      });
    }
  }

  function sampleHeight(layer: RidgeLayer, x: number): number {
    if (!layer.heights) return 0;
    const u = (x + EDGE_MARGIN + (layer.scrollOffset - layer.heightsOffset)) / tuning.sampleStep;
    const lower = Math.max(0, Math.min(sampleCount - 2, Math.floor(u)));
    const frac = clamp01(u - lower);
    return mix(layer.heights[lower], layer.heights[lower + 1], frac);
  }

  function sampleDistantHeight(layer: DistantLandscapeLayer, x: number): number {
    if (!layer.heights) return 0;
    const u = (x + EDGE_MARGIN + (layer.scrollOffset - layer.heightsOffset)) / tuning.sampleStep;
    const lower = Math.max(0, Math.min(sampleCount - 2, Math.floor(u)));
    const frac = clamp01(u - lower);
    return mix(layer.heights[lower], layer.heights[lower + 1], frac);
  }

  function spawnSwell(): void {
    for (const swell of swells) {
      if (swell.active) continue;
      swell.active = true;
      swell.age = 0;
      swell.life = 2.6 + Math.random() * 0.9;
      swell.x = Math.random() < 0.5 ? -EDGE_MARGIN : w + EDGE_MARGIN;
      swell.speed = ((w + EDGE_MARGIN * 2) / swell.life) * (swell.x < 0 ? 1 : -1);
      swell.strength = 0.5 + curAudio.bass * 0.5;
      return;
    }
  }

  function spawnShootingStar(star: ShootingStar, boost = 0): void {
    const direction = star.seed > 0.5 ? 1 : -1;
    const startPad = w * 0.14 + EDGE_MARGIN;
    star.active = true;
    star.age = 0;
    star.life = 0.82 + Math.random() * 0.42;
    star.angle = (direction > 0 ? 0.18 : Math.PI - 0.18) + (Math.random() - 0.5) * 0.16;
    star.speed = w * (0.72 + Math.random() * 0.28 + boost * 0.18);
    star.length = Math.max(60, Math.min(160, w * (0.06 + Math.random() * 0.035 + boost * 0.018)));
    star.x = direction > 0 ? -startPad : w + startPad;
    star.y = h * (0.09 + Math.random() * 0.23);
    star.seed = (star.seed * 13.37 + Math.random() * 0.41) % 1;
  }

  function triggerShootingStar(boost = 0): void {
    const available = shootingStars.find((star) => !star.active);
    if (available) spawnShootingStar(available, boost);
  }

  return {
    setup(_q, _w, _h, _palette, _tuning) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      tuning = resolveNativeNightfallRidgesTuning(_tuning);
      time = 0;
      cue = createCueEventState();
      sectionCueCount = 0;
      sectionProgress = 0;
      ampLift = 0;
      ampLiftTarget = 0;
      warmTurn = 0;
      warmTurnTarget = 0;
      driftLift = 0;
      driftLiftTarget = 0;
      glintLift = 0;
      glintLiftTarget = 0;
      fogLift = 0;
      fogLiftTarget = 0;
      onsetCooldown = 0;
      for (const swell of swells) swell.active = false;
      skyGrad = null;
      skyColorKey = -1;
      distantRefreshCursor = 0;
      buildLayers();
      buildDistantLandscape();
      resetShootingStars();
    },

    update(dt, params, audio, exclusion) {
      curParams = params;
      curAudio = audio;
      curExclusion = exclusion;
      cue.update(dt);

      const damp = 1 - Math.pow(0.001, dt);
      ampLift = mix(ampLift, ampLiftTarget, damp);
      warmTurn = mix(warmTurn, warmTurnTarget, damp);
      driftLift = mix(driftLift, driftLiftTarget, damp);
      glintLift = mix(glintLift, glintLiftTarget, damp);
      fogLift = mix(fogLift, fogLiftTarget, damp);
      ampLiftTarget = Math.max(0, ampLiftTarget - dt * 0.04);
      warmTurnTarget = Math.max(0, warmTurnTarget - dt * 0.035);
      driftLiftTarget = Math.max(0, driftLiftTarget - dt * 0.04);
      glintLiftTarget = Math.max(0, glintLiftTarget - dt * 0.03);
      fogLiftTarget = Math.max(0, fogLiftTarget - dt * 0.04);

      if (hasReducedMotion()) return;
      time += dt;
      onsetCooldown = Math.max(0, onsetCooldown - dt);

      const revealDamp = 1 - Math.pow(0.04, dt * 0.4);
      const driftScale = 0.5 + params.drift * 0.9 + sectionProgress * 0.45 + driftLift * 0.6 + cue.motion * 0.25 + audio.energy * 0.12;
      const distantDriftScale = 0.35 + params.drift * 0.28 + sectionProgress * 0.16 + cue.motion * 0.08;
      for (const layer of distantLayers) {
        layer.scrollOffset += layer.scrollSpeed * distantDriftScale * dt;
      }
      // Refresh one distant layer per frame round-robin: sampling interpolates
      // against heightsOffset, so scroll stays smooth between refreshes and only
      // the glacial time-morph is sampled less often.
      if (distantLayers.length > 0) {
        distantRefreshCursor = (distantRefreshCursor + 1) % distantLayers.length;
        refreshDistantLayer(distantLayers[distantRefreshCursor]);
      }
      for (const layer of layers) {
        layer.scrollOffset += layer.scrollSpeed * driftScale * dt;
        layer.reveal = mix(layer.reveal, layer.revealTarget, revealDamp);
      }

      const starCadence = 0.55 + curParams.shimmer * 0.55 + curAudio.highs * 0.45 + sectionProgress * 0.35;
      for (const star of shootingStars) {
        if (!star.active) {
          star.delay -= dt * starCadence;
          if (star.delay <= 0) spawnShootingStar(star, curParams.shimmer * 0.5 + sectionProgress * 0.35);
          continue;
        }
        star.age += dt;
        star.x += Math.cos(star.angle) * star.speed * dt;
        star.y += Math.sin(star.angle) * star.speed * dt;
        if (star.age >= star.life || star.x < -w * 0.3 || star.x > w * 1.3 || star.y > h * 0.36) {
          star.active = false;
          star.delay = 5 + Math.random() * 12 - sectionProgress * 2.5;
        }
      }

      if ((audio.bassOnset ?? 0) > 0.55 && onsetCooldown <= 0) {
        spawnSwell();
        onsetCooldown = 0.8;
      }
      for (const swell of swells) {
        if (!swell.active) continue;
        swell.age += dt;
        swell.x += swell.speed * dt;
        if (swell.age >= swell.life) swell.active = false;
      }

      // Round-robin heightline refresh keeps noise cost amortized while the
      // per-frame scroll stays smooth via interpolated sampling.
      const layersPerFrame = getQualityScale() < 0.8 ? 1 : 2;
      for (let step = 0; step < layersPerFrame; step += 1) {
        refreshCursor = (refreshCursor + 1) % layers.length;
        const layer = layers[refreshCursor];
        if (layer.reveal > 0.01) refreshLayer(layer);
      }
    },

    draw(_q, ctx) {
      const [br, bg, bb] = palette.bgDark;
      const [mr, mg, mb] = palette.bgMid;
      const [ar, ag, ab] = palette.accentGlow;
      const [wr, wg, wb] = palette.accentWarm;
      const [dr, dg, db] = palette.dotColor;

      // Opaque sky repaint every frame: translucent fills must never
      // accumulate (they flatten the scene into solid color slabs). The dusk
      // glow sits behind the farthest crest and warms as sections turn.
      const skyWarm = clamp01(Math.max(warmTurn, Math.max(0, sectionProgress - 0.2) * 0.8));
      const glowLift = clamp01(0.26 + curParams.glow * 0.2 + fogLift * 0.2 + curAudio.mids * 0.12 + sectionProgress * 0.18);
      const [kr, kg, kb] = cue.mixBackgroundColor([
        Math.round(mix(mix(br, mix(mr, dr, 0.34), glowLift), wr, skyWarm * 0.22)),
        Math.round(mix(mix(bg, mix(mg, dg, 0.34), glowLift), wg, skyWarm * 0.22)),
        Math.round(mix(mix(bb, mix(mb, db, 0.34), glowLift), wb, skyWarm * 0.22)),
      ], 3.7);
      const skyKey = (kr << 16) | (kg << 8) | kb;
      if (!skyGrad || skyKey !== skyColorKey) {
        skyGrad = ctx.createLinearGradient(0, 0, 0, h);
        skyGrad.addColorStop(0, `rgb(${br},${bg},${bb})`);
        skyGrad.addColorStop(0.3, `rgb(${kr},${kg},${kb})`);
        skyGrad.addColorStop(0.66, `rgb(${br},${bg},${bb})`);
        skyGrad.addColorStop(1, `rgb(${br},${bg},${bb})`);
        skyColorKey = skyKey;
      }
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);
      const ampScale = (0.7 + curParams.turbulence * 0.8 + sectionProgress * 0.45 + ampLift * 0.7) * (1 + curAudio.bass * 0.3);
      const distantAmpScale = 0.72 + curParams.turbulence * 0.22 + sectionProgress * 0.12 + fogLift * 0.08;

      for (const layer of distantLayers) {
        if (!layer.heights) continue;
        const horizonPath = new Path2D();
        let firstY = layer.baseY;
        for (let x = -EDGE_MARGIN; x <= w + EDGE_MARGIN; x += tuning.sampleStep) {
          const y = layer.baseY + sampleDistantHeight(layer, x) * layer.amp * distantAmpScale;
          if (x === -EDGE_MARGIN) {
            horizonPath.moveTo(x, y);
            firstY = y;
          } else {
            horizonPath.lineTo(x, y);
          }
        }
        const fillPath = new Path2D(horizonPath);
        const floorY = h * (0.54 + layer.depth * 0.08);
        fillPath.lineTo(w + EDGE_MARGIN, floorY);
        fillPath.lineTo(-EDGE_MARGIN, floorY);
        fillPath.lineTo(-EDGE_MARGIN, firstY);
        fillPath.closePath();

        const haze = 0.12 + layer.depth * 0.16;
        const [lr, lg, lb] = cue.mixRidgeColor([
          Math.round(mix(mix(mr, dr, 0.2), br, haze)),
          Math.round(mix(mix(mg, dg, 0.2), bg, haze)),
          Math.round(mix(mix(mb, db, 0.2), bb, haze)),
        ], layer.seed + 23);
        const alpha = tuning.distantLandscapeAlpha * (0.58 + layer.depth * 0.34 + sectionProgress * 0.18);
        // Normalized-stop gradient cached per layer; the per-frame alpha rides
        // on globalAlpha so color churn is the only rebuild trigger.
        const hazeKey = (lr << 16) | (lg << 8) | lb;
        if (!layer.hazeGrad || hazeKey !== layer.hazeColorKey) {
          layer.hazeGrad = ctx.createLinearGradient(0, layer.baseY - layer.amp * 2, 0, floorY);
          layer.hazeGrad.addColorStop(0, `rgba(${lr},${lg},${lb},1)`);
          layer.hazeGrad.addColorStop(1, `rgba(${lr},${lg},${lb},0.12)`);
          layer.hazeColorKey = hazeKey;
        }
        ctx.globalAlpha = clamp01(alpha);
        ctx.fillStyle = layer.hazeGrad;
        ctx.fill(fillPath);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = `rgba(${ar},${ag},${ab},${alpha * (0.28 + curParams.glow * 0.24)})`;
        ctx.lineWidth = 0.55;
        ctx.stroke(horizonPath);
      }

      if (!hasReducedMotion()) {
        for (const star of shootingStars) {
          if (!star.active || star.y > h * 0.34) continue;
          const progress = clamp01(star.age / star.life);
          const envelope = Math.sin(Math.PI * progress);
          const headAlpha = tuning.shootingStarAlpha * envelope * (0.6 + curParams.shimmer * 0.35 + curAudio.highs * 0.25);
          if (headAlpha < 0.01) continue;
          const tailX = star.x - Math.cos(star.angle) * star.length;
          const tailY = star.y - Math.sin(star.angle) * star.length;
          const gradient = ctx.createLinearGradient(tailX, tailY, star.x, star.y);
          gradient.addColorStop(0, `rgba(${ar},${ag},${ab},0)`);
          gradient.addColorStop(0.72, `rgba(${ar},${ag},${ab},${headAlpha * 0.42})`);
          gradient.addColorStop(1, `rgba(${wr},${wg},${wb},${headAlpha})`);
          ctx.strokeStyle = gradient;
          ctx.lineWidth = 0.8 + envelope * 0.7;
          ctx.beginPath();
          ctx.moveTo(tailX, tailY);
          ctx.lineTo(star.x, star.y);
          ctx.stroke();
          ctx.fillStyle = `rgba(${wr},${wg},${wb},${headAlpha})`;
          ctx.beginPath();
          ctx.arc(star.x, star.y, 1.1 + envelope * 0.55, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const nearest = (() => {
        for (let index = layers.length - 1; index >= 0; index -= 1) {
          if (layers[index].reveal > 0.4) return index;
        }
        return tuning.ridgeCountBase - 1;
      })();

      for (let index = 0; index < layers.length; index += 1) {
        const layer = layers[index];
        if (layer.reveal < 0.02) continue;

        // Atmospheric perspective: far ridges sit near bgMid haze lifted by a
        // touch of dotColor, near ridges sink toward bgDark with a warm turn.
        const haze = 0.18 + layer.depth * 0.78;
        const hazeLight = (1 - layer.depth) * 0.16;
        const warmTint = warmTurn * (0.06 + layer.depth * 0.14);
        const [fr, fg, fb] = cue.mixRidgeColor([
          Math.round(mix(mix(mix(mr, dr, hazeLight), br, haze), wr, warmTint)),
          Math.round(mix(mix(mix(mg, dg, hazeLight), bg, haze), wg, warmTint)),
          Math.round(mix(mix(mix(mb, db, hazeLight), bb, haze), wb, warmTint)),
        ], layer.seed);

        const isNearest = index === nearest;
        const linePath = new Path2D();
        let firstY = 0;
        const ridgeSampleLimit = Math.ceil((w + EDGE_MARGIN * 2) / tuning.sampleStep);
        const exclusionSampleCount = buildExclusionSamples(ridgeSampleLimit + 1, (sample) => {
          const x = sample * tuning.sampleStep - EDGE_MARGIN;
          let y = layer.baseY + sampleHeight(layer, x) * layer.amp * ampScale;
          if (isNearest) {
            for (const swell of swells) {
              if (!swell.active) continue;
              const span = (x - swell.x) / 90;
              const envelope = Math.sin(Math.PI * clamp01(swell.age / swell.life));
              y -= Math.exp(-span * span) * swell.strength * envelope * 7;
            }
          }
          return y;
        });
        for (let sample = 0; sample <= ridgeSampleLimit; sample += 1) {
          const x = sample * tuning.sampleStep - EDGE_MARGIN;
          let y = layer.baseY + sampleHeight(layer, x) * layer.amp * ampScale;
          if (isNearest) {
            for (const swell of swells) {
              if (!swell.active) continue;
              const span = (x - swell.x) / 90;
              const envelope = Math.sin(Math.PI * clamp01(swell.age / swell.life));
              y -= Math.exp(-span * span) * swell.strength * envelope * 7;
            }
          }
          const factors = sampleExclusion(exclusionSampleCount, sample);
          y = layer.baseY + (y - layer.baseY) * factors.motion;
          if (sample === 0) {
            linePath.moveTo(x, y);
            firstY = y;
          } else {
            linePath.lineTo(x, y);
          }
        }
        const fillPath = new Path2D(linePath);
        fillPath.lineTo(w + EDGE_MARGIN, h + EDGE_MARGIN);
        fillPath.lineTo(-EDGE_MARGIN, h + EDGE_MARGIN);
        fillPath.lineTo(-EDGE_MARGIN, firstY);
        fillPath.closePath();

        // Opaque fill once revealed (alpha is only the reveal fade-in); a
        // slight vertical darkening inside each silhouette adds body. The
        // gradient is cached opaque (reveal rides on globalAlpha) and only
        // rebuilds when the color or the 2px-quantized crest line moves.
        const crestTop = layer.baseY - layer.amp * ampScale;
        const bodyColorKey = (fr << 16) | (fg << 8) | fb;
        const bodyCrestQ = Math.round(crestTop / 2);
        if (!layer.bodyGrad || bodyColorKey !== layer.bodyColorKey || bodyCrestQ !== layer.bodyCrestQ) {
          const shade = 0.3 + layer.depth * 0.2;
          layer.bodyGrad = ctx.createLinearGradient(0, bodyCrestQ * 2, 0, h);
          layer.bodyGrad.addColorStop(0, `rgb(${fr},${fg},${fb})`);
          layer.bodyGrad.addColorStop(1, `rgb(${Math.round(fr * (1 - shade))},${Math.round(fg * (1 - shade))},${Math.round(fb * (1 - shade))})`);
          layer.bodyColorKey = bodyColorKey;
          layer.bodyCrestQ = bodyCrestQ;
        }
        ctx.globalAlpha = clamp01(layer.reveal);
        ctx.fillStyle = layer.bodyGrad;
        ctx.fill(fillPath);
        ctx.globalAlpha = 1;

        // Rim light along the crest separates silhouettes from the haze.
        const rimTint = clamp01(0.3 + curParams.glow * 0.4 + curAudio.transient * 0.3 + cue.bloom * 0.3);
        const [rr, rg, rb] = cue.mixForegroundColor([
          Math.round(mix(dr, ar, rimTint)),
          Math.round(mix(dg, ag, rimTint)),
          Math.round(mix(db, ab, rimTint)),
        ], layer.seed + 11.3);
        const rimAlpha = tuning.rimAlpha * (0.7 + curParams.glow * 0.8 + curAudio.transient * 0.6 + sectionProgress * 0.7 + glintLift * 0.4) * layer.reveal;
        ctx.strokeStyle = `rgba(${rr},${rg},${rb},${rimAlpha})`;
        ctx.lineWidth = 0.8 + layer.depth * 0.8;
        ctx.stroke(linePath);

        // Valley mist pooled above this crest, lit faintly from below.
        const fogTop = layer.baseY - layer.amp * ampScale - 26;
        const fogBottom = layer.baseY + layer.amp * 0.5;
        const fogAlpha = tuning.fogAlpha * (0.5 + curParams.density * 0.5 + curAudio.mids * 0.5 + sectionProgress * 0.7 + fogLift * 0.9) * layer.reveal;
        if (fogAlpha > 0.003 && fogBottom > fogTop) {
          const [hr, hg, hb] = cue.mixMistColor([
            Math.round(mix(dr, ar, 0.4)),
            Math.round(mix(dg, ag, 0.4)),
            Math.round(mix(db, ab, 0.4)),
          ], layer.seed + 5.1);
          const fogColorKey = (hr << 16) | (hg << 8) | hb;
          const fogTopQ = Math.round(fogTop / 2);
          if (!layer.fogGrad || fogColorKey !== layer.fogColorKey || fogTopQ !== layer.fogTopQ) {
            layer.fogGrad = ctx.createLinearGradient(0, fogTopQ * 2, 0, fogBottom);
            layer.fogGrad.addColorStop(0, `rgba(${hr},${hg},${hb},0)`);
            layer.fogGrad.addColorStop(1, `rgba(${hr},${hg},${hb},1)`);
            layer.fogColorKey = fogColorKey;
            layer.fogTopQ = fogTopQ;
          }
          ctx.globalAlpha = clamp01(fogAlpha);
          ctx.fillStyle = layer.fogGrad;
          ctx.fillRect(0, fogTopQ * 2, w, fogBottom - fogTopQ * 2);
          ctx.globalAlpha = 1;
        }

        // Distant glints: a few are alive from the opening so section 1 has
        // fine detail; they multiply and brighten as sections deepen.
        const glintBase = 0.16 + sectionProgress * 0.7 + glintLift * 0.5;
        if (layer.depth < 0.55 && layer.glintFracs) {
          // Glints bucket into quantized-alpha Path2Ds so each layer pays a
          // handful of fills instead of one fill per glint. The ≤1/16 alpha
          // rounding is invisible on 1.2px twinkling dots.
          for (let bucket = 0; bucket <= GLINT_BUCKETS; bucket += 1) glintPaths[bucket] = null;
          // Only a third of the glints exist at the opening; the rest join
          // as the persistent progression climbs.
          const visibleGlints = Math.round(layer.glintFracs.length * (0.34 + sectionProgress * 0.66));
          let glintFactors = FULL_EXCLUSION;
          for (let glint = 0; glint < visibleGlints; glint += 1) {
            const frac = layer.glintFracs[glint];
            const gx = ((frac * (w + EDGE_MARGIN * 2) + layer.scrollOffset * 0.4) % (w + EDGE_MARGIN * 2)) - EDGE_MARGIN;
            const gy = layer.baseY + sampleHeight(layer, gx) * layer.amp * ampScale - 2;
            const twinkle = 0.5 + 0.5 * Math.sin(time * (1.1 + frac * 2.3) + frac * 40);
            if (glint % EXCLUSION_SAMPLE_STRIDE === 0) {
              glintFactors = hasActiveExclusion(curExclusion) ? computeExclusion(gx, gy, curExclusion) : FULL_EXCLUSION;
            }
            const alpha = glintBase * twinkle * (0.3 + curParams.shimmer * 0.5 + curAudio.highs * 0.4) * layer.reveal * glintFactors.alpha;
            if (alpha < 0.01) continue;
            const bucket = Math.round(clamp01(alpha) * GLINT_BUCKETS);
            if (bucket === 0) continue;
            const path = glintPaths[bucket] ?? (glintPaths[bucket] = new Path2D());
            path.moveTo(gx + 1.2, gy);
            path.arc(gx, gy, 1.2, 0, Math.PI * 2);
          }
          ctx.fillStyle = `rgba(${ar},${ag},${ab},1)`;
          for (let bucket = 1; bucket <= GLINT_BUCKETS; bucket += 1) {
            const path = glintPaths[bucket];
            if (!path) continue;
            ctx.globalAlpha = bucket / GLINT_BUCKETS;
            ctx.fill(path);
          }
          ctx.globalAlpha = 1;
        }
      }

      // Soft traveling light where a crest swell rides the nearest ridge.
      for (const swell of swells) {
        if (!swell.active) continue;
        const layer = layers[nearest];
        const envelope = Math.sin(Math.PI * clamp01(swell.age / swell.life));
        const sy = layer.baseY + sampleHeight(layer, swell.x) * layer.amp * ampScale;
        const factors = computeExclusion(swell.x, sy, curExclusion);
        const alpha = 0.045 * swell.strength * envelope * factors.alpha;
        if (alpha < 0.004) continue;
        const radius = 90;
        const glow = ctx.createRadialGradient(swell.x, sy, 0, swell.x, sy, radius);
        glow.addColorStop(0, `rgba(${wr},${wg},${wb},${alpha})`);
        glow.addColorStop(1, `rgba(${wr},${wg},${wb},0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(swell.x - radius, sy - radius, radius * 2, radius * 2);
      }
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      const intensity = clamp01(event.intensity ?? 0.5);
      if (event.type === 'section-cue') {
        sectionCueCount = Math.max(sectionCueCount + 1, (event.sectionIndex ?? 0));
        sectionProgress = Math.min(1, sectionCueCount / 5);
        const step = sectionProgress;
        ampLiftTarget = Math.max(ampLiftTarget, 0.14 + step * 0.4 + intensity * 0.16);
        fogLiftTarget = Math.max(fogLiftTarget, 0.16 + step * 0.44);
        if (sectionCueCount >= 2) {
          warmTurnTarget = Math.max(warmTurnTarget, 0.24 + step * 0.4);
          driftLiftTarget = Math.max(driftLiftTarget, 0.2 + step * 0.34);
        }
        if (sectionCueCount >= 3) {
          glintLiftTarget = Math.max(glintLiftTarget, 0.3 + step * 0.5 + intensity * 0.2);
        }
        applyReveals();
      }
      if (event.type === 'density-surge' || event.type === 'grain-bloom') {
        fogLiftTarget = Math.max(fogLiftTarget, 0.34 + intensity * 0.4);
        ampLiftTarget = Math.max(ampLiftTarget, 0.2 + intensity * 0.3);
      }
      if (event.type === 'motion-drift' || event.type === 'veil-sweep') {
        driftLiftTarget = Math.max(driftLiftTarget, 0.3 + intensity * 0.44);
      }
      if (event.type === 'color-morph' || event.type === 'palette-morph') {
        warmTurnTarget = Math.max(warmTurnTarget, 0.3 + intensity * 0.5);
      }
      if (event.type === 'glow-pulse' || event.type === 'spark-burst' || event.type === 'bloom-flash') {
        glintLiftTarget = Math.max(glintLiftTarget, 0.26 + intensity * 0.4);
        triggerShootingStar(intensity);
      }
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      skyGrad = null;
      skyColorKey = -1;
      buildLayers();
      buildDistantLandscape();
      resetShootingStars();
    },

    destroy() {
      for (const layer of layers) {
        layer.heights = null;
        layer.glintFracs = null;
      }
      for (const layer of distantLayers) layer.heights = null;
      layers = [];
      distantLayers = [];
      shootingStars = [];
    },
  };
}
