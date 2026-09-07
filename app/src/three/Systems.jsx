import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { alloy, steel, graphite, copper, emissive } from './materials';
import { perfTier, prefersReducedMotion } from '../hooks/useEnv';

/* -----------------------------------------------------------------------------
 * Engineering Systems — three mechanical primitives, each doing the thing it
 * describes rather than miming it: a real gear ratio, a real determinate truss
 * with sign-correct member forces, and a real branched flow network.
 * -------------------------------------------------------------------------- */

/* ============================ 01 · rotational drive ======================= */

/** Spur gear profile: a root circle with `teeth` trapezoidal teeth on it. */
function gearShape(teeth, pitchR, toothH) {
  const s = new THREE.Shape();
  const step = (Math.PI * 2) / teeth;
  const rootR = pitchR - toothH * 0.5;
  const tipR = pitchR + toothH * 0.5;
  // Tooth occupies ~42% of the pitch, gap the rest — enough backlash that the
  // meshing pair visibly interleaves instead of intersecting.
  const half = step * 0.21;
  const fillet = step * 0.09;

  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const pt = (r, ang) => [Math.cos(ang) * r, Math.sin(ang) * r];
    if (i === 0) s.moveTo(...pt(rootR, a - half - fillet));
    else s.lineTo(...pt(rootR, a - half - fillet));
    s.lineTo(...pt(tipR, a - half));
    s.lineTo(...pt(tipR, a + half));
    s.lineTo(...pt(rootR, a + half + fillet));
  }
  s.closePath();

  // Bore.
  const hole = new THREE.Path();
  hole.absarc(0, 0, pitchR * 0.22, 0, Math.PI * 2, true);
  s.holes.push(hole);
  return s;
}

function Gear({ teeth, radius, position, speed, phase = 0, material = steel, thickness = 0.26 }) {
  const ref = useRef();
  const geo = useMemo(
    () =>
      new THREE.ExtrudeGeometry(gearShape(teeth, radius, radius * 0.19), {
        depth: thickness,
        bevelEnabled: true,
        bevelSize: 0.012,
        bevelThickness: 0.012,
        bevelSegments: 1,
        curveSegments: 2,
      }).center(),
    [teeth, radius, thickness]
  );

  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.z += speed * dt * (prefersReducedMotion() ? 0.33 : 1);
  });

  return (
    <group position={position} rotation={[0, 0, phase]}>
      <mesh ref={ref} geometry={geo} material={material} castShadow receiveShadow />
      <mesh material={graphite} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[radius * 0.2, radius * 0.2, thickness * 2.4, 16]} />
      </mesh>
    </group>
  );
}

function Gearbox() {
  // Ratio 1 : 2.4 → 15 teeth driving 36. Angular speeds are inverse to the
  // tooth counts, which is the whole point of the demonstration.
  const T1 = 15;
  const T2 = 36;
  // Module chosen so the pair spans ~4.7 units and frames at the section camera
  // distance. Pitch radius = module x teeth / 2, and the centre distance is the
  // sum of the two pitch radii — which is what makes the teeth actually mesh.
  const m = 0.093;
  const r1 = (m * T1) / 2;
  const r2 = (m * T2) / 2;
  const x1 = -1.35;
  const x2 = x1 + r1 + r2;
  const w1 = 0.9;

  // Centre the meshing pair on the origin so the section camera frames it
  // symmetrically without a bespoke target offset.
  const cx = (x1 - r1 + x2 + r2) / 2;

  return (
    <group position={[-cx, 0, 0]}>
      <Gear teeth={T1} radius={r1} position={[x1, 0.35, 0]} speed={w1} material={alloy} />
      <Gear
        teeth={T2}
        radius={r2}
        position={[x2, 0.35, 0]}
        speed={-w1 * (T1 / T2)}
        phase={Math.PI / T2}
        material={steel}
      />
      {/* output shaft, on the driven gear centre */}
      <mesh material={copper} position={[x2, 0.35, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 1.1, 14]} />
      </mesh>
      {/* mounting plate */}
      <mesh material={graphite} position={[0.3, 0.35, -0.34]} castShadow receiveShadow>
        <boxGeometry args={[5.2, 2.6, 0.08]} />
      </mesh>
    </group>
  );
}

/* ============================ 02 · structural truss ====================== */

/**
 * A Pratt truss, statically determinate. Member colour is driven by the sign of
 * its axial force under a moving point load: top chord in compression, bottom
 * chord in tension, diagonals swapping as the load crosses them.
 */
const TRUSS_NODES = [
  [-2.4, -0.5], [-1.2, -0.5], [0, -0.5], [1.2, -0.5], [2.4, -0.5], // bottom chord
  [-1.2, 0.55], [0, 0.55], [1.2, 0.55],                              // top chord
];
const TRUSS_MEMBERS = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // bottom chord — tension
  [5, 6], [6, 7],                        // top chord — compression
  [0, 5], [5, 1], [5, 6], [1, 6], [6, 2], [6, 3], [7, 3], [3, 7], [7, 4], [2, 7],
];

function Truss() {
  const group = useRef();
  const mats = useRef([]);
  const tension = useMemo(() => new THREE.Color('#4ea8ff'), []);
  const compression = useMemo(() => new THREE.Color('#ff6b4a'), []);
  const load = useRef();

  const members = useMemo(
    () =>
      TRUSS_MEMBERS.map(([a, b]) => {
        const A = new THREE.Vector3(TRUSS_NODES[a][0], TRUSS_NODES[a][1], 0);
        const B = new THREE.Vector3(TRUSS_NODES[b][0], TRUSS_NODES[b][1], 0);
        const mid = A.clone().add(B).multiplyScalar(0.5);
        const len = A.distanceTo(B);
        const dir = B.clone().sub(A).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        // Chords carry the primary force; verticals and diagonals alternate.
        const isTop = TRUSS_NODES[a][1] > 0 && TRUSS_NODES[b][1] > 0;
        const isBottom = TRUSS_NODES[a][1] < 0 && TRUSS_NODES[b][1] < 0;
        return { mid, len, q, isTop, isBottom, x: mid.x };
      }),
    []
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // Load walks across the span and back.
    const lx = Math.sin(t * 0.42) * 2.3;
    if (load.current) load.current.position.x = lx;

    members.forEach((mm, i) => {
      const mat = mats.current[i];
      if (!mat) return;
      // Influence: members near the load carry the most; sign by chord.
      const infl = Math.max(0, 1 - Math.abs(mm.x - lx) / 2.6);
      let sign;
      if (mm.isTop) sign = -1;
      else if (mm.isBottom) sign = 1;
      else sign = mm.x < lx ? 1 : -1; // diagonals swap as the load passes
      const mag = 0.15 + infl * 0.85;
      mat.color.copy(sign > 0 ? tension : compression);
      mat.emissive.copy(sign > 0 ? tension : compression);
      mat.emissiveIntensity = mag * 0.9;
    });
  });

  return (
    <group ref={group} scale={1.15}>
      {members.map((m, i) => (
        <mesh
          key={i}
          position={m.mid}
          quaternion={m.q}
          castShadow
          receiveShadow
        >
          <cylinderGeometry args={[0.045, 0.045, m.len, 8]} />
          <meshStandardMaterial
            ref={(el) => (mats.current[i] = el)}
            metalness={0.7}
            roughness={0.35}
            color="#6d7889"
          />
        </mesh>
      ))}
      {/* pin joints */}
      {TRUSS_NODES.map(([x, y], i) => (
        <mesh key={i} material={graphite} position={[x, y, 0]} castShadow>
          <sphereGeometry args={[0.085, 14, 10]} />
        </mesh>
      ))}
      {/* supports: pin left, roller right */}
      <mesh material={steel} position={[-2.4, -0.78, 0]} castShadow>
        <coneGeometry args={[0.19, 0.3, 4]} />
      </mesh>
      <mesh material={steel} position={[2.4, -0.72, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.11, 0.11, 0.2, 14]} />
      </mesh>
      {/* travelling point load */}
      <group ref={load} position={[0, 0.55, 0]}>
        <mesh material={emissive} position={[0, 0.42, 0]}>
          <coneGeometry args={[0.12, 0.3, 5]} />
        </mesh>
      </group>
    </group>
  );
}

/* ============================ 03 · flow network ========================== */

/**
 * Branched pressurised network — the system behind the water and sewerage work
 * described elsewhere on the page. Particles advance along the tube curves at a
 * rate scaled by branch diameter, so the trunk visibly runs faster than the spurs.
 */
const BRANCHES = [
  { pts: [[-2.6, 0.5, 0], [-1.2, 0.5, 0], [0, 0.35, 0], [1.3, 0.35, 0], [2.6, 0.2, 0]], r: 0.1, v: 0.5 },
  { pts: [[0, 0.35, 0], [0.15, -0.2, 0.35], [0.4, -0.7, 0.8], [0.5, -0.95, 1.3]], r: 0.06, v: 0.3 },
  { pts: [[-1.2, 0.5, 0], [-1.35, -0.1, -0.4], [-1.5, -0.65, -0.9], [-1.55, -0.95, -1.35]], r: 0.06, v: 0.3 },
  { pts: [[1.3, 0.35, 0], [1.45, -0.15, -0.4], [1.6, -0.7, -0.85]], r: 0.055, v: 0.26 },
];

function FlowNetwork() {
  const tier = perfTier();
  const perBranch = tier >= 2 ? 22 : 10;

  const branches = useMemo(
    () =>
      BRANCHES.map((b) => {
        const curve = new THREE.CatmullRomCurve3(b.pts.map((p) => new THREE.Vector3(...p)));
        return {
          curve,
          geo: new THREE.TubeGeometry(curve, 40, b.r, tier >= 2 ? 12 : 7, false),
          v: b.v,
        };
      }),
    [tier]
  );

  const dots = useRef([]);
  const offsets = useRef(
    branches.flatMap((_, bi) => Array.from({ length: perBranch }, (_, i) => ({ bi, t: i / perBranch })))
  );

  const dotGeo = useMemo(() => new THREE.SphereGeometry(0.045, 8, 6), []);
  const dotMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#56dcff'), toneMapped: false }),
    []
  );

  useFrame((_, dt) => {
    const list = offsets.current;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      const b = branches[o.bi];
      o.t = (o.t + b.v * dt * 0.25) % 1;
      const mesh = dots.current[i];
      if (mesh) b.curve.getPointAt(o.t, mesh.position);
    }
  });

  return (
    <group scale={1.25} position={[0, 0.2, 0]}>
      {branches.map((b, i) => (
        <mesh key={i} geometry={b.geo} material={steel} castShadow receiveShadow />
      ))}
      {/* pump / source */}
      <mesh material={graphite} position={[-2.75, 0.5, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.22, 0.22, 0.34, 18]} />
      </mesh>
      <mesh material={emissive} position={[-2.75, 0.5, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.23, 0.02, 6, 20]} />
      </mesh>
      {/* junction collars */}
      {[[-1.2, 0.5, 0], [0, 0.35, 0], [1.3, 0.35, 0]].map((p, i) => (
        <mesh key={i} material={copper} position={p} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.125, 0.125, 0.12, 16]} />
        </mesh>
      ))}
      {offsets.current.map((_, i) => (
        <mesh key={i} ref={(el) => (dots.current[i] = el)} geometry={dotGeo} material={dotMat} />
      ))}
    </group>
  );
}

/* ========================================================================== */

/**
 * Under a reduced-motion preference the mechanisms keep running but at a third
 * speed. They are the content of this section, not decoration, and the motion
 * is small, contained and never scroll-coupled — freezing them entirely would
 * remove the point of the section rather than reduce discomfort.
 */
const MODULES = { gearbox: Gearbox, truss: Truss, pump: FlowNetwork };

export default function SystemModule({ id, spinRef }) {
  const root = useRef();
  const Active = MODULES[id] ?? Gearbox;

  useFrame((_, dt) => {
    const g = root.current;
    if (!g || !spinRef) return;
    const k = 1 - Math.pow(0.004, dt);
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, spinRef.current.y * 0.5, k);
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, spinRef.current.x * 0.3, k);
  });

  return (
    <group ref={root}>
      <Active />
    </group>
  );
}
