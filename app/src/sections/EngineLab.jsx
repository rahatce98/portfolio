import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, DepthOfField, Vignette, ChromaticAberration } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import Stage from '../three/Stage';
import { perfTier } from '../hooks/useEnv';

/* -----------------------------------------------------------------------------
 * LAB-06 — Turbofan: a cinematic, scroll-scrubbed product film.
 *
 * One continuous timeline p ∈ [0,1], damped toward the scroll position so the
 * scrub has weight (the GSAP "scrub: 1" feel). Every visual is a function of
 * that same p, so transitions are physically linked rather than stacked:
 *
 *   blueprint  0.00–0.14  wireframe only, slow orbit
 *   materialize 0.14–0.32 a scan plane sweeps nose → nozzle; behind it the
 *                         part is solid PBR, ahead of it still wireframe
 *   explode    0.32–0.54  modules slide apart along the shaft, staggered
 *   fly-through 0.54–0.72 camera enters the intake and travels the core,
 *                         airflow particles stream past
 *   reassemble 0.72–0.88  modules return with a spring overshoot
 *   hero       0.88–1.00  pull-out to a three-quarter hero, exhaust glow
 *
 * Drag anywhere to spin the engine 360° (inertia, independent of scroll).
 * Bloom, depth of field, vignette and a touch of chromatic aberration run on
 * capable GPUs; lower tiers skip the composer.
 * -------------------------------------------------------------------------- */

const CHAPTERS = [
  { at: 0.0, t: 'Blueprint', d: 'Every part starts as geometry — a 3D wireframe of a high-bypass turbofan.' },
  { at: 0.14, t: 'Materialize', d: 'A scan plane sweeps the shaft. Behind it: titanium, carbon and ceramic.' },
  { at: 0.32, t: 'Exploded view', d: 'Fan, compressor, combustor, turbine and nozzle slide apart on the shaft.' },
  { at: 0.54, t: 'Fly-through', d: 'Into the intake. Air is compressed, burned and expanded through the core.' },
  { at: 0.72, t: 'Reassembly', d: 'Modules seat back onto the shaft — tolerances in microns.' },
  { at: 0.88, t: 'Ignition', d: 'Spool up. Drag to turn it; pick a finish below.' },
];

const FINISHES = {
  titanium: { label: 'Titanium', color: '#b9c2cc', metal: 1, rough: 0.28, cc: 0 },
  carbon: { label: 'Carbon', color: '#1c2026', metal: 0.4, rough: 0.35, cc: 1 },
  gold: { label: 'Gold leaf', color: '#d9a441', metal: 1, rough: 0.22, cc: 0 },
  cobalt: { label: 'Anodized', color: '#3552c9', metal: 0.9, rough: 0.3, cc: 0.6 },
};

const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const seg = (p, a, b) => ease((p - a) / (b - a));
const springOut = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.cos(t * Math.PI * 2.4) * Math.exp(-5 * t));

/* ------------------------------------------------------------ geometry --- */

function lathe(points, seg = 64) {
  const g = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  g.rotateZ(-Math.PI / 2); // lathe axis Y → engine axis X
  return g;
}

/** A part rendered twice: solid behind the scan plane, wireframe ahead of it. */
function Dual({ geometry, solid, wire, children, ...rest }) {
  return (
    <group {...rest}>
      <mesh geometry={geometry} material={solid} castShadow receiveShadow />
      <mesh geometry={geometry} material={wire} />
      {children}
    </group>
  );
}

/** Ring of blades as one InstancedMesh (solid + wire). */
function BladeRing({ count, r0, r1, chord, twist, solid, wire, spinRef, dir = 1 }) {
  const geo = useMemo(() => {
    const g = new THREE.BoxGeometry(chord * 0.18, r1 - r0, chord, 1, 6, 1);
    g.translate(0, (r0 + r1) / 2, 0);
    // twist along span so blades read as airfoils
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const k = ((y - r0) / (r1 - r0)) * twist;
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setX(i, x * Math.cos(k) - z * Math.sin(k));
      pos.setZ(i, x * Math.sin(k) + z * Math.cos(k));
    }
    g.computeVertexNormals();
    g.rotateZ(-Math.PI / 2);
    return g;
  }, [r0, r1, chord, twist]);
  const s = useRef(), w = useRef(), grp = useRef();
  useEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < count; i++) {
      e.set((i / count) * Math.PI * 2, 0, 0.35);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(), q, new THREE.Vector3(1, 1, 1));
      s.current.setMatrixAt(i, m);
      w.current.setMatrixAt(i, m);
    }
    s.current.instanceMatrix.needsUpdate = w.current.instanceMatrix.needsUpdate = true;
  }, [count]);
  useFrame((_, dt) => {
    if (grp.current && spinRef) grp.current.rotation.x += dt * spinRef.current * dir;
  });
  return (
    <group ref={grp}>
      <instancedMesh ref={s} args={[geo, solid, count]} castShadow />
      <instancedMesh ref={w} args={[geo, wire, count]} />
    </group>
  );
}

/* --------------------------------------------------------------- engine --- */

function Engine({ pRef, finish, thrustRef, dragRef }) {
  const root = useRef();
  const parts = useRef({});
  const scan = useRef();
  const glow = useRef();
  const spin = useRef(0);
  const { gl } = useThree();

  useEffect(() => {
    gl.localClippingEnabled = true;
  }, [gl]);

  // Two clipping planes share one constant: solid keeps x < sweep, wire x > sweep.
  const planes = useMemo(() => ({ solid: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0), wire: new THREE.Plane(new THREE.Vector3(1, 0, 0), 0) }), []);

  const mats = useMemo(() => {
    const f = FINISHES[finish];
    const shell = new THREE.MeshPhysicalMaterial({ color: f.color, metalness: f.metal, roughness: f.rough, clearcoat: f.cc, clearcoatRoughness: 0.15, side: THREE.DoubleSide, clippingPlanes: [planes.solid], envMapIntensity: 1.2 });
    const metal = new THREE.MeshPhysicalMaterial({ color: '#c9d1da', metalness: 1, roughness: 0.2, clippingPlanes: [planes.solid] });
    const dark = new THREE.MeshPhysicalMaterial({ color: '#2a3038', metalness: 0.9, roughness: 0.45, clippingPlanes: [planes.solid] });
    const hot = new THREE.MeshPhysicalMaterial({ color: '#6b4a3a', metalness: 0.8, roughness: 0.35, emissive: '#ff6a1a', emissiveIntensity: 0.2, clippingPlanes: [planes.solid] });
    const blade = new THREE.MeshPhysicalMaterial({ color: '#dfe6ee', metalness: 1, roughness: 0.18, clippingPlanes: [planes.solid] });
    const wire = new THREE.MeshBasicMaterial({ color: '#56dcff', wireframe: true, transparent: true, opacity: 0.35, clippingPlanes: [planes.wire], depthWrite: false });
    return { shell, metal, dark, hot, blade, wire };
  }, [finish, planes]);

  const G = useMemo(() => ({
    spinner: lathe([[0.001, 0.0], [0.18, 0.12], [0.3, 0.34], [0.34, 0.5]], 48),
    nacelle: lathe([[1.24, 0], [1.36, 0.12], [1.38, 0.6], [1.34, 1.6], [1.22, 2.3], [1.15, 2.5]], 96),
    core: lathe([[0.62, 0], [0.72, 0.4], [0.74, 1.6], [0.66, 2.4], [0.58, 2.9]], 72),
    comb: new THREE.CylinderGeometry(0.62, 0.62, 0.55, 64, 1, true).rotateZ(Math.PI / 2),
    shaft: new THREE.CylinderGeometry(0.08, 0.08, 5.2, 24).rotateZ(Math.PI / 2),
    nozzle: lathe([[0.62, 0], [0.6, 0.4], [0.5, 1.0], [0.46, 1.1]], 72),
    plug: lathe([[0.36, 0], [0.3, 0.4], [0.12, 0.85], [0.001, 1.0]], 48),
    hub: new THREE.CylinderGeometry(0.34, 0.34, 0.16, 48).rotateZ(Math.PI / 2),
  }), []);

  // layout along X (assembled) and the explode offset per module
  const LAYOUT = {
    fan: { x: -2.0, ex: -2.1 },
    nacelle: { x: -2.3, ex: -0.4 },
    comp: { x: -1.1, ex: -0.9 },
    comb: { x: 0.35, ex: 0.1 },
    turb: { x: 1.0, ex: 0.95 },
    nozzle: { x: 1.55, ex: 2.1 },
  };

  useFrame((state, dt) => {
    const p = pRef.current;
    const t = state.clock.elapsedTime;

    // scan sweep: nose (-2.6) → tail (2.8) during materialize, then fully solid
    const sweep = p < 0.14 ? -3 : p < 0.32 ? THREE.MathUtils.lerp(-2.6, 2.9, seg(p, 0.14, 0.32)) : 4;
    planes.solid.constant = sweep;
    planes.wire.constant = -sweep;
    mats.wire.opacity = 0.35 * (1 - seg(p, 0.3, 0.36));
    if (scan.current) {
      scan.current.position.x = sweep;
      scan.current.visible = p > 0.13 && p < 0.33;
      scan.current.material.opacity = 0.8 * Math.sin(Math.PI * seg(p, 0.14, 0.32));
    }

    // explode out 0.32–0.54, hold, reassemble with spring 0.72–0.88
    const out = seg(p, 0.32, 0.54);
    const back = springOut((p - 0.72) / 0.16);
    const k = p < 0.72 ? out : 1 - back;
    const keys = Object.keys(LAYOUT);
    keys.forEach((id, i) => {
      const n = parts.current[id];
      if (!n) return;
      const stagger = ease(Math.min(1, Math.max(0, k * 1.25 - i * 0.05)));
      n.position.x = LAYOUT[id].x + LAYOUT[id].ex * stagger * 1.6;
    });
    // nacelle also splits open radially in the explode for a look inside
    if (parts.current.nacelle) parts.current.nacelle.scale.setScalar(1 + 0.18 * k);

    // spool: idle → spool-up in hero; user thrust multiplies
    const spool = 1.2 + 18 * seg(p, 0.86, 1) * thrustRef.current + 4 * seg(p, 0.54, 0.72);
    spin.current = THREE.MathUtils.damp(spin.current, spool, 2, dt);
    thrustRef.spin = spin.current;
    mats.hot.emissiveIntensity = 0.2 + 3.2 * seg(p, 0.88, 1) * thrustRef.current + 0.8 * seg(p, 0.6, 0.7);
    if (glow.current) glow.current.material.opacity = 0.9 * seg(p, 0.88, 1) * thrustRef.current;

    // drag-to-spin with inertia
    const d = dragRef.current;
    d.v *= Math.pow(0.04, dt);
    if (!d.down) d.yaw += d.v * dt;
    root.current.rotation.y = d.yaw + (p < 0.14 ? t * 0.08 : 0);
  });

  const spinRef = useRef(0);
  useFrame(() => {
    spinRef.current = thrustRef.spin || 0;
  });

  return (
    <group ref={root}>
      <group ref={(n) => (parts.current.fan = n)}>
        <Dual geometry={G.spinner} solid={mats.metal} wire={mats.wire} position={[-0.5, 0, 0]} />
        <Dual geometry={G.hub} solid={mats.dark} wire={mats.wire} />
        <BladeRing count={22} r0={0.3} r1={1.2} chord={0.34} twist={0.9} solid={mats.blade} wire={mats.wire} spinRef={spinRef} />
      </group>
      <group ref={(n) => (parts.current.nacelle = n)}>
        <Dual geometry={G.nacelle} solid={mats.shell} wire={mats.wire} />
      </group>
      <group ref={(n) => (parts.current.comp = n)}>
        <Dual geometry={G.core} solid={mats.dark} wire={mats.wire} position={[-0.2, 0, 0]} scale={[0.5, 0.82, 0.82]} />
        {[0, 1, 2, 3, 4].map((i) => (
          <group key={i} position={[i * 0.22, 0, 0]}>
            <BladeRing count={30 + i * 4} r0={0.22} r1={0.62 - i * 0.03} chord={0.12} twist={0.5} solid={mats.blade} wire={mats.wire} spinRef={spinRef} dir={1.4} />
          </group>
        ))}
      </group>
      <group ref={(n) => (parts.current.comb = n)}>
        <Dual geometry={G.comb} solid={mats.hot} wire={mats.wire} />
        {Array.from({ length: 16 }, (_, i) => (
          <mesh key={i} rotation={[(i / 16) * Math.PI * 2, 0, 0]} position={[0, 0, 0]}>
            <boxGeometry args={[0.3, 0.02, 0.05]} />
            <meshBasicMaterial color="#ffb070" toneMapped={false} clippingPlanes={[planes.solid]} />
          </mesh>
        ))}
      </group>
      <group ref={(n) => (parts.current.turb = n)}>
        {[0, 1, 2].map((i) => (
          <group key={i} position={[i * 0.2, 0, 0]}>
            <BladeRing count={40} r0={0.2} r1={0.56 + i * 0.03} chord={0.1} twist={-0.6} solid={mats.hot} wire={mats.wire} spinRef={spinRef} dir={-1.8} />
          </group>
        ))}
      </group>
      <group ref={(n) => (parts.current.nozzle = n)}>
        <Dual geometry={G.nozzle} solid={mats.shell} wire={mats.wire} />
        <Dual geometry={G.plug} solid={mats.metal} wire={mats.wire} position={[0.1, 0, 0]} />
        <mesh ref={glow} position={[1.15, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.42, 2.2, 32, 1, true]} />
          <meshBasicMaterial color="#ff8a3a" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      </group>
      <Dual geometry={G.shaft} solid={mats.metal} wire={mats.wire} />

      {/* scan plane — the visible edge of the wireframe → solid transition */}
      <mesh ref={scan} rotation={[0, Math.PI / 2, 0]}>
        <ringGeometry args={[0.05, 1.7, 96]} />
        <meshBasicMaterial color="#56dcff" transparent opacity={0} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>

      <Airflow pRef={pRef} thrustRef={thrustRef} />
    </group>
  );
}

/** Particles streaming through the engine along +X; density follows the film. */
function Airflow({ pRef, thrustRef, n = 1800 }) {
  const pts = useRef();
  const data = useMemo(() => {
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt(Math.random()) * 1.15, a = Math.random() * Math.PI * 2;
      pos[i * 3] = -6 + Math.random() * 12;
      pos[i * 3 + 1] = Math.cos(a) * r;
      pos[i * 3 + 2] = Math.sin(a) * r;
      seed[i * 2] = r;
      seed[i * 2 + 1] = a;
    }
    return { pos, seed };
  }, [n]);
  useFrame((_, dt) => {
    const p = pRef.current;
    const v = (2 + 10 * seg(p, 0.54, 0.7) + 14 * seg(p, 0.88, 1) * thrustRef.current) * dt;
    const a = data.pos;
    for (let i = 0; i < n; i++) {
      let x = a[i * 3] + v * (1 + (1.15 - data.seed[i * 2]));
      if (x > 6) x = -6;
      a[i * 3] = x;
      // squeeze radius through the core (compression), relax after the nozzle
      const squeeze = x > -1.3 && x < 1.8 ? 0.55 : 1;
      const r = data.seed[i * 2] * squeeze;
      const ang = data.seed[i * 2 + 1] + x * 0.25;
      a[i * 3 + 1] = Math.cos(ang) * r;
      a[i * 3 + 2] = Math.sin(ang) * r;
    }
    pts.current.geometry.attributes.position.needsUpdate = true;
    pts.current.material.opacity = 0.15 + 0.75 * Math.max(seg(p, 0.5, 0.58) * (1 - seg(p, 0.72, 0.8)), seg(p, 0.88, 1));
  });
  return (
    <points ref={pts}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.pos, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.025} color="#9fe8ff" transparent opacity={0.2} blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation toneMapped={false} />
    </points>
  );
}

/* --------------------------------------------------------------- camera --- */

// [p, position, lookAt] — interpolated with smoothstep between keys
const SHOTS = [
  [0.0, [3.6, 1.6, 5.6], [0, 0, 0]],
  [0.14, [2.2, 1.0, 4.6], [-0.6, 0, 0]],
  [0.32, [0.4, 0.9, 4.2], [0.6, 0, 0]],
  [0.5, [0.2, 3.2, 8.6], [0, 0, 0]],
  [0.58, [-5.2, 0.2, 0.9], [-2.2, 0, 0]],
  [0.66, [-1.6, 0.05, 0.12], [2, 0, 0]],
  [0.72, [2.6, 0.3, 0.4], [5, 0, 0]],
  [0.8, [4.6, 1.8, 4.6], [0, 0, 0]],
  [0.9, [5.4, 1.0, 3.4], [0.4, 0, 0]],
  [1.0, [-4.8, 1.2, 4.2], [0.2, 0, 0]],
];
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), l1 = new THREE.Vector3(), l2 = new THREE.Vector3();

function Rig({ pRef, focusRef }) {
  const { camera } = useThree();
  const look = useRef(new THREE.Vector3());
  useFrame((_, dt) => {
    const p = pRef.current;
    let i = 0;
    while (i < SHOTS.length - 2 && p > SHOTS[i + 1][0]) i++;
    const [pa, a, la] = SHOTS[i];
    const [pb, b, lb] = SHOTS[i + 1];
    const k = ease((p - pa) / (pb - pa));
    v1.fromArray(a);
    v2.fromArray(b);
    l1.fromArray(la);
    l2.fromArray(lb);
    v1.lerp(v2, k);
    l1.lerp(l2, k);
    // critically damped follow — the camera has mass
    camera.position.x = THREE.MathUtils.damp(camera.position.x, v1.x, 5, dt);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, v1.y, 5, dt);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, v1.z, 5, dt);
    look.current.lerp(l1, 1 - Math.exp(-5 * dt));
    camera.lookAt(look.current);
    focusRef.current = camera.position.distanceTo(look.current);
  });
  return null;
}

function Post() {
  const target = useMemo(() => new THREE.Vector3(0, 0, 0), []);
  return (
    <EffectComposer multisampling={0}>
      <DepthOfField target={target} focalLength={0.08} bokehScale={2.2} />
      <Bloom intensity={0.9} luminanceThreshold={0.62} luminanceSmoothing={0.2} mipmapBlur />
      <ChromaticAberration offset={[0.0006, 0.0008]} blendFunction={BlendFunction.NORMAL} />
      <Vignette eskil={false} offset={0.2} darkness={0.75} />
    </EffectComposer>
  );
}

/* -------------------------------------------------------------- section --- */

export default function EngineLab() {
  const track = useRef(null);
  const pRef = useRef(0);
  const target = useRef(0);
  const thrustRef = useRef(1);
  const dragRef = useRef({ yaw: 0, v: 0, down: false, x: 0 });
  const focusRef = useRef(6);
  const [finish, setFinish] = useState('titanium');
  const [thrust, setThrust] = useState(1);
  const [chapter, setChapter] = useState(0);
  const [pct, setPct] = useState(0);
  const tier = perfTier();
  thrustRef.current = thrust;

  // scroll → target progress; a rAF loop damps p toward it (the scrub)
  useEffect(() => {
    let raf;
    const read = () => {
      const el = track.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      target.current = Math.min(1, Math.max(0, -r.top / (r.height - innerHeight)));
    };
    const loop = () => {
      pRef.current += (target.current - pRef.current) * 0.08;
      const p = pRef.current;
      let c = 0;
      CHAPTERS.forEach((x, i) => p >= x.at - 0.001 && (c = i));
      setChapter((v) => (v === c ? v : c));
      setPct((v) => (Math.abs(v - p) > 0.004 ? p : v));
      raf = requestAnimationFrame(loop);
    };
    read();
    window.addEventListener('scroll', read, { passive: true });
    window.addEventListener('resize', read);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', read);
      window.removeEventListener('resize', read);
    };
  }, []);

  const jump = (at) => {
    const el = track.current;
    const top = el.getBoundingClientRect().top + scrollY;
    window.scrollTo({ top: top + (el.offsetHeight - innerHeight) * (at + 0.02), behavior: 'smooth' });
  };

  const onDown = (e) => {
    const d = dragRef.current;
    d.down = true;
    d.x = e.clientX;
    d.t = performance.now();
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    const d = dragRef.current;
    if (!d.down) return;
    const now = performance.now();
    const dx = e.clientX - d.x;
    d.yaw += dx * 0.008;
    d.v = (dx * 0.008) / Math.max(0.008, (now - d.t) / 1000);
    d.x = e.clientX;
    d.t = now;
  };
  const onUp = () => (dragRef.current.down = false);

  const c = CHAPTERS[chapter];

  return (
    <section className="section section--flush engine" id="engine-lab">
      <div className="engine__track" ref={track}>
        <div className="engine__sticky" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <Stage
            active
            camera={{ position: [3.6, 1.6, 5.6], fov: 38, near: 0.05, far: 60 }}
            className="engine__canvas"
            onCreated={({ gl, scene }) => {
              gl.localClippingEnabled = true;
              scene.fog = new THREE.FogExp2('#04060b', 0.045);
            }}
          >
            <Engine pRef={pRef} finish={finish} thrustRef={thrustRef} dragRef={dragRef} />
            <Rig pRef={pRef} focusRef={focusRef} />
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.7, 0]} receiveShadow>
              <circleGeometry args={[9, 64]} />
              <meshStandardMaterial color="#070b12" metalness={0.6} roughness={0.5} />
            </mesh>
            {tier >= 2 && <Post />}
          </Stage>

          <div className="engine__hud engine__hud--tl">
            <span className="mono">LAB-06 · Turbofan</span>
            <h3 key={c.t}>{c.t}</h3>
            <p key={c.d}>{c.d}</p>
          </div>

          <div className="engine__hud engine__hud--r">
            {CHAPTERS.map((x, i) => (
              <button type="button" key={x.t} data-on={i === chapter} data-done={i < chapter} onClick={() => jump(x.at)}>
                <i />
                <span>{x.t}</span>
              </button>
            ))}
          </div>

          <div className="engine__hud engine__hud--b">
            <div className="engine__bar"><i style={{ transform: `scaleX(${pct})` }} /></div>
            <div className="engine__cfg" onPointerDown={(e) => e.stopPropagation()}>
              <div className="eng__seg" role="group" aria-label="Finish">
                {Object.entries(FINISHES).map(([k, f]) => (
                  <button type="button" key={k} aria-pressed={finish === k} onClick={() => setFinish(k)}>
                    <span className="engine__sw" style={{ background: f.color }} />
                    {f.label}
                  </button>
                ))}
              </div>
              <label className="engine__thrust">
                <span className="mono">Thrust {Math.round(thrust * 100)}%</span>
                <input type="range" min="0" max="1.5" step="0.05" value={thrust} onChange={(e) => setThrust(+e.target.value)} />
              </label>
              <span className="mono engine__hint">{pct < 0.02 ? 'Scroll to play ↓' : 'Drag to rotate 360°'}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
