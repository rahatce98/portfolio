import { useEffect, useState, useCallback, useSyncExternalStore } from 'react';

/* -----------------------------------------------------------------------------
 * Environment probes. Everything expensive is measured once, at module scope,
 * so a component can branch on capability without paying for the check.
 * -------------------------------------------------------------------------- */

/** Probe for a usable WebGL context once, then cache the answer. */
let webglSupport = null;
export function hasWebGL() {
  if (webglSupport !== null) return webglSupport;
  try {
    const c = document.createElement('canvas');
    webglSupport = !!(
      window.WebGLRenderingContext &&
      (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'))
    );
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

/**
 * Coarse device tier. Drives particle counts, shadow maps, DPR ceiling and
 * whether the secondary scenes mount at all.
 *   2 = desktop / discrete GPU     1 = mid     0 = low-power
 */
let tierCache = null;
export function perfTier() {
  if (tierCache !== null) return tierCache;
  if (typeof window === 'undefined') return 1;

  // Deliberately NOT folded in here: a motion preference says nothing about
  // what the GPU can do. Reduced motion suppresses autonomous animation (see
  // prefersReducedMotion below); it must not strip a capable device of the 3D
  // content itself.
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const narrow = window.innerWidth < 768;

  if (narrow || coarse) tierCache = cores >= 8 && mem >= 4 ? 1 : 0;
  else if (cores >= 8 && mem >= 8) tierCache = 2;
  else if (cores >= 4) tierCache = 1;
  else tierCache = 0;

  return tierCache;
}

/** Device-pixel-ratio ceiling per tier — the single biggest fill-rate lever. */
export function dprRange(tier = perfTier()) {
  if (tier >= 2) return [1, 2];
  if (tier === 1) return [1, 1.5];
  return [1, 1];
}

export function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/* --- media query as a hook ------------------------------------------------ */

function subscribeMedia(query) {
  return (cb) => {
    const mq = window.matchMedia(query);
    mq.addEventListener('change', cb);
    return () => mq.removeEventListener('change', cb);
  };
}

export function useMedia(query, serverValue = false) {
  return useSyncExternalStore(
    useCallback(subscribeMedia(query), [query]),
    () => window.matchMedia(query).matches,
    () => serverValue
  );
}

/* --- theme ---------------------------------------------------------------- */

const THEME_KEY = 'rh-theme';

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      /* storage can throw in private mode — fall through to the default */
    }
    return 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* non-fatal: the theme still applies for this page view */
    }
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  return [theme, toggle];
}
