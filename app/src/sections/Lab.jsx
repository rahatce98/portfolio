import { lazy, Suspense, useState } from 'react';
import { useReveal } from '../hooks/useScroll';

/* -----------------------------------------------------------------------------
 * 05 — Lab
 *
 * The three interactive 3D studies (rocket, car, mechanisms) used to be three
 * full-height sections in a row. They now sit behind one tabbed console, and
 * only the selected study is fetched and mounted.
 * -------------------------------------------------------------------------- */

const RocketLab = lazy(() => import('./RocketLab'));
const AutoLab = lazy(() => import('./AutoLab'));
const SystemsSection = lazy(() => import('./SystemsSection'));

const TABS = [
  { id: 'rocket', code: 'LAB-01', label: 'Launch Vehicle', note: 'Scroll-driven disassembly', C: RocketLab },
  { id: 'auto', code: 'LAB-02', label: 'Automotive', note: 'Nine assemblies, exploded', C: AutoLab },
  { id: 'systems', code: 'LAB-03', label: 'Mechanisms', note: 'Gears, pistons, linkages', C: SystemsSection },
];

export default function Lab() {
  const root = useReveal();
  const [tab, setTab] = useState(null);
  const active = TABS.find((t) => t.id === tab);

  return (
    <section className="section lab" id="lab" ref={root}>
      <div className="wrap">
        <div className="section-head" data-reveal>
          <div>
            <span className="section-head__index">05 — Lab</span>
            <h2>
              Side experiments<span className="dim"> in 3D.</span>
            </h2>
          </div>
          <p>
            Real-time WebGL studies built to learn how machines go together. Pick one to load it —
            nothing downloads until you do.
          </p>
        </div>

        <div className="labtabs" role="tablist" data-reveal>
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              className="labtab"
              onClick={() => setTab((v) => (v === t.id ? null : t.id))}
            >
              <span className="labtab__code mono">{t.code}</span>
              <span className="labtab__label">{t.label}</span>
              <span className="labtab__note">{t.note}</span>
              <span className="labtab__cta mono">{tab === t.id ? 'Close ×' : 'Load →'}</span>
            </button>
          ))}
        </div>
      </div>

      {active && (
        <div className="lab__stage" role="tabpanel">
          <Suspense
            fallback={
              <div className="wrap">
                <div className="stage__fallback">
                  <span className="mono">Loading scene…</span>
                </div>
              </div>
            }
          >
            <active.C />
          </Suspense>
        </div>
      )}
    </section>
  );
}
