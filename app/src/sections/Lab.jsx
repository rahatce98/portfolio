import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useReveal } from '../hooks/useScroll';

/* -----------------------------------------------------------------------------
 * 06 — Lab
 *
 * A launcher of interactive studies. Picking one enters "theater" mode: the
 * rest of the page is hidden, a HUD bar takes over the top edge, and the lab
 * gets the whole viewport. The 3D labs are scroll-driven against the window,
 * so theater mode hides siblings instead of moving the lab into an overlay —
 * their scroll maths keeps working untouched.
 *
 * Keys in theater: 1–5 switch lab · F native full screen · Esc exit.
 * -------------------------------------------------------------------------- */

const RocketLab = lazy(() => import('./RocketLab'));
const AutoLab = lazy(() => import('./AutoLab'));
const SystemsSection = lazy(() => import('./SystemsSection'));
const PipeLab = lazy(() => import('./PipeLab'));
const BeamLab = lazy(() => import('./BeamLab'));
const EngineLab = lazy(() => import('./EngineLab'));

function Wrapped({ C, code, title, lead }) {
  return (
    <section className="section">
      <div className="wrap">
        <div className="section-head">
          <div>
            <span className="section-head__index">{code}</span>
            <h2>{title}</h2>
          </div>
          <p>{lead}</p>
        </div>
        <C />
      </div>
    </section>
  );
}

export const LABS = [
  { id: 'engine', code: 'LAB-00', group: 'Cinematic', label: 'Turbofan', note: 'A scroll-scrubbed product film: blueprint → materialize → explode → fly-through → reassemble.', art: 'engine', render: () => <EngineLab /> },
  { id: 'rocket', code: 'LAB-01', group: '3D', label: 'Launch Vehicle', note: 'Scroll to disassemble a two-stage rocket, stage by stage.', art: 'rocket', render: () => <RocketLab /> },
  { id: 'auto', code: 'LAB-02', group: '3D', label: 'Supercar', note: 'Nine assemblies. Explode, orbit, and inspect each one.', art: 'car', render: () => <AutoLab /> },
  { id: 'systems', code: 'LAB-03', group: '3D', label: 'Mechanisms', note: 'Gears, pistons and linkages running in real time.', art: 'gear', render: () => <SystemsSection /> },
  {
    id: 'pipe', code: 'LAB-04', group: 'Civil', label: 'Sewer Hydraulics', note: 'Manning partial-flow for circular pipes — live section and curve.', art: 'pipe',
    render: () => <Wrapped C={PipeLab} code="LAB-04 — Sewer Hydraulics" title="Flow in a part-full pipe." lead="Set diameter, slope and depth; discharge, velocity and the self-cleansing check update as you drag." />,
  },
  {
    id: 'beam', code: 'LAB-05', group: 'Civil', label: 'Beam Analyzer', note: 'Drag a load along a beam; shear, moment and deflection follow.', art: 'beam',
    render: () => <Wrapped C={BeamLab} code="LAB-05 — Beam Analyzer" title="Load it, watch it bend." lead="Simply supported span with a point load and UDL. Grab the arrow and move it — every diagram is recomputed per frame." />,
  },
];

function Art({ kind }) {
  switch (kind) {
    case 'rocket':
      return (
        <svg viewBox="0 0 120 120" className="lart lart--rocket">
          <path d="M60 14c10 12 14 28 14 46v22H46V60c0-18 4-34 14-46z" />
          <path d="M46 70l-12 16v8l12-6M74 70l12 16v8l-12-6" />
          <circle cx="60" cy="46" r="6" />
          <path className="lart__flame" d="M52 84c2 12 6 18 8 24 2-6 6-12 8-24z" />
        </svg>
      );
    case 'car':
      return (
        <svg viewBox="0 0 120 120" className="lart lart--car">
          <path d="M14 76l8-14c4-6 10-10 18-12l14-4h16c10 0 20 6 28 14l8 4c4 2 6 6 6 10v4H14z" />
          <path d="M44 50l8 12h34" />
          <circle className="lart__wheel" cx="36" cy="80" r="10" />
          <circle className="lart__wheel" cx="88" cy="80" r="10" />
          <path className="lart__speed" d="M4 60h14M0 68h12M6 52h10" />
        </svg>
      );
    case 'gear':
      return (
        <svg viewBox="0 0 120 120" className="lart lart--gear">
          <g className="lart__g1"><circle cx="48" cy="58" r="20" /><path d="M48 30v8M48 78v8M20 58h8M68 58h8M28 38l6 6M62 72l6 6M28 78l6-6M62 44l6-6" /></g>
          <g className="lart__g2"><circle cx="84" cy="80" r="12" /><path d="M84 62v6M84 92v6M66 80h6M96 80h6" /></g>
        </svg>
      );
    case 'pipe':
      return (
        <svg viewBox="0 0 120 120" className="lart lart--pipe">
          <circle cx="60" cy="60" r="36" />
          <path className="lart__water" d="M28 72c8-3 16 3 24 0s16-3 24 0 12 2 16 0v0a36 36 0 0 1-64 0z" />
          <path d="M28 72h64" strokeDasharray="3 3" />
        </svg>
      );
    case 'engine':
      return (
        <svg viewBox="0 0 120 120" className="lart lart--engine">
          <path d="M22 38h58l18 10v24l-18 10H22z" />
          <g className="lart__fan"><circle cx="30" cy="60" r="20" /><path d="M30 40v40M10 60h40M16 46l28 28M16 74l28-28" /></g>
          <path className="lart__jet" d="M98 52l18 8-18 8" />
          <path d="M50 38v44M66 38v44" strokeDasharray="2 3" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 120 120" className="lart lart--beam">
          <rect x="14" y="44" width="92" height="6" rx="1" />
          <path d="M14 50l-6 10h12zM106 50l-6 10h12z" />
          <path className="lart__arrow" d="M60 14v26M55 34l5 6 5-6" />
          <path className="lart__bmd" d="M14 70q46 36 92 0" />
        </svg>
      );
  }
}

export default function Lab() {
  const root = useReveal();
  const [tab, setTab] = useState(null);
  const active = LABS.find((t) => t.id === tab);
  const idx = LABS.findIndex((t) => t.id === tab);

  const open = useCallback((id) => {
    setTab(id);
    requestAnimationFrame(() => {
      const el = document.getElementById('lab-stage');
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 64, behavior: 'instant' });
    });
  }, []);

  const exit = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    setTab(null);
    requestAnimationFrame(() => document.getElementById('lab')?.scrollIntoView({ behavior: 'instant', block: 'start' }));
  }, []);

  useEffect(() => {
    document.body.toggleAttribute('data-theater', !!tab);
    return () => document.body.removeAttribute('data-theater');
  }, [tab]);

  useEffect(() => {
    const onLab = (e) => open(e.detail);
    window.addEventListener('rh-lab', onLab);
    return () => window.removeEventListener('rh-lab', onLab);
  }, [open]);

  useEffect(() => {
    if (!tab) return;
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') exit();
      else if (/^[1-6]$/.test(e.key)) open(LABS[+e.key - 1].id);
      else if (e.key === 'ArrowRight' || e.key === ']') open(LABS[(idx + 1) % LABS.length].id);
      else if (e.key === 'ArrowLeft' || e.key === '[') open(LABS[(idx - 1 + LABS.length) % LABS.length].id);
      else if (e.key.toLowerCase() === 'f') {
        if (document.fullscreenElement) document.exitFullscreen?.();
        else document.documentElement.requestFullscreen?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab, idx, open, exit]);

  return (
    <section className="section labx" id="lab" ref={root}>
      <div className="wrap labx__intro">
        <div className="section-head" data-reveal>
          <div>
            <span className="section-head__index">06 — Lab</span>
            <h2>
              Learn by building<span className="dim"> — six working studies.</span>
            </h2>
          </div>
          <p>
            Real-time 3D machines and live civil-engineering calculators. Each opens full screen;
            nothing downloads until you pick one. Keys <kbd>1</kbd>–<kbd>6</kbd>, <kbd>Esc</kbd> to return.
          </p>
        </div>

        <div className="labgrid2">
          {LABS.map((t, i) => (
            <button key={t.id} type="button" className="lcard" data-art={t.art} onClick={() => open(t.id)} data-reveal style={{ '--reveal-delay': `${i * 70}ms` }}>
              <span className="lcard__top">
                <span className="mono">{t.code}</span>
                <span className="lcard__grp">{t.group}</span>
              </span>
              <Art kind={t.art} />
              <span className="lcard__label">{t.label}</span>
              <span className="lcard__note">{t.note}</span>
              <span className="lcard__cta mono">
                Enter <b>{i + 1}</b>
              </span>
            </button>
          ))}
        </div>
      </div>

      {active && (
        <>
          <div className="theater-bar" role="toolbar" aria-label="Lab controls">
            <button type="button" className="theater-bar__back" onClick={exit}>
              ← <span>Exit lab</span> <kbd>Esc</kbd>
            </button>
            <div className="theater-bar__tabs">
              {LABS.map((t, i) => (
                <button key={t.id} type="button" aria-pressed={t.id === tab} onClick={() => open(t.id)}>
                  <kbd>{i + 1}</kbd>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="theater-bar__fs"
              onClick={() => (document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.())}
              aria-label="Toggle full screen (F)"
              title="Full screen (F)"
            >
              ⛶
            </button>
          </div>
          <div className="lab__stage2" id="lab-stage" role="region" aria-label={active.label} key={active.id}>
            <Suspense
              fallback={
                <div className="lab__loading">
                  <span className="lab__spinner" />
                  <span className="mono">Loading {active.label}…</span>
                </div>
              }
            >
              {active.render()}
            </Suspense>
          </div>
        </>
      )}
    </section>
  );
}
