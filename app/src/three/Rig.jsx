import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

/* -----------------------------------------------------------------------------
 * Camera rig.
 *
 * Combines free orbiting with scripted moves. When a component is selected the
 * rig eases the camera to that component's framing; the moment the user touches
 * the controls the scripted move is abandoned, so the camera never fights the
 * pointer. This is the whole reason the controls are not left to drei alone.
 * -------------------------------------------------------------------------- */

const EASE = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Spherical (radius, phi, theta) around a target → world position. */
function sphericalTo(out, target, radius, phi, theta) {
  out.set(
    target[0] + radius * Math.sin(phi) * Math.sin(theta),
    target[1] + radius * Math.cos(phi),
    target[2] + radius * Math.sin(phi) * Math.cos(theta)
  );
  return out;
}

export default function CameraRig({
  focus,
  home = { radius: 11, phi: 1.32, theta: 0.5, target: [0, 0, 0] },
  resetKey = 0,
  commandRef,
  autoRotate = false,
  autoRotateSpeed = 0.45,
  minDistance = 3.2,
  maxDistance = 26,
  enablePan = false,
  // Wheel zoom is off by default: inside a page-embedded viewer it would trap
  // the page scroll. The control panel exposes explicit zoom instead, and the
  // labs switch this on in fullscreen where there is no page to scroll.
  enableZoom = false,
  duration = 1.05,
}) {
  const controls = useRef();
  const { camera } = useThree();

  const anim = useRef({ active: false, t: 0, dur: duration });
  const fromPos = useMemo(() => new THREE.Vector3(), []);
  const toPos = useMemo(() => new THREE.Vector3(), []);
  const fromTgt = useMemo(() => new THREE.Vector3(), []);
  const toTgt = useMemo(() => new THREE.Vector3(), []);
  const scratch = useMemo(() => new THREE.Vector3(), []);

  /** Begin a scripted move to a spherical framing. */
  const flyTo = useMemo(
    () => (spec, dur = duration) => {
      const c = controls.current;
      if (!c) return;
      const target = spec.target ?? [0, 0, 0];
      fromPos.copy(camera.position);
      fromTgt.copy(c.target);
      sphericalTo(toPos, target, spec.radius, spec.phi, spec.theta);
      toTgt.set(target[0], target[1], target[2]);
      anim.current.active = true;
      anim.current.t = 0;
      anim.current.dur = dur;
    },
    [camera, duration, fromPos, fromTgt, toPos, toTgt]
  );

  /* --- imperative commands used by the on-screen control panel ------------ */
  useEffect(() => {
    if (!commandRef) return;
    commandRef.current = {
      /** step is >0 to move closer, <0 to pull back */
      dolly(step) {
        const c = controls.current;
        if (!c) return;
        anim.current.active = false;
        scratch.copy(camera.position).sub(c.target);
        const d = THREE.MathUtils.clamp(scratch.length() * (1 - step * 0.22), minDistance, maxDistance);
        scratch.setLength(d);
        camera.position.copy(c.target).add(scratch);
        c.update();
      },
      /** nudge the orbit angle without touching distance */
      orbit(dTheta, dPhi = 0) {
        const c = controls.current;
        if (!c) return;
        anim.current.active = false;
        scratch.copy(camera.position).sub(c.target);
        const s = new THREE.Spherical().setFromVector3(scratch);
        s.theta += dTheta;
        s.phi = THREE.MathUtils.clamp(s.phi + dPhi, 0.2, Math.PI - 0.2);
        scratch.setFromSpherical(s);
        camera.position.copy(c.target).add(scratch);
        c.update();
      },
      flyTo,
      home: () => flyTo(home, 0.85),
    };
  }, [camera, commandRef, flyTo, home, maxDistance, minDistance, scratch]);

  /* --- react to a new focus / reset --------------------------------------- */
  useEffect(() => {
    if (focus) flyTo(focus);
  }, [focus, flyTo]);

  useEffect(() => {
    if (resetKey) flyTo(home, 0.85);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const a = anim.current;
    if (a.active) {
      a.t = Math.min(1, a.t + dt / a.dur);
      const k = EASE(a.t);
      camera.position.lerpVectors(fromPos, toPos, k);
      c.target.lerpVectors(fromTgt, toTgt, k);
      if (a.t >= 1) a.active = false;
    }
    c.update();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={enablePan}
      enableZoom={enableZoom}
      enableDamping
      dampingFactor={0.075}
      rotateSpeed={0.62}
      zoomSpeed={0.7}
      minDistance={minDistance}
      maxDistance={maxDistance}
      minPolarAngle={0.18}
      maxPolarAngle={Math.PI - 0.18}
      autoRotate={autoRotate}
      autoRotateSpeed={autoRotateSpeed}
      // Any manual input cancels a scripted move so the two never fight.
      onStart={() => {
        anim.current.active = false;
      }}
      target={home.target}
    />
  );
}
