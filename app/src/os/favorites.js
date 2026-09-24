import { createStore, useStore, storage } from './store';

/* Favourite ("quick") tools. These are the same pins the Tools section has
   always saved under `rh-tool-pins` — one list of ids into the one tool
   registry, now shared so the palette, the dock and J.A.R.V.I.S. can read and
   change it too. */

const K = 'rh-tool-pins';

export const pinStore = createStore({ ids: storage.get(K, []) });

export function togglePin(id) {
  let on = false;
  pinStore.set((s) => {
    on = !s.ids.includes(id);
    const ids = on ? [...s.ids, id] : s.ids.filter((x) => x !== id);
    storage.set(K, ids);
    return { ids };
  });
  return on;
}

export const isPinned = (id) => pinStore.get().ids.includes(id);
export const usePins = () => useStore(pinStore).ids;
