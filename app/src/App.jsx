import { useCallback, useEffect, useState } from 'react';
import Nav from './components/Nav';
import Loader from './components/Loader';
import Hero from './sections/Hero';
import Explore from './sections/Explore';
import Technology from './sections/Technology';
import Projects from './sections/Projects';
import Contact from './sections/Contact';
import Tools from './sections/Tools';
import Lab from './sections/Lab';
import CommandPalette from './components/CommandPalette';
import Jarvis from './sections/Jarvis';
import Bento from './sections/Bento';
import Shortcuts from './components/Shortcuts';
import ToastHost from './components/Toast';
import Vault from './components/Vault';
import { person, seo, socials } from './data/site';
import { hasWebGL } from './hooks/useEnv';
import { useScrollTo } from './hooks/useScroll';
import { ArrowUp } from './components/Icons';

/* -----------------------------------------------------------------------------
 * App shell.
 *
 * The three lab sections are code-split: they carry the bulk of the geometry
 * and none of them is above the fold, so they are fetched as the reader
 * approaches rather than at boot. Each placeholder reserves the section's
 * height so the page never shifts under the reader when a chunk lands.
 * -------------------------------------------------------------------------- */

function BackToTop() {
  const [show, setShow] = useState(false);
  const scrollTo = useScrollTo();

  useEffect(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      setShow(window.scrollY > window.innerHeight * 1.4);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  if (!show) return null;
  return (
    <button
      className="icon-btn totop"
      type="button"
      onClick={() => scrollTo('home')}
      aria-label="Back to top"
    >
      <ArrowUp />
    </button>
  );
}

export default function App() {
  // The loader waits on a real signal from the hero canvas. Without WebGL that
  // signal never comes, so treat "no WebGL" as ready immediately.
  const [sceneReady, setSceneReady] = useState(() => !hasWebGL());
  const onSceneReady = useCallback(() => setSceneReady(true), []);

  // Honour a deep link once the page has settled, since the hero is 100svh and
  // the browser's own restoration runs before the sections have their height.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const t = setTimeout(() => {
      const node = document.getElementById(hash);
      if (node) window.scrollTo({ top: node.getBoundingClientRect().top + window.scrollY - 76 });
    }, 240);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <Loader ready={sceneReady} />

      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Nav />

      <main id="main">
        <Hero onSceneReady={onSceneReady} />
        <Bento />
        <Explore />
        <Jarvis />
        <Tools />
        <Projects />
        <Technology />
        <Lab />
        <Contact />
      </main>

      <footer className="footer">
        <div className="wrap footer__inner">
          <p>
            © {new Date().getFullYear()} {person.name}
          </p>
          <p>
            {socials.slice(0, 3).map((s, i) => (
              <span key={s.id}>
                {i > 0 && ' · '}
                <a href={s.url} target="_blank" rel="noreferrer noopener">
                  {s.label}
                </a>
              </span>
            ))}
          </p>
          <p className="mono">
            Built by hand · <kbd>?</kbd> for keys
          </p>
        </div>
      </footer>

      <BackToTop />
      <CommandPalette />
      <Shortcuts />
      <Vault />
      <ToastHost />
    </>
  );
}
