import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { perfTier, prefersReducedMotion } from '../hooks/useEnv';

/* -----------------------------------------------------------------------------
 * Atmospheric layers shared by the hero and the lab viewports: a star field, a
 * near dust layer that parallaxes against the pointer, and a perspective grid
 * floor. All three are single draw calls.
 * -------------------------------------------------------------------------- */

/** Deterministic PRNG so the star field is identical between reloads. */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* --- star field ----------------------------------------------------------- */

export function Starfield({ count, radius = 60, seed = 7 }) {
  const tier = perfTier();
  const n = count ?? (tier >= 2 ? 1400 : tier === 1 ? 700 : 320);
  const ref = useRef();

  const [positions, colors, sizes] = useMemo(() => {
    const rnd = mulberry32(seed);
    const p = new Float32Array(n * 3);
    const c = new Float32Array(n * 3);
    const s = new Float32Array(n);
    const cool = new THREE.Color('#9fd8ff');
    const warm = new THREE.Color('#ffd9a8');
    const white = new THREE.Color('#ffffff');

    for (let i = 0; i < n; i++) {
      // Even distribution on a sphere shell, biased outward so the near field
      // stays clear of the models.
      const u = rnd() * 2 - 1;
      const th = rnd() * Math.PI * 2;
      const r = radius * (0.55 + rnd() * 0.45);
      const sp = Math.sqrt(1 - u * u);
      p[i * 3] = Math.cos(th) * sp * r;
      p[i * 3 + 1] = u * r * 0.62;
      p[i * 3 + 2] = Math.sin(th) * sp * r;

      const pick = rnd();
      const col = pick > 0.86 ? warm : pick > 0.5 ? cool : white;
      c[i * 3] = col.r;
      c[i * 3 + 1] = col.g;
      c[i * 3 + 2] = col.b;
      s[i] = 0.09 + rnd() * 0.22;
    }
    return [p, c, s];
  }, [n, radius, seed]);

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    return g;
  }, [positions, colors, sizes]);

  // Per-point size and a slow twinkle, done on the GPU.
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uScale: { value: 260 } },
        vertexShader: /* glsl */ `
          attribute float aSize;
          varying vec3 vColor;
          varying float vTw;
          uniform float uTime;
          uniform float uScale;
          void main() {
            vColor = color;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vTw = 0.65 + 0.35 * sin(uTime * 1.4 + position.x * 0.7 + position.z * 0.4);
            gl_PointSize = aSize * uScale / max(0.001, -mv.z);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec3 vColor;
          varying float vTw;
          void main() {
            vec2 d = gl_PointCoord - 0.5;
            float a = smoothstep(0.5, 0.0, length(d));
            gl_FragColor = vec4(vColor, a * a * vTw);
          }
        `,
        vertexColors: true,
      }),
    []
  );

  useFrame((state, dt) => {
    mat.uniforms.uTime.value = state.clock.elapsedTime;
    if (ref.current) ref.current.rotation.y += dt * 0.008;
  });

  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} />;
}

/* --- near dust ------------------------------------------------------------ */

/**
 * Foreground motes. They drift upward, wrap around, and lean toward the
 * pointer — which is what sells the volume as a space rather than a backdrop.
 */
export function Dust({ count, spread = 16, seed = 21 }) {
  const tier = perfTier();
  const n = count ?? (tier >= 2 ? 260 : tier === 1 ? 140 : 60);
  const ref = useRef();
  const { pointer } = useThree();
  const reduced = prefersReducedMotion();

  const { geo, speeds, base } = useMemo(() => {
    const rnd = mulberry32(seed);
    const p = new Float32Array(n * 3);
    const sp = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      p[i * 3] = (rnd() - 0.5) * spread;
      p[i * 3 + 1] = (rnd() - 0.5) * spread * 0.8;
      p[i * 3 + 2] = (rnd() - 0.5) * spread * 0.6;
      sp[i] = 0.12 + rnd() * 0.4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    return { geo: g, speeds: sp, base: p.slice() };
  }, [n, spread, seed]);

  const mat = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.035,
        color: new THREE.Color('#8fd6ff'),
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    []
  );

  useFrame((state, dt) => {
    if (reduced) return; // static field: still present, no drift
    const arr = geo.attributes.position.array;
    const top = spread * 0.4;
    for (let i = 0; i < n; i++) {
      arr[i * 3 + 1] += speeds[i] * dt;
      if (arr[i * 3 + 1] > top) arr[i * 3 + 1] = -top;
      // Lateral sway keyed off the original x so motes do not move in lockstep.
      arr[i * 3] = base[i * 3] + Math.sin(state.clock.elapsedTime * 0.3 + i) * 0.18;
    }
    geo.attributes.position.needsUpdate = true;

    if (ref.current) {
      ref.current.rotation.y = THREE.MathUtils.lerp(ref.current.rotation.y, pointer.x * 0.16, 1 - Math.pow(0.01, dt));
      ref.current.rotation.x = THREE.MathUtils.lerp(ref.current.rotation.x, -pointer.y * 0.1, 1 - Math.pow(0.01, dt));
    }
  });

  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} />;
}

/* --- grid floor ----------------------------------------------------------- */

/**
 * Perspective reference grid with a radial fade. Drawn in a shader rather than
 * as line geometry so the fade is smooth and it stays one draw call.
 */
export function GridFloor({ y = -3.2, size = 46, cell = 1.1, color = '#56dcff' }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          uCell: { value: cell },
          uTime: { value: 0 },
          uSize: { value: size },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          varying vec3 vPos;
          void main() {
            vUv = uv;
            vPos = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec2 vUv;
          varying vec3 vPos;
          uniform vec3 uColor;
          uniform float uCell;
          uniform float uTime;
          uniform float uSize;

          // Analytic anti-aliased grid: derivative-based line width keeps the
          // far side of the plane from aliasing into moire.
          float grid(vec2 p, float w) {
            vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
            float line = min(g.x, g.y);
            return 1.0 - min(line * w, 1.0);
          }

          void main() {
            vec2 p = vPos.xy / uCell;
            float fine = grid(p, 1.0) * 0.5;
            float coarse = grid(p * 0.2, 1.3) * 0.85;
            float g = max(fine, coarse);

            float d = length(vPos.xy) / (uSize * 0.5);
            float fade = smoothstep(1.0, 0.15, d);

            // A slow scan sweep outward from the centre.
            float scan = 0.14 * smoothstep(0.06, 0.0, abs(fract(d * 1.6 - uTime * 0.08) - 0.5) - 0.44);

            float a = (g * fade * 0.55) + scan * fade;
            if (a < 0.002) discard;
            gl_FragColor = vec4(uColor, a);
          }
        `,
      }),
    [cell, color, size]
  );

  useFrame((state) => {
    mat.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <mesh material={mat} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
      <planeGeometry args={[size, size]} />
    </mesh>
  );
}
