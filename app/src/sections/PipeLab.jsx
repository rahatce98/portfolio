import { useEffect, useMemo, useRef, useState } from 'react';
import { hyd, MATERIALS } from '../jarvis/engineering';
import { setOs } from '../os/context';

/* -----------------------------------------------------------------------------
 * LAB-04 — Sewer pipe hydraulics (Manning, partially full circular pipe)
 *
 *   θ  = 2·acos(1 − 2·d/D)            central angle of the wetted arc
 *   A  = D²/8 · (θ − sin θ)            flow area
 *   P  = D·θ/2                         wetted perimeter
 *   R  = A/P                           hydraulic radius
 *   V  = (1/n)·R^(2/3)·S^(1/2)         Manning velocity (SI)
 *   Q  = A·V
 *
 * The cross-section, the flowing particles and the Q/Qfull curve all read the
 * same numbers, so the drawing is the calculation.
 * -------------------------------------------------------------------------- */

// The maths lives in jarvis/engineering.js so J.A.R.V.I.S. answers with the
// exact same numbers this lab draws.

const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');

export default function PipeLab() {
  const [D, setD] = useState(400); // mm
  const [S, setS] = useState(0.4); // %
  const [y, setY] = useState(0.62); // d/D
  const [mat, setMat] = useState('upvc');
  const n = MATERIALS.find((m) => m.id === mat).n;
  const cv = useRef(null);

  const r = useMemo(() => hyd(D / 1000, y, S / 100, n), [D, y, S, n]);
  const full = useMemo(() => hyd(D / 1000, 0.9999, S / 100, n), [D, S, n]);
  const curve = useMemo(() => {
    const pts = [];
    for (let i = 1; i <= 100; i++) {
      const k = i / 100;
      const h = hyd(1, k, 0.01, 0.013);
      pts.push([k, h.Q]);
    }
    const qf = hyd(1, 0.9999, 0.01, 0.013).Q;
    return pts.map(([k, q]) => [k, q / qf]);
  }, []);
  // Publish the live inputs so "what's the velocity?" asked here uses this pipe.
  useEffect(() => setOs({ labState: { D, S, y, n } }), [D, S, y, n]);
  useEffect(() => () => setOs({ labState: null }), []);

  const qRatio = r.Q / full.Q;
  const selfClean = r.V >= 0.6;
  const surcharge = y > 0.8;

  // Animated cross-section: water body with drifting particles.
  useEffect(() => {
    const c = cv.current;
    const ctx = c.getContext('2d');
    let raf = 0;
    const parts = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), s: 0.4 + Math.random() }));
    const size = () => {
      const b = c.getBoundingClientRect();
      const dpr = Math.min(2, devicePixelRatio || 1);
      c.width = b.width * dpr;
      c.height = b.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(c);
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue('--accent').trim() || '#56dcff';
    const line = css.getPropertyValue('--line-2').trim();
    const ink = css.getPropertyValue('--ink-3').trim();

    const draw = () => {
      const w = c.clientWidth, h = c.clientHeight;
      const R = Math.min(w, h) * 0.38;
      const cx = w / 2, cy = h / 2;
      const lvl = cy + R - 2 * R * y; // water surface y
      ctx.clearRect(0, 0, w, h);

      // pipe wall
      ctx.lineWidth = 10;
      ctx.strokeStyle = 'rgba(140,170,210,0.12)';
      ctx.beginPath(); ctx.arc(cx, cy, R + 6, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = line;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();

      // water
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
      const g = ctx.createLinearGradient(0, lvl, 0, cy + R);
      g.addColorStop(0, 'rgba(86,220,255,0.55)');
      g.addColorStop(1, 'rgba(40,90,200,0.35)');
      ctx.fillStyle = g;
      const t = performance.now() / 1000;
      ctx.beginPath();
      ctx.moveTo(cx - R, lvl);
      for (let x = -R; x <= R; x += 6) ctx.lineTo(cx + x, lvl + Math.sin(x / 14 + t * 3) * 1.6);
      ctx.lineTo(cx + R, cy + R); ctx.lineTo(cx - R, cy + R); ctx.closePath(); ctx.fill();
      // particles drift outward from centre (flow toward viewer)
      for (const p of parts) {
        p.s += 0.004 * (0.5 + r.V);
        if (p.s > 1.6) { p.s = 0.3; p.x = Math.random(); p.y = Math.random(); }
        const px = cx + (p.x - 0.5) * 2 * R;
        const py = lvl + p.y * (cy + R - lvl);
        const k = p.s;
        const dx = (px - cx) * (k - 1) * 0.25, dy = (py - (lvl + cy + R) / 2) * (k - 1) * 0.25;
        ctx.fillStyle = `rgba(220,245,255,${0.5 * (1.6 - k)})`;
        ctx.beginPath(); ctx.arc(px + dx, py + dy, 1.2 * k, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();

      // surface line + dims
      const half = Math.sqrt(Math.max(0, R * R - (lvl - cy) ** 2));
      ctx.strokeStyle = accent; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(cx - half, lvl); ctx.lineTo(cx + half, lvl); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = ink; ctx.lineWidth = 1;
      const dxl = cx + R + 30;
      ctx.beginPath(); ctx.moveTo(dxl, cy + R); ctx.lineTo(dxl, lvl); ctx.moveTo(dxl - 5, lvl); ctx.lineTo(dxl + 5, lvl); ctx.moveTo(dxl - 5, cy + R); ctx.lineTo(dxl + 5, cy + R); ctx.stroke();
      ctx.fillStyle = ink; ctx.font = '11px "Geist Mono", monospace';
      ctx.fillText(`d = ${Math.round(y * D)} mm`, dxl + 8, (lvl + cy + R) / 2 + 4);
      ctx.fillText(`Ø ${D}`, cx - 18, cy - R - 16);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [y, D, r.V]);

  const W = 260, H = 150;
  const path = curve.map(([k, q], i) => `${i ? 'L' : 'M'}${(q / 1.1) * W},${H - k * H}`).join(' ');

  return (
    <div className="eng">
      <div className="eng__viz">
        <canvas ref={cv} className="eng__canvas" aria-label="Pipe cross-section with current flow depth" />
        <div className="eng__badges">
          <span data-ok={selfClean}>{selfClean ? '✓ self-cleansing' : '⚠ below 0.6 m/s'}</span>
          <span data-ok={!surcharge}>{surcharge ? '⚠ d/D above 0.8' : '✓ d/D within 0.8'}</span>
        </div>
      </div>

      <div className="eng__panel">
        <div className="eng__ctrls">
          <label>
            <span>Diameter <b>{D} mm</b></span>
            <input type="range" min="150" max="1500" step="50" value={D} onChange={(e) => setD(+e.target.value)} />
          </label>
          <label>
            <span>Slope <b>{S.toFixed(2)} % · 1 in {Math.round(100 / S)}</b></span>
            <input type="range" min="0.05" max="3" step="0.05" value={S} onChange={(e) => setS(+e.target.value)} />
          </label>
          <label>
            <span>Depth ratio d/D <b>{y.toFixed(2)}</b></span>
            <input type="range" min="0.05" max="1" step="0.01" value={y} onChange={(e) => setY(+e.target.value)} />
          </label>
          <div className="eng__seg" role="group" aria-label="Pipe material">
            {MATERIALS.map((m) => (
              <button type="button" key={m.id} aria-pressed={mat === m.id} onClick={() => setMat(m.id)}>
                {m.label}
                <small>n {m.n}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="eng__out">
          <div><span>Discharge Q</span><b>{fmt(r.Q * 1000, 1)}</b><em>L/s</em></div>
          <div><span>Velocity V</span><b>{fmt(r.V)}</b><em>m/s</em></div>
          <div><span>Q / Q full</span><b>{fmt(qRatio * 100, 0)}</b><em>%</em></div>
          <div><span>Hydraulic R</span><b>{fmt(r.R * 1000, 0)}</b><em>mm</em></div>
          <div><span>Flow area</span><b>{fmt(r.A, 4)}</b><em>m²</em></div>
          <div><span>Full-bore Q</span><b>{fmt(full.Q * 1000, 1)}</b><em>L/s</em></div>
        </div>

        <figure className="eng__chart">
          <svg viewBox={`-30 -10 ${W + 50} ${H + 36}`} role="img" aria-label="Partial flow curve, Q over Q full against d over D">
            {[0, 0.25, 0.5, 0.75, 1].map((k) => (
              <g key={k}>
                <line x1="0" x2={W} y1={H - k * H} y2={H - k * H} stroke="var(--line)" />
                <text x="-6" y={H - k * H + 3} textAnchor="end">{k}</text>
              </g>
            ))}
            <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" />
            <circle cx={(qRatio / 1.1) * W} cy={H - y * H} r="5" fill="var(--accent)" stroke="var(--bg)" strokeWidth="2" />
            <line x1={W / 1.1} x2={W / 1.1} y1="0" y2={H} stroke="var(--line-2)" strokeDasharray="3 3" />
            <text x={W / 2} y={H + 26} textAnchor="middle">Q / Q full →</text>
            <text x="-24" y={-2}>d/D</text>
          </svg>
        </figure>
        <p className="eng__note">Manning, circular section, SI. Peak discharge sits near d/D ≈ 0.94 — above that, the extra wetted perimeter costs more than the area gains.</p>
      </div>
    </div>
  );
}
