import * as THREE from 'three';

/* -----------------------------------------------------------------------------
 * Shared material library.
 *
 * Materials are created once at module scope and reused across every scene.
 * Three.js compiles a shader program per unique material configuration, so
 * sharing these keeps the program count (and the first-frame compile cost) flat
 * no matter how many parts the assemblies grow to.
 *
 * Colours are authored in sRGB and converted on assignment, which is what
 * three's default colour management expects since r152.
 * -------------------------------------------------------------------------- */

const srgb = (hex) => new THREE.Color().setStyle(hex, THREE.SRGBColorSpace);

/** Brushed aluminium — the default airframe / body panel surface. */
export const alloy = new THREE.MeshStandardMaterial({
  color: srgb('#c8d2e0'),
  metalness: 0.92,
  roughness: 0.28,
  envMapIntensity: 1.15,
});

/** Darker structural metal for frames, brackets and subassemblies. */
export const steel = new THREE.MeshStandardMaterial({
  color: srgb('#6d7889'),
  metalness: 0.88,
  roughness: 0.38,
  envMapIntensity: 0.95,
});

/** Near-black anodised parts — engine blocks, calipers, housings. */
export const graphite = new THREE.MeshStandardMaterial({
  color: srgb('#2a3038'),
  metalness: 0.72,
  roughness: 0.44,
  envMapIntensity: 0.8,
});

/** Rubber / tyre / seal. Deliberately non-metallic so it reads as soft. */
export const rubber = new THREE.MeshStandardMaterial({
  color: srgb('#14171c'),
  metalness: 0.05,
  roughness: 0.92,
});

/** Heat-treated nozzle and exhaust metal — warm, slightly burnished. */
export const inconel = new THREE.MeshStandardMaterial({
  color: srgb('#8a7f74'),
  metalness: 0.95,
  roughness: 0.33,
  envMapIntensity: 1.2,
});

/** Copper piping and coils. */
export const copper = new THREE.MeshStandardMaterial({
  color: srgb('#c07a48'),
  metalness: 0.95,
  roughness: 0.3,
  envMapIntensity: 1.1,
});

/** Accent-lit trim: emissive so it glows without needing its own light. */
export const emissive = new THREE.MeshStandardMaterial({
  color: srgb('#0a1420'),
  emissive: srgb('#56dcff'),
  emissiveIntensity: 1.4,
  metalness: 0.4,
  roughness: 0.5,
});

/** Warm emissive for combustion, brake heat and warning trim. */
export const hot = new THREE.MeshStandardMaterial({
  color: srgb('#1a0e05'),
  emissive: srgb('#ff8a1e'),
  emissiveIntensity: 2.2,
  metalness: 0.3,
  roughness: 0.6,
});

/** Glazing — cabin glass, instrument covers. */
export const glazing = new THREE.MeshPhysicalMaterial({
  color: srgb('#8fc8ea'),
  metalness: 0,
  roughness: 0.06,
  transmission: 0.72,
  thickness: 0.4,
  ior: 1.45,
  transparent: true,
  opacity: 0.55,
  envMapIntensity: 1.4,
});

/** Painted body colour. */
export const paint = new THREE.MeshPhysicalMaterial({
  color: srgb('#16294a'),
  metalness: 0.6,
  roughness: 0.26,
  clearcoat: 1,
  clearcoatRoughness: 0.08,
  envMapIntensity: 1.3,
});

/**
 * Selection / hover highlight. Clones the part material and lifts its emissive
 * channel, so highlighting never mutates the shared instances above — those are
 * reused across every assembly and a direct edit would light all of them.
 * Callers own the clone and must dispose it when the highlight is removed.
 */
export function highlightOf(base, intensity = 0.55) {
  const m = base.clone();
  m.emissive = srgb('#56dcff');
  m.emissiveIntensity = intensity;
  return m;
}
