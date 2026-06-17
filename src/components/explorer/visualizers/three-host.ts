/* ── Three.js Render Host ────────────────────────────────────
   Module-level singleton owning ONE WebGLRenderer + one canvas
   shared by every Three visualizer. Browsers cap live WebGL
   contexts (~16) and the explorer creates/destroys a stage on
   every track and section change, so a context-per-stage design
   would exhaust contexts and crash. Each Three visualizer instead
   holds only a lightweight Scene + Camera and renders through this
   shared host, blitting the result into its 2D stage buffer.

   Rendering is pull-driven by the explorer draw loop only — this
   module never owns a requestAnimationFrame loop. Three is
   lazy-loaded via dynamic import on first use so the default
   Canvas2D experience and the initial /productions payload are
   unaffected and Three lands in its own bundle chunk.
   See THREE_INTEGRATION.md for the working contract.
──────────────────────────────────────────────────────────────── */

import type * as THREE_NS from 'three';

type ThreeModule = typeof THREE_NS;

let three: ThreeModule | null = null;
let renderer: THREE_NS.WebGLRenderer | null = null;
let canvas: HTMLCanvasElement | null = null;
let loadPromise: Promise<void> | null = null;
// Permanently false once we know WebGL can never work here (import failure or
// renderer construction throwing). The adapter then paints its fallback frame
// forever rather than retrying every frame.
let unavailable = false;
// Flipped false on webglcontextlost, true again after a successful restore.
let contextLive = true;
// Bumped on every (re)initialization. Live scenes compare against the value
// captured at build time; a mismatch means the GL context was lost and
// restored, so they must rebuild their GPU resources on the next draw.
let generation = 0;
let curWidth = 0;
let curHeight = 0;

function onContextLost(event: Event): void {
  event.preventDefault(); // ask the browser to attempt a restore
  contextLive = false;
}

function onContextRestored(): void {
  // Force renderer state + dimensions to re-sync, then re-mark live and bump
  // the generation so every live scene rebuilds on its next draw.
  if (renderer) {
    renderer.resetState();
  }
  curWidth = 0;
  curHeight = 0;
  contextLive = true;
  generation += 1;
}

function init(): void {
  if (!three || renderer || unavailable) return;
  try {
    canvas = document.createElement('canvas');
    canvas.addEventListener('webglcontextlost', onContextLost, false);
    canvas.addEventListener('webglcontextrestored', onContextRestored, false);
    renderer = new three.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2));
    renderer.setClearColor(0x000000, 0);
    generation += 1;
  } catch {
    // No WebGL — flag permanently unavailable so adapters fall back.
    unavailable = true;
    renderer = null;
    canvas = null;
  }
}

/** Kick off the lazy Three import (idempotent). Safe to call every frame. */
function ensure(): void {
  if (three || loadPromise || unavailable || typeof window === 'undefined') return;
  loadPromise = import('three')
    .then((mod) => {
      three = mod;
      init();
    })
    .catch(() => {
      unavailable = true;
    });
}

export const threeHost = {
  /** Begin loading Three if not already loaded. Pull-driven; no rAF. */
  ensure,

  /** True once the renderer exists and the GL context is live. */
  get ready(): boolean {
    return !unavailable && !!renderer && contextLive;
  },

  /** True when WebGL is known to be impossible here — adapters fall back forever. */
  get unavailable(): boolean {
    return unavailable;
  },

  /** The Three module once resolved (for scenes to build geometry/materials). */
  get three(): ThreeModule | null {
    return three;
  },

  /** The shared WebGL canvas to blit from after a render. */
  get domElement(): HTMLCanvasElement | null {
    return canvas;
  },

  /**
   * Current init generation. Scenes capture this at build() time; if
   * threeHost.generation later differs, the context was lost+restored and the
   * scene must rebuild its GPU resources.
   */
  get generation(): number {
    return generation;
  },

  /** Resize (only when dims change) then render the scene. Pull-driven. */
  render(scene: THREE_NS.Object3D, camera: THREE_NS.Camera, w: number, h: number): void {
    if (!renderer || !contextLive) return;
    if (w !== curWidth || h !== curHeight) {
      renderer.setSize(w, h, false);
      curWidth = w;
      curHeight = h;
    }
    renderer.clear();
    renderer.render(scene as THREE_NS.Scene, camera);
  },

  /**
   * Render into a scene-owned target, then restore the default framebuffer.
   * Used by feedback/displacement sketches that keep GPU state in FBOs.
   */
  renderToTarget(scene: THREE_NS.Object3D, camera: THREE_NS.Camera, target: THREE_NS.WebGLRenderTarget, w: number, h: number): void {
    if (!renderer || !contextLive) return;
    const previousTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.setViewport(0, 0, w, h);
    renderer.clear();
    renderer.render(scene as THREE_NS.Scene, camera);
    renderer.setRenderTarget(previousTarget);
    renderer.setViewport(0, 0, curWidth || w, curHeight || h);
  },
};

export type { ThreeModule };
