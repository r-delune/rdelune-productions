import type { AudioSignal } from '../audio-signal';
import type { Palette } from '../palette';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { createCueEventState } from './cue-event-state';

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Parametric Lissajous: x = A*sin(a*t + delta), y = B*sin(b*t)
// Different a:b ratios produce different "knot" shapes.
const LISSAJOUS_RATIOS: [number, number, number][] = [
  [1, 1, Math.PI / 2],       // circle/ellipse
  [3, 2, Math.PI / 4],       // figure-8 variant
  [3, 4, Math.PI / 6],       // complex knot
  [5, 4, Math.PI / 3],       // dense star
  [2, 3, Math.PI / 5],       // trefoil-like
];
const TAU = Math.PI * 2;

interface Tracer {
  t: number;
  radius: number;
  alpha: number;
}

export function createNativeLissajous(): Visualizer {
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let burst = 0;
  let sectionCueCount = 0;
  let cue = createCueEventState();
  let ratioIndex = 0;
  let ratioProgress = 1; // 1 = fully arrived at current ratio
  let prevRatio = LISSAJOUS_RATIOS[0];
  let curRatio = LISSAJOUS_RATIOS[0];
  let hueShiftAccum = 0;
  let tracers: Tracer[] = [];
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };

  function lerpRatio(p: number): [number, number, number] {
    const t = p * p * (3 - 2 * p); // smoothstep
    return [
      mix(prevRatio[0], curRatio[0], t),
      mix(prevRatio[1], curRatio[1], t),
      mix(prevRatio[2], curRatio[2], t),
    ];
  }

  function advanceRatio() {
    prevRatio = lerpRatio(ratioProgress);
    ratioIndex = (ratioIndex + 1) % LISSAJOUS_RATIOS.length;
    curRatio = LISSAJOUS_RATIOS[ratioIndex];
    ratioProgress = 0;
  }

  return {
    setup(_q, _w, _h, _palette) {
      w = _w;
      h = _h;
      palette = _palette;
      time = 0;
      burst = 0;
      sectionCueCount = 0;
      cue = createCueEventState();
      ratioIndex = 0;
      ratioProgress = 1;
      prevRatio = LISSAJOUS_RATIOS[0];
      curRatio = LISSAJOUS_RATIOS[0];
      hueShiftAccum = 0;
      tracers = Array.from({ length: 84 }, (_, index) => ({
        t: (index / 84) * TAU,
        radius: 0.82 + (index % 7) * 0.22,
        alpha: 0.18 + (index % 6) * 0.038,
      }));
    },

    update(dt, params, audio, _exclusion: ExclusionRect) {
      curParams = params;
      curAudio = audio;
      burst = Math.max(0, burst - dt * 1.8);
      cue.update(dt);

      const reduced = typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) return;

      time += dt * (0.48 + params.drift * 1.6 + audio.energy * 0.58 + burst * 0.42);
      hueShiftAccum = (hueShiftAccum + dt * (8 + audio.mids * 24 + params.drift * 14)) % 360;

      // Advance ratio over ~8-14s depending on density
      const ratioSpeed = 1 / (8 + (1 - params.density) * 6);
      ratioProgress = Math.min(1, ratioProgress + dt * ratioSpeed);
      const tracerRate = 0.03 + params.drift * 0.04 + audio.energy * 0.02;
      for (let index = 0; index < tracers.length; index += 1) {
        tracers[index].t = (tracers[index].t + dt * tracerRate * (0.86 + index * 0.012)) % TAU;
      }
    },

    draw(_q, ctx) {
      const [br, bg, bb] = cue.mixBackgroundColor(palette.bgDark);
      const [ar, ag, ab] = cue.mixForegroundColor(palette.accentGlow);
      const [wr, wg, wb] = palette.accentWarm;
      const [dr, dg, db] = palette.dotColor;
      const activity = clamp01(
        curParams.density * 0.48
        + curParams.glow * 0.25
        + curParams.turbulence * 0.16
        + curParams.impulse * 0.7
        + burst * 0.46
        + cue.bloom * 0.24,
      );
      const surge = clamp01(
        (curParams.density - 0.4) * 1.72
        + curParams.glow * 0.44
        + curParams.impulse * 1.15
        + burst * 0.48,
      );

      // Soft persistent trail — lower alpha = longer ghost
      const trailAlpha = 0.048 + curParams.shimmer * 0.028 + curAudio.energy * 0.025 - surge * 0.008;
      ctx.fillStyle = `rgba(${br},${bg},${bb},${trailAlpha})`;
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const scale = Math.min(w, h) * (0.32 + curParams.density * 0.19 + burst * 0.1);

      // High-energy recipes should occupy the canvas before any cue events arrive.
      if (activity > 0.12) {
        const haloRadius = scale * (0.68 + activity * 0.72);
        const halo = ctx.createRadialGradient(cx, cy, scale * 0.06, cx, cy, haloRadius);
        halo.addColorStop(0, `rgba(${ar},${ag},${ab},${0.018 + activity * 0.055})`);
        halo.addColorStop(0.48, `rgba(${wr},${wg},${wb},${surge * 0.024})`);
        halo.addColorStop(1, `rgba(${br},${bg},${bb},0)`);
        ctx.fillStyle = halo;
        ctx.fillRect(cx - haloRadius, cy - haloRadius, haloRadius * 2, haloRadius * 2);
      }

      // Audio warps the a:b frequency ratio slightly for organic breathing
      const [ra, rb, rdelta] = lerpRatio(ratioProgress);
      const freqA = ra * (1 + curAudio.bass * 0.06 + curParams.turbulence * 0.012);
      const freqB = rb * (1 + curAudio.mids * 0.06 - curParams.turbulence * 0.009);
      const delta = rdelta
        + curAudio.transient * 0.28
        + time * 0.008
        + Math.sin(time * 0.34) * curParams.turbulence * 0.12;

      const steps = Math.max(180, Math.floor(250 + curParams.density * 190 + surge * 80));
      const step = (Math.PI * 2) / steps;

      // Layers remain light in Drift, then multiply into broad ribbon strands in Surge.
      const layerCount = Math.min(4, 1 + Math.round(curParams.density * 2.5 + surge * 0.72));
      const lw = 0.85 + curParams.shimmer * 1.55 + curAudio.highs * 2.2 + burst * 1.5 + cue.bloom * 1.4;

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = 'lighter';

      for (let layer = 0; layer < layerCount; layer++) {
        const layerPhase = layer * (Math.PI * 2 / 3);
        const layerHue = (hueShiftAccum + curParams.hueShift + layer * 92) % 360;
        const layerScale = scale * (1 - layer * (0.018 + surge * 0.016));
        const phaseWarp = Math.sin(time * 0.27 + layer * 1.7) * curParams.turbulence * (0.025 + layer * 0.035);

        // Derive a color biased toward the palette colors cycling per layer
        const tWarm = (Math.sin(layerHue * Math.PI / 180) * 0.5 + 0.5);
        const tDot = (Math.cos(layerHue * Math.PI / 180) * 0.5 + 0.5);
        const cr = Math.round(clamp01(mix(mix(ar, wr, tWarm), dr, tDot * 0.3) / 255) * 255);
        const cg = Math.round(clamp01(mix(mix(ag, wg, tWarm), dg, tDot * 0.3) / 255) * 255);
        const cb = Math.round(clamp01(mix(mix(ab, wb, tWarm), db, tDot * 0.3) / 255) * 255);

        const alpha = clamp01(0.22 + curParams.glow * 0.32 + cue.bloom * 0.28 + burst * 0.24)
          * (layer === 0 ? 1.0 : 0.62 - layer * 0.12);

        ctx.beginPath();
        let firstPoint = true;
        for (let i = 0; i <= steps; i++) {
          const t = i * step + layerPhase + time * 0.04 + phaseWarp;
          const px = cx + Math.sin(freqA * t + delta) * layerScale;
          const py = cy + Math.sin(freqB * t) * layerScale * (0.88 + curAudio.bass * 0.14);

          if (firstPoint) {
            ctx.moveTo(px, py);
            firstPoint = false;
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha * (0.1 + surge * 0.1)})`;
        ctx.lineWidth = lw * (3.4 + surge * 3.8);
        ctx.stroke();
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha})`;
        ctx.lineWidth = lw * (layer === 0 ? 1.0 : 0.72 - layer * 0.08);
        ctx.stroke();
      }

      const reduced = typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!reduced) {
        const tracerCount = Math.min(tracers.length, Math.floor(18 + curParams.density * 54 + surge * 26));
        const tailLength = 0.008 + curParams.drift * 0.014 + surge * 0.026;
        for (let index = 0; index < tracerCount; index += 1) {
          const tracer = tracers[Math.floor(index * tracers.length / tracerCount)];
          const tracerT = tracer.t + time * 0.04;
          const x = cx + Math.sin(freqA * tracerT + delta) * scale;
          const y = cy + Math.sin(freqB * tracerT) * scale * (0.88 + curAudio.bass * 0.14);
          const tailT = tracerT - tailLength;
          const tailX = cx + Math.sin(freqA * tailT + delta) * scale;
          const tailY = cy + Math.sin(freqB * tailT) * scale * (0.88 + curAudio.bass * 0.14);
          const radius = tracer.radius * (1 + surge * 0.48 + burst * 1.3);
          const alpha = clamp01(tracer.alpha * (0.8 + activity * 0.72 + burst * 0.62 + curAudio.mids * 0.12));
          ctx.strokeStyle = `rgba(${ar},${ag},${ab},${alpha * (0.14 + surge * 0.24)})`;
          ctx.lineWidth = radius * (0.6 + surge * 0.4);
          ctx.beginPath();
          ctx.moveTo(tailX, tailY);
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.fillStyle = `rgba(${wr},${wg},${wb},${alpha})`;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, TAU);
          ctx.fill();
        }
      }

      // Highlight the current path position as a moving dot
      if (curParams.glow > 0.1 || burst > 0.05) {
        const headT = time * 0.04 * freqA;
        const headX = cx + Math.sin(freqA * headT + delta) * scale;
        const headY = cy + Math.sin(freqB * headT) * scale;
        const headR = 2 + surge * 2.5 + burst * 5 + cue.bloom * 4 + curAudio.transient * 3;
        ctx.fillStyle = `rgba(${ar},${ag},${ab},${clamp01(0.08 + activity * 0.2)})`;
        ctx.beginPath();
        ctx.arc(headX, headY, headR * (2.5 + surge), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(${wr},${wg},${wb},${clamp01(0.55 + burst * 0.45)})`;
        ctx.beginPath();
        ctx.arc(headX, headY, headR, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    },

    onEvent(event: VisualEvent) {
      const intensity = clamp01(event.intensity ?? 0.5);
      cue.handle(event, palette);
      if (event.type === 'section-cue') {
        sectionCueCount += 1;
        burst = Math.max(burst, 0.5 + intensity * 0.5);
        advanceRatio();
      }
      if (event.type === 'bloom-flash' || event.type === 'spark-burst') {
        burst = Math.max(burst, 0.36 + intensity * 0.54);
      }
      if (event.type === 'density-surge' || event.type === 'motion-drift') {
        burst = Math.max(burst, 0.18 + intensity * 0.34);
      }
      if (event.type === 'storm-release') {
        advanceRatio();
        burst = Math.max(burst, 0.28 + intensity * 0.44);
      }
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
    },

    destroy() {
      tracers = [];
    },
  };
}
