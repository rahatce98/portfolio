import { useEffect, useRef } from 'react';

/* Animated AI core: a point-cloud sphere with a live waveform ring.
   Canvas 2D, DPR-capped, paused off-screen, calmer under reduced motion.
   `state` tints and drives motion; `level` (0-1, a ref) feeds the waveform —
   real microphone amplitude while listening, speech cadence while speaking. */

export const STATE_COLOR = {
  idle: [86, 220, 255],
  listening: [255, 128, 116],
  thinking: [150, 138, 255],
  searching: [255, 196, 102],
  executing: [84, 226, 184],
  speaking: [120, 230, 255],
  success: [104, 224, 146],
  error: [255, 96, 96],
};
const MOTION = { idle: 0.35, listening: 0.9, thinking: 1.6, searching: 1.3, executing: 1.8, speaking: 1, success: 0.6, error: 0.5 };

export default function JarvisCore({ state = 'idle', level }) {
  const cv = useRef(null);
  const st = useRef(state);
  st.current = state;

  useEffect(() => {
    const c = cv.current;
    const g = c.getContext('2d');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const N = 720;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = i * 2.399963;
      pts.push([Math.cos(th) * r, y, Math.sin(th) * r, Math.random()]);
    }
    const wave = new Float32Array(96);
    let col = [...STATE_COLOR.idle];
    let speed = MOTION.idle;
    let rot = 0, t = 0, raf = 0, visible = true, w = 0, h = 0, dpr = 1;

    const size = () => {
      dpr = Math.min(2, devicePixelRatio || 1);
      w = c.clientWidth;
      h = c.clientHeight;
      c.width = w * dpr;
      c.height = h * dpr;
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(c);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(frame);
    });
    io.observe(c);

    function frame() {
      raf = 0;
      if (!visible) return;
      const s = st.current;
      const target = STATE_COLOR[s] || STATE_COLOR.idle;
      col = col.map((v, i) => v + (target[i] - v) * 0.06);
      speed += ((MOTION[s] || 0.4) * (reduce ? 0.3 : 1) - speed) * 0.05;
      t += 0.016 * speed;
      rot += 0.004 * speed;

      // Amplitude: live level when present, otherwise a state-shaped synthetic one.
      const live = level?.current ?? 0;
      const synth = s === 'speaking' ? 0.35 + 0.35 * Math.abs(Math.sin(t * 7)) * Math.abs(Math.sin(t * 2.3)) : s === 'thinking' || s === 'searching' || s === 'executing' ? 0.18 + 0.08 * Math.sin(t * 5) : 0.05;
      const amp = Math.max(live, synth);
      for (let i = 0; i < wave.length; i++) {
        const k = amp * (0.55 + 0.45 * Math.sin(i * 0.9 + t * 9) * Math.sin(i * 0.23 - t * 3));
        wave[i] += (k - wave[i]) * 0.25;
      }

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.3;
      const [r0, g0, b0] = col.map(Math.round);

      const glow = g.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.7);
      glow.addColorStop(0, `rgba(${r0},${g0},${b0},${0.2 + amp * 0.25})`);
      glow.addColorStop(1, `rgba(${r0},${g0},${b0},0)`);
      g.fillStyle = glow;
      g.fillRect(0, 0, w, h);

      const cr = Math.cos(rot), sr = Math.sin(rot), ct = Math.cos(0.4), stl = Math.sin(0.4);
      for (const [x, y, z, n] of pts) {
        const disp = 1 + 0.06 * Math.sin(n * 20 + t * 3) * speed * 0.6 + amp * 0.12 * Math.sin(y * 6 + t * 8);
        let X = x * cr - z * sr, Z = x * sr + z * cr;
        const Y = y * ct - Z * stl;
        Z = y * stl + Z * ct;
        const p = 1.9 / (2.6 - Z);
        const px = cx + X * R * disp * p, py = cy + Y * R * disp * p;
        const a = 0.15 + 0.75 * ((Z + 1) / 2);
        g.fillStyle = `rgba(${r0},${g0},${b0},${a})`;
        g.fillRect(px, py, 1.3 * p, 1.3 * p);
      }

      // Waveform ring
      g.beginPath();
      for (let i = 0; i <= wave.length; i++) {
        const k = i % wave.length;
        const ang = (k / wave.length) * Math.PI * 2 - Math.PI / 2;
        const rr = R * 1.32 + wave[k] * R * 0.34;
        const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.strokeStyle = `rgba(${r0},${g0},${b0},0.75)`;
      g.lineWidth = 1.4;
      g.stroke();
      g.beginPath();
      g.arc(cx, cy, R * 1.52, 0, Math.PI * 2);
      g.strokeStyle = `rgba(${r0},${g0},${b0},0.12)`;
      g.lineWidth = 1;
      g.stroke();

      // Orbiting tick — a quiet sense of activity
      const oa = t * 1.4;
      g.beginPath();
      g.arc(cx, cy, R * 1.52, oa, oa + 0.5 + amp);
      g.strokeStyle = `rgba(${r0},${g0},${b0},0.8)`;
      g.lineWidth = 2;
      g.stroke();

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [level]);

  return <canvas ref={cv} className="jv2__canvas" aria-hidden="true" />;
}
