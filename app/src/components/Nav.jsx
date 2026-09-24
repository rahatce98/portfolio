import { useEffect, useState, useMemo } from 'react';
import { person, sections, pageSections } from '../data/site';
import { useActiveSection, useScrolled, useScrollProgress, useScrollTo } from '../hooks/useScroll';
import { useTheme } from '../hooks/useEnv';
import { setOs } from '../os/context';
import { Sun, Moon, Menu, Close } from './Icons';

/* Fixed header, mobile drawer, scroll progress bar and the desktop section
   rail. All four read from the same section registry in data/site.js — the
   Rahat OS information architecture. The header also carries the global
   J.A.R.V.I.S. command bar. */

export default function Nav() {
  const ids = useMemo(() => pageSections.map((s) => s.id), []);
  const active = useActiveSection(ids);
  const stuck = useScrolled(30);
  const progress = useScrollProgress();
  const scrollTo = useScrollTo();
  const [theme, toggleTheme] = useTheme();
  const [open, setOpen] = useState(false);

  // J.A.R.V.I.S. context: where the reader is.
  useEffect(() => setOs({ section: active }), [active]);

  // The drawer must not survive a resize into the desktop layout, and must not
  // leave the page scroll-locked behind it.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('resize', close);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    window.addEventListener('rh-theme', toggleTheme);
    return () => window.removeEventListener('rh-theme', toggleTheme);
  }, [toggleTheme]);

  const go = (e, s) => {
    e.preventDefault();
    setOpen(false);
    if (s.event) return window.dispatchEvent(new Event(s.event));
    scrollTo(s.id);
    // Keep the address bar honest without triggering a jump.
    if (history.replaceState) history.replaceState(null, '', `#${s.id}`);
  };

  return (
    <>
      <div className="progress" style={{ '--p': `${progress * 100}%` }} aria-hidden="true" />

      <header className="nav" data-stuck={stuck}>
        <div className="nav__inner">
          <a className="brand" href="#home" onClick={(e) => go(e, sections[0])}>
            <span className="brand__mark brand__mark--photo">
              <img src={`${import.meta.env.BASE_URL}${person.photo}`} alt="" width="40" height="40" />
              <i aria-hidden="true" />
            </span>
            <span className="brand__text">
              <span className="brand__name">{person.name}</span>
              <span className="brand__sub">{person.eyebrow}</span>
            </span>
          </a>

          <nav className="nav__links" aria-label="Primary">
            {sections
              .filter((s) => s.nav !== false)
              .map((s) => (
                <a
                  key={s.id}
                  className="nav__link"
                  href={s.event ? '#' : `#${s.id}`}
                  data-event={s.event ? '' : undefined}
                  aria-current={active === s.id ? 'true' : undefined}
                  onClick={(e) => go(e, s)}
                >
                  {s.label}
                </a>
              ))}
          </nav>

          <div className="nav__actions">
            <button className="cbar" type="button" onClick={() => window.dispatchEvent(new Event('rh-jarvis'))} aria-label="Ask J.A.R.V.I.S. (Ctrl J)">
              <span className="cbar__orb" aria-hidden="true" />
              <span className="cbar__text">Ask J.A.R.V.I.S. anything…</span>
              <kbd>Ctrl J</kbd>
            </button>
            <button
              className="icon-btn"
              type="button"
              onClick={() => window.dispatchEvent(new Event('rh-palette'))}
              aria-label="Search everything (Ctrl K)"
              title="Search · Ctrl K or /"
            >
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            </button>
            <button
              className="icon-btn"
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              {theme === 'dark' ? <Sun /> : <Moon />}
            </button>
            <button
              className="icon-btn nav__burger"
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls="nav-mobile"
              aria-label={open ? 'Close menu' : 'Open menu'}
            >
              {open ? <Close /> : <Menu />}
            </button>
          </div>
        </div>
      </header>

      <div className="nav__mobile" id="nav-mobile" data-open={open}>
        <div>
          <ul className="wrap">
            {sections
              .filter((s) => s.id !== 'home')
              .map((s) => (
                <li key={s.id}>
                  <a
                    href={s.event ? '#' : `#${s.id}`}
                    aria-current={active === s.id ? 'true' : undefined}
                    onClick={(e) => go(e, s)}
                    tabIndex={open ? 0 : -1}
                  >
                    <span>{s.index || '··'}</span>
                    {s.label}
                  </a>
                </li>
              ))}
          </ul>
        </div>
      </div>

      <nav className="rail" aria-label="Section navigation">
        {pageSections.map((s) => (
          <button
            key={s.id}
            className="rail__item"
            type="button"
            data-active={active === s.id}
            onClick={() => scrollTo(s.id)}
            aria-label={`Go to ${s.label}`}
          >
            <span className="rail__label">{s.label}</span>
            <span className="rail__dot" />
          </button>
        ))}
      </nav>
    </>
  );
}
