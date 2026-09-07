import { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { alloy, steel, graphite, inconel, copper, emissive, hot, highlightOf } from './materials';
import { ROCKET_COMPONENTS } from '../data/assemblies';
import { perfTier, prefersReducedMotion } from '../hooks/useEnv';

/* -----------------------------------------------------------------------------
 * Procedural launch vehicle.
 *
 * Built as one named group per component so the exploded view, the click
 * targets and the information panel all address the same objects. A downloaded
 * GLB would be a single fused mesh and could not be taken apart this way.
 *
 * Model axis is +Y (nose up). Total height ≈ 9 units, centred near the origin.
 * -------------------------------------------------------------------------- */

/* --- profile generators --------------------------------------------------- */

/**
 * Tangent-ogive nose profile — the shape actually used on launch vehicles,
 * rather than a plain cone. rho is the ogive radius that makes the curve
 * tangent to the body at the base.
 */
function ogivePoints(radius, length, segs = 22) {
  const rho = (radius * radius + length * length) / (2 * radius);
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const y = (i / segs) * length;
    const r = Math.sqrt(Math.max(0, rho * rho - y * y)) + radius - rho;
    pts.push(new THREE.Vector2(Math.max(0.001, r), y));
  }
  return pts;
}

/**
 * Converging–diverging bell. Sharp contraction to the throat, then a
 * parabolic expansion — the same compromise described in the info panel.
 */
function bellPoints(inletR, throatR, exitR, length, segs = 26) {
  const pts = [];
  const throatAt = 0.3;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    let r;
    if (t < throatAt) {
      const k = t / throatAt;
      r = THREE.MathUtils.lerp(inletR, throatR, k * k * (3 - 2 * k)); // smoothstep
    } else {
      const k = (t - throatAt) / (1 - throatAt);
      r = throatR + (exitR - throatR) * Math.pow(k, 0.62); // parabolic bell
    }
    pts.push(new THREE.Vector2(r, -t * length));
  }
  return pts;
}

/* --- small reusable parts ------------------------------------------------- */

function Ribs({ count, from, to, radius, thickness = 0.045 }) {
  const geo = useMemo(() => new THREE.TorusGeometry(radius, thickness, 6, 40), [radius, thickness]);
  const ys = useMemo(
    () => Array.from({ length: count }, (_, i) => from + ((to - from) * i) / (count - 1)),
    [count, from, to]
  );
  return ys.map((y, i) => (
    <mesh key={i} geometry={geo} material={steel} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow />
  ));
}

/** Four grid fins at the base of the tank. */
function Fins({ y, bodyR }) {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(1.15, -0.55);
    s.lineTo(1.15, -0.95);
    s.lineTo(0, -0.75);
    s.closePath();
    return s;
  }, []);
  const geo = useMemo(
    () => new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 }),
    [shape]
  );
  return [0, 1, 2, 3].map((i) => (
    <group key={i} rotation={[0, (i * Math.PI) / 2, 0]}>
      <mesh geometry={geo} material={alloy} position={[bodyR - 0.06, y, -0.035]} castShadow />
    </group>
  ));
}

/* --- exhaust plume -------------------------------------------------------- */

/**
 * Engine plume. Two additive cones plus shock diamonds — no texture, no
 * particle system, so it costs three draw calls and animates on the GPU-side
 * transform only.
 */
function Plume({ throttleRef, y }) {
  const inner = useRef();
  const outer = useRef();
  const diamonds = useRef();

  const innerMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#cfefff'), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    []
  );
  const outerMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a3c'), transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    []
  );

  useFrame((state) => {
    const t = throttleRef.current;
    const time = state.clock.elapsedTime;
    // Flicker is deterministic noise, not Math.random, so the flame reads as
    // turbulent rather than as strobing.
    const flick = 1 + Math.sin(time * 41) * 0.05 + Math.sin(time * 17.3) * 0.035;

    for (const [ref, base] of [[inner, 1], [outer, 1.45]]) {
      if (!ref.current) continue;
      const s = t * flick;
      ref.current.scale.set(s * base * 0.8, s * base, s * base * 0.8);
      ref.current.visible = t > 0.02;
      ref.current.material.opacity = (base === 1 ? 0.9 : 0.42) * Math.min(1, t * 1.4);
    }
    if (diamonds.current) {
      diamonds.current.visible = t > 0.55;
      diamonds.current.scale.setScalar(t * flick);
    }
  });

  return (
    <group position={[0, y, 0]}>
      <mesh ref={outer} material={outerMat} position={[0, -1.5, 0]}>
        <coneGeometry args={[0.62, 3.4, 20, 1, true]} />
      </mesh>
      <mesh ref={inner} material={innerMat} position={[0, -1.0, 0]}>
        <coneGeometry args={[0.32, 2.2, 18, 1, true]} />
      </mesh>
      <group ref={diamonds}>
        {[0.55, 1.05, 1.5, 1.9].map((d, i) => (
          <mesh key={i} material={innerMat} position={[0, -d, 0]} scale={[1, 0.45, 1]}>
            <sphereGeometry args={[0.14 - i * 0.022, 10, 8]} />
          </mesh>
        ))}
      </group>
      {/* Light cast by the flame onto the engine bay above it. */}
      <pointLight position={[0, -0.6, 0]} color="#ff8a1e" intensity={26} distance={7} decay={2} />
    </group>
  );
}

/* --- component wrapper ---------------------------------------------------- */

/**
 * One named assembly. Owns its explode offset, its hover/selected state and the
 * lerp that gets it there — so adding a component needs no changes elsewhere.
 */
function Part({ def, explodeRef, selected, onSelect, showLabels, children }) {
  const group = useRef();
  const target = useMemo(() => new THREE.Vector3(), []);
  const [hovered, setHovered] = useState(false);
  const isSel = selected === def.id;

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const e = explodeRef.current;
    target.set(def.explode[0] * e, def.explode[1] * e, def.explode[2] * e);
    // Frame-rate independent smoothing.
    const k = 1 - Math.pow(0.0015, dt);
    g.position.lerp(target, k);

    const wanted = isSel ? 1.045 : 1;
    const s = THREE.MathUtils.lerp(g.scale.x, wanted, k);
    g.scale.setScalar(s);
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
        <Html
          center
          distanceFactor={11}
          position={[0.95, def.explode[1] ? def.explode[1] * 0.15 : 0, 0]}
          zIndexRange={[20, 0]}
          style={{ pointerEvents: 'none' }}
        >
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

export default function Rocket({
  explodeRef,
  throttleRef,
  spinRef,
  selected,
  onSelect,
  showLabels = false,
  autoSpin = true,
  onTick,
}) {
  const root = useRef();
  const tier = perfTier();
  const reduced = prefersReducedMotion();

  const noseGeo = useMemo(() => new THREE.LatheGeometry(ogivePoints(0.62, 1.5), tier >= 2 ? 40 : 24), [tier]);
  const bellGeo = useMemo(
    () => new THREE.LatheGeometry(bellPoints(0.34, 0.2, 0.68, 1.25), tier >= 2 ? 40 : 24),
    [tier]
  );

  const parts = useMemo(() => Object.fromEntries(ROCKET_COMPONENTS.map((c) => [c.id, c])), []);

  // Ambient yaw is accumulated separately from the user's drag so the two add
  // rather than overwrite each other.
  const auto = useRef(0);

  useFrame((state, dt) => {
    const g = root.current;
    if (!g) return;
    onTick?.();
    if (autoSpin && !reduced) auto.current += dt * 0.13;
    g.rotation.y = auto.current + (spinRef?.current.y ?? 0);
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, spinRef?.current.x ?? 0, 1 - Math.pow(0.002, dt));
    // Idle bob keeps the silhouette alive when nothing is selected.
    g.position.y = reduced ? 0 : Math.sin(state.clock.elapsedTime * 0.6) * 0.06;
  });

  const common = { explodeRef, selected, onSelect, showLabels };

  return (
    <group ref={root} scale={0.86}>
      {/* ---- 01 nose cone ------------------------------------------------- */}
      <Part def={parts['nose-cone']} {...common}>
        <mesh geometry={noseGeo} material={alloy} position={[0, 3.3, 0]} castShadow receiveShadow />
        <mesh material={emissive} position={[0, 3.28, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.6, 0.022, 6, 34]} />
        </mesh>
      </Part>

      {/* ---- 02 payload section ------------------------------------------- */}
      <Part def={parts.payload} {...common}>
        <mesh material={alloy} position={[0, 2.58, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.62, 0.62, 1.45, tier >= 2 ? 40 : 22]} />
        </mesh>
        {/* payload bay access hatch */}
        <mesh material={graphite} position={[0.6, 2.62, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.26, 0.26, 0.06, 20]} />
        </mesh>
        <Ribs count={2} from={2.0} to={3.16} radius={0.635} />
      </Part>

      {/* ---- 03 fuel tank -------------------------------------------------- */}
      <Part def={parts['fuel-tank']} {...common}>
        <mesh material={alloy} position={[0, 0.72, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.66, 0.66, 2.3, tier >= 2 ? 44 : 24]} />
        </mesh>
        {/* common bulkhead band, visually splitting fuel from oxidiser */}
        <mesh material={graphite} position={[0, 0.72, 0]} castShadow>
          <cylinderGeometry args={[0.672, 0.672, 0.16, tier >= 2 ? 44 : 24]} />
        </mesh>
        <mesh material={emissive} position={[0, 1.32, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.668, 0.016, 6, 40]} />
        </mesh>
        <Ribs count={4} from={-0.22} to={1.68} radius={0.675} />
        <Fins y={-0.05} bodyR={0.66} />
      </Part>

      {/* ---- 04 engine section --------------------------------------------- */}
      <Part def={parts.engine} {...common}>
        <mesh material={steel} position={[0, -0.72, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.6, 0.46, 0.6, tier >= 2 ? 36 : 20]} />
        </mesh>
        {/* combustion chamber */}
        <mesh material={inconel} position={[0, -1.28, 0]} castShadow>
          <cylinderGeometry args={[0.3, 0.34, 0.55, 24]} />
        </mesh>
        {/* turbopumps, symmetric pair */}
        {[-1, 1].map((s) => (
          <group key={s}>
            <mesh material={graphite} position={[s * 0.34, -1.0, 0]} castShadow>
              <cylinderGeometry args={[0.13, 0.13, 0.3, 16]} />
            </mesh>
            <mesh material={copper} position={[s * 0.34, -1.24, 0]} rotation={[0, 0, s * -0.5]} castShadow>
              <cylinderGeometry args={[0.045, 0.045, 0.42, 10]} />
            </mesh>
          </group>
        ))}
        <mesh material={hot} position={[0, -1.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.3, 0.02, 6, 26]} />
        </mesh>
      </Part>

      {/* ---- 05 nozzle ------------------------------------------------------ */}
      <Part def={parts.nozzle} {...common}>
        <mesh geometry={bellGeo} material={inconel} position={[0, -1.55, 0]} castShadow receiveShadow />
        {/* regenerative cooling channels, suggested with rings */}
        {[0.35, 0.72, 1.05].map((d, i) => (
          <mesh key={i} material={copper} position={[0, -1.55 - d, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.24 + d * 0.34, 0.017, 6, 30]} />
          </mesh>
        ))}
        <Plume throttleRef={throttleRef} y={-2.75} />
      </Part>

      {/* ---- 06 internal components ----------------------------------------
           Only meaningful once the stack is apart, so it fades in with explode. */}
      <Part def={parts.internals} {...common}>
        <group>
          {/* avionics ring */}
          <mesh material={graphite} position={[0, 1.95, 0]} castShadow>
            <torusGeometry args={[0.4, 0.07, 8, 26]} />
          </mesh>
          {/* pressurant bottles */}
          {[0, 1, 2].map((i) => {
            const a = (i / 3) * Math.PI * 2;
            return (
              <mesh key={i} material={alloy} position={[Math.cos(a) * 0.34, 1.95, Math.sin(a) * 0.34]} castShadow>
                <capsuleGeometry args={[0.09, 0.16, 4, 10]} />
              </mesh>
            );
          })}
          {/* propellant feed line running the length of the tank */}
          <mesh material={copper} position={[0.0, 0.2, 0.42]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 1.9, 12]} />
          </mesh>
          <mesh material={copper} position={[0.0, -0.78, 0.3]} rotation={[0.55, 0, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 0.55, 12]} />
          </mesh>
          {/* harness runs */}
          <mesh material={emissive} position={[-0.42, 0.5, 0.2]}>
            <cylinderGeometry args={[0.014, 0.014, 2.2, 6]} />
          </mesh>
        </group>
      </Part>
    </group>
  );
}
