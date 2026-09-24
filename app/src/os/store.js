import { useSyncExternalStore } from 'react';

/* -----------------------------------------------------------------------------
 * Rahat OS shared state.
 *
 * A dozen lines instead of a state library: a store is a value plus a set of
 * listeners, and React reads it through useSyncExternalStore so every surface
 * (nav, palette, dock, sections) sees the same value without prop drilling.
 * -------------------------------------------------------------------------- */

export function createStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...next };
      subs.forEach((f) => f());
    },
    subscribe(f) {
      subs.add(f);
      return () => subs.delete(f);
    },
  };
}

/** Subscribe to a whole store. Keep selectors out: a fresh object per read
    would make useSyncExternalStore re-render forever. */
export function useStore(store) {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export const storage = {
  get(k, d, s = globalThis.localStorage) {
    try {
      const v = s.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch {
      return d;
    }
  },
  set(k, v, s = globalThis.localStorage) {
    try {
      if (v == null) s.removeItem(k);
      else s.setItem(k, JSON.stringify(v));
    } catch {
      /* storage blocked (private mode) — the value lives for this page view */
    }
  },
};
