import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer, AdaptiveDpr, AdaptiveEvents, Preload } from '@react-three/drei';
import * as THREE from 'three';
import { hasWebGL, perfTier, dprRange } from '../hooks/useEnv';

/* -----------------------------------------------------------------------------
 * Stage — the one place a <Canvas> is configured.
 *
 * Every scene on the page mounts through here so that the performance policy
 * (DPR ceiling, shadow budget, tone mapping, frameloop gating) is decided once
 * rather than drifting between sections.
 *
 * `active` is the visibility gate: when a section scrolls out of view its
 * frameloop is set to 'never', so an off-screen canvas costs nothing per frame
 * while still keeping its WebGL context and compiled shaders warm.
 * -------------------------------------------------------------------------- */

/**
 * Reflection environment built from emissive planes inside the scene, rendered
 * once to a small cube target. This is what makes the metals read as metal —
 * without it, MeshStandardMaterial at high metalness renders nearly black.
 *
 * Deliberately not an HDRI preset: drei's presets fetch several MB from a CDN,
 * which would be the single largest asset on a site that otherwise ships no
 * binary models at all.
 */
function StudioEnv({ tier }) {
  return (
    <Environment resolution={tier >= 2 ? 256 : 128} frames={1}>
      {/* key light — cool, high and forward */}
      <Lightformer form="rect" intensity={3.2} color="#dff2ff" position={[0, 6, 6]} scale={[12, 6, 1]} rotation={[-0.4, 0, 0]} />
      {/* rim — warm, low and behind, to separate silhouettes from the ground */}
      <Lightformer form="rect" intensity={1.9} color="#ffbb77" position={[-7, 2, -6]} scale={[9, 5, 1]} rotation={[0, -Math.PI / 3, 0]} />
      {/* fill — accent-tinted, camera left */}
      <Lightformer form="rect" intensity={1.5} color="#7c8cff" position={[7, 1, 3]} scale={[7, 5, 1]} rotation={[0, Math.PI / 4, 0]} />
      {/* overhead strip — gives long specular streaks along cylindrical parts */}
      <Lightformer form="rect" intensity={1.35} color="#e8f2ff" position={[0, 9, 0]} scale={[2, 14, 1]} rotation={[Math.PI / 2, 0, 0]} />
      {/* ground bounce */}
      <Lightformer form="rect" intensity={0.7} color="#38506e" position={[0, -6, 0]} scale={[14, 14, 1]} rotation={[-Math.PI / 2, 0, 0]} />
    </Environment>
  );
}

/** Direct lights on top of the environment: shape, contact and accent. */
function Lights({ tier }) {
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[5, 8, 6]}
        intensity={2.1}
        color="#eaf4ff"
        castShadow={tier >= 2}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
      >
        <orthographicCamera attach="shadow-camera" args={[-9, 9, 9, -9, 0.1, 34]} />
      </directionalLight>
      <directionalLight position={[-6, 3, -5]} intensity={0.9} color="#7c8cff" />
      <pointLight position={[0, -3, 4]} intensity={12} distance={16} decay={2} color="#56dcff" />
    </>
  );
}

export default function Stage({
  children,
  active = true,
  camera = { position: [0, 1.4, 11], fov: 42 },
  className = '',
  style,
  shadows = true,
  fallback = null,
  onCreated,
  ...rest
}) {
  const tier = perfTier();
  const dpr = useMemo(() => dprRange(tier), [tier]);
  const webgl = hasWebGL();

  // No WebGL at all (old browser, blocked context, headless): show the caller's
  // static fallback rather than an empty black box.
  if (!webgl) {
    return (
      fallback ?? (
        <div className="stage__fallback">
          <strong>3D view unavailable</strong>
          <span>This browser does not expose WebGL. All content remains readable below.</span>
        </div>
      )
    );
  }

  return (
    <Canvas
      className={className}
      style={style}
      // Off-screen canvases stop rendering entirely rather than unmounting,
      // which avoids a context re-create (and shader recompile) on scroll-back.
      frameloop={active ? 'always' : 'never'}
      dpr={dpr}
      shadows={shadows && tier >= 2}
      camera={camera}
      gl={{
        antialias: tier >= 1,
        alpha: true,
        powerPreference: 'high-performance',
        // The default is true; turning it off lets the driver skip a copy.
        preserveDrawingBuffer: false,
        stencil: false,
      }}
      onCreated={(state) => {
        state.gl.toneMapping = THREE.ACESFilmicToneMapping;
        state.gl.toneMappingExposure = 1.05;
        onCreated?.(state);
      }}
      {...rest}
    >
      <Suspense fallback={null}>
        <Lights tier={tier} />
        <StudioEnv tier={tier} />
        {children}
        <Preload all />
      </Suspense>
      {/* Drops resolution while the camera is moving, restores it when still. */}
      <AdaptiveDpr pixelated={false} />
      <AdaptiveEvents />
    </Canvas>
  );
}
