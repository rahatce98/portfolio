import { useRef } from 'react';
import Tesseract from '../components/Tesseract';
import { useTools } from './Tools';
import { useScrollTo, useReveal } from '../hooks/useScroll';
import { socials } from '../data/site';
import { Icon } from '../components/Icons';

/* -----------------------------------------------------------------------------
 * Command center — the whole site at a glance, one tile per destination.
 * Each tile is a live door (event or scroll), not a picture of one.
 * Pointer position drives a per-tile specular highlight via CSS vars.
 * -------------------------------------------------------------------------- */

function Tile({ className = '', onClick, children, label }) {
  const ref = useRef(null);
  const move = (e) => {
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty('--mx', `${e.clientX - r.left}px`);
    ref.current.style.setProperty('--my', `${e.clientY - r.top}px`);
  };
  return (
    <button type="button" ref={ref} className={`bt ${className}`} onClick={onClick} onPointerMove={move} aria-label={label} data-reveal>
      {children}
    </button>
  );
}

export default function Bento() {
  const root = useReveal();
  const { tools } = useTools();
  const scrollTo = useScrollTo();
  const live = tools.filter((t) => t.status === 'live').length;
  const names = tools.slice(0, 14).map((t) => t.name);
  const lab = (id) => window.dispatchEvent(new CustomEvent('rh-lab', { detail: id }));

  return (
    <section className="section bento" id="command" ref={root}>
      <div className="wrap">
        <div className="section-head" data-reveal>
          <div>
            <span className="section-head__index">Command center</span>
            <h2>
              Everything, one tap away<span className="dim">.</span>
            </h2>
          </div>
          <p>Tools, the console, the vault and the labs — each tile opens the real thing.</p>
        </div>

        <div className="bgrid">
          <Tile className="bt--tools" onClick={() => scrollTo('tools')} label="Open the tool index">
            <span className="bt__k mono">Index</span>
            <span className="bt__big">{String(tools.length).padStart(2, '0')}</span>
            <span className="bt__t">tools, forms &amp; consoles</span>
            <span className="bt__sub">{live} live · searchable · editable</span>
            <span className="bt__marquee" aria-hidden="true">
              <span>{[...names, ...names].map((n, i) => <em key={i}>{n}</em>)}</span>
            </span>
          </Tile>

          <Tile className="bt--jarvis" onClick={() => window.dispatchEvent(new Event('rh-jarvis'))} label="Open J.A.R.V.I.S.">
            <Tesseract className="bt__cube" speed={0.8} />
            <span className="bt__k mono">Console</span>
            <span className="bt__t">J.A.R.V.I.S.</span>
            <span className="bt__sub">Type or speak — <kbd>J</kbd></span>
          </Tile>

          <Tile className="bt--vault" onClick={() => window.dispatchEvent(new Event('rh-vault'))} label="Open the vault">
            <span className="bt__lock" aria-hidden="true">
              <svg viewBox="0 0 64 64"><rect x="14" y="28" width="36" height="26" rx="6" /><path className="bt__shackle" d="M22 28v-8a10 10 0 0 1 20 0v8" /><circle cx="32" cy="41" r="3" /></svg>
            </span>
            <span className="bt__k mono">Vault</span>
            <span className="bt__t">Passwords &amp; codes</span>
            <span className="bt__sub">AES-256 · zero-knowledge</span>
          </Tile>

          <Tile className="bt--engine" onClick={() => lab('engine')} label="Play the Turbofan film">
            <svg className="bt__fan" viewBox="0 0 100 100" aria-hidden="true">
              {Array.from({ length: 14 }, (_, i) => (
                <path key={i} d="M50 50 C54 36 60 22 62 8 L54 8 C52 22 50 36 50 50z" transform={`rotate(${(i * 360) / 14} 50 50)`} />
              ))}
              <circle cx="50" cy="50" r="9" />
            </svg>
            <span className="bt__k mono">LAB-00 · Cinematic</span>
            <span className="bt__t">Turbofan</span>
            <span className="bt__sub">Wireframe → solid → explode → fly-through</span>
            <span className="bt__play" aria-hidden="true">▶</span>
          </Tile>

          <Tile className="bt--pipe" onClick={() => lab('pipe')} label="Open sewer hydraulics lab">
            <span className="bt__k mono">Civil</span>
            <span className="bt__t">Sewer hydraulics</span>
            <svg className="bt__pipe" viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="30" /><path className="bt__water" d="M12 50q7-4 14 0t14 0 14 0 14 0a30 30 0 0 1-56 0z" /></svg>
          </Tile>

          <Tile className="bt--beam" onClick={() => lab('beam')} label="Open beam analyzer">
            <span className="bt__k mono">Civil</span>
            <span className="bt__t">Beam analyzer</span>
            <svg className="bt__bm" viewBox="0 0 120 50" aria-hidden="true"><path d="M6 12h108" /><path className="bt__curve" d="M6 18q54 40 108 0" /></svg>
          </Tile>

          <Tile className="bt--3d" onClick={() => lab('rocket')} label="Open 3D labs">
            <span className="bt__k mono">3D</span>
            <span className="bt__t">Rocket · Supercar · Mechanisms</span>
            <span className="bt__sub">Explode, orbit, inspect</span>
          </Tile>

          <div className="bt bt--social" data-reveal>
            <span className="bt__k mono">Elsewhere</span>
            <div className="bt__icons">
              {socials.filter((s) => s.id !== 'email').slice(0, 8).map((s) => (
                <a key={s.id} href={s.url} target="_blank" rel="noreferrer noopener" aria-label={s.label} title={s.label}>
                  <Icon name={s.id} />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
