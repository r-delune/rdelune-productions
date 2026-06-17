import type { AudioSignal } from '../audio-signal';
import { computeExclusion } from '../exclusion';
import type { Palette } from '../palette';
import { resolveCongWanderingLinesTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { createCueEventState } from './cue-event-state';

interface WanderingLine {
  points: { x: number; y: number }[];
  alpha: number;
  speed: number;
  seed: number;
  width: number;
  hue: number;
  lane: number;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function createCongWanderingLines(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let lines: WanderingLine[] = [];
  let cue = createCueEventState();
  let eventLift = 0;
  let sectionCueCount = 0;
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };

  let config = {
    lineCount: 12,
    pointsPerLine: 24,
    baseAlpha: 0.048,
  };

  function buildLines() {
    lines = [];
    for (let i = 0; i < config.lineCount; i++) {
      const points: { x: number; y: number }[] = [];
      const startX = w * (0.05 + Math.random() * 0.15);
      const startY = h * (0.1 + Math.random() * 0.8);
      
      for (let j = 0; j < config.pointsPerLine; j++) {
        const progress = j / config.pointsPerLine;
        points.push({
          x: startX + w * progress * 0.7 + (Math.random() - 0.5) * 40,
          y: startY + (Math.random() - 0.5) * 60,
        });
      }
      
      lines.push({
        points,
        alpha: config.baseAlpha * (0.5 + Math.random() * 0.8),
        speed: 0.08 + Math.random() * 0.16,
        seed: Math.random() * 1000,
        width: 0.8 + Math.random() * 2,
        hue: Math.random(),
        lane: i / Math.max(1, config.lineCount - 1),
      });
    }
  }

  return {
    setup(_q, _w, _h, _palette, _tuning) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      const tuning = resolveCongWanderingLinesTuning(_tuning);
      config = {
        lineCount: Math.max(10, tuning.lineCount),
        pointsPerLine: Math.max(12, tuning.pointsPerLine),
        baseAlpha: Math.max(0.042, tuning.baseAlpha),
      };
      time = 0;
      cue = createCueEventState();
      eventLift = 0;
      sectionCueCount = 0;
      buildLines();
    },

    update(dt, params, audio, exclusion) {
      curParams = params;
      curAudio = audio;
      curExclusion = exclusion;
      cue.update(dt);
      eventLift = Math.max(0, eventLift - dt * 0.58);

      const reduced = typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) return;

      const activity = audio.activity ?? audio.energy;
      time += dt * (0.2 + params.drift * 0.75 + activity * 0.28 + audio.energy * 0.22 + audio.bass * 0.12 + cue.motion * 0.26 + eventLift * 0.18);
    },

    draw(_q, ctx) {
      const [br, bg, bb] = palette.bgDark;
      ctx.fillStyle = `rgba(${br},${bg},${bb},0.08)`;
      ctx.fillRect(0, 0, w, h);

      const [ar, ag, ab] = palette.accentGlow;
      const [dr, dg, db] = palette.dotColor;
      const activity = curAudio.activity ?? curAudio.energy;

      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Animate points with noise
        const animatedPoints = line.points.map((pt, j) => {
          const progress = j / line.points.length;
          const noiseX = q.noise(line.seed + j * 0.1, time * line.speed, 0) - 0.5;
          const noiseY = q.noise(line.seed + j * 0.1 + 1, time * line.speed, 0) - 0.5;
          const lanePulse = Math.sin(time * (0.38 + line.speed) + line.lane * Math.PI * 2) * (8 + activity * 24 + eventLift * 28);
          const amplitude = 28 + curParams.turbulence * 54 + activity * 26 + cue.motion * 20;
          
          return {
            x: pt.x + noiseX * amplitude + Math.sin(progress * Math.PI + time * 0.18 + line.seed) * lanePulse,
            y: pt.y + noiseY * amplitude * (0.5 + progress * 0.5) + Math.cos(progress * Math.PI * 2 + time * 0.24 + line.seed) * lanePulse * 0.34,
          };
        });

        const visiblePoints = animatedPoints.filter((pt) => computeExclusion(pt.x, pt.y, curExclusion).alpha > 0.18);
        if (visiblePoints.length < 2) continue;

        const tint = Math.min(1, line.hue * 0.4 + curParams.glow * 0.45 + curAudio.mids * 0.28 + activity * 0.16 + cue.focus * 0.2);
        const [r, g, b] = cue.mixForegroundColor([
          Math.round(mix(dr, ar, tint)),
          Math.round(mix(dg, ag, tint)),
          Math.round(mix(db, ab, tint)),
        ], line.seed);
        const densityStep = cue.densityProgress(line.seed);
        const alpha = line.alpha * (0.72 + curParams.density * 1.15 + curParams.shimmer * 0.28 + activity * 0.48 + eventLift * 0.42 + cue.bloom * 0.4) * Math.max(0, Math.min(1, 1 + densityStep * 0.58));

        // Draw ribbon trail
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.lineWidth = line.width * (1 + curAudio.bass * 0.28 + eventLift * 0.24 + cue.sizeProgress(line.seed) * 0.42);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.beginPath();
        ctx.moveTo(visiblePoints[0].x, visiblePoints[0].y);
        
        for (let j = 1; j < visiblePoints.length - 1; j++) {
          const xc = (visiblePoints[j].x + visiblePoints[j + 1].x) / 2;
          const yc = (visiblePoints[j].y + visiblePoints[j + 1].y) / 2;
          ctx.quadraticCurveTo(visiblePoints[j].x, visiblePoints[j].y, xc, yc);
        }
        
        ctx.lineTo(visiblePoints[visiblePoints.length - 1].x, visiblePoints[visiblePoints.length - 1].y);
        ctx.stroke();

        if (curAudio.bass > 0.15) {
          const anchor = animatedPoints[Math.floor(animatedPoints.length / 2)];
          ctx.fillStyle = `rgba(${ar},${ag},${ab},${alpha * 0.8})`;
          ctx.beginPath();
          ctx.arc(anchor.x, anchor.y, 2 + curAudio.bass * 6, 0, Math.PI * 2);
          ctx.fill();
        }

        // Bouncing accent on transient
        const accentPulse = Math.max(curAudio.transient, cue.bloom * 0.72, eventLift * 0.55);
        if (accentPulse > 0.08) {
          const accentIdx = Math.floor((Math.sin(time * 1.4 + line.seed) * 0.5 + 0.5) * (visiblePoints.length - 1));
          const accentPt = visiblePoints[accentIdx];
          ctx.fillStyle = `rgba(${ar},${ag},${ab},${alpha * (1.1 + accentPulse * 2.2)})`;
          ctx.beginPath();
          ctx.arc(accentPt.x, accentPt.y, line.width * (1.4 + accentPulse * 3.4), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      eventLift = Math.min(1, eventLift + 0.16 + event.intensity * 0.44);
      if (event.type === 'section-cue') {
        sectionCueCount += 1;
        eventLift = Math.min(1, eventLift + Math.min(sectionCueCount, 6) * 0.025);
      }
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      buildLines();
    },

    destroy() {
      // No persistent resources to clean
    },
  };
}
