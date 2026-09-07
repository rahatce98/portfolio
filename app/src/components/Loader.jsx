import { useEffect, useRef, useState } from 'react';
import { person } from '../data/site';

/**
 * Boot overlay.
 *
 * The bar tracks something real: it eases toward 90% while the WebGL chunk is
 * parsing and only completes when the hero canvas reports its first frame. A
 * hard timeout releases it regardless, so a device without WebGL — where that
 * signal never arrives — is never left staring at a loading screen.
 */
export default function Loader({ ready, timeout = 7000 }) {
  const [pct, setPct] = useState(4);
  const [done, setDone] = useState(false);
  const raf = useRef(0);

  useEffect(() => {
    const tick = () => {
      setPct((p) => {
        if (ready) return Math.min(100, p + Math.max(2, (100 - p) * 0.35));
        // Asymptotic approach to 90 — never implies completion it cannot back up.
        return p + (90 - p) * 0.035;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [ready]);

  useEffect(() => {
    if (pct >= 99.4 && ready) {
      const t = setTimeout(() => setDone(true), 220);
      return () => clearTimeout(t);
    }
  }, [pct, ready]);

  // Safety valve: never trap the page behind the overlay.
  useEffect(() => {
    const t = setTimeout(() => setDone(true), timeout);
    return () => clearTimeout(t);
  }, [timeout]);

  // Keep the rest of the page from scrolling underneath the overlay.
  useEffect(() => {
    document.body.style.overflow = done ? '' : 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [done]);

  useEffect(() => {
    if (done) document.documentElement.setAttribute('data-booted', 'true');
  }, [done]);

  return (
    <div className="loader" data-done={done} aria-hidden={done} role="status">
      <span className="loader__mark">{person.monogram} — Initialising</span>
      <span className="loader__bar">
        <span className="loader__fill" style={{ '--p': `${pct}%` }} />
      </span>
      <span className="loader__pct">{String(Math.floor(pct)).padStart(3, '0')}%</span>
      <span className="sr-only">Loading the interactive 3D experience</span>
    </div>
  );
}
