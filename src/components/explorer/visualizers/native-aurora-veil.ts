import type { AudioSignal } from '../audio-signal';
import { hsbToRgb, rgbToHsb, type Palette } from '../palette';
import { getQualityScale } from '../render-quality';
import { resolveNativeAuroraVeilTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { clamp01, createSeededRandom, fbm, hasReducedMotion, mix } from './cong-particle-primitives';
import { createCueEventState } from './cue-event-state';

/* ── Native Aurora Veil ──────────────────────────────────────
   Domain-warped fbm fog on a low-resolution grid, upscaled with
   smoothing into curtain-like mist that never reads as particles.
   Anisotropic sampling gives vertical striations; the cached
   grid composites twice (stretched haze + foreground curtain)
   for parallax depth. Sections deepen the warp, descend a warm
   tension down the curtain, and sharpen the striations. Bass
   onsets send slow surge bands of light across the veil.
──────────────────────────────────────────────────────────────── */

function shiftedColor(color: [number, number, number], hueShift: number): [number, number, number] {
  if (Math.abs(hueShift) < 0.01) return color;
  const hsb = rgbToHsb(color[0], color[1], color[2]);
  return hsbToRgb(hsb.h + hueShift, hsb.s, hsb.b);
}

interface SurgeBand {
  x: number;
  age: number;
  life: number;
  strength: number;
  active: boolean;
}

export function createNativeAuroraVeil(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let gw = 0;
  let gh = 0;
  let gridCanvas: HTMLCanvasElement | null = null;
  let gridCtx: CanvasRenderingContext2D | null = null;
  let gridImage: ImageData | null = null;
  let surgeBoost: Float32Array | null = null;
  let rowWarm: Float32Array | null = null;
  let colFade: Float32Array | null = null;
  let rowFade: Float32Array | null = null;
  let cue = createCueEventState();
  let random = createSeededRandom(91733);
  let renderParity = 0;
  let seed = 0;
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };
  let tuning = resolveNativeAuroraVeilTuning();
  let sectionCueCount = 0;
  // Persistent 0..1 progression base — never decays, so each section leaves
  // the curtain permanently deeper while the lift targets accent the change.
  let sectionProgress = 0;
  let warpDepth = 0;
  let warpDepthTarget = 0;
  let driftLift = 0;
  let driftLiftTarget = 0;
  let colorTension = 0;
  let colorTensionTarget = 0;
  let tensionDescend = 0;
  let tensionDescendTarget = 0;
  let densityLift = 0;
  let densityLiftTarget = 0;
  let anisoLift = 0;
  let anisoLiftTarget = 0;
  let hazeLift = 0;
  let hazeLiftTarget = 0;
  let onsetCooldown = 0;
  const surges: SurgeBand[] = [
    { x: 0, age: 0, life: 4, strength: 0, active: false },
    { x: 0, age: 0, life: 4, strength: 0, active: false },
  ];

  function buildGrid(): void {
    gw = w < 768 ? Math.round(tuning.gridScale * 0.6) : tuning.gridScale;
    gh = Math.max(24, Math.round(gw * (h / Math.max(1, w))));
    gridCanvas = document.createElement('canvas');
    gridCanvas.width = gw;
    gridCanvas.height = gh;
    gridCtx = gridCanvas.getContext('2d');
    gridImage = gridCtx ? gridCtx.createImageData(gw, gh) : null;
    surgeBoost = new Float32Array(gw);
    rowWarm = new Float32Array(gh);
    colFade = new Float32Array(gw);
    rowFade = new Float32Array(gh);
  }

  // Per-axis exclusion falloff in grid space: a cell's fade is driven by the
  // larger of the two axis distances, mirroring computeExclusion's shape
  // without a per-cell rect test.
  function fillAxisFade(target: Float32Array, cells: number, full: number, lowEdge: number, highEdge: number, pad: number): void {
    for (let cell = 0; cell < cells; cell += 1) {
      const position = (cell / Math.max(cells - 1, 1)) * full;
      const distance = position < lowEdge
        ? (lowEdge - position) / pad
        : position > highEdge
          ? (position - highEdge) / pad
          : 0;
      target[cell] = Math.min(1, distance);
    }
  }

  function renderGrid(fieldTime: number): void {
    if (!gridCtx || !gridImage || !surgeBoost || !rowWarm || !colFade || !rowFade) return;

    fillAxisFade(colFade, gw, w, curExclusion.left, curExclusion.right, curExclusion.pad);
    fillAxisFade(rowFade, gh, h, curExclusion.top, curExclusion.bottom, curExclusion.pad);

    surgeBoost.fill(0);
    for (const surge of surges) {
      if (!surge.active) continue;
      const envelope = Math.sin(Math.PI * clamp01(surge.age / surge.life));
      const width = gw * 0.12;
      for (let col = 0; col < gw; col += 1) {
        const span = (col - surge.x) / width;
        surgeBoost[col] += Math.exp(-span * span) * surge.strength * envelope;
      }
    }

    // Capped well below 1 so the warm turn stays a tonal accent in the upper
    // curtain rather than flooding the whole veil.
    const tension = Math.min(0.72, colorTension + Math.max(0, sectionProgress - 0.2) * 0.4);
    const descend = clamp01(tensionDescend + sectionProgress * 0.55);
    for (let row = 0; row < gh; row += 1) {
      const ny = row / Math.max(gh - 1, 1);
      rowWarm[row] = clamp01(tension * clamp01(1.2 - ny * (1.8 - descend * 1.6))) * tuning.tensionMix;
    }

    const lowColor = cue.mixBackgroundColor(palette.bgMid);
    const highColor = cue.mixMistColor(shiftedColor(palette.accentGlow, curParams.hueShift));
    const [tr, tg, tb] = palette.accentWarm;
    const alphaScale = clamp01(tuning.veilAlpha * (0.55 + curParams.density * 0.3 + sectionProgress * 0.12 + densityLift * 0.3 + curAudio.bass * 0.12 + cue.grain * 0.15));
    const anisotropy = tuning.anisotropy * (1 + sectionProgress * 0.32 + anisoLift * 0.45);
    const warpStrength = tuning.warpStrength * (0.7 + sectionProgress * 0.5 + warpDepth * 0.8 + curAudio.mids * 0.12);
    const highsBoost = curAudio.highs * 0.3 + curParams.shimmer * 0.16;
    const warpTime = fieldTime * 0.05 + seed;
    const data = gridImage.data;

    for (let row = 0; row < gh; row += 1) {
      const ny = row / Math.max(gh - 1, 1);
      const warm = rowWarm[row];
      const fadeY = rowFade[row];
      for (let col = 0; col < gw; col += 1) {
        const nx = col / Math.max(gw - 1, 1);
        const warp = q.noise(nx * tuning.warpFreq + seed, ny * tuning.warpFreq + seed * 1.7, warpTime);
        const value = fbm(
          q,
          nx * tuning.baseFreq * anisotropy + (warp - 0.5) * warpStrength + seed * 3.1,
          ny * tuning.baseFreq + (warp - 0.5) * warpStrength * 0.6,
          fieldTime + seed,
          2,
        );
        let eased = clamp01((value - 0.34) * 1.9);
        // Squared smoothstep keeps the midtones dark so the curtain always
        // holds negative space, even at full section density.
        eased = eased * eased * (3 - 2 * eased);
        eased *= eased;
        eased = clamp01(eased * (1 + surgeBoost[col]) + (eased > 0.72 ? (eased - 0.72) * highsBoost * 3 : 0));

        const fade = Math.max(fadeY, colFade[col]);
        const fadeT = fade >= 1 ? 1 : fade * fade * (3 - 2 * fade);
        const exclusionAlpha = 0.08 + fadeT * 0.92;

        const offset = (row * gw + col) * 4;
        const colorMix = eased * 0.85;
        data[offset] = Math.round(mix(mix(lowColor[0], highColor[0], colorMix), tr, warm * colorMix));
        data[offset + 1] = Math.round(mix(mix(lowColor[1], highColor[1], colorMix), tg, warm * colorMix));
        data[offset + 2] = Math.round(mix(mix(lowColor[2], highColor[2], colorMix), tb, warm * colorMix));
        data[offset + 3] = Math.round(eased * alphaScale * exclusionAlpha * 255);
      }
    }
    gridCtx.putImageData(gridImage, 0, 0);
  }

  return {
    setup(_q, _w, _h, _palette, _tuning) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      tuning = resolveNativeAuroraVeilTuning(_tuning);
      time = 0;
      renderParity = 0;
      sectionCueCount = 0;
      sectionProgress = 0;
      warpDepth = 0;
      warpDepthTarget = 0;
      driftLift = 0;
      driftLiftTarget = 0;
      colorTension = 0;
      colorTensionTarget = 0;
      tensionDescend = 0;
      tensionDescendTarget = 0;
      densityLift = 0;
      densityLiftTarget = 0;
      anisoLift = 0;
      anisoLiftTarget = 0;
      hazeLift = 0;
      hazeLiftTarget = 0;
      onsetCooldown = 0;
      for (const surge of surges) surge.active = false;
      random = createSeededRandom(91733 + Math.round(w + h));
      seed = random() * 100;
      cue = createCueEventState();
      buildGrid();
      // Render once so reduced-motion users get a stable non-blank curtain.
      renderGrid(0);
    },

    update(dt, params, audio, exclusion) {
      curParams = params;
      curAudio = audio;
      curExclusion = exclusion;
      cue.update(dt);

      const damp = 1 - Math.pow(0.001, dt);
      warpDepth = mix(warpDepth, warpDepthTarget, damp);
      driftLift = mix(driftLift, driftLiftTarget, damp);
      colorTension = mix(colorTension, colorTensionTarget, damp);
      tensionDescend = mix(tensionDescend, tensionDescendTarget, damp);
      densityLift = mix(densityLift, densityLiftTarget, damp);
      anisoLift = mix(anisoLift, anisoLiftTarget, damp);
      hazeLift = mix(hazeLift, hazeLiftTarget, damp);
      warpDepthTarget = Math.max(0, warpDepthTarget - dt * 0.02);
      driftLiftTarget = Math.max(0, driftLiftTarget - dt * 0.025);
      colorTensionTarget = Math.max(0, colorTensionTarget - dt * 0.015);
      tensionDescendTarget = Math.max(0, tensionDescendTarget - dt * 0.015);
      densityLiftTarget = Math.max(0, densityLiftTarget - dt * 0.02);
      anisoLiftTarget = Math.max(0, anisoLiftTarget - dt * 0.02);
      hazeLiftTarget = Math.max(0, hazeLiftTarget - dt * 0.02);

      if (hasReducedMotion()) return;
      time += dt * tuning.driftSpeed * (0.7 + curParams.drift * 0.8 + sectionProgress * 0.4 + driftLift * 0.6 + audio.energy * 0.3 + cue.motion * 0.25);
      onsetCooldown = Math.max(0, onsetCooldown - dt);

      if ((audio.bassOnset ?? 0) > 0.5 && onsetCooldown <= 0) {
        for (const surge of surges) {
          if (surge.active) continue;
          surge.active = true;
          surge.age = 0;
          surge.life = 3.4 + random() * 1.2;
          surge.x = (0.15 + random() * 0.7) * gw;
          surge.strength = 0.4 + audio.bass * 0.5 + sectionCueCount * 0.06;
          onsetCooldown = 0.9;
          break;
        }
      }
      for (const surge of surges) {
        if (!surge.active) continue;
        surge.age += dt;
        if (surge.age >= surge.life) surge.active = false;
      }

      // Re-render the field every 2nd frame (3rd under load); the cached
      // canvas composites every frame so drift stays smooth.
      const cadence = getQualityScale() < 0.8 ? 3 : 2;
      renderParity = (renderParity + 1) % cadence;
      if (renderParity === 0) renderGrid(time);
    },

    draw(_q, ctx) {
      if (!gridCanvas) return;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Background haze: the same curtain stretched and dimmed reads as a
      // slower, farther fog depth behind the foreground veil.
      const hazeAlpha = clamp01(0.26 + sectionProgress * 0.18 + hazeLift * 0.3 + cue.bloom * 0.1);
      const stretch = 1.25;
      ctx.globalAlpha = hazeAlpha;
      ctx.drawImage(gridCanvas, 0, 0, gw, gh, -w * (stretch - 1) * 0.5, -h * (stretch - 1) * 0.65, w * stretch, h * stretch);

      ctx.globalAlpha = clamp01(0.52 + curParams.glow * 0.24 + cue.bloom * 0.14);
      ctx.drawImage(gridCanvas, 0, 0, gw, gh, 0, 0, w, h);
      ctx.restore();
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      const intensity = clamp01(event.intensity ?? 0.5);
      if (event.type === 'section-cue') {
        sectionCueCount = Math.max(sectionCueCount + 1, event.sectionIndex ?? 0);
        sectionProgress = Math.min(1, sectionCueCount / 5);
        const step = sectionProgress;
        warpDepthTarget = Math.max(warpDepthTarget, 0.24 + step * 0.5 + intensity * 0.16);
        driftLiftTarget = Math.max(driftLiftTarget, 0.18 + step * 0.4);
        if (sectionCueCount >= 2) {
          colorTensionTarget = Math.max(colorTensionTarget, 0.3 + step * 0.5);
          tensionDescendTarget = Math.max(tensionDescendTarget, step);
          densityLiftTarget = Math.max(densityLiftTarget, 0.2 + step * 0.4);
        }
        if (sectionCueCount >= 3) {
          anisoLiftTarget = Math.max(anisoLiftTarget, 0.3 + step * 0.5);
          hazeLiftTarget = Math.max(hazeLiftTarget, 0.24 + step * 0.5);
        }
      }
      if (event.type === 'density-surge' || event.type === 'grain-bloom') {
        densityLiftTarget = Math.max(densityLiftTarget, 0.3 + intensity * 0.4);
      }
      if (event.type === 'motion-drift' || event.type === 'veil-sweep') {
        driftLiftTarget = Math.max(driftLiftTarget, 0.3 + intensity * 0.4);
        warpDepthTarget = Math.max(warpDepthTarget, 0.24 + intensity * 0.3);
      }
      if (event.type === 'color-morph' || event.type === 'palette-morph') {
        colorTensionTarget = Math.max(colorTensionTarget, 0.34 + intensity * 0.4);
        tensionDescendTarget = Math.max(tensionDescendTarget, 0.4 + intensity * 0.3);
      }
      if (event.type === 'glow-pulse' || event.type === 'spark-burst' || event.type === 'bloom-flash') {
        hazeLiftTarget = Math.max(hazeLiftTarget, 0.3 + intensity * 0.4);
      }
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      buildGrid();
      renderGrid(time);
    },

    destroy() {
      gridCanvas = null;
      gridCtx = null;
      gridImage = null;
      surgeBoost = null;
      rowWarm = null;
      colFade = null;
      rowFade = null;
    },
  };
}
