import { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { alloy, steel, graphite, rubber, inconel, copper, emissive, hot, glazing, paint, highlightOf } from './materials';
import { CAR_COMPONENTS } from '../data/assemblies';
import { perfTier, prefersReducedMotion } from '../hooks/useEnv';

/* -----------------------------------------------------------------------------
 * Procedural vehicle, authored as nine independently addressable assemblies.
 *
 * Length runs along X (+X is forward), width along Z, height along Y.
 * Wheelbase ≈ 3.05, track ≈ 2.0, so the whole car sits inside roughly
 * 5.2 × 2.2 × 1.6 units and frames well at a 9-unit orbit radius.
 * -------------------------------------------------------------------------- */

const AXLE_F = 1.55;
const AXLE_R = -1.5;
const TRACK = 1.0;
const HUB_Y = 0.44;

/** Four corner positions, front-left first. */
const CORNERS = [
  [AXLE_F, HUB_Y, TRACK],
  [AXLE_F, HUB_Y, -TRACK],
  [AXLE_R, HUB_Y, TRACK],
  [AXLE_R, HUB_Y, -TRACK],
];

/* --- geometry helpers ----------------------------------------------------- */

/** Side elevation of the body, extruded across the car's width. */
function bodyProfile() {
  const s = new THREE.Shape();
  s.moveTo(-2.3, 0.16);
  s.lineTo(2.2, 0.16);
  s.quadraticCurveTo(2.52, 0.18, 2.52, 0.46); // front bumper
  s.lineTo(2.38, 0.7); // leading edge of the bonnet
  s.quadraticCurveTo(1.75, 0.84, 1.18, 0.9); // bonnet
  s.quadraticCurveTo(0.78, 0.94, 0.42, 1.4); // windscreen rake
  s.lineTo(-0.72, 1.48); // roof
  s.quadraticCurveTo(-1.52, 1.44, -1.92, 0.96); // backlight
  s.lineTo(-2.24, 0.88);
  s.quadraticCurveTo(-2.52, 0.84, -2.5, 0.5); // rear
  s.closePath();
  return s;
}

/** Greenhouse glass, inset slightly inside the body shell. */
function glassProfile() {
  const s = new THREE.Shape();
  s.moveTo(0.46, 1.36);
  s.quadraticCurveTo(0.82, 0.98, 1.1, 0.94);
  s.lineTo(-1.86, 0.99);
  s.quadraticCurveTo(-1.5, 1.4, -0.74, 1.44);
  s.closePath();
  return s;
}

/** A coil spring as a swept tube along a helical curve. */
function coilGeometry(radius = 0.13, height = 0.42, turns = 5, tube = 0.028) {
  const pts = [];
  const steps = turns * 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, t * height, Math.sin(a) * radius));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), steps, tube, 6, false);
}

/** Exhaust run: manifold under the engine, back along the floor, to the tip. */
function exhaustCurve() {
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(1.5, 0.3, 0.16),
    new THREE.Vector3(1.0, 0.2, 0.26),
    new THREE.Vector3(0.2, 0.17, 0.3),
    new THREE.Vector3(-0.9, 0.17, 0.3),
    new THREE.Vector3(-1.7, 0.2, 0.34),
    new THREE.Vector3(-2.3, 0.26, 0.42),
    new THREE.Vector3(-2.62, 0.3, 0.44),
  ]);
}

/* --- part wrapper --------------------------------------------------------- */

function Part({ def, explodeRef, selected, onSelect, showLabels, labelAt, children }) {
  const group = useRef();
  const target = useMemo(() => new THREE.Vector3(), []);
  const [hovered, setHovered] = useState(false);
  const isSel = selected === def.id;

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const e = explodeRef.current;
    target.set(def.explode[0] * e, def.explode[1] * e, def.explode[2] * e);
    const k = 1 - Math.pow(0.0015, dt);
    g.position.lerp(target, k);
  });

  const over = useCallback((e) => {
    e.stopPropagation();
    document.body.style.cursor = 'pointer';
    setHovered(true);
  }, []);
  const out = useCallback(() => {
    document.body.style.cursor = '';
    setHovered(false);
  }, []);

  // Selection / hover highlight. The materials are shared module-level
  // singletons, so this clones the material for the affected meshes and
  // restores the original on cleanup — mutating the shared instance would
  // light up every other assembly that uses the same material.
  useEffect(() => {
    const g = group.current;
    if (!g) return;
    const level = isSel ? 0.55 : hovered ? 0.2 : 0;
    if (!level) return;
    const swapped = [];
    g.traverse((o) => {
      if (!o.isMesh || !o.material || !o.material.emissive) return;
      o.userData.__origMat = o.material;
      o.material = highlightOf(o.material, level);
      swapped.push(o);
    });
    return () => {
      swapped.forEach((o) => {
        o.material.dispose();
        o.material = o.userData.__origMat;
      });
    };
  }, [isSel, hovered]);

  const click = useCallback(
    (e) => {
      e.stopPropagation();
      onSelect(def.id);
    },
    [def.id, onSelect]
  );

  return (
    <group ref={group} name={def.id} onPointerOver={over} onPointerOut={out} onClick={click}>
      {children}
      {showLabels && (
        <Html center distanceFactor={10} position={labelAt ?? [0, 1, 0]} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <span className={`hud-label${isSel ? ' hud-label--on' : ''}`}>
            <i />
            {def.label}
          </span>
        </Html>
      )}
    </group>
  );
}

/* --- the vehicle ---------------------------------------------------------- */

export default function Car({
  explodeRef,
  spinRef,
  selected,
  onSelect,
  showLabels = false,
  autoSpin = true,
  wheelSpinRef,
  onTick,
}) {
  const root = useRef();
  const wheels = useRef([]);
  const tier = perfTier();
  const reduced = prefersReducedMotion();
  const seg = tier >= 2 ? 26 : 14;

  const bodyGeo = useMemo(
    () =>
      new THREE.ExtrudeGeometry(bodyProfile(), {
        depth: 1.72,
        bevelEnabled: true,
        bevelSize: 0.07,
        bevelThickness: 0.07,
        bevelSegments: tier >= 2 ? 3 : 1,
        curveSegments: tier >= 2 ? 14 : 7,
      }),
    [tier]
  );

  const glassGeo = useMemo(
    () =>
      new THREE.ExtrudeGeometry(glassProfile(), {
        depth: 1.8,
        bevelEnabled: false,
        curveSegments: tier >= 2 ? 12 : 6,
      }),
    [tier]
  );

  const coilGeo = useMemo(() => coilGeometry(), []);
  const exhaustGeo = useMemo(() => new THREE.TubeGeometry(exhaustCurve(), 48, 0.052, 8, false), []);
  const parts = useMemo(() => Object.fromEntries(CAR_COMPONENTS.map((c) => [c.id, c])), []);

  // Ambient yaw accumulates separately from the user's drag so the two add.
  const auto = useRef(0);

  useFrame((_, dt) => {
    const g = root.current;
    if (!g) return;
    onTick?.();
    if (autoSpin && !reduced) auto.current += dt * 0.12;
    g.rotation.y = auto.current + (spinRef?.current.y ?? 0);
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, spinRef?.current.x ?? 0, 1 - Math.pow(0.002, dt));
    // Wheels keep turning while the car is assembled, stop once it is apart.
    const rate = wheelSpinRef ? wheelSpinRef.current : 0;
    if (rate) {
      for (const w of wheels.current) if (w) w.rotation.y += dt * rate;
    }
  });

  const common = { explodeRef, selected, onSelect, showLabels };

  return (
    <group ref={root} position={[0, -0.35, 0]}>
      {/* ---- 01 body & chassis --------------------------------------------- */}
      <Part def={parts.body} {...common} labelAt={[0, 1.7, 0]}>
        <mesh geometry={bodyGeo} material={paint} position={[0, 0, -0.86]} castShadow receiveShadow />
        <mesh geometry={glassGeo} material={glazing} position={[0, 0, -0.9]} />
        {/* sills */}
        {[1, -1].map((s) => (
          <mesh key={s} material={graphite} position={[0, 0.22, s * 0.88]} castShadow>
            <boxGeometry args={[3.9, 0.1, 0.08]} />
          </mesh>
        ))}
        {/* lighting signature */}
        {[1, -1].map((s) => (
          <mesh key={s} material={emissive} position={[2.44, 0.62, s * 0.6]}>
            <boxGeometry args={[0.05, 0.09, 0.42]} />
          </mesh>
        ))}
        {[1, -1].map((s) => (
          <mesh key={`r${s}`} material={hot} position={[-2.46, 0.72, s * 0.55]}>
            <boxGeometry args={[0.04, 0.08, 0.4]} />
          </mesh>
        ))}
        {/* wing mirrors */}
        {[1, -1].map((s) => (
          <mesh key={`m${s}`} material={graphite} position={[0.5, 1.06, s * 0.94]} castShadow>
            <boxGeometry args={[0.16, 0.09, 0.13]} />
          </mesh>
        ))}
      </Part>

      {/* ---- 02 engine ------------------------------------------------------ */}
      <Part def={parts.engine} {...common} labelAt={[1.5, 1.2, 0]}>
        <mesh material={graphite} position={[1.5, 0.62, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.78, 0.5, 0.86]} />
        </mesh>
        {/* cylinder bank */}
        {[-0.27, -0.09, 0.09, 0.27].map((z, i) => (
          <mesh key={i} material={alloy} position={[1.5, 0.92, z]} castShadow>
            <cylinderGeometry args={[0.075, 0.075, 0.2, 12]} />
          </mesh>
        ))}
        {/* cam cover */}
        <mesh material={alloy} position={[1.5, 1.02, 0]} castShadow>
          <boxGeometry args={[0.62, 0.09, 0.74]} />
        </mesh>
        {/* intake plenum */}
        <mesh material={steel} position={[1.22, 0.98, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.11, 0.11, 0.66, 14]} />
        </mesh>
        {/* accessory pulleys at the front of the block */}
        {[0.3, -0.02].map((z, i) => (
          <mesh key={i} material={steel} position={[1.9, 0.66 - i * 0.14, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.1, 0.1, 0.05, 14]} />
          </mesh>
        ))}
      </Part>

      {/* ---- 03 transmission ------------------------------------------------ */}
      <Part def={parts.transmission} {...common} labelAt={[0.75, 0.9, 0]}>
        {/* bell housing */}
        <mesh material={steel} position={[1.02, 0.55, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.3, 0.22, 0.28, seg]} />
        </mesh>
        {/* gearbox casing */}
        <mesh material={graphite} position={[0.72, 0.5, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.22, 0.19, 0.42, seg]} />
        </mesh>
        {/* differential */}
        <mesh material={steel} position={[1.5, 0.4, 0]} castShadow>
          <sphereGeometry args={[0.17, seg, 12]} />
        </mesh>
        {/* half-shafts to each front hub */}
        {[1, -1].map((s) => (
          <mesh key={s} material={alloy} position={[1.52, 0.42, s * 0.55]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.045, 0.045, 0.85, 10]} />
          </mesh>
        ))}
      </Part>

      {/* ---- 04 suspension --------------------------------------------------- */}
      <Part def={parts.suspension} {...common} labelAt={[0, -0.5, 1.3]}>
        {CORNERS.map(([x, y, z], i) => (
          <group key={i} position={[x, y, z * 0.78]}>
            <mesh geometry={coilGeo} material={inconel} position={[0, 0.05, 0]} castShadow />
            {/* damper body inside the coil */}
            <mesh material={graphite} position={[0, 0.24, 0]} castShadow>
              <cylinderGeometry args={[0.055, 0.055, 0.5, 12]} />
            </mesh>
            <mesh material={alloy} position={[0, 0.52, 0]} castShadow>
              <cylinderGeometry args={[0.09, 0.09, 0.06, 12]} />
            </mesh>
            {/* lower control arm reaching out to the hub */}
            <mesh
              material={steel}
              position={[0, -0.06, z > 0 ? 0.16 : -0.16]}
              rotation={[z > 0 ? -0.35 : 0.35, 0, 0]}
              castShadow
            >
              <boxGeometry args={[0.12, 0.05, 0.42]} />
            </mesh>
          </group>
        ))}
        {/* anti-roll bars */}
        {[AXLE_F, AXLE_R].map((x) => (
          <mesh key={x} material={steel} position={[x, 0.26, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.028, 0.028, 1.5, 8]} />
          </mesh>
        ))}
      </Part>

      {/* ---- 05 wheels & tyres ------------------------------------------------ */}
      <Part def={parts.wheels} {...common} labelAt={[0, 0.6, 1.5]}>
        {CORNERS.map(([x, y, z], i) => (
          <group key={i} ref={(el) => (wheels.current[i] = el)} position={[x, y, z]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh material={rubber} castShadow receiveShadow>
              <cylinderGeometry args={[0.44, 0.44, 0.3, tier >= 2 ? 30 : 16]} />
            </mesh>
            {/* rim face */}
            <mesh material={alloy} castShadow>
              <cylinderGeometry args={[0.29, 0.29, 0.32, tier >= 2 ? 30 : 16]} />
            </mesh>
            {/* spokes */}
            {Array.from({ length: 5 }, (_, k) => (
              <mesh key={k} material={alloy} rotation={[0, (k / 5) * Math.PI * 2, 0]} position={[0, 0.02, 0]} castShadow>
                <boxGeometry args={[0.5, 0.05, 0.08]} />
              </mesh>
            ))}
            <mesh material={graphite} position={[0, 0.17, 0]}>
              <cylinderGeometry args={[0.08, 0.08, 0.04, 12]} />
            </mesh>
          </group>
        ))}
      </Part>

      {/* ---- 06 brakes --------------------------------------------------------- */}
      <Part def={parts.brakes} {...common} labelAt={[0, 0.2, -1.5]}>
        {CORNERS.map(([x, y, z], i) => (
          <group key={i} position={[x, y, z * 0.9]}>
            <mesh material={steel} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.27, 0.27, 0.035, tier >= 2 ? 28 : 14]} />
            </mesh>
            {/* vent ring */}
            <mesh material={graphite} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.19, 0.022, 6, 20]} />
            </mesh>
            {/* caliper straddling the disc */}
            <mesh material={hot} position={[-0.02, 0.24, z > 0 ? -0.04 : 0.04]} castShadow>
              <boxGeometry args={[0.14, 0.17, 0.1]} />
            </mesh>
          </group>
        ))}
      </Part>

      {/* ---- 07 battery & electrical -------------------------------------------- */}
      <Part def={parts.battery} {...common} labelAt={[1.0, 1.1, -0.7]}>
        <mesh material={graphite} position={[1.05, 0.68, -0.52]} castShadow receiveShadow>
          <boxGeometry args={[0.46, 0.26, 0.3]} />
        </mesh>
        {[0.13, -0.13].map((dz, i) => (
          <mesh key={i} material={copper} position={[1.05 + dz, 0.84, -0.52]} castShadow>
            <cylinderGeometry args={[0.03, 0.03, 0.07, 10]} />
          </mesh>
        ))}
        {/* harness runs back to the cabin */}
        <mesh material={emissive} position={[0.5, 0.5, -0.5]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.018, 0.018, 1.2, 6]} />
        </mesh>
        <mesh material={emissive} position={[-0.3, 0.42, -0.3]} rotation={[0, 0.5, Math.PI / 2]}>
          <cylinderGeometry args={[0.015, 0.015, 1.4, 6]} />
        </mesh>
        {/* fuse box */}
        <mesh material={steel} position={[0.72, 0.6, -0.62]} castShadow>
          <boxGeometry args={[0.18, 0.14, 0.12]} />
        </mesh>
      </Part>

      {/* ---- 08 exhaust ---------------------------------------------------------- */}
      <Part def={parts.exhaust} {...common} labelAt={[-1.6, -0.2, 0.8]}>
        <mesh geometry={exhaustGeo} material={inconel} castShadow />
        {/* catalyst */}
        <mesh material={steel} position={[0.35, 0.17, 0.3]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.1, 0.1, 0.36, 14]} />
        </mesh>
        {/* silencer */}
        <mesh material={steel} position={[-1.75, 0.2, 0.34]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.15, 0.15, 0.6, 16]} />
        </mesh>
        {/* tailpipe tip */}
        <mesh material={alloy} position={[-2.7, 0.3, 0.44]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.075, 0.062, 0.14, 14]} />
        </mesh>
      </Part>

      {/* ---- 09 interior ---------------------------------------------------------- */}
      <Part def={parts.interior} {...common} labelAt={[-0.3, 1.6, 0]}>
        {/* seats */}
        {[0.42, -0.42].map((z, i) => (
          <group key={i} position={[-0.32, 0.52, z]}>
            <mesh material={rubber} castShadow>
              <boxGeometry args={[0.44, 0.1, 0.42]} />
            </mesh>
            <mesh material={rubber} position={[-0.2, 0.28, 0]} rotation={[0, 0, 0.18]} castShadow>
              <boxGeometry args={[0.12, 0.56, 0.4]} />
            </mesh>
            <mesh material={graphite} position={[-0.26, 0.6, 0]} castShadow>
              <boxGeometry args={[0.1, 0.14, 0.24]} />
            </mesh>
          </group>
        ))}
        {/* dashboard */}
        <mesh material={graphite} position={[0.62, 0.78, 0]} castShadow>
          <boxGeometry args={[0.3, 0.16, 1.42]} />
        </mesh>
        {/* instrument cluster glow */}
        <mesh material={emissive} position={[0.5, 0.83, 0.42]} rotation={[0, 0, 0.2]}>
          <boxGeometry args={[0.02, 0.1, 0.3]} />
        </mesh>
        {/* steering wheel */}
        <mesh material={rubber} position={[0.36, 0.82, 0.42]} rotation={[0, 0, 1.15]} castShadow>
          <torusGeometry args={[0.15, 0.028, 8, 22]} />
        </mesh>
        <mesh material={graphite} position={[0.44, 0.79, 0.42]} rotation={[0, 0, 1.15]} castShadow>
          <cylinderGeometry args={[0.025, 0.025, 0.18, 10]} />
        </mesh>
        {/* centre console */}
        <mesh material={graphite} position={[0.1, 0.5, 0]} castShadow>
          <boxGeometry args={[0.7, 0.12, 0.22]} />
        </mesh>
      </Part>
    </group>
  );
}
