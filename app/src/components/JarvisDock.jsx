import { useCallback, useEffect, useRef, useState } from 'react';
import JarvisCore from '../jarvis/JarvisCore';
import JarvisConsole, { JarvisStatus, ProviderPanel } from './JarvisConsole';
import { useJarvis } from '../jarvis/engine';
import { usePins } from '../os/favorites';
import { useHistory, clock } from '../os/history';
import { useMedia } from '../hooks/useEnv';
import { useScrollTo } from '../hooks/useScroll';

/* -----------------------------------------------------------------------------
 * Global J.A.R.V.I.S. — reachable from every page and every scroll position.
 *
 *   desktop  floating orb bottom-right → a compact panel above it
 *   mobile   floating orb → a bottom sheet with a backdrop
 *   keys     Ctrl/⌘ J toggles · Esc closes
 *
 * If the full Jarvis section is already on screen, opening focuses that
 * console instead of stacking a second window over it.
 * -------------------------------------------------------------------------- */

const sectionVisible = () => {
  const el = document.getElementById('jarvis');
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.top < window.innerHeight * 0.5 && r.bottom > window.innerHeight * 0.5;
};

const I = ({ d }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

export default function JarvisDock() {
  const j = useJarvis();
  const pins = usePins();
  const history = useHistory();
  const sheet = useMedia('(max-width: 720px)');
  const scrollTo = useScrollTo();
  const [open, setOpen] = useState(false);
  const [adv, setAdv] = useState(false);
  const [full, setFull] = useState(false);
  const input = useRef(null);
  const orb = useRef(null);

  const show = useCallback(
    (focus = true) => {
      if (sectionVisible()) {
        window.dispatchEvent(new Event('rh-jarvis-focus'));
        return;
      }
      j.boot();
      setOpen(true);
      if (focus) setTimeout(() => input.current?.focus({ preventScroll: true }), 60);
    },
    [j],
  );
  const hide = useCallback(() => {
    setOpen(false);
    setAdv(false);
    setFull(false);
    orb.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'j') {
        e.preventDefault(); // Ctrl J is the browser's downloads shortcut
        if (open) hide();
        else show();
      } else if (e.key === 'Escape' && open) hide();
    };
    const onOpen = () => show();
    const onReveal = () => !open && show(false);
    // "Jarvis mode": the dock fills the screen over whatever page is showing.
    const onFull = (e) => {
      if (e.detail === false) return setFull(false);
      j.boot();
      setOpen(true);
      setFull(true);
      setTimeout(() => input.current?.focus({ preventScroll: true }), 60);
    };
    window.addEventListener('rh-jv-float', onFull);
    window.addEventListener('keydown', onKey);
    window.addEventListener('rh-jarvis', onOpen);
    window.addEventListener('rh-jarvis-reveal', onReveal);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('rh-jarvis', onOpen);
      window.removeEventListener('rh-jarvis-reveal', onReveal);
      window.removeEventListener('rh-jv-float', onFull);
    };
  }, [open, show, hide, j]);

  // PWA shortcut / deep link: /portfolio/?jarvis=1
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (p.get('jarvis') === '1') setTimeout(() => show(), 600);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The sheet owns the screen on phones: lock the page behind it.
  useEffect(() => {
    if (!(open && (sheet || full))) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, sheet, full]);

  const quick = pins.map((id) => j.tools.find((t) => t.id === id)).filter(Boolean).slice(0, 8);
  const recent = history.slice(0, 3);

  return (
    <>
      <button
        ref={orb}
        type="button"
        className="orb"
        data-state={j.state}
        data-open={open}
        onClick={() => (open ? hide() : show())}
        aria-label={open ? 'Close J.A.R.V.I.S.' : 'Open J.A.R.V.I.S. (Ctrl J)'}
        aria-expanded={open}
        aria-controls="jdock"
        title="J.A.R.V.I.S. — Ctrl J"
      >
        <span className="orb__core" />
        <span className="orb__ring" />
        <span className="orb__ring orb__ring--2" />
        {!j.online && <span className="orb__off" aria-hidden="true" />}
      </button>

      {open && (sheet || full) && <div className="jdock__scrim" data-full={full || undefined} onPointerDown={hide} aria-hidden="true" />}

      <div
        id="jdock"
        className="jdock"
        data-open={open}
        data-sheet={sheet}
        data-full={full || undefined}
        data-state={j.state}
        role="dialog"
        aria-modal={sheet ? 'true' : undefined}
        aria-label="J.A.R.V.I.S. assistant"
        hidden={!open}
      >
        {sheet && <span className="jdock__grip" aria-hidden="true" />}
        <header className="jdock__head">
          <div className="jdock__core">{open && <JarvisCore state={j.state} level={j.level} compact />}</div>
          <div className="jdock__title">
            <b>J.A.R.V.I.S.</b>
            <JarvisStatus />
          </div>
          <div className="jdock__acts">
            {j.canSpeak && (
              <button type="button" className="jdock__btn" aria-pressed={j.speak} onClick={() => j.toggleVoice(!j.speak)} title={j.speak ? 'Spoken replies on' : 'Spoken replies off'} aria-label={j.speak ? 'Turn spoken replies off' : 'Turn spoken replies on'}>
                <I d={j.speak ? <><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></> : <><path d="M11 5 6 9H3v6h3l5 4z" /><path d="m22 9-6 6M16 9l6 6" /></>} />
              </button>
            )}
            <button type="button" className="jdock__btn" aria-pressed={adv} onClick={() => setAdv((v) => !v)} title="Advanced AI settings" aria-label="Advanced AI settings">
              <I d={<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>} />
            </button>
            <button type="button" className="jdock__btn" aria-pressed={full} onClick={() => setFull((v) => !v)} title={full ? 'Exit Jarvis mode' : 'Jarvis mode (full screen)'} aria-label={full ? 'Exit Jarvis mode' : 'Jarvis mode (full screen)'}>
              <I d={full ? <path d="M9 3v6H3M15 21v-6h6M9 9 3 3M15 15l6 6" /> : <path d="M3 9V3h6M21 15v6h-6M3 3l7 7M21 21l-7-7" />} />
            </button>
            <button type="button" className="jdock__btn" onClick={() => (hide(), scrollTo('jarvis'))} title="Open the full console" aria-label="Open the full J.A.R.V.I.S. console">
              <I d={<path d="M15 3h6v6M21 3l-7 7M9 21H3v-6M3 21l7-7" />} />
            </button>
            <button type="button" className="jdock__btn" onClick={hide} title="Close (Esc)" aria-label="Close J.A.R.V.I.S.">
              <I d={<path d="M6 6l12 12M18 6 6 18" />} />
            </button>
          </div>
        </header>

        {adv && <ProviderPanel variant="list" />}

        {(quick.length > 0 || recent.length > 0) && j.log.length < 2 && (
          <div className="jdock__quick">
            {quick.length > 0 && (
              <>
                <span className="mono">My quick tools</span>
                <div>
                  {quick.map((t) => (
                    <button type="button" key={t.id} onClick={() => j.runAction({ tool: 'openTool', arguments: { id: t.id } }, t.name)}>
                      {t.name}
                    </button>
                  ))}
                </div>
              </>
            )}
            {recent.length > 0 && (
              <>
                <span className="mono">Recent</span>
                <div>
                  {recent.map((h) => (
                    <button type="button" key={h.at} onClick={() => j.run(h.text, { via: 'history' })}>
                      <em className="mono">{clock(h.at)}</em> {h.text}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <JarvisConsole ref={input} compact />
      </div>
    </>
  );
}
