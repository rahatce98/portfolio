import { useState } from 'react';
import { person, about, expertise, chain } from '../data/site';
import { useReveal } from '../hooks/useScroll';
import { Icon } from '../components/Icons';

/* 01 — Explore: who this is, what the capability set is, and how the two
   halves of it connect. Photo falls back to the monogram if the file is
   missing, exactly as the previous site did. */

export default function Explore() {
  const root = useReveal();
  const [photoOk, setPhotoOk] = useState(true);

  return (
    <section className="section" id="explore" ref={root}>
      <div className="wrap">
        <div className="section-head" data-reveal>
          <div>
            <span className="section-head__index">01 — Portfolio</span>
            <h2>Engineering, and the tools around it.</h2>
          </div>
          <p>{person.tagline}</p>
        </div>

        <div className="about">
          <div data-reveal>
            <div className="about__photo">
              {photoOk ? (
                <img
                  src={`${import.meta.env.BASE_URL}${person.photo}`}
                  alt={person.photoAlt}
                  width="600"
                  height="600"
                  loading="lazy"
                  decoding="async"
                  onError={() => setPhotoOk(false)}
                />
              ) : (
                <span className="about__mono" aria-hidden="true">
                  {person.monogram}
                </span>
              )}
            </div>
            <div className="stack" style={{ marginTop: 16 }}>
              <span className="chip chip--accent">{person.location}</span>
              <span className="mono">{person.role}</span>
            </div>
          </div>

          <div>
            <p className="about__lead" data-reveal>
              {about.lead}
            </p>
            <div className="about__body">
              {about.body.map((p, i) => (
                <p key={i} data-reveal style={{ '--reveal-delay': `${i * 80}ms` }}>
                  {p}
                </p>
              ))}
            </div>

            <div className="grid-3 mt-l">
              {about.pillars.map((p, i) => (
                <article className="card" key={p.title} data-reveal style={{ '--reveal-delay': `${i * 90}ms` }}>
                  <span className="card__icon">
                    <Icon name={p.icon} />
                  </span>
                  <h3>{p.title}</h3>
                  <p>{p.text}</p>
                </article>
              ))}
            </div>
          </div>
        </div>

        {/* --- capability groups ------------------------------------------- */}
        <div className="mt-l">
          <h3 className="mono" data-reveal>
            Capability
          </h3>
          <div className="grid-2" style={{ marginTop: 18 }}>
            {expertise.map((g, i) => (
              <article className="card" key={g.title} data-reveal style={{ '--reveal-delay': `${i * 70}ms` }}>
                <span className="card__icon">
                  <Icon name={g.icon} />
                </span>
                <h3>{g.title}</h3>
                <ul className="taglist" style={{ marginTop: 14 }}>
                  {g.items.map((it) => (
                    <li className="chip" key={it}>
                      {it}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>

        {/* --- the positioning chain ---------------------------------------- */}
        <div className="mt-l">
          <div className="section-head" data-reveal style={{ marginBottom: 20 }}>
            <div>
              <span className="section-head__index">Chain</span>
              <h2 style={{ fontSize: 'clamp(1.5rem, 3vw, 2.1rem)' }}>{chain.heading}</h2>
            </div>
            <p>{chain.lead}</p>
          </div>
          <div className="chain">
            {chain.steps.map((s, i) => (
              <div
                className="chain__row"
                key={s.label}
                data-accent={s.accent ? 'true' : undefined}
                data-reveal
                style={{ '--reveal-delay': `${i * 60}ms` }}
              >
                <span className="chain__n">{String(i + 1).padStart(2, '0')}</span>
                <span>
                  <span className="chain__label">{s.label}</span>
                  <br />
                  <span className="chain__note">{s.note}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
