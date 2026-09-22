import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import Stage from '../three/Stage';
import Rocket from '../three/Rocket';
import CameraRig from '../three/Rig';
import { GridFloor, Dust } from '../three/Atmosphere';
import LabViewer, { useFullscreen } from '../components/LabViewer';
import ControlPanel from '../components/ControlPanel';
import InfoPanel, { Stepper } from '../components/InfoPanel';
import { ROCKET_COMPONENTS } from '../data/assemblies';
import { useSectionProgress, useInView } from '../hooks/useScroll';
import useDragGuard from '../hooks/useDragGuard';
import { perfTier } from '../hooks/useEnv';
import { Tag, Reset, Plus, Minus, Explode, Assemble, Expand, Shrink, Bulb, Rotate } from '../components/Icons';

/* -----------------------------------------------------------------------------
 * LAB-01 — Launch Vehicle
 *
 * A tall scroll track runs behind a sticky viewer. Scroll position maps to the
 * disassembly sequence, and clicking a step scrolls the page to that step's
 * position — so the two input methods stay in sync instead of competing.
 * -------------------------------------------------------------------------- */

const N = ROCKET_COMPONENTS.length;
/** Viewport heights of scroll travel per component. */
const STEP_VH = 68;

/** Bridges scroll progress into the scene without re-rendering React. */
function SequenceDriver({ progressRef, explodeRef, overrideRef, onStage }) {
  const stage = useRef(-1);

  useFrame((_, dt) => {
    const p = progressRef.current;
    // The first ~14% of the track is the approach; disassembly runs after it.
    const seq = THREE.MathUtils.clamp((p - 0.14) / 0.76, 0, 1);

    const ov = overrideRef.current;
    const wanted = ov === null ? THREE.MathUtils.smoothstep(seq, 0, 0.22) : ov;
    explodeRef.current = THREE.MathUtils.lerp(explodeRef.current, wanted, 1 - Math.pow(0.004, dt));

    const idx = THREE.MathUtils.clamp(Math.floor(seq * N), 0, N - 1);
    if (idx !== stage.current) {
      stage.current = idx;
      onStage(idx);
    }
  });

  return null;
}

function Scene({ progressRef, explodeRef, overrideRef, selected, onSelect, onStage, showLabels, focus, resetKey, commandRef, lightsOn, fullscreen }) {
  const throttle = useRef(0);
  const tier = perfTier();

  return (
    <>
      <SequenceDriver
        progressRef={progressRef}
        explodeRef={explodeRef}
        overrideRef={overrideRef}
        onStage={onStage}
      />
      <Rocket
        explodeRef={explodeRef}
        throttleRef={throttle}
        selected={selected}
        onSelect={onSelect}
        showLabels={showLabels}
        autoSpin={false}
      />
      {lightsOn && tier >= 1 && <Dust count={tier >= 2 ? 150 : 70} spread={14} />}
      {lightsOn && <GridFloor y={-4.6} size={38} />}
      <CameraRig
        focus={focus}
        home={{ radius: 11.5, phi: 1.35, theta: 0.55, target: [0, 0.2, 0] }}
        resetKey={resetKey}
        commandRef={commandRef}
        minDistance={4}
        maxDistance={22}
        enableZoom={fullscreen}
      />
    </>
  );
}

export default function RocketLab() {
  const [trackRef, progressRef] = useSectionProgress();
  const [viewRef, inView] = useInView({ rootMargin: '260px 0px' });
  const explodeRef = useRef(0);
  const overrideRef = useRef(null);
  const commandRef = useRef(null);
  const viewerEl = useRef(null);

  const [stage, setStage] = useState(0);
  const [selected, setSelected] = useState(ROCKET_COMPONENTS[0].id);
  const [showLabels, setShowLabels] = useState(false);
  const [lightsOn, setLightsOn] = useState(true);
  const [override, setOverride] = useState(null);
  const [resetKey, setResetKey] = useState(0);
  const [isFull, toggleFull, canFull] = useFullscreen(viewerEl);
  const { bind, moved } = useDragGuard();

  const component = useMemo(
    () => ROCKET_COMPONENTS.find((c) => c.id === selected) ?? null,
    [selected]
  );

  // Scroll advances the stage; the stage selects the component.
  const onStage = useCallback((idx) => {
    setStage(idx);
    setSelected(ROCKET_COMPONENTS[idx].id);
  }, []);

  useEffect(() => {
    overrideRef.current = override;
  }, [override]);

  const setRefs = useCallback(
    (node) => {
      trackRef.current = node;
      viewRef.current = node;
    },
    [trackRef, viewRef]
  );

  /** Clicking a step scrolls the track to that step, keeping scroll canonical. */
  const goToStage = useCallback(
    (id) => {
      if (moved.current > 6) return;
      const idx = ROCKET_COMPONENTS.findIndex((c) => c.id === id);
      if (idx < 0) return;
      const node = trackRef.current;
      if (!node) {
        setSelected(id);
        return;
      }
      const rect = node.getBoundingClientRect();
      const trackTop = rect.top + window.scrollY;
      const span = rect.height + window.innerHeight;
      // Invert the mapping used in SequenceDriver, landing mid-stage.
      const seq = (idx + 0.5) / N;
      const p = seq * 0.76 + 0.14;
      const y = trackTop - window.innerHeight + p * span;
      window.scrollTo({
        top: y,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
    },
    [moved, trackRef]
  );

  const controls = (
    <ControlPanel
      items={[
        { id: 'left', label: 'Rotate', icon: <Rotate />, onClick: () => commandRef.current?.orbit(-0.45), title: 'Orbit left' },
        { id: 'in', label: 'In', icon: <Plus />, onClick: () => commandRef.current?.dolly(1), title: 'Zoom in' },
        { id: 'out', label: 'Out', icon: <Minus />, onClick: () => commandRef.current?.dolly(-1), title: 'Zoom out' },
        { sep: true },
        {
          id: 'explode',
          label: 'Explode',
          icon: <Explode />,
          active: override === 1,
          onClick: () => setOverride((o) => (o === 1 ? null : 1)),
          title: 'Hold the vehicle apart',
        },
        {
          id: 'assemble',
          label: 'Assemble',
          icon: <Assemble />,
          active: override === 0,
          onClick: () => setOverride((o) => (o === 0 ? null : 0)),
          title: 'Hold the vehicle together',
        },
        { sep: true },
        { id: 'labels', label: 'Labels', icon: <Tag />, active: showLabels, onClick: () => setShowLabels((v) => !v) },
        { id: 'lights', label: 'Ambient', icon: <Bulb />, active: lightsOn, onClick: () => setLightsOn((v) => !v) },
        { id: 'reset', label: 'Reset', icon: <Reset />, onClick: () => { setOverride(null); setResetKey((k) => k + 1); } },
        ...(canFull
          ? [{ id: 'full', label: isFull ? 'Exit' : 'Full', icon: isFull ? <Shrink /> : <Expand />, onClick: toggleFull, active: isFull }]
          : []),
      ]}
    />
  );

  return (
    <section className="section" id="rocket-lab">
      <div className="wrap">
        <div className="section-head" data-reveal>
          <div>
            <span className="section-head__index">02 — Rocket Lab</span>
            <h2>Take the vehicle apart.</h2>
          </div>
          <p>
            Scroll to run the disassembly sequence, or pick a section to jump straight to it.
            Drag the model to turn it; every component is a real object you can click.
          </p>
        </div>
      </div>

      {/* Scroll track: one viewport of approach plus STEP_VH per component. */}
      <div
        className="scrolly"
        ref={setRefs}
        style={{ height: `calc(100svh + ${N * STEP_VH}vh)` }}
      >
        <div className="scrolly__sticky">
          <div className="wrap" style={{ height: '100%' }}>
            <div className="scrolly__grid">
              <div className="scrolly__viewer stage" {...bind}>
                <LabViewer
                  viewerRef={viewerEl}
                  height="100%"
                  readout={[
                    <>SEQ <b>{String(stage + 1).padStart(2, '0')}</b> / {String(N).padStart(2, '0')}</>,
                    <>MODE <b>{override === null ? 'SCROLL' : override === 1 ? 'HOLD-APART' : 'HOLD-ASSY'}</b></>,
                  ]}
                  hint="Drag to rotate · click a component · scroll to sequence"
                  controls={controls}
                >
                  <Stage
                    active={inView}
                    camera={{ position: [6, 2, 9], fov: 40 }}
                    shadows={false}
                  >
                    <Scene
                      progressRef={progressRef}
                      explodeRef={explodeRef}
                      overrideRef={overrideRef}
                      selected={selected}
                      onSelect={goToStage}
                      onStage={onStage}
                      showLabels={showLabels}
                      focus={component?.focus}
                      resetKey={resetKey}
                      commandRef={commandRef}
                      lightsOn={lightsOn}
                      fullscreen={isFull}
                    />
                  </Stage>
                </LabViewer>
              </div>

              <div className="scrolly__side">
                <div className="scrolly__progress" aria-hidden="true">
                  {ROCKET_COMPONENTS.map((c, i) => (
                    <span className="scrolly__tick" key={c.id} data-done={i <= stage}>
                      <i />
                    </span>
                  ))}
                </div>
                <Stepper items={ROCKET_COMPONENTS} selected={selected} onSelect={goToStage} />
                <InfoPanel component={component} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
