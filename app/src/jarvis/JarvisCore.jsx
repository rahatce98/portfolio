import { useEffect, useRef } from 'react';
import { perfTier, prefersReducedMotion } from '../hooks/useEnv';

/* Animated AI core: a point-cloud sphere with a live waveform ring.
   Canvas 2D, DPR-capped, paused off-screen, calmer under reduced motion.
   `state` tints and drives motion; `level` (0-1, a ref) feeds the waveform —
   real microphone amplitude while listening, speech cadence while speaking.

   Visual state machine (all transitions are eased, never cut):
     idle       slow breathing
     listening  sphere opens up, waveform follows the mic
     thinking   points drift inward, slow rotation
     searching  faster orbit, extra scanning arcs
     executing  energy sweeps in one direction around the ring
     speaking   pulse follows speech cadence
     success    one soft radial pulse
     error      a brief low-amplitude shimmer — no red strobe
   `compact` draws a small, cheaper core for the floating dock. */

export const STATE_COLOR = {
  idle: [86, 220, 255],
  listening: [255, 138, 120],
  thinking: [150, 138, 255],
  searching: [255, 196, 102],
  executing: [84, 226, 184],
  speaking: [120, 230, 255],
  success: [104, 224, 146],
  error: [255, 128, 112],
};
const MOTION = { idle: 0.35, listening: 0.9, thinking: 1.1, searching: 1.9, executing: 1.6, speaking: 1, success: 0.6, error: 0.5 };

export default function JarvisCore({ state = 'idle', level, compact = false }) {
  const cv = useRef(null);
  const st = useRef(state);
  const changed = useRef({ state, at: 0 });
  if (st.current !== state) changed.current = { state, at: performance.now() };
  st.current = state;

  useEffect(() => {
    const c = cv.current;
    const g = c.getContext('2d');
    let reduce = prefersReducedMotion();
    const onMotion = () => (reduce = prefersReducedMotion());
    window.addEventListener('rh-motion', onMotion);
    const tier = perfTier();
    const N = compact ? (tier === 0 ? 160 : 260) : tier === 0 ? 360 : tier === 1 ? 560 : 720;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = i * 2.399963;
      pts.push([Math.cos(th) * r, y, Math.sin(th) * r, Math.random()]);
    }
    const wave = new Float32Array(compact ? 64 : 96);
    let col = [...STATE_COLOR.idle];
    let speed = MOTION.idle;
    let pull = 0; // inward drift while thinking
    let open = 0; // expansion while listening
    let rot = 0, t = 0, raf = 0, visible = true, w = 0, h = 0, dpr = 1;

    const size = () => {
      dpr = Math.min(compact ? 2 : tier >= 2 ? 2 : 1.5, devicePixelRatio || 1);
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

    function frame(now) {
      raf = 0;
      if (!visible) return;
      const s = st.current;
      const since = (now - changed.current.at) / 1000;
      const target = STATE_COLOR[s] || STATE_COLOR.idle;
      const k = reduce ? 0.2 : 1;
      col = col.map((v, i) => v + (target[i] - v) * 0.07);
      speed += ((MOTION[s] || 0.4) * (reduce ? 0.25 : 1) - speed) * 0.05;
      pull += ((s === 'thinking' ? 0.12 : 0) - pull) * 0.06;
      open += ((s === 'listening' ? 0.08 : 0) - open) * 0.08;
      t += 0.016 * speed;
      rot += 0.004 * speed;

      // Amplitude: live level when present, otherwise a state-shaped synthetic one.
      const live = level?.current ?? 0;
      const synth = s === 'speaking' ? 0.35 + 0.35 * Math.abs(Math.sin(t * 7)) * Math.abs(Math.sin(t * 2.3)) : s === 'thinking' || s === 'searching' || s === 'executing' ? 0.18 + 0.08 * Math.sin(t * 5) : 0.05 + 0.03 * Math.sin(t * 1.3);
      const amp = Math.max(live, synth) * (reduce ? 0.4 : 1);
      for (let i = 0; i < wave.length; i++) {
        const e = amp * (0.55 + 0.45 * Math.sin(i * 0.9 + t * 9) * Math.sin(i * 0.23 - t * 3));
        wave[i] += (e - wave[i]) * 0.25;
      }

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * (compact ? 0.26 : 0.3);
      const [r0, g0, b0] = col.map(Math.round);
      const rgba = (a) => `rgba(${r0},${g0},${b0},${a})`;

      const glow = g.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.7);
      glow.addColorStop(0, rgba(0.18 + amp * 0.22));
      glow.addColorStop(1, rgba(0));
      g.fillStyle = glow;
      g.fillRect(0, 0, w, h);

      // Error: a short, low shimmer that fades in ~0.8 s.
      const jitter = s === 'error' && !reduce ? Math.max(0, 1 - since / 0.8) * 0.05 : 0;
      const cr = Math.cos(rot), sr = Math.sin(rot), ct = Math.cos(0.4), stl = Math.sin(0.4);
      const sz = compact ? 1.6 : 1.3;
      for (const [x, y, z, n] of pts) {
        let disp = 1 + open + 0.06 * Math.sin(n * 20 + t * 3) * speed * 0.6 * k + amp * 0.12 * Math.sin(y * 6 + t * 8);
        disp -= pull * (0.5 + 0.5 * Math.sin(n * 40 + t * 2)); // inward drift
        if (jitter) disp += jitter * Math.sin(n * 90 + now * 0.05);
        let X = x * cr - z * sr, Z = x * sr + z * cr;
        const Y = y * ct - Z * stl;
        Z = y * stl + Z * ct;
        const p = 1.9 / (2.6 - Z);
        g.fillStyle = rgba(0.15 + 0.75 * ((Z + 1) / 2));
        g.fillRect(cx + X * R * disp * p, cy + Y * R * disp * p, sz * p, sz * p);
      }

      // Waveform ring
      g.beginPath();
      for (let i = 0; i <= wave.length; i++) {
        const q = i % wave.length;
        const ang = (q / wave.length) * Math.PI * 2 - Math.PI / 2;
        const rr = R * 1.32 + wave[q] * R * 0.34;
        const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.strokeStyle = rgba(0.75);
      g.lineWidth = compact ? 1.2 : 1.4;
      g.stroke();
      g.beginPath();
      g.arc(cx, cy, R * 1.52, 0, Math.PI * 2);
      g.strokeStyle = rgba(0.12);
      g.lineWidth = 1;
      g.stroke();

      // Orbit ticks: one at rest, a scanning trio while searching, a long
      // directional sweep while executing.
      const oa = t * 1.4;
      const arcs = s === 'searching' ? 3 : 1;
      for (let a = 0; a < arcs; a++) {
        const start = oa * (a ? 1.6 : 1) + (a * Math.PI * 2) / 3;
        g.beginPath();
        g.arc(cx, cy, R * (1.52 + a * 0.1), start, start + (s === 'executing' ? 1.4 : 0.5) + amp);
        g.strokeStyle = rgba(a ? 0.45 : 0.8);
        g.lineWidth = 2;
        g.stroke();
      }

      // Success: one radial pulse, then nothing.
      if (s === 'success' && since < 1.1 && !reduce) {
        const e = since / 1.1;
        g.beginPath();
        g.arc(cx, cy, R * (1.1 + e * 0.9), 0, Math.PI * 2);
        g.strokeStyle = rgba(0.5 * (1 - e));
        g.lineWidth = 2;
        g.stroke();
      }

      // Reduced motion: draw the settled frame and stop until the state changes.
      if (reduce && since > 1.5 && s !== 'listening' && s !== 'speaking') return;
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    // Restart the loop when a state change arrives under reduced motion.
    const kick = setInterval(() => {
      if (!raf && visible && performance.now() - changed.current.at < 1500) raf = requestAnimationFrame(frame);
    }, 250);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(kick);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('rh-motion', onMotion);
    };
  }, [level, compact]);

  return <canvas ref={cv} className={compact ? 'jcore jcore--compact' : 'jv2__canvas'} aria-hidden="true" />;
}
