/* -----------------------------------------------------------------------------
 * Engineering utilities — one implementation shared by the labs and by
 * J.A.R.V.I.S., so an answer in the console and the drawing in LAB-04 can never
 * disagree. Pure functions, SI units internally, no dependencies.
 * -------------------------------------------------------------------------- */

/**
 * Manning, partially full circular pipe (moved here from PipeLab).
 *   D metres · y = d/D · S m/m · n Manning roughness
 *   θ = 2·acos(1 − 2y) · A = D²/8 (θ − sin θ) · P = Dθ/2 · R = A/P
 *   V = (1/n) R^(2/3) S^(1/2) · Q = A·V
 */
export function hyd(D, y, S, n) {
  const r = Math.min(0.9999, Math.max(0.0001, y));
  const th = 2 * Math.acos(1 - 2 * r);
  const A = ((D * D) / 8) * (th - Math.sin(th));
  const P = (D * th) / 2;
  const R = A / P;
  const V = (1 / n) * Math.pow(R, 2 / 3) * Math.sqrt(S);
  return { A, P, R, V, Q: A * V, th, T: D * Math.sin(th / 2) };
}

export const MATERIALS = [
  { id: 'upvc', label: 'uPVC', n: 0.011 },
  { id: 'grp', label: 'GRP', n: 0.01 },
  { id: 'rcc', label: 'RCC', n: 0.013 },
  { id: 'vc', label: 'Vitrified clay', n: 0.014 },
];

const f = (v, d = 3) => (Number.isFinite(v) ? Number(v.toFixed(d)).toLocaleString('en-US', { maximumFractionDigits: d }) : '—');

/** Mean velocity from continuity for a pipe flowing full: V = Q / (πD²/4). */
export function pipeVelocity({ diameter_mm, flow_lps }) {
  if (!(diameter_mm > 0) || !(flow_lps > 0)) throw new Error('diameter and flow must both be positive');
  const D = diameter_mm / 1000;
  const Q = flow_lps / 1000;
  const A = (Math.PI * D * D) / 4;
  const V = Q / A;
  const band = V < 0.6 ? 'below 0.6 m/s — risk of deposition in a gravity sewer' : V > 3 ? 'above 3 m/s — check scour / water hammer' : 'within the usual 0.6 – 3 m/s design band';
  return {
    V,
    A,
    text: `Velocity ≈ **${f(V, 2)} m/s** for ${f(flow_lps, 2)} L/s in a ${f(diameter_mm, 0)} mm pipe (full-bore, V = Q ÷ A).`,
    list: [`Area A = π·D²/4 = ${f(A, 4)} m²`, `Q = ${f(Q, 4)} m³/s`, `V = ${f(V, 3)} m/s — ${band}`],
  };
}

/** Manning capacity for a circular pipe at a given slope and fill. */
export function pipeFlow({ diameter_mm, slope_pct, n = 0.013, depth_ratio = 1 }) {
  if (!(diameter_mm > 0) || !(slope_pct > 0)) throw new Error('diameter and slope must both be positive');
  const D = diameter_mm / 1000;
  const r = hyd(D, depth_ratio, slope_pct / 100, n);
  const full = hyd(D, 0.9999, slope_pct / 100, n);
  return {
    ...r,
    text: `Manning: **${f(r.Q * 1000, 1)} L/s** at **${f(r.V, 2)} m/s** — ${f(diameter_mm, 0)} mm pipe, slope ${f(slope_pct, 3)}%, n = ${n}, d/D = ${f(depth_ratio, 2)}.`,
    list: [
      `Flow area ${f(r.A, 4)} m² · wetted perimeter ${f(r.P, 3)} m · R = ${f(r.R, 4)} m`,
      `Full-bore capacity ${f(full.Q * 1000, 1)} L/s at ${f(full.V, 2)} m/s`,
      r.V >= 0.6 ? 'Self-cleansing: OK (V ≥ 0.6 m/s)' : 'Self-cleansing: NOT met (V < 0.6 m/s)',
    ],
  };
}

/* ------------------------------------------------------------ units --- */

// factor to the SI base of each dimension
const U = {
  length: { mm: 1e-3, cm: 1e-2, m: 1, km: 1e3, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 },
  area: { mm2: 1e-6, cm2: 1e-4, m2: 1, km2: 1e6, ha: 1e4, acre: 4046.8564224, ft2: 0.09290304, in2: 6.4516e-4, decimal: 40.468564224, katha: 66.89, bigha: 1337.8 },
  volume: { ml: 1e-6, l: 1e-3, m3: 1, ft3: 0.028316846592, gal: 0.003785411784, ukgal: 0.00454609 },
  flow: { lps: 1e-3, 'm3/s': 1, 'm3/h': 1 / 3600, 'm3/d': 1 / 86400, mld: 1000 / 86400, gpm: 0.003785411784 / 60, cfs: 0.028316846592, lpm: 1e-3 / 60 },
  pressure: { pa: 1, kpa: 1e3, mpa: 1e6, bar: 1e5, psi: 6894.757293, atm: 101325, mh2o: 9806.65 },
  mass: { g: 1e-3, kg: 1, t: 1e3, lb: 0.45359237 },
  force: { n: 1, kn: 1e3, kgf: 9.80665, lbf: 4.4482216153 },
  speed: { 'm/s': 1, 'km/h': 1 / 3.6, mph: 0.44704, 'ft/s': 0.3048 },
};

const ALIAS = {
  millimetre: 'mm', millimeter: 'mm', millimetres: 'mm', millimeters: 'mm', centimetre: 'cm', centimeter: 'cm', metre: 'm', meter: 'm', metres: 'm', meters: 'm', kilometre: 'km', kilometer: 'km',
  inch: 'in', inches: 'in', '"': 'in', foot: 'ft', feet: 'ft', "'": 'ft', yard: 'yd', yards: 'yd', mile: 'mi', miles: 'mi',
  'sq m': 'm2', 'sqm': 'm2', 'm²': 'm2', 'sq ft': 'ft2', sqft: 'ft2', 'ft²': 'ft2', 'sq in': 'in2', hectare: 'ha', hectares: 'ha', acres: 'acre', decimals: 'decimal', shotangsho: 'decimal', kathas: 'katha', bighas: 'bigha', 'sq km': 'km2', 'km²': 'km2', 'cm²': 'cm2', 'mm²': 'mm2',
  litre: 'l', liter: 'l', litres: 'l', liters: 'l', 'm³': 'm3', cum: 'm3', 'cubic metre': 'm3', 'cubic meter': 'm3', cft: 'ft3', 'cu ft': 'ft3', 'ft³': 'ft3', gallon: 'gal', gallons: 'gal', 'us gal': 'gal', 'uk gal': 'ukgal',
  'l/s': 'lps', 'lit/s': 'lps', 'litres per second': 'lps', 'liters per second': 'lps', 'm³/s': 'm3/s', cumec: 'm3/s', cumecs: 'm3/s', 'm³/h': 'm3/h', 'm3/hr': 'm3/h', 'm³/d': 'm3/d', 'm3/day': 'm3/d', 'l/min': 'lpm', 'ft3/s': 'cfs',
  kilopascal: 'kpa', megapascal: 'mpa', 'n/mm2': 'mpa', 'n/mm²': 'mpa', 'm wc': 'mh2o', mwc: 'mh2o', 'm head': 'mh2o', 'metre head': 'mh2o',
  kilogram: 'kg', kilograms: 'kg', kgs: 'kg', tonne: 't', tonnes: 't', ton: 't', tons: 't', pound: 'lb', pounds: 'lb', lbs: 'lb', gram: 'g', grams: 'g',
  newton: 'n', newtons: 'n', kilonewton: 'kn', kilonewtons: 'kn',
  kmh: 'km/h', kph: 'km/h', 'km/hr': 'km/h', mps: 'm/s', fps: 'ft/s',
  celsius: 'c', '°c': 'c', fahrenheit: 'f', '°f': 'f', kelvin: 'k',
};

export function unitKey(u) {
  const k = String(u || '').toLowerCase().trim().replace(/\s+/g, ' ');
  return ALIAS[k] || k;
}

function dimOf(k) {
  if (['c', 'f', 'k'].includes(k)) return 'temperature';
  return Object.keys(U).find((d) => k in U[d]) || null;
}

export function convert({ value, from, to }) {
  const a = unitKey(from);
  const b = unitKey(to);
  const da = dimOf(a);
  const db = dimOf(b);
  if (!da || !db) throw new Error(`unknown unit “${!da ? from : to}”`);
  if (da !== db) throw new Error(`can’t convert ${da} to ${db}`);
  let out;
  if (da === 'temperature') {
    const c = a === 'c' ? value : a === 'f' ? ((value - 32) * 5) / 9 : value - 273.15;
    out = b === 'c' ? c : b === 'f' ? (c * 9) / 5 + 32 : c + 273.15;
  } else out = (value * U[da][a]) / U[da][b];
  const note = ['katha', 'bigha', 'decimal'].includes(a) || ['katha', 'bigha', 'decimal'].includes(b) ? ' (standard values: 1 katha = 720 ft², 1 bigha = 20 katha)' : '';
  return { value: out, text: `${f(value, 6)} ${from} = **${f(out, 6)} ${to}**${note}` };
}

/* ---------------------------------------------------------- parsing --- */

const NUM = '(\\d+(?:[.,]\\d+)?)';
const num = (s) => parseFloat(String(s).replace(/,/g, ''));

function diameterOf(s) {
  let m = s.match(new RegExp(`${NUM}\\s*(mm|millimet(?:er|re)s?)\\b`)) || s.match(new RegExp(`(?:\\bdia(?:meter)?|\\bd|ø)\\s*(?:=|of)?\\s*${NUM}\\s*(mm)?\\b`));
  if (m) return num(m[1]);
  m = s.match(new RegExp(`${NUM}\\s*(?:inch(?:es)?|in|")\\s*(?:pipe|dia)`));
  if (m) return num(m[1]) * 25.4;
  m = s.match(new RegExp(`${NUM}\\s*m\\b\\s*(?:dia|pipe|diameter)`));
  return m ? num(m[1]) * 1000 : null;
}

function flowOf(s) {
  const m = s.match(new RegExp(`${NUM}\\s*(l\\/s|lps|lit(?:re|er)s? ?(?:per|\\/) ?s(?:ec(?:ond)?)?|m3\\/s|m³\\/s|cumecs?|m3\\/h(?:r)?|m³\\/h|mld|gpm|l\\/min|lpm)`));
  if (!m) return null;
  const u = unitKey(m[2].replace(/lit(?:re|er)s? ?(?:per|\/) ?s(?:ec(?:ond)?)?/, 'l/s'));
  return (num(m[1]) * U.flow[u in U.flow ? u : 'lps']) * 1000; // → L/s
}

function slopeOf(s) {
  let m = s.match(new RegExp(`\\b(?:slope|gradient|grade|s)\\b\\s*(?:=|of)?\\s*${NUM}\\s*%`)) || s.match(new RegExp(`${NUM}\\s*%\\s*(?:slope|gradient|grade|fall)`));
  if (m) return num(m[1]);
  m = s.match(/(?:slope|gradient)\s*(?:=|of)?\s*1\s*(?:in|:)\s*(\d+(?:\.\d+)?)/) || s.match(/\b1\s*in\s*(\d+(?:\.\d+)?)\b/);
  if (m) return 100 / num(m[1]);
  m = s.match(new RegExp(`(?:slope|gradient)\\s*(?:=|of)?\\s*(0?\\.\\d+)\\b`));
  return m ? num(m[1]) * 100 : null;
}

function nOf(s) {
  const m = s.match(/\bn\s*=?\s*(0?\.0\d+)/);
  if (m) return num(m[1]);
  return MATERIALS.find((x) => s.includes(x.id) || s.includes(x.label.toLowerCase()))?.n;
}

function depthOf(s) {
  let m = s.match(/d\s*\/\s*d\s*(?:=|of)?\s*(0?\.\d+|1(?:\.0+)?)/);
  if (m) return num(m[1]);
  m = s.match(new RegExp(`${NUM}\\s*%\\s*(?:full|depth)`));
  return m ? num(m[1]) / 100 : null;
}

/**
 * Natural-language pipe maths. `lab` is the live state PipeLab publishes to the
 * OS context, used to fill in whatever the user leaves out while they are in
 * the lab ("what's the velocity?" → the lab's current pipe).
 * Returns { action, arguments } or null.
 */
export function parsePipe(s, lab) {
  if (!/\b(velocity|speed|flow|discharge|capacity|manning|pipe|sewer|drain)\b/.test(s)) return null;
  if (!/\b(calc|calculate|compute|what|find|velocity|capacity|manning|how (?:fast|much))\b/.test(s)) return null;
  const D = diameterOf(s) ?? (lab ? lab.D : null);
  const Q = flowOf(s);
  const S = slopeOf(s) ?? (lab && !Q ? lab.S : null);
  if (Q && D) return { tool: 'pipeVelocity', arguments: { diameter_mm: D, flow_lps: Q } };
  if (D && S) {
    const y = depthOf(s) ?? (lab && !diameterOf(s) ? lab.y : 1);
    return { tool: 'pipeFlow', arguments: { diameter_mm: D, slope_pct: S, n: nOf(s) ?? (lab ? lab.n : 0.013), depth_ratio: Math.min(1, y) } };
  }
  return null;
}

export function parseConvert(s) {
  const m = s.match(new RegExp(`^(?:convert\\s+)?${NUM}\\s*([a-z°²³"'/ 0-9]+?)\\s+(?:to|in|into|as)\\s+([a-z°²³"'/ 0-9]+?)\\??$`));
  if (!m) return null;
  const from = m[2].trim();
  const to = m[3].trim();
  if (!dimOf(unitKey(from)) || !dimOf(unitKey(to))) return null;
  return { value: num(m[1]), from, to };
}
