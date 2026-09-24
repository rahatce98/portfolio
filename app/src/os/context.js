import { createStore, useStore } from './store';
import { historyStore } from './history';

/* -----------------------------------------------------------------------------
 * The application context J.A.R.V.I.S. reasons about.
 *
 * Surfaces write what they know (Nav: active section · Lab: open lab · PipeLab:
 * its live inputs); J.A.R.V.I.S. and the palette read it. It holds navigation
 * state only — no memories, notes, PINs or tool URLs — so it is safe to hand to
 * any model, local or cloud.
 * -------------------------------------------------------------------------- */

const online = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

export const osStore = createStore({
  section: 'home',
  lab: null, // id of the lab open in theater mode
  labState: null, // live inputs a lab chooses to publish, e.g. { D, S, y, n }
  online: online(),
});

if (typeof window !== 'undefined') {
  const sync = () => osStore.set({ online: online() });
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
}

export const setOs = (patch) => osStore.set(patch);
export const useOs = () => useStore(osStore);

/** The lightweight context object handed to the router and the model. */
export function getContext(availableActions = []) {
  const s = osStore.get();
  return {
    page: 'Rahat OS',
    section: s.section,
    selectedTool: s.lab ? { type: 'lab', id: s.lab, ...(s.labState ? { inputs: s.labState } : {}) } : null,
    route: typeof location === 'undefined' ? '/' : location.hash || '/',
    recentCommands: historyStore.get().items.slice(0, 5).map((h) => h.text),
    availableActions,
    online: s.online,
  };
}
