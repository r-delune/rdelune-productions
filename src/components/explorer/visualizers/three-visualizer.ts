/* ── Three Visualizer Adapter ────────────────────────────────
   createThreeVisualizer(makeScene) wraps a Three scene in the full
   Visualizer lifecycle and owns the buffer blit, so individual GPU
   sketches only write scene code — mirroring how the cong particle
   factory centralizes shared logic and keeps recipes declarative.

   Reconciles Three's async load against the synchronous setup():
   setup records dims/palette/tuning/context and marks the scene
   unbuilt; draw lazily calls the idempotent scene.build() the first
   time threeHost.ready, guarded by a disposed flag against the race
   where the module resolves AFTER destroy() ran. Until built (or if
   WebGL is unavailable / the context is lost) draw paints a stable
   palette-derived fallback frame — never blank. On context loss it
   does NOT throw (recoverStage is reserved for real exceptions); it
   shows the fallback and rebuilds once the context is restored.
   See THREE_INTEGRATION.md.
──────────────────────────────────────────────────────────────── */

import type { AudioSignal } from '../audio-signal';
import type { Palette } from '../palette';
import type { VisualizerTuningConfig } from '../tuning';
import type {
  ExclusionRect,
  VisualEvent,
  VisualizerRuntimeContext,
  VisualParams,
  Visualizer,
} from '../visualizer';
import { hasReducedMotion } from './cong-particle-primitives';
import { threeHost, type ThreeModule } from './three-host';

/** Arguments handed to a scene's build() once Three is ready. */
export interface ThreeSceneBuildArgs {
  three: ThreeModule;
  w: number;
  h: number;
  palette: Palette;
  tuning?: VisualizerTuningConfig;
  context?: VisualizerRuntimeContext;
}

/**
 * A GPU sketch. The adapter drives the lifecycle; the scene only builds GPU
 * resources, pushes uniforms in update(), and frees everything in dispose().
 */
export interface ThreeScene {
  /** Create geometry/materials/uniforms. Driven (and de-duplicated) by the adapter. */
  build(args: ThreeSceneBuildArgs): void;
  /** Push uniforms from frame signals. No rendering. */
  update(dt: number, params: VisualParams, audio: AudioSignal, exclusion: ExclusionRect): void;
  /** Eased uniform targets for color-morph / density-surge / etc. */
  onEvent(event: VisualEvent): void;
  /** React to a stage resize. */
  resize(w: number, h: number): void;
  /** Optional scene-owned offscreen passes before the final host render. */
  preRender?(): void;
  /** Free EVERY geometry, material, texture, and render target. */
  dispose(): void;
  readonly scene: import('three').Object3D | null;
  readonly camera: import('three').Camera | null;
  /**
   * Optional internal render-resolution multiplier (0..1). Heavy per-pixel
   * sketches (raymarch) render the GL at w*scale × h*scale; the 2D blit then
   * upscales to the full buffer. The scene keeps uResolution at full size so
   * aspect and exclusion math stay correct. Default 1 (full resolution).
   */
  readonly renderScale?: number;
}

export function createThreeVisualizer(makeScene: () => ThreeScene): Visualizer {
  const scene = makeScene();

  let w = 0;
  let h = 0;
  let palette: Palette;
  let tuning: VisualizerTuningConfig | undefined;
  let context: VisualizerRuntimeContext | undefined;

  let built = false;
  let buildGeneration = -1;
  let disposed = false;

  // Events that arrive before the scene is built (Three loads async). Drained
  // in tryBuild() so section-cue and other pre-build events are not lost.
  let pendingEvents: VisualEvent[] = [];

  // Last frame's signals, replayed once immediately after a (re)build so the
  // first rendered frame has live uniforms instead of construction defaults.
  let lastDt = 0;
  let lastParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let lastAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let lastExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };

  function paintFallback(ctx: CanvasRenderingContext2D): void {
    if (!palette) return;
    const [dr, dg, db] = palette.bgDark;
    const [mr, mg, mb] = palette.bgMid;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, `rgb(${dr},${dg},${db})`);
    grad.addColorStop(1, `rgb(${mr},${mg},${mb})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // A faint off-center accent wash so the frame reads as an intentional
    // tableau (never a flat blank) while Three loads or if WebGL is absent.
    const [ar, ag, ab] = palette.accentGlow;
    const radius = Math.max(w, h) * 0.7;
    const halo = ctx.createRadialGradient(w * 0.42, h * 0.46, 0, w * 0.42, h * 0.46, radius);
    halo.addColorStop(0, `rgba(${ar},${ag},${ab},0.10)`);
    halo.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);
  }

  function tryBuild(): void {
    if (disposed || built || !threeHost.ready) return;
    const three = threeHost.three;
    if (!three) return;
    scene.build({ three, w, h, palette, tuning, context });
    built = true;
    buildGeneration = threeHost.generation;
    // Seed uniforms from the most recent frame so frame one isn't stale.
    scene.update(lastDt, lastParams, lastAudio, lastExclusion);
    // Drain events queued before the scene was ready (e.g. section-cue fired
    // right after stage creation, before the first draw()).
    for (const event of pendingEvents) scene.onEvent(event);
    pendingEvents = [];
  }

  return {
    setup(_q, _w, _h, _palette, _tuning, _context) {
      w = _w;
      h = _h;
      palette = _palette;
      tuning = _tuning;
      context = _context;
      built = false;
      buildGeneration = -1;
      disposed = false;
      pendingEvents = [];
      threeHost.ensure(); // begin the lazy Three load (no-op if already loading)
    },

    update(dt, params, audio, exclusion) {
      lastDt = dt;
      lastParams = params;
      lastAudio = audio;
      lastExclusion = exclusion;
      if (disposed || !built) return;
      // Reduced motion: freeze scene time but still push the current static
      // signals so the held frame stays coherent.
      const frameDt = hasReducedMotion() ? 0 : dt;
      scene.update(frameDt, params, audio, exclusion);
    },

    draw(_q, ctx) {
      if (disposed) {
        paintFallback(ctx);
        return;
      }

      threeHost.ensure();

      // Context was lost and restored under us: drop the stale GPU resources
      // and rebuild on the idempotent path below.
      if (built && threeHost.generation !== buildGeneration) {
        scene.dispose();
        built = false;
      }

      tryBuild();

      if (!built || !threeHost.ready) {
        paintFallback(ctx);
        return;
      }

      const sceneObj = scene.scene;
      const camera = scene.camera;
      const domElement = threeHost.domElement;
      if (!sceneObj || !camera || !domElement) {
        paintFallback(ctx);
        return;
      }

      // Render the GL at the scene's internal resolution (heavy raymarch
      // sketches render small); the 4-arg blit scales the entire host canvas
      // up to the full buffer size, so it stays correct at any pixelRatio.
      const rs = scene.renderScale ?? 1;
      const rw = rs < 1 ? Math.max(1, Math.round(w * rs)) : w;
      const rh = rs < 1 ? Math.max(1, Math.round(h * rs)) : h;
      scene.preRender?.();
      threeHost.render(sceneObj, camera, rw, rh);
      ctx.drawImage(domElement, 0, 0, w, h);
    },

    onEvent(event: VisualEvent) {
      if (disposed) return;
      if (!built) { pendingEvents.push(event); return; }
      scene.onEvent(event);
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      if (built) scene.resize(w, h);
    },

    destroy() {
      disposed = true;
      pendingEvents = [];
      scene.dispose();
      built = false;
    },
  };
}
