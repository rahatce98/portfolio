import { useCallback, useRef, useMemo } from 'react';
import { prefersReducedMotion } from '../hooks/useEnv';

/* -----------------------------------------------------------------------------
 * Project card with a real perspective tilt.
 *
 * The rotation is applied in 3D transform space (rotateX/rotateY on a
 * preserve-3d subtree), not faked with a scale or shadow, and the inner content
 * is lifted on Z so it parallaxes against the card face. Values are written
 * straight to CSS custom properties so the tilt never triggers a React render.
 * -------------------------------------------------------------------------- */

const MAX_TILT = 9; // degrees

/** Deterministic generative artwork per project — no image requests. */
function Art({ kind, seed }) {
  const rnd = useMemo(() => {
    let s = seed * 2654435761;
    return () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
  }, [seed]);

  const nodes = useMemo(() => {
    const out = [];
    if (kind === 'network') {
      const pts = Array.from({ length: 9 }, () => [12 + rnd() * 296, 12 + rnd() * 84]);
      pts.forEach((p, i) => {
        const q = pts[(i + 1 + Math.floor(rnd() * 3)) % pts.length];
        out.push(<line key={`l${i}`} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke="currentColor" strokeWidth="0.7" opacity="0.4" />);
      });
      pts.forEach((p, i) => out.push(<circle key={`c${i}`} cx={p[0]} cy={p[1]} r={2.4} fill="currentColor" opacity="0.85" />));
    } else if (kind === 'grid') {
      for (let x = 0; x < 16; x++)
        for (let y = 0; y < 5; y++) {
          const on = rnd() > 0.55;
          out.push(
            <rect key={`${x}-${y}`} x={12 + x * 19} y={12 + y * 17} width={14} height={12} rx="2"
              fill="currentColor" opacity={on ? 0.16 + rnd() * 0.5 : 0.05} />
          );
        }
    } else if (kind === 'contour') {
      for (let i = 0; i < 7; i++) {
        const y = 18 + i * 12;
        let d = `M 6 ${y}`;
        for (let x = 6; x <= 314; x += 22) d += ` Q ${x + 11} ${y + (rnd() - 0.5) * 22} ${x + 22} ${y}`;
        out.push(<path key={i} d={d} fill="none" stroke="currentColor" strokeWidth="0.8" opacity={0.2 + i * 0.08} />);
      }
    } else if (kind === 'flow') {
      for (let i = 0; i < 5; i++) {
        const y = 20 + i * 16;
        out.push(<path key={`p${i}`} d={`M 8 ${y} H ${120 + rnd() * 120} l 14 14 H 312`} fill="none" stroke="currentColor" strokeWidth="0.9" opacity={0.25 + i * 0.1} />);
        out.push(<circle key={`d${i}`} cx={40 + rnd() * 240} cy={y} r="2.6" fill="currentColor" opacity="0.9" />);
      }
    } else if (kind === 'signal') {
      let d = 'M 6 60';
      for (let x = 6; x <= 314; x += 8) d += ` L ${x} ${60 - Math.sin(x * 0.09) * (10 + rnd() * 26)}`;
      out.push(<path key="w" d={d} fill="none" stroke="currentColor" strokeWidth="1.1" opacity="0.75" />);
      for (let x = 20; x < 310; x += 40)
        out.push(<line key={`t${x}`} x1={x} y1="96" x2={x} y2={96 - rnd() * 30} stroke="currentColor" strokeWidth="2.4" opacity="0.28" />);
    } else {
      // geometric
      for (let i = 0; i < 12; i++) {
        const s = 10 + rnd() * 34;
        out.push(
          <rect key={i} x={14 + rnd() * 270} y={10 + rnd() * 70} width={s} height={s}
            fill="none" stroke="currentColor" strokeWidth="0.8"
            opacity={0.18 + rnd() * 0.55} transform={`rotate(${rnd() * 90} 160 55)`} />
        );
      }
    }
    return out;
  }, [kind, rnd]);

  return (
    <svg viewBox="0 0 320 110" preserveAspectRatio="none" role="img" aria-hidden="true" style={{ color: 'var(--accent)' }}>
      <rect width="320" height="110" fill="var(--bg-1)" />
      {nodes}
    </svg>
  );
}

export default function ProjectCard({ project, index }) {
  const ref = useRef(null);
  const raf = useRef(0);
  const reduced = prefersReducedMotion();

  const onMove = useCallback(
    (e) => {
      if (reduced) return;
      const node = ref.current;
      if (!node || raf.current) return;
      const { clientX, clientY } = e;
      raf.current = requestAnimationFrame(() => {
        raf.current = 0;
        const r = node.getBoundingClientRect();
        const px = (clientX - r.left) / r.width;
        const py = (clientY - r.top) / r.height;
        node.style.setProperty('--ry', `${(px - 0.5) * MAX_TILT * 2}deg`);
        node.style.setProperty('--rx', `${(0.5 - py) * MAX_TILT * 2}deg`);
        node.style.setProperty('--mx', `${px * 100}%`);
        node.style.setProperty('--my', `${py * 100}%`);
      });
    },
    [reduced]
  );

  const onLeave = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    if (raf.current) {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    }
    node.style.setProperty('--rx', '0deg');
    node.style.setProperty('--ry', '0deg');
  }, []);

  const links = Object.entries(project.links ?? {});

  return (
    <article className="pcard" data-reveal style={{ '--reveal-delay': `${(index % 3) * 90}ms` }}>
      <div className="pcard__inner" ref={ref} onPointerMove={onMove} onPointerLeave={onLeave}>
        <span className="pcard__glare" aria-hidden="true" />
        <div className="pcard__lift">
          <div className="pcard__art">
            <Art kind={project.art} seed={index + 1} />
          </div>
          <div className="pcard__top">
            <span className="chip chip--accent">{project.badge}</span>
            <span className="mono">{project.category}</span>
          </div>
          <h3>{project.title}</h3>
          <p className="pcard__desc">{project.description}</p>
          <p className="pcard__role">{project.role}</p>
          <ul className="taglist">
            {project.tech.map((t) => (
              <li className="chip" key={t}>
                {t}
              </li>
            ))}
          </ul>
          {links.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              {links.map(([k, url]) => (
                <a className="btn" key={k} href={url} target="_blank" rel="noreferrer noopener">
                  {k}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
