import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import Stage from '../three/Stage';
import Rocket from '../three/Rocket';
import { Dust, GridFloor } from '../three/Atmosphere';
import { perfTier, prefersReducedMotion } from '../hooks/useEnv';

/* -----------------------------------------------------------------------------
 * The hero's 3D content, split into its own module so it can be code-split.
 *
 * App renders the hero copy immediately and streams this chunk (three.js + the
 * scene) in behind it, which is what keeps first paint independent of the
 * WebGL stack.
 * -------------------------------------------------------------------------- */

function Director({ progressRef, throttleRef, ignitedRef, boostRef, boostOnRef, liftRef, rocketRef }) {
  const { camera, pointer } = useThree();
  const reduced = prefersReducedMotion();
  const base = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, dt) => {
    const p = progressRef.current; // 0 → 1 across the hero's travel
    const k = 1 - Math.pow(0.005, Math.min(dt, 0.05));

    // Wide and low at rest; closes in and rises as the section scrolls away.
    const radius = THREE.MathUtils.lerp(15.5, 9.6, p);
    const height = THREE.MathUtils.lerp(0.6, 3.4, p);
    const sway = reduced ? 0 : pointer.x * 0.28;
    const rise = reduced ? 0 : -pointer.y * 0.5;

    base.set(Math.sin(0.42 + sway) * radius, height + rise, Math.cos(0.42 + sway) * radius);
    camera.position.lerp(base, k * 0.55);

    // On the two-column layout the copy owns the left half, so the camera aims
    // left of the vehicle and the vehicle lands in the empty right column.
    // Below that breakpoint the layout stacks and the vehicle re-centres.
    const wide = state.size.width > 940;
    const offX = wide ? THREE.MathUtils.lerp(-2.9, -1.2, p) : 0;
    // Stacked layout: the copy runs down the top of a very tall canvas, so aim
    // higher and the vehicle drops into the empty space beneath it.
    const offY = wide
      ? THREE.MathUtils.lerp(0.2, 1.5, p)
      : THREE.MathUtils.lerp(2.7, 3.6, p);
    look.set(offX, offY, 0);
    camera.lookAt(look);

    // Throttle spools with scroll, or latches full when ignition is on.
    const wanted = ignitedRef.current ? 1 : THREE.MathUtils.clamp((p - 0.2) * 2.1, 0, 1);
    throttleRef.current = THREE.MathUtils.lerp(throttleRef.current, wanted, k * 0.5);
    // Super-heavy mode spools up over ~1 s and bleeds off more slowly.
    const bw = boostOnRef.current ? 1 : 0;
    boostRef.current = THREE.MathUtils.lerp(boostRef.current, bw, k * (bw ? 0.35 : 0.2));
    if (boostRef.current > 0.02 && !reduced) {
      const tt = state.clock.elapsedTime;
      camera.position.x += Math.sin(tt * 61) * 0.03 * boostRef.current;
      camera.position.y += Math.sin(tt * 47.5) * 0.03 * boostRef.current;
    }

    // The vehicle climbs once there is meaningful thrust.
    liftRef.current = THREE.MathUtils.lerp(
      liftRef.current,
      Math.max(0, throttleRef.current - 0.4) * 2.2 + boostRef.current * 1.6,
      k * 0.3
    );
    if (rocketRef.current) rocketRef.current.position.y = liftRef.current;
  });

  return null;
}

function Scene({ progressRef, ignitedRef, boostOnRef, spin, tick, onIgnite }) {
  const throttle = useRef(0);
  const boost = useRef(0);
  const lift = useRef(0);
  const explode = useRef(0);
  const rocketRef = useRef();
  const tier = perfTier();

  return (
    <>
      <Director
        progressRef={progressRef}
        throttleRef={throttle}
        ignitedRef={ignitedRef}
        boostRef={boost}
        boostOnRef={boostOnRef}
        liftRef={lift}
        rocketRef={rocketRef}
      />
      <group ref={rocketRef}>
        <Rocket
          explodeRef={explode}
          throttleRef={throttle}
          boostRef={boost}
          spinRef={spin}
          onTick={tick}
          selected={null}
          onSelect={onIgnite}
          autoSpin
        />
      </group>

      {tier >= 1 && <Dust count={tier >= 2 ? 220 : 110} spread={18} />}
      <GridFloor y={-3.6} size={44} />
    </>
  );
}

export default function HeroCanvas({ active, progressRef, ignitedRef, boostOnRef, spin, tick, onIgnite, onReady }) {
  return (
    <Stage
      active={active}
      camera={{ position: [5, 1, 13], fov: 42 }}
      shadows={false}
      onCreated={() => onReady?.()}
    >
      <Scene
        progressRef={progressRef}
        ignitedRef={ignitedRef}
        boostOnRef={boostOnRef}
        spin={spin}
        tick={tick}
        onIgnite={onIgnite}
      />
    </Stage>
  );
}
