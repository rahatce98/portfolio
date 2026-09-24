import { createStore, useStore, storage } from './store';

/* Command history — every command typed, spoken or picked, on this device only.
   Shown as RECENT in the palette and recalled with ↑ in the console. */

const K = 'rh-os-history';
const MAX = 60;

export const historyStore = createStore({ items: storage.get(K, []) });

export function addHistory(text, via = 'typed') {
  const t = String(text || '').trim();
  if (!t || t.length > 300) return;
  historyStore.set((s) => {
    const items = [{ text: t, at: Date.now(), via }, ...s.items.filter((h) => h.text.toLowerCase() !== t.toLowerCase())].slice(0, MAX);
    storage.set(K, items);
    return { items };
  });
}

export function clearHistory() {
  storage.set(K, []);
  historyStore.set({ items: [] });
}

export const useHistory = () => useStore(historyStore).items;

export const clock = (at) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
