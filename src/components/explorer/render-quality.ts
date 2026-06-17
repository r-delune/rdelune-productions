/* ── Render Quality Governor ─────────────────────────────────
   Adaptive quality scaling for the explorer canvas. The draw
   loop reports frame times; consumers read a 0.55–1.0 scale.
   Asymmetric hysteresis: quality drops fast when frames go
   long, recovers slowly (~10s) so it never oscillates.

   Two consumption tiers:
   - Zero-touch: ExplorerCanvas multiplies density targets by the
     scale, which most kernels translate into fewer/lighter
     particles.
   - Opt-in: heavy kernels import getQualityScale() directly to
     hard-cap step counts / iterations / particle budgets.
──────────────────────────────────────────────────────────────── */

const TARGET_FRAME_MS = 1000 / 45; // matches the canvas's playing-state cap
const MIN_SCALE = 0.55;
const DROP_RATE = 1.6;     // per second toward lower quality
const RECOVER_RATE = 0.045; // per second toward full quality (~10s full recovery)

let frameEma = TARGET_FRAME_MS;
let qualityScale = 1;
let lastReportAt = 0;

export interface RenderQualityTelemetry {
  frameEma: number;
  fpsEstimate: number;
  qualityScale: number;
  targetFrameMs: number;
}

export function reportFrame(frameMs: number): void {
  // Ignore absurd outliers (tab switches, debugger pauses).
  const clamped = Math.min(frameMs, 250);
  frameEma += (clamped - frameEma) * 0.08;

  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const dt = lastReportAt > 0 ? Math.min(0.1, (now - lastReportAt) / 1000) : 1 / 60;
  lastReportAt = now;

  const overBudget = frameEma > TARGET_FRAME_MS * 1.35;
  const underBudget = frameEma < TARGET_FRAME_MS * 1.08;
  if (overBudget) {
    qualityScale = Math.max(MIN_SCALE, qualityScale - DROP_RATE * dt * ((frameEma / TARGET_FRAME_MS) - 1.35));
  } else if (underBudget) {
    qualityScale = Math.min(1, qualityScale + RECOVER_RATE * dt);
  }
}

export function getQualityScale(): number {
  return qualityScale;
}

export function getRenderQualityTelemetry(): RenderQualityTelemetry {
  return {
    frameEma,
    fpsEstimate: frameEma > 0 ? 1000 / frameEma : 0,
    qualityScale,
    targetFrameMs: TARGET_FRAME_MS,
  };
}

export function resetQualityScale(): void {
  frameEma = TARGET_FRAME_MS;
  qualityScale = 1;
  lastReportAt = 0;
}
