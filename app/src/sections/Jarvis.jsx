import { useEffect } from 'react';
import { useReveal } from '../hooks/useScroll';
import { useJarvis } from '../jarvis/engine';
import JarvisHUD from '../components/JarvisHUD';

/* -----------------------------------------------------------------------------
 * 07 — J.A.R.V.I.S. command center
 *
 * The full HUD of the global assistant, embedded in the page. The engine lives
 * in jarvis/engine.jsx and is shared with the floating dock (Ctrl/⌘ J) and the
 * full-screen Jarvis mode, so this section is one window onto it.
 * -------------------------------------------------------------------------- */

export default function Jarvis() {
  const root = useReveal();
  const j = useJarvis();

  // Setup runs the first time the console scrolls into view (or J.A.R.V.I.S.
  // is opened anywhere), so visitors who never use it pay nothing.
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e.isIntersecting && j.boot(), { rootMargin: '200px' });
    if (root.current) io.observe(root.current);
    return () => io.disconnect();
  }, [j.boot, root]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="section jarvis" id="jarvis" ref={root}>
      <div className="wrap">
        <div className="section-head" data-reveal>
          <div>
            <span className="section-head__index">07 — J.A.R.V.I.S.</span>
            <h2>
              J.A.R.V.I.S.<span className="dim"> — think, plan, execute. By voice.</span>
            </h2>
          </div>
          <p>
            The command center behind Rahat OS: many AI brains with instant fallback, agents that search, open, remember and
            calculate, hands-free voice in English and বাংলা. On every page — <kbd>Ctrl</kbd> <kbd>J</kbd>, or full screen.
          </p>
        </div>
        <div data-reveal>
          <JarvisHUD />
        </div>
      </div>
    </section>
  );
}
