'use client';

import { useEffect, useState } from 'react';

let loading = false;
let loaded = false;
let failed = false;
const listeners = new Set<(ok: boolean) => void>();

function notify(ok: boolean, options: { clear?: boolean } = {}) {
  listeners.forEach((fn) => fn(ok));
  if (options.clear) listeners.clear();
}

function ensureQ5() {
  if (loaded || failed) return;
  if (loading) return;

  // If Q5 is already on window (e.g. script survived HMR), skip loading.
  if ((window as any).Q5) {
    loaded = true;
    failed = false;
    notify(true, { clear: true });
    return;
  }

  // If a script tag for q5 already exists (previous HMR cycle), wait for it.
  const existing = document.querySelector('script[src="/q5.min.js"]');
  if (existing) {
    existing.addEventListener('load', () => {
      loaded = true;
      failed = false;
      notify(true, { clear: true });
    });
    existing.addEventListener('error', () => {
      failed = true;
      loading = false;
      notify(false, { clear: true });
    });
    loading = true;
    return;
  }

  loading = true;

  const script = document.createElement('script');
  script.src = '/q5.min.js';
  script.async = true;

  const timeout = setTimeout(() => {
    if (!loaded) {
      failed = true;
      notify(false);
    }
  }, 5000);

  script.onload = () => {
    clearTimeout(timeout);
    // q5's sound module creates a real AudioContext on every canvas pointerdown,
    // which renegotiates the browser's shared audio session and distorts the
    // HTML audio element (bass roll-off, high-pass artifacts). We don't use q5
    // audio at all, so stub its audio state to 'running' so _startAudio() sees
    // it as already live and never escalates to a real AudioContext.
    const Q5 = (window as any).Q5;
    if (Q5) {
      Q5._offlineAudio = false;
      Q5.aud = { state: 'running', resume: () => Promise.resolve(), close: () => Promise.resolve() };
    }
    loaded = true;
    failed = false;
    notify(true, { clear: true });
  };

  script.onerror = () => {
    clearTimeout(timeout);
    failed = true;
    loading = false;
    notify(false, { clear: true });
  };

  document.head.appendChild(script);
}

interface UseQ5Options {
  enabled?: boolean;
}

export default function useQ5(options: UseQ5Options = {}): { ready: boolean; failed: boolean } {
  const enabled = options.enabled ?? true;
  const [state, setState] = useState({ ready: loaded, failed });

  useEffect(() => {
    if (!enabled) return;
    if (loaded) { setState({ ready: true, failed: false }); return; }
    if (failed) { setState({ ready: false, failed: true }); return; }

    const cb = (ok: boolean) => setState({ ready: ok, failed: !ok });
    listeners.add(cb);
    ensureQ5();
    return () => { listeners.delete(cb); };
  }, [enabled]);

  return state;
}
