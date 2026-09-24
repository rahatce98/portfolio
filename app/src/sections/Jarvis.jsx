import { useEffect, useRef } from 'react';
import JarvisCore from '../jarvis/JarvisCore';
import { useReveal } from '../hooks/useScroll';
import { useJarvis, STAGES, STATE_LABEL } from '../jarvis/engine';
import { PROVIDERS } from '../jarvis/brain';
import JarvisConsole, { ProviderPanel } from '../components/JarvisConsole';

/* -----------------------------------------------------------------------------
 * 07 — J.A.R.V.I.S. command center
 *
 * The full-size view of the global assistant: the visual core, the task
 * pipeline, the model switcher and the console. The engine itself lives in
 * jarvis/engine.jsx and is shared with the floating dock (Ctrl/⌘ J), so this
 * section is just one window onto it.
 * -------------------------------------------------------------------------- */

export default function Jarvis() {
  const root = useReveal();
  const j = useJarvis();
  const input = useRef(null);

  // Setup runs the first time the console scrolls into view (or J.A.R.V.I.S.
  // is opened anywhere), so visitors who never use it pay nothing.
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e.isIntersecting && j.boot(), { rootMargin: '200px' });
    if (root.current) io.observe(root.current);
    return () => io.disconnect();
  }, [j.boot, root]); // eslint-disable-line react-hooks/exhaustive-deps

  // When this section is already on screen, Ctrl/⌘ J focuses it instead of
  // opening a second window onto the same conversation.
  useEffect(() => {
    const focus = () => input.current?.focus({ preventScroll: true });
    window.addEventListener('rh-jarvis-focus', focus);
    return () => window.removeEventListener('rh-jarvis-focus', focus);
  }, []);

  return (
    <section className="section jarvis" id="jarvis" ref={root}>
      <div className="wrap">
        <div className="section-head" data-reveal>
          <div>
            <span className="section-head__index">07 — J.A.R.V.I.S.</span>
            <h2>
              J.A.R.V.I.S.<span className="dim"> — ask, search, calculate, open. By voice.</span>
            </h2>
          </div>
          <p>
            The assistant behind Rahat OS: many AI brains with instant fallback (say “switch brain”), hands-free
            voice in English and বাংলা, and commands that work without any AI. On every page — <kbd>Ctrl</kbd> <kbd>J</kbd> or the orb.
          </p>
        </div>

        <div className="jv2" data-reveal data-state={j.state}>
          <div className="jv2__stage">
            <JarvisCore state={j.state} level={j.level} />
            <div className="jv2__status">
              <span className="jv2__dot" />
              <b>{j.online ? STATE_LABEL[j.state] : 'Offline mode'}</b>
              {j.hands && <span className="jv2__hands mono">hands-free · {j.lang === 'bn-BD' ? 'বাংলা' : 'EN'}</span>}
              <span className="mono">
                Brain: {j.provider ? `${PROVIDERS.find((p) => p.id === j.provider)?.label} · ${j.kind}` : 'built-in commands'}
              </span>
            </div>
            <ol className="jv2__pipe" aria-label="Task progress">
              {STAGES.map((s, i) => (
                <li key={s} data-on={j.stage === i} data-done={j.stage > i}>
                  <i />
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            <ProviderPanel variant="chips" />
          </div>
          <JarvisConsole ref={input} />
        </div>
      </div>
    </section>
  );
}
