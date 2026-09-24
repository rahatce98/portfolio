import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { STATE_COLOR } from './JarvisCore';

/* -----------------------------------------------------------------------------
 * J.A.R.V.I.S. AI core — WebGL.
 *
 * A wireframe globe inside a point shell, wrapped in mechanical rings that
 * counter-rotate like an arc reactor: segmented bands, a toothed gear ring,
 * tick scales and orbiting satellites. On mount every part flies in from an
 * exploded position and locks together ("assembly"); state changes spin the
 * rings up and re-tint everything. Voice level swells the core.
 *
 * Plain WebGL1-compatible materials only — runs in Chrome, Edge, Firefox and
 * Safari. The caller falls back to the 2D canvas core when WebGL is missing.
 * -------------------------------------------------------------------------- */

const MOTION = { idle: 0.35, listening: 0.9, thinking: 2.2, searching: 1.6, executing: 2.6, speaking: 1.1, success: 0.7, error: 0.5 };
const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 4);

function useTint(state) {
  const col = useRef(new THREE.Color(...STATE_COLOR.idle.map((v) => v / 255)));
  const target = useMemo(() => new THREE.Color(...(STATE_COLOR[state] || STATE_COLOR.idle).map((v) => v / 255)), [state]);
  return { col, target };
}

/* Fibonacci point shell */
function Shell({ col, level }) {
  const ref = useRef();
  const geo = useMemo(() => {
    const N = 1600;
    const p = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = i * 2.399963;
      p.set([Math.cos(th) * r * 1.18, y * 1.18, Math.sin(th) * r * 1.18], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    return g;
  }, []);
  useFrame((_, dt) => {
    ref.current.rotation.y -= dt * 0.05;
    ref.current.material.color.copy(col.current);
    const s = 1 + (level.current || 0) * 0.08;
    ref.current.scale.setScalar(s);
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial size={0.018} transparent opacity={0.75} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  );
}

/* Wireframe globe + glowing heart */
function Globe({ col, level, speed }) {
  const g = useRef();
  const heart = useRef();
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.92, 3)), []);
  const lat = useMemo(() => {
    const pts = [];
    for (let k = -3; k <= 3; k++) {
      const y = (k / 4) * 0.92;
      const r = Math.sqrt(0.92 * 0.92 - y * y);
      for (let i = 0; i < 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        const b = ((i + 1) / 96) * Math.PI * 2;
        pts.push(Math.cos(a) * r, y, Math.sin(a) * r, Math.cos(b) * r, y, Math.sin(b) * r);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return geo;
  }, []);
  useFrame((st, dt) => {
    g.current.rotation.y += dt * 0.18 * speed.current;
    g.current.rotation.x = Math.sin(st.clock.elapsedTime * 0.2) * 0.12;
    g.current.children.forEach((c) => c.material?.color?.copy(col.current));
    const l = level.current || 0;
    heart.current.scale.setScalar(0.34 + l * 0.18 + Math.sin(st.clock.elapsedTime * 3) * 0.015 * speed.current);
    heart.current.material.color.copy(col.current).multiplyScalar(1.6 + l * 2);
  });
  return (
    <group ref={g}>
      <lineSegments geometry={edges}>
        <lineBasicMaterial transparent opacity={0.28} depthWrite={false} blending={THREE.AdditiveBlending} />
      </lineSegments>
      <lineSegments geometry={lat}>
        <lineBasicMaterial transparent opacity={0.18} depthWrite={false} blending={THREE.AdditiveBlending} />
      </lineSegments>
      <mesh ref={heart}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* One mechanical ring: dashes, ticks or gear teeth around a circle. */
function Ring({ radius, count, size, gap = 0, tilt = [0, 0, 0], spin = 0.2, kind = 'dash', col, speed, born, from, opacity = 0.9 }) {
  const grp = useRef();
  const inst = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    let k = 0;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      // gaps make it look machined: skip a run of segments every so often
      if (gap && i % gap === 0) continue;
      dummy.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
      dummy.rotation.set(0, -a, 0);
      const h = kind === 'tick' ? (i % 5 === 0 ? size[1] * 2.2 : size[1]) : size[1];
      dummy.scale.set(size[0], kind === 'gear' ? size[1] : h, size[2]);
      dummy.updateMatrix();
      inst.current.setMatrixAt(k++, dummy.matrix);
    }
    inst.current.count = k;
    inst.current.instanceMatrix.needsUpdate = true;
  }, [count, radius, size, gap, kind, dummy]);
  useFrame((st, dt) => {
    const t = ease((st.clock.elapsedTime - born) / 1.8);
    // assembly: fly in from an exploded pose and lock
    grp.current.position.set(from[0] * (1 - t), from[1] * (1 - t), from[2] * (1 - t));
    grp.current.scale.setScalar(0.4 + 0.6 * t);
    grp.current.children[0].rotation.y += dt * spin * speed.current * (1 + (1 - t) * 6);
    inst.current.material.color.copy(col.current);
    inst.current.material.opacity = opacity * t;
  });
  return (
    <group ref={grp} rotation={tilt}>
      <group>
        <instancedMesh ref={inst} args={[null, null, count]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </instancedMesh>
      </group>
    </group>
  );
}

/* Thin continuous circle / ellipse line */
function Orbit({ rx, rz, tilt, col, speed, sat = true, born, dir = 1 }) {
  const grp = useRef();
  const satRef = useRef();
  const geo = useMemo(() => {
    const p = [];
    for (let i = 0; i <= 160; i++) {
      const a = (i / 160) * Math.PI * 2;
      p.push(Math.cos(a) * rx, 0, Math.sin(a) * rz);
    }
    return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  }, [rx, rz]);
  useFrame((st) => {
    const t = ease((st.clock.elapsedTime - born) / 2.2);
    grp.current.children[0].material.color.copy(col.current);
    grp.current.children[0].material.opacity = 0.35 * t;
    grp.current.scale.setScalar(0.6 + 0.4 * t);
    if (satRef.current) {
      const a = st.clock.elapsedTime * 0.6 * speed.current * dir;
      satRef.current.position.set(Math.cos(a) * rx, 0, Math.sin(a) * rz);
      satRef.current.material.color.copy(col.current).multiplyScalar(2);
    }
  });
  return (
    <group ref={grp} rotation={tilt}>
      <line geometry={geo}>
        <lineBasicMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </line>
      {sat && (
        <mesh ref={satRef}>
          <sphereGeometry args={[0.035, 12, 12]} />
          <meshBasicMaterial toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/* Base "hologram emitter": concentric pulsing discs under the core */
function Emitter({ col, speed }) {
  const g = useRef();
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    g.current.children.forEach((m, i) => {
      const k = (t * 0.35 * speed.current + i / 4) % 1;
      m.scale.setScalar(0.6 + k * 1.6);
      m.material.opacity = (1 - k) * 0.35;
      m.material.color.copy(col.current);
    });
  });
  return (
    <group ref={g} position={[0, -1.72, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i}>
          <ringGeometry args={[0.98, 1, 96]} />
          <meshBasicMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function Scene({ state, level, reduce }) {
  const { col, target } = useTint(state);
  const speed = useRef(MOTION.idle);
  const rig = useRef();
  const [born] = useState(() => performance.now() / 1000);
  const b0 = useRef(null);
  useFrame((st, dt) => {
    if (b0.current == null) b0.current = st.clock.elapsedTime;
    col.current.lerp(target, Math.min(1, dt * 3));
    const want = (MOTION[state] || 0.4) * (reduce ? 0.25 : 1);
    speed.current += (want - speed.current) * Math.min(1, dt * 2.5);
    // slow cinematic drift + a little pointer parallax
    rig.current.rotation.y = Math.sin(st.clock.elapsedTime * 0.15) * 0.25 + st.pointer.x * 0.25;
    rig.current.rotation.x = 0.18 + st.pointer.y * -0.12;
  });
  const t0 = 0.15; // relative to clock start; parts arrive in a cascade
  void born;
  const RINGS = [
    { radius: 1.42, count: 96, size: [0.07, 0.012, 0.03], gap: 12, tilt: [Math.PI / 2.2, 0, 0], spin: 0.35, from: [0, 2.5, 0], delay: 0.0 },
    { radius: 1.58, count: 180, size: [0.01, 0.05, 0.01], kind: 'tick', tilt: [Math.PI / 2.2, 0, 0], spin: -0.12, from: [0, -2.5, 0], delay: 0.15, opacity: 0.7 },
    { radius: 1.72, count: 48, size: [0.1, 0.06, 0.05], kind: 'gear', gap: 8, tilt: [Math.PI / 2.6, 0.3, 0.2], spin: -0.28, from: [2.8, 0, 0], delay: 0.3 },
    { radius: 1.3, count: 64, size: [0.09, 0.01, 0.02], gap: 6, tilt: [0.4, 0, Math.PI / 2.4], spin: 0.5, from: [-2.8, 0, 0], delay: 0.45 },
    { radius: 1.9, count: 140, size: [0.03, 0.008, 0.012], gap: 20, tilt: [Math.PI / 1.9, -0.4, 0], spin: 0.08, from: [0, 0, 3], delay: 0.6, opacity: 0.55 },
  ];
  return (
    <group ref={rig}>
      <Globe col={col} level={level} speed={speed} />
      <Shell col={col} level={level} />
      {RINGS.map((r, i) => (
        <Ring key={i} {...r} col={col} speed={speed} born={t0 + r.delay} />
      ))}
      <Orbit rx={2.25} rz={1.1} tilt={[0.35, 0, 0.25]} col={col} speed={speed} born={t0 + 0.8} />
      <Orbit rx={2.05} rz={2.05} tilt={[1.25, 0.2, -0.3]} col={col} speed={speed} born={t0 + 1} dir={-1} />
      <Orbit rx={2.6} rz={0.9} tilt={[-0.25, 0.5, -0.15]} col={col} speed={speed} born={t0 + 1.2} />
      <Emitter col={col} speed={speed} />
    </group>
  );
}

export default function Core3D({ state = 'idle', level, className = '' }) {
  const wrap = useRef(null);
  const [visible, setVisible] = useState(true);
  const reduce = typeof matchMedia !== 'undefined' && (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.getAttribute('data-motion') === 'reduce');
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    if (wrap.current) io.observe(wrap.current);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={wrap} className={`core3d ${className}`} aria-hidden="true">
      <Canvas frameloop={visible ? 'always' : 'never'} dpr={[1, 1.75]} camera={{ position: [0, 0.2, 5.6], fov: 42 }} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}>
        <Scene state={state} level={level || { current: 0 }} reduce={reduce} />
        <EffectComposer multisampling={0}>
          <Bloom intensity={1.15} luminanceThreshold={0.08} luminanceSmoothing={0.35} mipmapBlur />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
