import { createStore, useStore } from './store';
import { toast } from '../components/Toast';

/* -----------------------------------------------------------------------------
 * Installable app plumbing. The worker itself is generated at build time
 * (vite.config.js → sw.js); this file registers it, keeps the browser's install
 * prompt so "install app" can show it on demand, and reports updates.
 * Registration is production-only so the dev server's HMR is never cached.
 * -------------------------------------------------------------------------- */

const standalone = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);

export const pwaStore = createStore({ installable: false, installed: standalone(), sw: 'none' });
export const usePwa = () => useStore(pwaStore);

let deferred = null;

export function registerPWA() {
  if (typeof window === 'undefined') return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep it for a deliberate "Install" instead of a banner
    deferred = e;
    pwaStore.set({ installable: true });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    pwaStore.set({ installable: false, installed: true });
    toast('Rahat OS installed');
  });

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const base = import.meta.env.BASE_URL;
  const hadController = !!navigator.serviceWorker.controller;
  const go = () =>
    navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .then(() => pwaStore.set({ sw: 'active' }))
      .catch(() => pwaStore.set({ sw: 'failed' }));
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go, { once: true });

  // A new build took over. Don't yank the page out from under the reader.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) toast('Rahat OS updated — reload for the latest version');
  });
}

/** Show the browser's install dialog if it offered one. */
export async function installApp() {
  if (pwaStore.get().installed) return { ok: false, reason: 'installed' };
  if (!deferred) return { ok: false, reason: 'unavailable' };
  deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  pwaStore.set({ installable: false });
  return { ok: outcome === 'accepted', reason: outcome };
}
