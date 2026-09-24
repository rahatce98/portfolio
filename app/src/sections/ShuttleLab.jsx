import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import Stage from '../three/Stage';
import { GridFloor, Dust } from '../three/Atmosphere';

/* -----------------------------------------------------------------------------
 * LAB-06 — Space Shuttle (STS stack)
 *
 * A procedural Space Transportation System: orbiter, external tank and two
 * solid rocket boosters, 16 named assemblies. Every part can be removed and
 * re-added on its own; "Disassemble" flies them out one by one, "Assemble"
 * locks them back in sequence. Blueprint mode shows the wireframe, Launch runs
 * ignition → lift-off → SRB separation. All geometry is built in code — no
 * model files are downloaded.
 * -------------------------------------------------------------------------- */

/* ------------------------------------------------------------ materials --- */
const M = {
  white: new THREE.MeshStandardMaterial({ color: '#eef1f5', roughness: 0.55, metalness: 0.05 }),
  tile: new THREE.MeshStandardMaterial({ color: '#16181c', roughness: 0.85, metalness: 0.05 }),
  rcc: new THREE.MeshStandardMaterial({ color: '#2b2e33', roughness: 0.6, metalness: 0.1 }),
  foam: new THREE.MeshStandardMaterial({ color: '#c8641e', roughness: 0.78, metalness: 0.02 }),
  foamDark: new THREE.MeshStandardMaterial({ color: '#9c4a14', roughness: 0.8 }),
  srb: new THREE.MeshStandardMaterial({ color: '#f2f2ee', roughness: 0.5, metalness: 0.08 }),
  steel: new THREE.MeshStandardMaterial({ color: '#a9b3bf', roughness: 0.32, metalness: 0.85 }),
  dark: new THREE.MeshStandardMaterial({ color: '#3a4049', roughness: 0.45, metalness: 0.6 }),
  gold: new THREE.MeshStandardMaterial({ color: '#d7a640', roughness: 0.3, metalness: 0.9 }),
  glass: new THREE.MeshStandardMaterial({ color: '#0b1a2a', roughness: 0.1, metalness: 0.9, emissive: '#0a2a44', emissiveIntensity: 0.4 }),
  bell: new THREE.MeshStandardMaterial({ color: '#8c929a', roughness: 0.35, metalness: 0.9, side: THREE.DoubleSide }),
  blue: new THREE.MeshStandardMaterial({ color: '#2e5ea8', roughness: 0.5, metalness: 0.2 }),
};
const WIRE = new THREE.MeshBasicMaterial({ color: '#56dcff', wireframe: true, transparent: true, opacity: 0.55 });
const SELECT = new THREE.MeshStandardMaterial({ color: '#56dcff', emissive: '#56dcff', emissiveIntensity: 0.9, roughness: 0.4 });

/* -------------------------------------------------------------- parts --- */
/* `out` = where the part flies to when disassembled (added to its seat). */
export const SHUTTLE_PARTS = [
  { id: 'et', name: 'External Tank', group: 'External Tank', out: [0, 0, -3.2], spec: '46.9 m · 8.4 m Ø · 760 t of LOX/LH₂ at lift-off', desc: 'Orange spray-on foam insulates the cryogenic propellants feeding the three main engines. The only part not reused.' },
  { id: 'et-nose', name: 'LOX Tank & Ogive', group: 'External Tank', out: [0, 3.2, -3.2], spec: 'Liquid oxygen, −183 °C · 550 m³', desc: 'The forward tank holds liquid oxygen; its ogive nose carries the vent cap.' },
  { id: 'et-feed', name: 'Feed Lines & Cable Tray', group: 'External Tank', out: [0.9, 0, -2.2], spec: '43 cm LOX line · 1,000 kg/s', desc: 'Carries oxygen down the tank to the orbiter umbilicals and the avionics cable tray.' },
  { id: 'srb-l', name: 'Solid Rocket Booster (left)', group: 'Boosters', out: [-3.6, 0, 0], spec: '45.5 m · 12.5 MN thrust · 123 s burn', desc: 'Four segmented PBAN solid motors; 71% of lift-off thrust. Parachute-recovered and refurbished.' },
  { id: 'srb-r', name: 'Solid Rocket Booster (right)', group: 'Boosters', out: [3.6, 0, 0], spec: '45.5 m · 12.5 MN thrust · 123 s burn', desc: 'Mirrors the left booster. Gimballed nozzles steer the stack during first stage.' },
  { id: 'struts', name: 'Attach Struts', group: 'External Tank', out: [0, -1.6, -1.2], spec: 'Explosive-bolt separation', desc: 'Forward and aft struts tie boosters and orbiter to the tank; pyrotechnics release them.' },
  { id: 'crew', name: 'Crew Module & Nose Cap', group: 'Orbiter', out: [0, 3.4, 2.2], spec: '71.5 m³ pressurised · 7 crew', desc: 'Flight deck and mid-deck. The nose cap is reinforced carbon-carbon for 1,650 °C re-entry.' },
  { id: 'fuselage', name: 'Mid Fuselage', group: 'Orbiter', out: [0, 0.4, 2.6], spec: '18.3 m payload bay · aluminium airframe', desc: 'Primary structure carrying wings, payload bay and the loads from the aft fuselage.' },
  { id: 'doors', name: 'Payload Bay Doors', group: 'Orbiter', out: [0, 0.4, 4.2], spec: 'Graphite-epoxy · radiator panels', desc: 'Open in orbit to expose the bay and dump heat through radiators on their inner faces.' },
  { id: 'arm', name: 'Canadarm (RMS)', group: 'Payload', out: [1.8, 1.2, 3.6], spec: '15.2 m · 6 joints · 29 t payload in space', desc: 'Remote Manipulator System for deploying and capturing payloads.' },
  { id: 'payload', name: 'Payload (telescope)', group: 'Payload', out: [-1.8, 1.4, 3.8], spec: 'Up to 24.4 t to LEO', desc: 'A Hubble-class observatory in its cradle — the reason for the mission.' },
  { id: 'wings', name: 'Delta Wings', group: 'Orbiter', out: [0, -0.6, 3.4], spec: '23.8 m span · RCC leading edges', desc: 'Double-delta planform for hypersonic re-entry and a 340 km/h unpowered landing.' },
  { id: 'tiles', name: 'Thermal Protection', group: 'Orbiter', out: [0, -0.2, 0.9], spec: '≈24,300 silica tiles', desc: 'Black HRSI tiles on the belly take the re-entry heat; white blankets cover cooler areas.' },
  { id: 'tail', name: 'Vertical Stabiliser', group: 'Orbiter', out: [0, 1.2, 4.4], spec: 'Split rudder / speed brake', desc: 'The rudder splits open as a speed brake during final approach.' },
  { id: 'oms', name: 'OMS Pods', group: 'Propulsion', out: [0, -1.4, 4.2], spec: '2 × 26.7 kN · MMH/N₂O₄', desc: 'Orbital Manoeuvring System engines for orbit insertion and de-orbit burns, with RCS thrusters.' },
  { id: 'ssme', name: 'RS-25 Main Engines', group: 'Propulsion', out: [0, -3.2, 2.4], spec: '3 × 2.28 MN vac · Isp 452 s', desc: 'Reusable staged-combustion hydrogen engines, throttleable 67–109%.' },
];
const BY = Object.fromEntries(SHUTTLE_PARTS.map((p) => [p.id, p]));

/* ---------------------------------------------------------- geometry kit --- */
function lathe(points, segs = 40) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segs);
}
const ogive = (R, L, n = 18) => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n;
  return [R * Math.sqrt(Math.max(0, 1 - t * t)) * (1 - 0.08 * t), t * L];
});
function wingShape() {
  // Double delta, in the orbiter's local frame (x = span, y = length, nose +y)
  const s = new THREE.Shape();
  s.moveTo(0.55, 1.2);
  s.lineTo(0.75, 0.2);
  s.lineTo(2.25, -1.55);
  s.lineTo(2.3, -1.85);
  s.lineTo(0.55, -1.85);
  s.lineTo(0.55, 1.2);
  return s;
}

/* ------------------------------------------------------------- engines --- */
function Plume({ size = 1, on, color = '#cfe8ff', long = 1 }) {
  const a = useRef();
  const b = useRef();
  useFrame((st) => {
    const t = on.current;
    const fl = 1 + Math.sin(st.clock.elapsedTime * 43) * 0.06;
    [a, b].forEach((r, i) => {
      if (!r.current) return;
      r.current.visible = t > 0.02;
      r.current.scale.set(t * fl * size, t * fl * size * long * (i ? 1.6 : 1), t * fl * size);
      r.current.material.opacity = (i ? 0.35 : 0.85) * Math.min(1, t * 1.5);
    });
  });
  return (
    <group>
      <mesh ref={a} position={[0, -0.9 * size, 0]} userData={{ fx: true }}>
        <coneGeometry args={[0.16, 1.8, 16, 1, true]} />
        <meshBasicMaterial color={color} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={b} position={[0, -1.5 * size, 0]} userData={{ fx: true }}>
        <coneGeometry args={[0.3, 3, 16, 1, true]} />
        <meshBasicMaterial color="#ff9a3c" transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* -------------------------------------------------------------- a part --- */
/* Owns the fly-in / fly-out: `state` 1 = seated, 0 = away (disassembled or
   removed). Removed parts shrink out; disassembled parts drift to `out`. */
function Part({ id, seat = [0, 0, 0], ui, children }) {
  const g = useRef();
  const k = useRef(0);
  const def = BY[id];
  useFrame((_, dt) => {
    const want = ui.current.parts[id];
    const target = want === 'in' ? 1 : 0;
    k.current += (target - k.current) * (1 - Math.pow(0.0025, dt));
    const e = (1 - k.current) * 0.78; // 0 seated … away (kept inside the frame)
    const removed = ui.current.removed[id];
    g.current.position.set(seat[0] + def.out[0] * e, seat[1] + def.out[1] * e, seat[2] + def.out[2] * e);
    g.current.rotation.y = e * 0.35 * (def.out[0] >= 0 ? 1 : -1);
    const s = removed ? Math.max(0.001, k.current) : 1;
    g.current.scale.setScalar(s);
    g.current.visible = s > 0.01;
    // materials: blueprint / selection / normal
    const sel = ui.current.selected === id;
    const bp = ui.current.blueprint;
    g.current.traverse((o) => {
      if (!o.isMesh || o.userData.fx) return;
      if (!o.userData.base) o.userData.base = o.material;
      o.material = sel ? SELECT : bp ? WIRE : o.userData.base;
    });
  });
  return (
    <group
      ref={g}
      onClick={(e) => {
        e.stopPropagation();
        ui.current.select(id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      {children}
      {ui.current.labels && (
        <Html center distanceFactor={14} position={[0, 0.2, 0]} style={{ pointerEvents: 'none' }}>
          <span className="shl-tag">{def.name}</span>
        </Html>
      )}
    </group>
  );
}

/* --------------------------------------------------------------- stack --- */
function Shuttle({ ui, thrust, srbOn }) {
  const tank = useMemo(() => lathe([[0, -4.1], [0.84, -4.0], [0.84, 1.9], [0, 1.9]], 48), []);
  const tankNose = useMemo(() => lathe(ogive(0.84, 2.1), 48), []);
  const srbBody = useMemo(() => lathe([[0, -4.0], [0.37, -4.0], [0.37, 3.1], [0, 3.1]], 32), []);
  const srbNose = useMemo(() => lathe(ogive(0.37, 1.0), 32), []);
  const srbSkirt = useMemo(() => lathe([[0.37, 0], [0.5, -0.5], [0.5, -0.55], [0.37, -0.05]], 32), []);
  const srbBell = useMemo(() => lathe([[0.16, 0], [0.24, -0.25], [0.34, -0.55]], 24), []);
  const noseCap = useMemo(() => lathe(ogive(0.36, 0.9), 32), []);
  const ssmeBell = useMemo(() => lathe([[0.07, 0], [0.12, -0.12], [0.2, -0.36], [0.24, -0.5]], 28), []);
  const wing = useMemo(() => new THREE.ExtrudeGeometry(wingShape(), { depth: 0.08, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 }), []);
  const geo = useMemo(() => {
    const L = 4.4; // fuselage length (extruded downward from the crew module)
    // Cross-section in (x, height). Floor at −0.47, walls to 0.2: an open-top U.
    const ch = new THREE.Shape();
    ch.moveTo(-0.5, -0.47);
    ch.lineTo(0.5, -0.47);
    ch.lineTo(0.5, 0.2);
    ch.lineTo(0.45, 0.2);
    ch.lineTo(0.45, -0.42);
    ch.lineTo(-0.45, -0.42);
    ch.lineTo(-0.45, 0.2);
    ch.lineTo(-0.5, 0.2);
    ch.closePath();
    // One payload-bay door: a quarter-ellipse shell from the wall to the spine.
    const door = new THREE.Shape();
    const N = 16;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * (Math.PI / 2);
      const x = Math.cos(a) * 0.5;
      const y = 0.2 + Math.sin(a) * 0.3;
      i ? door.lineTo(x, y) : door.moveTo(x, y);
    }
    for (let i = N; i >= 0; i--) {
      const a = (i / N) * (Math.PI / 2);
      door.lineTo(Math.cos(a) * 0.46, 0.2 + Math.sin(a) * 0.26);
    }
    door.closePath();
    // Fin in (height above the spine, length): leading edge swept aft.
    const f = new THREE.Shape();
    f.moveTo(0.45, 0.15);
    f.lineTo(0.45, -1.5);
    f.lineTo(1.9, -1.62);
    f.lineTo(1.9, -1.22);
    f.closePath();
    const ex = (shape, depth) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 16 });
    return { channel: ex(ch, L), door: ex(door, L - 0.2), fin: ex(f, 0.08) };
  }, []);

  // Orbiter sits on the tank's +z side; its belly faces the tank.
  const OZ = 1.25;
  return (
    <group>
      {/* ------------------------------- external tank --- */}
      <Part id="et" ui={ui}>
        <mesh geometry={tank} material={M.foam} castShadow receiveShadow />
        <mesh material={M.foamDark} position={[0, -0.6, 0]}>
          <cylinderGeometry args={[0.855, 0.855, 0.5, 48, 1, true]} />
        </mesh>
        {[-3.2, -1.8, 0.6].map((y) => (
          <mesh key={y} material={M.foamDark} position={[0, y, 0]}>
            <torusGeometry args={[0.845, 0.018, 6, 48]} />
          </mesh>
        ))}
      </Part>
      <Part id="et-nose" ui={ui} seat={[0, 1.9, 0]}>
        <mesh geometry={tankNose} material={M.foam} castShadow />
        <mesh material={M.dark} position={[0, 2.12, 0]}>
          <cylinderGeometry args={[0.03, 0.05, 0.24, 10]} />
        </mesh>
      </Part>
      <Part id="et-feed" ui={ui}>
        <mesh material={M.foamDark} position={[0.62, -0.8, 0.55]}>
          <cylinderGeometry args={[0.07, 0.07, 5.2, 12]} />
        </mesh>
        <mesh material={M.foamDark} position={[-0.5, -0.8, 0.66]}>
          <boxGeometry args={[0.1, 5.2, 0.08]} />
        </mesh>
      </Part>
      <Part id="struts" ui={ui}>
        {[
          [0, -3.6, 0.95, 0.9],
          [0, 1.3, 0.95, 0.5],
          [-1.0, -3.4, 0, 0.55],
          [1.0, -3.4, 0, 0.55],
          [-1.0, 1.0, 0, 0.45],
          [1.0, 1.0, 0, 0.45],
        ].map(([x, y, z, l], i) => (
          <mesh key={i} material={M.steel} position={[x, y, z]} rotation={x ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.04, 0.04, l, 8]} />
          </mesh>
        ))}
      </Part>

      {/* ------------------------------------- boosters --- */}
      {[
        ['srb-l', -1.3],
        ['srb-r', 1.3],
      ].map(([id, x]) => (
        <Part key={id} id={id} ui={ui} seat={[x, 0, 0]}>
          <mesh geometry={srbBody} material={M.srb} castShadow receiveShadow />
          <mesh geometry={srbNose} material={M.srb} position={[0, 3.1, 0]} castShadow />
          <mesh geometry={srbSkirt} material={M.srb} position={[0, -4.0, 0]} castShadow />
          <mesh geometry={srbBell} material={M.dark} position={[0, -4.5, 0]} />
          {[-2.4, -0.8, 0.8, 2.3].map((y) => (
            <mesh key={y} material={M.dark} position={[0, y, 0]}>
              <torusGeometry args={[0.375, 0.014, 6, 32]} />
            </mesh>
          ))}
          <mesh material={M.dark} position={[0, 2.4, 0]}>
            <cylinderGeometry args={[0.378, 0.378, 0.12, 32, 1, true]} />
          </mesh>
          <group position={[0, -4.85, 0]}>
            <Plume size={2.2} long={1.6} on={srbOn} color="#fff2c8" />
          </group>
        </Part>
      ))}

      {/* -------------------------------------- orbiter --- */}
      {/* Local frame: +y = nose, +z = the orbiter's top (away from the tank),
          −z = belly. Cross-sections are extruded along the length. */}
      <group position={[0, -1.05, OZ]}>
        <Part id="fuselage" ui={ui}>
          {/* U-channel: floor + side walls, open on top for the payload bay */}
          <mesh geometry={geo.channel} material={M.white} rotation={[Math.PI / 2, 0, 0]} position={[0, 2.95, 0]} castShadow receiveShadow />
          {/* aft fuselage: engine mount and OMS/fin base */}
          <mesh material={M.white} position={[0, -1.35, 0.02]} castShadow>
            <boxGeometry args={[1.12, 0.5, 1.02]} />
          </mesh>
          {/* bay liner glints gold where the doors open */}
          <mesh material={M.gold} position={[0, 0.75, -0.39]}>
            <boxGeometry args={[0.84, 4.2, 0.01]} />
          </mesh>
        </Part>
        <Part id="doors" ui={ui}>
          {[-1, 1].map((sx) => (
            <mesh key={sx} geometry={geo.door} material={M.white} rotation={[Math.PI / 2, 0, 0]} position={[0, 2.95, 0]} scale={[sx, 1, 1]} castShadow />
          ))}
          {/* radiator panels on the inner faces */}
          {[-1, 1].map((sx) => (
            <mesh key={'r' + sx} material={M.blue} position={[sx * 0.22, 0.75, 0.36]} rotation={[0, sx * 0.55, 0]}>
              <boxGeometry args={[0.3, 4.0, 0.012]} />
            </mesh>
          ))}
        </Part>
        <Part id="payload" ui={ui}>
          <mesh material={M.steel} position={[0.09, 1.25, -0.1]} castShadow>
            <cylinderGeometry args={[0.26, 0.26, 2.2, 28]} />
          </mesh>
          <mesh material={M.dark} position={[0.09, 2.4, -0.1]}>
            <cylinderGeometry args={[0.22, 0.26, 0.12, 28]} />
          </mesh>
          {[-1, 1].map((sx) => (
            <mesh key={sx} material={M.blue} position={[0.09 + sx * 0.3, 1.3, -0.1]}>
              <boxGeometry args={[0.02, 1.7, 0.3]} />
            </mesh>
          ))}
        </Part>
        <Part id="arm" ui={ui}>
          {/* shoulder → upper boom → elbow → lower boom → wrist */}
          <mesh material={M.dark} position={[-0.36, 2.55, 0.05]}>
            <sphereGeometry args={[0.055, 12, 12]} />
          </mesh>
          <mesh material={M.white} position={[-0.36, 1.45, 0.05]}>
            <cylinderGeometry args={[0.035, 0.035, 2.2, 10]} />
          </mesh>
          <mesh material={M.dark} position={[-0.36, 0.33, 0.05]}>
            <sphereGeometry args={[0.05, 12, 12]} />
          </mesh>
          <mesh material={M.white} position={[-0.36, -0.35, 0.05]}>
            <cylinderGeometry args={[0.03, 0.03, 1.3, 10]} />
          </mesh>
          <mesh material={M.gold} position={[-0.36, -1.02, 0.05]}>
            <boxGeometry args={[0.09, 0.1, 0.09]} />
          </mesh>
        </Part>
        <Part id="tiles" ui={ui}>
          {/* black HRSI tiles cover the belly and the underside of the nose */}
          <mesh material={M.tile} position={[0, 0.8, -0.5]} receiveShadow>
            <boxGeometry args={[1.06, 4.7, 0.035]} />
          </mesh>
          <mesh material={M.tile} position={[0, -1.35, -0.52]}>
            <boxGeometry args={[1.14, 0.5, 0.03]} />
          </mesh>
          {/* tile grid lines */}
          {Array.from({ length: 12 }, (_, i) => (
            <mesh key={i} material={M.rcc} position={[0, -1.4 + i * 0.4, -0.52]}>
              <boxGeometry args={[1.07, 0.008, 0.01]} />
            </mesh>
          ))}
        </Part>
        <Part id="crew" ui={ui} seat={[0, 3.25, 0]}>
          <mesh material={M.white} position={[0, 0, 0.02]} castShadow>
            <boxGeometry args={[1.0, 0.6, 0.98]} />
          </mesh>
          <mesh geometry={noseCap} material={M.white} position={[0, 0.3, -0.02]} scale={[1.36, 1, 1.32]} castShadow />
          <mesh material={M.rcc} position={[0, 1.13, -0.05]}>
            <sphereGeometry args={[0.12, 16, 12]} />
          </mesh>
          {/* flight-deck windows on the top face, raked forward */}
          {[-0.3, -0.1, 0.1, 0.3].map((x) => (
            <mesh key={x} material={M.glass} position={[x, 0.42, 0.44]} rotation={[-0.75, 0, 0]}>
              <boxGeometry args={[0.17, 0.16, 0.02]} />
            </mesh>
          ))}
          <mesh material={M.tile} position={[0, 0.25, -0.5]}>
            <boxGeometry args={[1.0, 1.1, 0.03]} />
          </mesh>
          {/* forward RCS thruster ports */}
          {[-0.36, 0.36].map((x) => (
            <mesh key={x} material={M.dark} position={[x, 0.75, 0.2]}>
              <boxGeometry args={[0.12, 0.08, 0.1]} />
            </mesh>
          ))}
        </Part>
        <Part id="wings" ui={ui}>
          {[-1, 1].map((sx) => (
            <group key={sx} scale={[sx, 1, 1]} position={[0, 0.2, -0.42]}>
              <mesh geometry={wing} material={M.white} castShadow receiveShadow />
              {/* RCC leading edge along the main sweep */}
              <mesh material={M.rcc} position={[1.5, -0.675, 0.04]} rotation={[0, 0, -2.433]}>
                <boxGeometry args={[0.07, 2.32, 0.13]} />
              </mesh>
              {/* strake leading edge */}
              <mesh material={M.rcc} position={[0.65, 0.7, 0.04]} rotation={[0, 0, -0.197]}>
                <boxGeometry args={[0.06, 1.02, 0.12]} />
              </mesh>
              <mesh material={M.tile} position={[1.35, -0.95, -0.045]}>
                <boxGeometry args={[1.7, 1.7, 0.02]} />
              </mesh>
              {/* elevons */}
              {[0.95, 1.8].map((x) => (
                <mesh key={x} material={M.dark} position={[x, -1.9, 0.04]}>
                  <boxGeometry args={[0.78, 0.1, 0.06]} />
                </mesh>
              ))}
            </group>
          ))}
        </Part>
        <Part id="tail" ui={ui}>
          <mesh geometry={geo.fin} material={M.white} rotation={[0, -Math.PI / 2, 0]} position={[0.04, 0, 0]} castShadow />
          {/* split rudder / speed brake panel */}
          <mesh material={M.dark} position={[0, -1.43, 1.25]} rotation={[0.14, 0, 0]}>
            <boxGeometry args={[0.085, 0.05, 1.1]} />
          </mesh>
        </Part>
        <Part id="oms" ui={ui} seat={[0, -1.0, 0.42]}>
          {[-1, 1].map((sx) => (
            <group key={sx} position={[sx * 0.4, 0, 0]}>
              <mesh material={M.white} castShadow>
                <capsuleGeometry args={[0.17, 0.75, 6, 16]} />
              </mesh>
              <mesh material={M.tile} position={[0, 0.1, 0.12]}>
                <boxGeometry args={[0.2, 0.5, 0.02]} />
              </mesh>
              <mesh material={M.bell} position={[0, -0.62, 0]}>
                <coneGeometry args={[0.09, 0.22, 16, 1, true]} />
              </mesh>
            </group>
          ))}
        </Part>
        <Part id="ssme" ui={ui} seat={[0, -1.62, 0.02]}>
          {[
            [0, 0.26],
            [-0.28, -0.12],
            [0.28, -0.12],
          ].map(([x, z], i) => (
            <group key={i} position={[x, 0, z]}>
              <mesh geometry={ssmeBell} material={M.bell} castShadow />
              <mesh material={M.steel} position={[0, 0.08, 0]}>
                <cylinderGeometry args={[0.08, 0.1, 0.18, 14]} />
              </mesh>
              <mesh material={M.gold} position={[0, 0.04, 0]}>
                <torusGeometry args={[0.1, 0.012, 6, 20]} />
              </mesh>
              <group position={[0, -0.52, 0]}>
                <Plume size={0.9} long={1.3} on={thrust} color="#bfe6ff" />
              </group>
            </group>
          ))}
        </Part>
      </group>
    </group>
  );
}

/* Launch sequence + camera follow; drives thrust refs without re-rendering. */
function Director({ ui, thrust, srbOn, stack, controls, onPhase }) {
  const { camera } = useThree();
  const t0 = useRef(null);
  const phase = useRef('pad');
  useFrame((st, dt) => {
    const L = ui.current.launch;
    if (!L) {
      t0.current = null;
      thrust.current += (0 - thrust.current) * Math.min(1, dt * 3);
      srbOn.current += (0 - srbOn.current) * Math.min(1, dt * 3);
      stack.current.position.y += (0 - stack.current.position.y) * Math.min(1, dt * 2);
      if (phase.current !== 'pad') onPhase((phase.current = 'pad'));
      return;
    }
    if (t0.current == null) t0.current = st.clock.elapsedTime;
    const t = st.clock.elapsedTime - t0.current;
    const set = (p) => phase.current !== p && onPhase((phase.current = p));
    if (t < 1.4) {
      set('SSME ignition');
      thrust.current = Math.min(1, t / 1.2);
    } else if (t < 2.2) {
      set('SRB ignition · lift-off');
      srbOn.current = Math.min(1, (t - 1.4) / 0.4);
    } else if (t < 9) {
      set('Roll & ascent');
      const a = t - 2.2;
      stack.current.position.y = 0.35 * a * a;
      stack.current.rotation.z = -Math.min(0.35, a * 0.05);
    } else if (t < 13) {
      set('SRB separation');
      srbOn.current = Math.max(0, srbOn.current - dt * 2);
      ui.current.parts['srb-l'] = 'out';
      ui.current.parts['srb-r'] = 'out';
      stack.current.position.y += dt * 6;
    } else {
      set('MECO · orbit insertion');
      ui.current.launch = false;
    }
    // camera follows the stack upward
    if (controls.current) {
      // aim below the stack so the plumes stay in frame
      const aim = stack.current.position.y - (L ? 2.2 : 0);
      controls.current.target.y += (aim - controls.current.target.y) * Math.min(1, dt * 2.5);
      camera.position.y += (aim + 1.2 - camera.position.y) * Math.min(1, dt * 1.5);
    }
  });
  return null;
}

export default function ShuttleLab() {
  const [, force] = useState(0);
  const redraw = () => force((x) => x + 1);
  const thrust = useRef(0);
  const srbOn = useRef(0);
  const stack = useRef();
  const controls = useRef();
  const [phase, setPhase] = useState('pad');
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const timers = useRef([]);
  const ui = useRef({
    parts: Object.fromEntries(SHUTTLE_PARTS.map((p) => [p.id, 'in'])),
    removed: {},
    selected: null,
    blueprint: false,
    labels: false,
    launch: false,
    select: (id) => {
      ui.current.selected = ui.current.selected === id ? null : id;
      setSelected(ui.current.selected);
    },
  });
  const u = ui.current;
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const clearT = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  // Staggered sequences: outer parts leave first, core parts return first.
  const disassemble = () => {
    clearT();
    u.launch = false;
    setBusy(true);
    const order = [...SHUTTLE_PARTS].reverse();
    order.forEach((p, i) => timers.current.push(setTimeout(() => ((u.parts[p.id] = 'out'), redraw()), i * 180)));
    timers.current.push(setTimeout(() => setBusy(false), order.length * 180 + 400));
  };
  const assemble = () => {
    clearT();
    u.launch = false;
    setBusy(true);
    SHUTTLE_PARTS.forEach((p, i) =>
      timers.current.push(
        setTimeout(() => {
          u.parts[p.id] = 'in';
          u.removed[p.id] = false;
          redraw();
        }, i * 200),
      ),
    );
    timers.current.push(setTimeout(() => setBusy(false), SHUTTLE_PARTS.length * 200 + 400));
  };
  const toggle = (id) => {
    const inNow = u.parts[id] === 'in' && !u.removed[id];
    u.parts[id] = inNow ? 'out' : 'in';
    u.removed[id] = inNow;
    redraw();
  };
  const launch = () => {
    clearT();
    SHUTTLE_PARTS.forEach((p) => {
      u.parts[p.id] = 'in';
      u.removed[p.id] = false;
    });
    u.selected = null;
    setSelected(null);
    u.launch = true;
    redraw();
  };
  const reset = () => {
    clearT();
    u.launch = false;
    SHUTTLE_PARTS.forEach((p) => {
      u.parts[p.id] = 'in';
      u.removed[p.id] = false;
    });
    if (stack.current) stack.current.rotation.z = 0;
    if (controls.current) controls.current.target.set(0, 0, 0);
    redraw();
  };

  // Jarvis can drive the lab: "disassemble the shuttle", "launch the shuttle"…
  useEffect(() => {
    const on = (e) => ({ assemble, disassemble, launch, reset, blueprint: () => ((u.blueprint = !u.blueprint), redraw()) })[e.detail]?.();
    window.addEventListener('rh-shuttle', on);
    return () => window.removeEventListener('rh-shuttle', on);
  });

  const groups = [...new Set(SHUTTLE_PARTS.map((p) => p.group))];
  const sel = selected && BY[selected];
  const seated = SHUTTLE_PARTS.filter((p) => u.parts[p.id] === 'in' && !u.removed[p.id]).length;

  return (
    <section className="shl" aria-label="Space Shuttle assembly lab">
      <div className="shl__view">
        <Stage camera={{ position: [9.5, 2.4, 13.5], fov: 38 }} shadows>
          <group ref={stack}>
            <Shuttle ui={ui} thrust={thrust} srbOn={srbOn} />
          </group>
          <Director ui={ui} thrust={thrust} srbOn={srbOn} stack={stack} controls={controls} onPhase={setPhase} />
          <OrbitControls ref={controls} makeDefault enablePan={false} minDistance={5} maxDistance={24} autoRotate={!u.launch && !selected} autoRotateSpeed={0.5} />
          <GridFloor y={-4.9} size={60} />
          <Dust count={140} spread={20} />
        </Stage>

        {/* HUD overlay */}
        <div className="shl__hud" aria-hidden="true">
          <i className="shl__c shl__c--tl" />
          <i className="shl__c shl__c--tr" />
          <i className="shl__c shl__c--bl" />
          <i className="shl__c shl__c--br" />
          <div className="shl__title mono">
            <b>STS · SPACE TRANSPORTATION SYSTEM</b>
            <span>
              LAB-06 · {seated}/{SHUTTLE_PARTS.length} assemblies seated · {u.launch ? phase.toUpperCase() : u.blueprint ? 'BLUEPRINT' : 'INSPECTION'}
            </span>
          </div>
          {u.launch && (
            <div className="shl__telemetry mono">
              <span>PHASE</span>
              <b>{phase}</b>
              <span>THRUST</span>
              <b>{phase.startsWith('SSME') ? '6.8 MN' : '31.2 MN'}</b>
            </div>
          )}
        </div>

        {sel && (
          <aside className="shl__info">
            <span className="mono">{sel.group}</span>
            <b>{sel.name}</b>
            <em className="mono">{sel.spec}</em>
            <p>{sel.desc}</p>
            <div>
              <button type="button" onClick={() => toggle(sel.id)}>
                {u.parts[sel.id] === 'in' && !u.removed[sel.id] ? 'Remove part' : 'Add part'}
              </button>
              <button type="button" onClick={() => u.select(sel.id)}>
                Close
              </button>
            </div>
          </aside>
        )}
      </div>

      <div className="shl__panel">
        <div className="shl__acts">
          <button type="button" className="is-primary" onClick={assemble} disabled={busy}>
            Assemble
          </button>
          <button type="button" onClick={disassemble} disabled={busy}>
            Disassemble
          </button>
          <button type="button" className="is-launch" onClick={launch} disabled={u.launch}>
            Launch
          </button>
          <button type="button" aria-pressed={u.blueprint} onClick={() => ((u.blueprint = !u.blueprint), redraw())}>
            Blueprint
          </button>
          <button type="button" aria-pressed={u.labels} onClick={() => ((u.labels = !u.labels), redraw())}>
            Labels
          </button>
          <button type="button" onClick={reset}>
            Reset
          </button>
        </div>
        <div className="shl__parts">
          {groups.map((g) => (
            <div key={g} className="shl__group">
              <span className="mono">{g}</span>
              {SHUTTLE_PARTS.filter((p) => p.group === g).map((p) => {
                const on = u.parts[p.id] === 'in' && !u.removed[p.id];
                return (
                  <div key={p.id} className="shl__part" data-on={on} data-sel={selected === p.id}>
                    <button type="button" className="shl__name" onClick={() => u.select(p.id)}>
                      {p.name}
                    </button>
                    <button type="button" className="shl__tog" onClick={() => toggle(p.id)} aria-label={on ? `Remove ${p.name}` : `Add ${p.name}`} aria-pressed={on}>
                      {on ? '−' : '+'}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
