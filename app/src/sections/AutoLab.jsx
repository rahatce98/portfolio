import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import Stage from '../three/Stage';
import Car from '../three/Car';
import CameraRig from '../three/Rig';
import { GridFloor } from '../three/Atmosphere';
import LabViewer, { useFullscreen } from '../components/LabViewer';
import ControlPanel from '../components/ControlPanel';
import InfoPanel, { Stepper } from '../components/InfoPanel';
import { CAR_COMPONENTS } from '../data/assemblies';
import { useInView } from '../hooks/useScroll';
import useDragGuard from '../hooks/useDragGuard';
import { perfTier } from '../hooks/useEnv';
import { Tag, Reset, Plus, Minus, Explode, Assemble, Expand, Shrink, Bulb, Rotate, Camera } from '../components/Icons';

/* -----------------------------------------------------------------------------
 * 03 — Automotive Lab
 *
 * A configurator rather than a scroll sequence: the user drives every state.
 * Explode is a continuous value, not a two-state toggle, so a part can be
 * pulled just far enough out of the assembly to see how it sits.
 * -------------------------------------------------------------------------- */

/** Named camera framings for the view presets. */
const VIEWS = {
  iso: { radius: 9.4, phi: 1.15, theta: 0.72, target: [0, 0.15, 0] },
  side: { radius: 8.6, phi: 1.57, theta: 0, target: [0, 0.15, 0] },
  front: { radius: 8.2, phi: 1.42, theta: Math.PI / 2, target: [0, 0.15, 0] },
  top: { radius: 9.6, phi: 0.28, theta: 0.6, target: [0, 0, 0] },
};

/** Eases the explode value and wheel rotation toward their targets. */
function Driver({ explodeRef, targetRef, wheelSpinRef }) {
  useFrame((_, dt) => {
    const k = 1 - Math.pow(0.004, dt);
    explodeRef.current = THREE.MathUtils.lerp(explodeRef.current, targetRef.current, k);
    // Wheels stop turning once the car is meaningfully apart.
    wheelSpinRef.current = (1 - THREE.MathUtils.clamp(explodeRef.current * 1.6, 0, 1)) * 2.4;
  });
  return null;
}

function Scene({ explodeRef, targetRef, wheelSpinRef, selected, onSelect, showLabels, focus, resetKey, commandRef, lightsOn, fullscreen }) {
  const tier = perfTier();
  return (
    <>
      <Driver explodeRef={explodeRef} targetRef={targetRef} wheelSpinRef={wheelSpinRef} />
      <Car
        explodeRef={explodeRef}
        wheelSpinRef={wheelSpinRef}
        selected={selected}
        onSelect={onSelect}
        showLabels={showLabels}
        autoSpin={false}
      />
      {lightsOn && <GridFloor y={-1.5} size={34} cell={0.9} />}
      {/* Contact shadow stand-in: a dark disc under the car, cheaper than a
          real shadow pass and stable on tiers without shadow maps. */}
      {tier >= 1 && (
        <mesh position={[0, -1.46, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[2.9, 32]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.32} depthWrite={false} />
        </mesh>
      )}
      <CameraRig
        focus={focus}
        home={VIEWS.iso}
        resetKey={resetKey}
        commandRef={commandRef}
        minDistance={3.4}
        maxDistance={20}
        enableZoom={fullscreen}
      />
    </>
  );
}

export default function AutoLab() {
  const [viewRef, inView] = useInView({ rootMargin: '240px 0px' });
  const explodeRef = useRef(0);
  const targetRef = useRef(0);
  const wheelSpinRef = useRef(2.4);
  const commandRef = useRef(null);
  const viewerEl = useRef(null);

  const [explode, setExplode] = useState(0);
  const [selected, setSelected] = useState(null);
  const [showLabels, setShowLabels] = useState(false);
  const [lightsOn, setLightsOn] = useState(true);
  const [resetKey, setResetKey] = useState(0);
  const [view, setView] = useState('iso');
  const [focus, setFocus] = useState(null);
  const [isFull, toggleFull, canFull] = useFullscreen(viewerEl);
  const { bind, guard } = useDragGuard();

  useEffect(() => {
    targetRef.current = explode;
  }, [explode]);

  const component = useMemo(
    () => CAR_COMPONENTS.find((c) => c.id === selected) ?? null,
    [selected]
  );

  /** Selecting a part frames it, and opens the assembly enough to see it. */
  const select = useCallback((id) => {
    setSelected((cur) => {
      const next = cur === id ? null : id;
      const def = CAR_COMPONENTS.find((c) => c.id === next);
      setFocus(def ? { ...def.focus, target: def.focus.target ?? [0, 0.15, 0] } : null);
      if (next) setExplode((e) => (e < 0.45 ? 0.62 : e));
      return next;
    });
  }, []);

  const guardedSelect = useMemo(() => guard(select), [guard, select]);

  const applyView = useCallback((name) => {
    setView(name);
    setSelected(null);
    setFocus({ ...VIEWS[name] });
  }, []);

  const reset = useCallback(() => {
    setSelected(null);
    setFocus(null);
    setExplode(0);
    setView('iso');
    setResetKey((k) => k + 1);
  }, []);

  const controls = (
    <ControlPanel
      items={[
        { id: 'left', label: 'Orbit', icon: <Rotate />, onClick: () => commandRef.current?.orbit(-0.45), title: 'Orbit left' },
        { id: 'in', label: 'In', icon: <Plus />, onClick: () => commandRef.current?.dolly(1), title: 'Zoom in' },
        { id: 'out', label: 'Out', icon: <Minus />, onClick: () => commandRef.current?.dolly(-1), title: 'Zoom out' },
        { sep: true },
        { id: 'explode', label: 'Explode', icon: <Explode />, active: explode > 0.9, onClick: () => setExplode(1) },
        { id: 'assemble', label: 'Assemble', icon: <Assemble />, active: explode < 0.02, onClick: () => setExplode(0) },
        { sep: true },
        { id: 'labels', label: 'Labels', icon: <Tag />, active: showLabels, onClick: () => setShowLabels((v) => !v) },
        { id: 'lights', label: 'Ambient', icon: <Bulb />, active: lightsOn, onClick: () => setLightsOn((v) => !v) },
        { id: 'reset', label: 'Reset', icon: <Reset />, onClick: reset },
        ...(canFull
          ? [{ id: 'full', label: isFull ? 'Exit' : 'Full', icon: isFull ? <Shrink /> : <Expand />, onClick: toggleFull, active: isFull }]
          : []),
      ]}
    />
  );

  return (
    <section className="section" id="automotive-lab" ref={viewRef}>
      <div className="wrap">
        <div className="section-head" data-reveal>
          <div>
            <span className="section-head__index">03 — Automotive Lab</span>
            <h2>Nine assemblies, one vehicle.</h2>
          </div>
          <p>
            Orbit it, open it up, and select any assembly to frame it and read what it does.
            The explode control is continuous — stop it anywhere.
          </p>
        </div>

        <div className="lab">
          <div className="stage" {...bind}>
            <LabViewer
              viewerRef={viewerEl}
              readout={[
                <>VIEW <b>{view.toUpperCase()}</b></>,
                <>EXPLODE <b>{Math.round(explode * 100)}%</b></>,
                <>SEL <b>{component ? component.code : '—'}</b></>,
              ]}
              hint="Drag to orbit · click any assembly"
              controls={controls}
            >
              <Stage active={inView} camera={{ position: [7, 3.5, 6], fov: 40 }}>
                <Scene
                  explodeRef={explodeRef}
                  targetRef={targetRef}
                  wheelSpinRef={wheelSpinRef}
                  selected={selected}
                  onSelect={guardedSelect}
                  showLabels={showLabels}
                  focus={focus}
                  resetKey={resetKey}
                  commandRef={commandRef}
                  lightsOn={lightsOn}
                  fullscreen={isFull}
                />
              </Stage>
            </LabViewer>
          </div>

          <div className="lab__side">
            <div className="glass" style={{ padding: '16px 18px', display: 'grid', gap: 12 }}>
              <label className="mono" htmlFor="explode-range" style={{ display: 'block' }}>
                Disassembly — {Math.round(explode * 100)}%
              </label>
              <input
                id="explode-range"
                className="range"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={explode}
                onChange={(e) => setExplode(parseFloat(e.target.value))}
                aria-label="Disassembly amount"
              />
              <div className="modtabs" style={{ margin: 0 }}>
                {Object.keys(VIEWS).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="filter"
                    data-on={view === v && !selected}
                    onClick={() => applyView(v)}
                  >
                    <Camera style={{ width: 13, height: 13, marginRight: 6, verticalAlign: '-2px' }} />
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <Stepper items={CAR_COMPONENTS} selected={selected} onSelect={select} />
            <InfoPanel
              component={component}
              empty="Select an assembly — from the list or by clicking it in the viewer — to frame it and read its function."
            />
          </div>
        </div>
      </div>
    </section>
  );
}
