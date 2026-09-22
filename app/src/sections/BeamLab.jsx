import { useMemo, useRef, useState } from 'react';

/* -----------------------------------------------------------------------------
 * LAB-05 — Simply supported beam: point load + UDL
 *
 * Supports at x = 0 and x = L. Point load P at a, UDL w over the full span.
 *   R_B = P·a/L + w·L/2,   R_A = P + w·L − R_B
 *   V(x) = R_A − w·x − (x > a ? P : 0)
 *   M(x) = R_A·x − w·x²/2 − (x > a ? P·(x − a) : 0)
 * Max deflection is found numerically from the closed-form elastic curves
 * (superposition), using E·I from the chosen section.
 * The load arrow is draggable; diagrams redraw on every move.
 * -------------------------------------------------------------------------- */

const SECTIONS = [
  { id: 'rc300', label: 'RC 300×450', EI: 25e9 * (0.3 * 0.45 ** 3) / 12 },
  { id: 'rc250', label: 'RC 250×400', EI: 25e9 * (0.25 * 0.4 ** 3) / 12 },
  { id: 'isb', label: 'Steel ISMB 300', EI: 200e9 * 8.6e-5 },
];

const N = 120;

export default function BeamLab() {
  const [L, setL] = useState(6);
  const [P, setP] = useState(40); // kN
  const [a, setA] = useState(2.4); // m
  const [w, setW] = useState(10); // kN/m
  const [sec, setSec] = useState('rc300');
  const svg = useRef(null);
  const drag = useRef(false);
  const EI = SECTIONS.find((s) => s.id === sec).EI;

  const res = useMemo(() => {
    const aa = Math.min(L, Math.max(0, a));
    const RB = (P * aa) / L + (w * L) / 2;
    const RA = P + w * L - RB;
    const xs = [], V = [], M = [], Y = [];
    const b = L - aa;
    for (let i = 0; i <= N; i++) {
      const x = (L * i) / N;
      xs.push(x);
      V.push(RA - w * x - (x > aa ? P : 0));
      M.push(RA * x - (w * x * x) / 2 - (x > aa ? P * (x - aa) : 0));
      // deflection (kN, m → N): UDL + point load, downward positive
      const yU = (w * 1e3 * x * (L ** 3 - 2 * L * x * x + x ** 3)) / (24 * EI);
      const yP = x <= aa
        ? (P * 1e3 * b * x * (L * L - b * b - x * x)) / (6 * EI * L)
        : (P * 1e3 * aa * (L - x) * (2 * L * x - x * x - aa * aa)) / (6 * EI * L);
      Y.push(yU + yP);
    }
    const iM = M.reduce((k, v, i) => (Math.abs(v) > Math.abs(M[k]) ? i : k), 0);
    const iY = Y.reduce((k, v, i) => (v > Y[k] ? i : k), 0);
    return { RA, RB, xs, V, M, Y, Mmax: M[iM], xM: xs[iM], Vmax: Math.max(...V.map(Math.abs)), ymax: Y[iY], xY: xs[iY], a: aa };
  }, [L, P, a, w, EI]);

  const W = 560, X0 = 40;
  const sx = (x) => X0 + (x / L) * W;
  const vMax = Math.max(1, ...res.V.map(Math.abs));
  const mMax = Math.max(1, ...res.M.map(Math.abs));
  const yMax = Math.max(1e-6, ...res.Y);
  const line = (arr, max, h, y0) => arr.map((v, i) => `${i ? 'L' : 'M'}${sx(res.xs[i]).toFixed(1)},${(y0 - (v / max) * h).toFixed(1)}`).join(' ');
  const area = (arr, max, h, y0) => `M${sx(0)},${y0} ${line(arr, max, h, y0).replace(/^M/, 'L')} L${sx(L)},${y0} Z`;
  const limit = (L * 1000) / 250;

  const onPointer = (e) => {
    if (!drag.current) return;
    const r = svg.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * 660 - X0;
    setA(Math.round(Math.min(L, Math.max(0, (px / W) * L)) * 10) / 10);
  };

  return (
    <div className="eng eng--beam">
      <div className="eng__viz eng__viz--beam">
        <svg
          ref={svg}
          viewBox="0 0 660 470"
          className="beam"
          onPointerMove={onPointer}
          onPointerUp={() => (drag.current = false)}
          onPointerLeave={() => (drag.current = false)}
          role="img"
          aria-label="Beam loading, shear force and bending moment diagrams"
        >
          {/* loading */}
          <text x="0" y="16" className="beam__t">LOADING</text>
          {Array.from({ length: 13 }, (_, i) => (
            <path key={i} d={`M${sx((L * i) / 12)},${52} v18 l-3,-5 m3,5 l3,-5`} className="beam__udl" />
          ))}
          <line x1={sx(0)} x2={sx(L)} y1="52" y2="52" className="beam__udl" />
          <text x={sx(L)} y="44" textAnchor="end" className="beam__v">w {w} kN/m</text>
          <g className="beam__load" transform={`translate(${sx(res.a)},0)`} onPointerDown={(e) => { drag.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); }}>
            <rect x="-18" y="18" width="36" height="66" fill="transparent" />
            <path d="M0,24 V80 M-7,70 L0,82 L7,70" />
            <text x="0" y="16" textAnchor="middle">P {P} kN</text>
          </g>
          <rect x={sx(0)} y="84" width={W} height="10" rx="2" className="beam__body" />
          <path d={`M${sx(0)},94 l-10,16 h20 z`} className="beam__sup" />
          <path d={`M${sx(L)},94 l-10,16 h20 z`} className="beam__sup" />
          <circle cx={sx(L)} cy="114" r="3" className="beam__sup" />
          <text x={sx(0)} y="130" textAnchor="middle" className="beam__v">{res.RA.toFixed(1)} kN</text>
          <text x={sx(L)} y="130" textAnchor="middle" className="beam__v">{res.RB.toFixed(1)} kN</text>
          <text x={sx(res.a)} y="130" textAnchor="middle" className="beam__dim">a = {res.a.toFixed(1)} m</text>

          {/* SFD */}
          <text x="0" y="160" className="beam__t">SHEAR FORCE</text>
          <line x1={sx(0)} x2={sx(L)} y1="215" y2="215" className="beam__axis" />
          <path d={area(res.V, vMax, 44, 215)} className="beam__sfd" />
          <path d={line(res.V, vMax, 44, 215)} className="beam__sfdl" />
          <text x={sx(L) + 8} y="219" className="beam__v">±{res.Vmax.toFixed(1)}</text>

          {/* BMD, sagging drawn downward (engineering convention) */}
          <text x="0" y="290" className="beam__t">BENDING MOMENT</text>
          <line x1={sx(0)} x2={sx(L)} y1="300" y2="300" className="beam__axis" />
          <path d={area(res.M.map((m) => -m), mMax, 70, 300)} className="beam__bmd" />
          <path d={line(res.M.map((m) => -m), mMax, 70, 300)} className="beam__bmdl" />
          <circle cx={sx(res.xM)} cy={300 + (res.Mmax / mMax) * 70} r="4" className="beam__pk" />
          <text x={sx(res.xM)} y={300 + (res.Mmax / mMax) * 70 + 18} textAnchor="middle" className="beam__v">{res.Mmax.toFixed(1)} kN·m</text>

          {/* deflected shape */}
          <text x="0" y="410" className="beam__t">DEFLECTION</text>
          <line x1={sx(0)} x2={sx(L)} y1="420" y2="420" className="beam__axis" />
          <path d={line(res.Y.map((v) => -v), yMax, 30, 420)} className="beam__def" />
          <text x={sx(res.xY)} y={462} textAnchor="middle" className="beam__v">{(res.ymax * 1000).toFixed(1)} mm</text>
        </svg>
        <div className="eng__badges">
          <span>drag the load arrow</span>
          <span data-ok={res.ymax * 1000 <= limit}>{res.ymax * 1000 <= limit ? `✓ within L/250 (${limit.toFixed(0)} mm)` : `⚠ exceeds L/250 (${limit.toFixed(0)} mm)`}</span>
        </div>
      </div>

      <div className="eng__panel">
        <div className="eng__ctrls">
          <label><span>Span L <b>{L.toFixed(1)} m</b></span><input type="range" min="2" max="12" step="0.5" value={L} onChange={(e) => { const v = +e.target.value; setL(v); setA((x) => Math.min(x, v)); }} /></label>
          <label><span>Point load P <b>{P} kN</b></span><input type="range" min="0" max="200" step="5" value={P} onChange={(e) => setP(+e.target.value)} /></label>
          <label><span>Position a <b>{res.a.toFixed(1)} m</b></span><input type="range" min="0" max={L} step="0.1" value={res.a} onChange={(e) => setA(+e.target.value)} /></label>
          <label><span>UDL w <b>{w} kN/m</b></span><input type="range" min="0" max="60" step="1" value={w} onChange={(e) => setW(+e.target.value)} /></label>
          <div className="eng__seg" role="group" aria-label="Section">
            {SECTIONS.map((s) => (
              <button type="button" key={s.id} aria-pressed={sec === s.id} onClick={() => setSec(s.id)}>{s.label}</button>
            ))}
          </div>
        </div>
        <div className="eng__out">
          <div><span>R_A</span><b>{res.RA.toFixed(1)}</b><em>kN</em></div>
          <div><span>R_B</span><b>{res.RB.toFixed(1)}</b><em>kN</em></div>
          <div><span>M max</span><b>{res.Mmax.toFixed(1)}</b><em>kN·m</em></div>
          <div><span>at x</span><b>{res.xM.toFixed(2)}</b><em>m</em></div>
          <div><span>V max</span><b>{res.Vmax.toFixed(1)}</b><em>kN</em></div>
          <div><span>δ max</span><b>{(res.ymax * 1000).toFixed(1)}</b><em>mm</em></div>
        </div>
        <p className="eng__note">Linear-elastic, small deflection, self-weight excluded. E·I from gross section (concrete E = 25 GPa, uncracked) — indicative only.</p>
      </div>
    </div>
  );
}
