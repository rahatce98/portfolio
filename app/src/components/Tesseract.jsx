import { useEffect, useRef } from 'react';

/* -----------------------------------------------------------------------------
 * A rotating 4D hypercube, projected 4D → 3D → 2D on a 2D canvas.
 *
 * 16 vertices at (±1,±1,±1,±1); edges join vertices that differ in exactly one
 * coordinate (32 edges). Rotation happens in the XW and YW planes (the "inside
 * out" motion) plus a slow XY/ZX turn, then two perspective divides. The inner
 * cube, outer cube and connecting struts get separate weights so the depth
 * reads. Pauses when off screen; a single static frame under reduced motion.
 * -------------------------------------------------------------------------- */

const V = [];
for (let i = 0; i < 16; i++) V.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1]);
const E = [];
for (let a = 0; a < 16; a++) for (let b = a + 1; b < 16; b++) {
  const d = a ^ b;
  if ((d & (d - 1)) === 0) E.push([a, b, d === 8 ? 'w' : 'c']);
}

export default function Tesseract({ className, speed = 1, color = '86, 220, 255', accent = '124, 140, 255', energy = 0 }) {
  const cv = useRef(null);
  const energyRef = useRef(energy);
  energyRef.current = energy;

  useEffect(() => {
    const c = cv.current;
    const ctx = c.getContext('2d');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let visible = true;
    let t = 0.6;
    let last = performance.now();

    const size = () => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(2, devicePixelRatio || 1);
      c.width = r.width * dpr;
      c.height = r.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(c);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf && !reduce) raf = requestAnimationFrame(frame);
    });
    io.observe(c);

    function draw() {
      const w = c.clientWidth;
      const h = c.clientHeight;
      const s = Math.min(w, h) * 0.34;
      const en = energyRef.current;
      ctx.clearRect(0, 0, w, h);

      // Double rotation in the XW and ZW planes turns the cube inside out;
      // a slow 3D yaw and fixed pitch keep the cage readable.
      const a = t * 0.5, b = t * 0.31, yaw = t * 0.18, pitch = 0.42;
      const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const P = V.map(([x, y, z, ww]) => {
        const x1 = x * ca - ww * sa, w1 = x * sa + ww * ca;
        const z1 = z * cb - w1 * sb, w2 = z * sb + w1 * cb;
        const k4 = 2 / (3 - w2);
        let X = x1 * k4, Y = y * k4, Z = z1 * k4;
        const X2 = X * cy + Z * sy, Z2 = -X * sy + Z * cy;
        const Y2 = Y * cp - Z2 * sp, Z3 = Y * sp + Z2 * cp;
        const k3 = 3.2 / (5 - Z3);
        return [w / 2 + X2 * s * k3 * 0.8, h / 2 + Y2 * s * k3 * 0.8, w2, Z3];
      });

      ctx.lineCap = 'round';
      for (const [i, j, kind] of E) {
        const p = P[i], q = P[j];
        const depth = (p[2] + q[2]) / 2; // -1..1 along W
        const alpha = 0.25 + (depth + 1) * 0.3 + en * 0.2;
        ctx.strokeStyle = `rgba(${kind === 'w' ? accent : color}, ${Math.min(1, alpha)})`;
        ctx.lineWidth = kind === 'w' ? 1 : 1.4 + (depth + 1) * 0.6;
        ctx.shadowColor = `rgba(${color}, ${0.6 + en * 0.4})`;
        ctx.shadowBlur = 8 + en * 14;
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(q[0], q[1]);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      for (const p of P) {
        const r = 1.6 + (p[2] + 1) * 1.3;
        ctx.fillStyle = `rgba(233, 250, 255, ${0.5 + (p[2] + 1) * 0.25})`;
        ctx.beginPath();
        ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function frame(now) {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt * speed * (1 + energyRef.current * 2.5);
      draw();
      if (visible) raf = requestAnimationFrame(frame);
    }

    draw();
    if (!reduce) raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [speed, color, accent]);

  return <canvas ref={cv} className={className} aria-hidden="true" />;
}
