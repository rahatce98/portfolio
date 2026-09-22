import { useRef, useState, useMemo } from 'react';
import Stage from '../three/Stage';
import SystemModule from '../three/Systems';
import CameraRig from '../three/Rig';
import LabViewer, { useFullscreen } from '../components/LabViewer';
import ControlPanel from '../components/ControlPanel';
import { SYSTEM_MODULES } from '../data/assemblies';
import { useInView, useReveal } from '../hooks/useScroll';
import { perfTier } from '../hooks/useEnv';
import { Reset, Plus, Minus, Expand, Shrink, Rotate } from '../components/Icons';

/* -----------------------------------------------------------------------------
 * LAB-03 — Mechanisms
 *
 * Three mechanical primitives, each simulated rather than illustrated: a real
 * gear ratio, a truss whose members change colour with the sign of their axial
 * force, and a branched flow network.
 *
 * On low-power devices the canvas is replaced by the same content as text —
 * this is the heaviest of the four scenes per pixel and the least essential.
 * -------------------------------------------------------------------------- */

const HOMES = {
  gearbox: { radius: 7.6, phi: 1.35, theta: 0.15, target: [0, 0.35, 0] },
  truss: { radius: 8.2, phi: 1.42, theta: 0.1, target: [0, 0, 0] },
  pump: { radius: 8.6, phi: 1.2, theta: 0.5, target: [0, 0, 0] },
};

export default function SystemsSection() {
  const root = useReveal();
  const [viewRef, inView] = useInView({ rootMargin: '220px 0px' });
  const [active, setActive] = useState(SYSTEM_MODULES[0].id);
  const [resetKey, setResetKey] = useState(0);
  const commandRef = useRef(null);
  const viewerEl = useRef(null);
  const [isFull, toggleFull, canFull] = useFullscreen(viewerEl);
  const tier = perfTier();

  const mod = useMemo(() => SYSTEM_MODULES.find((m) => m.id === active), [active]);

  const controls = (
    <ControlPanel
      items={[
        { id: 'left', label: 'Orbit', icon: <Rotate />, onClick: () => commandRef.current?.orbit(-0.4) },
        { id: 'in', label: 'In', icon: <Plus />, onClick: () => commandRef.current?.dolly(1) },
        { id: 'out', label: 'Out', icon: <Minus />, onClick: () => commandRef.current?.dolly(-1) },
        { id: 'reset', label: 'Reset', icon: <Reset />, onClick: () => setResetKey((k) => k + 1) },
        ...(canFull
          ? [{ id: 'full', label: isFull ? 'Exit' : 'Full', icon: isFull ? <Shrink /> : <Expand />, onClick: toggleFull, active: isFull }]
          : []),
      ]}
    />
  );

  return (
    <section className="section" id="systems" ref={root}>
      <div className="wrap" ref={viewRef}>
        <div className="section-head" data-reveal>
          <div>
            <span className="section-head__index">04 — Engineering Systems</span>
            <h2>Mechanisms, running.</h2>
          </div>
          <p>
            Three primitives behind the work below. Each one is simulated, not drawn: the gears
            hold a true ratio, the truss members change colour with the sign of their axial force,
            and the network carries real flow.
          </p>
        </div>

        <div className="modtabs">
          {SYSTEM_MODULES.map((m) => (
            <button
              key={m.id}
              type="button"
              className="modtab"
              data-on={active === m.id}
              onClick={() => {
                setActive(m.id);
                setResetKey((k) => k + 1);
              }}
            >
              <span>{m.code}</span>
              <b>{m.label}</b>
            </button>
          ))}
        </div>

        <div className="lab">
          {tier >= 1 ? (
            <LabViewer
              viewerRef={viewerEl}
              readout={[<>MOD <b>{mod.code}</b></>, <>{mod.metric}</>]}
              hint="Drag to orbit"
              controls={controls}
              height="clamp(320px, 50vh, 520px)"
            >
              <Stage active={inView} camera={{ position: [4, 2.4, 6.4], fov: 42 }}>
                <SystemModule id={active} />
                <CameraRig
                  home={HOMES[active]}
                  resetKey={resetKey}
                  commandRef={commandRef}
                  minDistance={3}
                  maxDistance={16}
                  enableZoom={isFull}
                />
              </Stage>
            </LabViewer>
          ) : (
            <div className="stage__fallback">
              <strong>{mod.label}</strong>
              <span>{mod.blurb}</span>
              <span className="mono">{mod.metric}</span>
              <span className="mono" style={{ marginTop: 8 }}>
                Simplified for this device
              </span>
            </div>
          )}

          <div className="lab__side">
            <div className="info">
              <span className="info__code">{mod.code}</span>
              <h3 className="info__title">{mod.label}</h3>
              <p className="info__blurb">{mod.blurb}</p>
              <dl className="info__specs">
                <div className="info__row">
                  <dt>Readout</dt>
                  <dd>{mod.metric}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
