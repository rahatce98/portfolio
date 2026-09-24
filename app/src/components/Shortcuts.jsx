import { useEffect, useRef, useState } from 'react';
import { useScrollTo } from '../hooks/useScroll';

/* Global keyboard map. The floating J.A.R.V.I.S. orb lives in JarvisDock;
   Ctrl/⌘ K and "/" belong to the command palette, Ctrl/⌘ J to the dock.
   Single-key shortcuts are ignored while typing in a field. */

const MAP = [
  ['Navigate', [
    ['Ctrl K', 'Command palette — search everything'],
    ['/', 'Command palette (when not typing)'],
    ['Ctrl J', 'J.A.R.V.I.S. from any page'],
    ['J', 'J.A.R.V.I.S. (single key)'],
    ['G then H · A · P · L · T · J · C', 'Home · Portfolio · Projects · Labs · Tools · J.A.R.V.I.S. · Contact'],
  ]],
  ['Act', [
    ['N', 'Add a tool (owner)'],
    ['T', 'Toggle light / dark'],
    ['?', 'This keyboard map'],
  ]],
  ['Inside a lab', [
    ['1 – 6', 'Switch lab'],
    ['← →', 'Previous / next lab'],
    ['F', 'Native full screen'],
    ['Esc', 'Exit lab'],
  ]],
];

const GO = { h: 'home', a: 'explore', t: 'tools', p: 'projects', l: 'lab', c: 'contact', j: 'jarvis', e: 'technology' };

export default function Shortcuts() {
  const [open, setOpen] = useState(false);
  const scrollTo = useScrollTo();
  const g = useRef(0);

  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('dialog[open]')) return;
      const k = e.key.toLowerCase();
      const theater = document.body.hasAttribute('data-theater');

      if (g.current && Date.now() - g.current < 1200 && GO[k]) {
        g.current = 0;
        e.preventDefault();
        if (theater) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        setTimeout(() => scrollTo(GO[k]), theater ? 60 : 0);
        return;
      }
      if (k === 'escape') return setOpen(false);
      if (e.key === '?') {
        e.preventDefault();
        return setOpen((v) => !v);
      }
      if (theater) return; // the lab owns the rest of the keys
      if (k === 'g') g.current = Date.now();
      else if (k === 'j') {
        e.preventDefault();
        window.dispatchEvent(new Event('rh-jarvis'));
      } else if (k === 't') window.dispatchEvent(new Event('rh-theme'));
      else if (k === 'n') window.dispatchEvent(new Event('rh-add-tool'));
    };
    const show = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('rh-shortcuts', show);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('rh-shortcuts', show);
    };
  }, [scrollTo]);

  return (
    <>
      <button type="button" className="keyhint mono" onClick={() => setOpen(true)} aria-label="Keyboard shortcuts">
        <kbd>?</kbd> keys
      </button>

      {open && (
        <div className="keys" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="keys__panel">
            <header>
              <span className="section-head__index">Keyboard</span>
              <h3>Move at the speed of thought.</h3>
            </header>
            <div className="keys__grid">
              {MAP.map(([group, rows]) => (
                <div key={group}>
                  <span className="mono">{group}</span>
                  {rows.map(([k, d]) => (
                    <div className="keys__row" key={k}>
                      <span className="keys__k">{k.split(' ').map((x, i) => (x === 'then' || x === '·' ? <em key={i}>{x}</em> : <kbd key={i}>{x}</kbd>))}</span>
                      <span>{d}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <footer className="mono">press ? or esc to close</footer>
          </div>
        </div>
      )}
    </>
  );
}
