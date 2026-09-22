import { useEffect, useState, useMemo } from 'react';
import { person, sections } from '../data/site';
import { useActiveSection, useScrolled, useScrollProgress, useScrollTo } from '../hooks/useScroll';
import { useTheme } from '../hooks/useEnv';
import { Sun, Moon, Menu, Close } from './Icons';

/* Fixed header, mobile drawer, scroll progress bar and the desktop section
   rail. All four read from the same section registry in data/site.js. */

export default function Nav() {
  const ids = useMemo(() => sections.map((s) => s.id), []);
  const active = useActiveSection(ids);
  const stuck = useScrolled(30);
  const progress = useScrollProgress();
  const scrollTo = useScrollTo();
  const [theme, toggleTheme] = useTheme();
  const [open, setOpen] = useState(false);

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

  const go = (e, id) => {
    e.preventDefault();
    setOpen(false);
    scrollTo(id);
    // Keep the address bar honest without triggering a jump.
    if (history.replaceState) history.replaceState(null, '', `#${id}`);
  };

  return (
    <>
      <div className="progress" style={{ '--p': `${progress * 100}%` }} aria-hidden="true" />

      <header className="nav" data-stuck={stuck}>
        <div className="nav__inner">
          <a className="brand" href="#home" onClick={(e) => go(e, 'home')}>
            <span className="brand__mark">{person.monogram}</span>
            <span className="brand__text">
              <span className="brand__name">{person.name}</span>
              <span className="brand__sub">{person.eyebrow}</span>
            </span>
          </a>

          <nav className="nav__links" aria-label="Primary">
            {sections.map((s) => (
              <a
                key={s.id}
                className="nav__link"
                href={`#${s.id}`}
                aria-current={active === s.id ? 'true' : undefined}
                onClick={(e) => go(e, s.id)}
              >
                {s.label}
              </a>
            ))}
          </nav>

          <div className="nav__actions">
            <button
              className="kbtn"
              type="button"
              onClick={() => window.dispatchEvent(new Event('rh-palette'))}
              aria-label="Search tools (Ctrl K)"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <span>Search</span>
              <kbd>Ctrl K</kbd>
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
            {sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  aria-current={active === s.id ? 'true' : undefined}
                  onClick={(e) => go(e, s.id)}
                  tabIndex={open ? 0 : -1}
                >
                  <span>{s.index}</span>
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <nav className="rail" aria-label="Section navigation">
        {sections.map((s) => (
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
