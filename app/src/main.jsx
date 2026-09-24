import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';
import './styles/v3.css';
import './styles/v4.css';
import './styles/vault.css';
import './styles/engine.css';
import './styles/bento.css';
import './styles/jarvis.css';
import './styles/os.css';
import './styles/hud.css';
import { registerPWA } from './os/pwa';

registerPWA();

// A tab opened before a deploy may ask for a lazy chunk that no longer exists.
// Reload once to pick up the new build instead of leaving a broken section.
window.addEventListener('vite:preloadError', (e) => {
  try {
    if (sessionStorage.getItem('rh-reloaded') === '1') return;
    sessionStorage.setItem('rh-reloaded', '1');
  } catch {
    return;
  }
  e.preventDefault();
  location.reload();
});
setTimeout(() => {
  try {
    sessionStorage.removeItem('rh-reloaded');
  } catch {
    /* storage blocked */
  }
}, 15000);

// Let the page own its scroll position rather than the browser restoring one
// before the tall scroll tracks have laid out.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
