import { lab, now, education } from '../data/site';
import { useReveal } from '../hooks/useScroll';
import { Bulb, Doc } from '../components/Icons';

/* 04 — Technology: what is being learned, what is being worked on right now,
   and the formal background behind both. */

export default function Technology() {
  const root = useReveal();

  return (
    <section className="section" id="technology" ref={root}>
      <div className="wrap">
        <div className="section-head" data-reveal>
          <div>
            <span className="section-head__index">05 — Technology</span>
            <h2>{lab.note}</h2>
          </div>
          <p>
            A running list of what is being learned and built, and the current focus.
            Updated {now.updated}.
          </p>
        </div>

        <div className="labgrid">
          {lab.items.map((it, i) => (
            <div className="labitem" key={it.name} data-reveal style={{ '--reveal-delay': `${i * 45}ms` }}>
              <span>{it.name}</span>
              <span className="status" data-s={it.status}>
                {it.status}
              </span>
            </div>
          ))}
        </div>

        <div className="grid-2 mt-l">
          <article className="card" data-reveal>
            <span className="card__icon">
              <Bulb />
            </span>
            <h3>Now — {now.updated}</h3>
            <ul className="now" style={{ marginTop: 14 }}>
              {now.items.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </article>

          <article className="card" data-reveal style={{ '--reveal-delay': '90ms' }}>
            <span className="card__icon">
              <Doc />
            </span>
            <h3>Education</h3>
            <div className="stack" style={{ marginTop: 14 }}>
              {education.map((e) => (
                <div key={e.degree}>
                  <strong style={{ fontSize: '0.95rem', display: 'block' }}>{e.degree}</strong>
                  <span className="mono" style={{ display: 'block', margin: '4px 0 6px' }}>
                    {e.school} · {e.place}
                  </span>
                  <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: '0.87rem' }}>{e.note}</p>
                </div>
              ))}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
