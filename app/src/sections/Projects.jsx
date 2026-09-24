import { useEffect, useMemo, useState } from 'react';
import { projects, projectCategories, experience } from '../data/site';
import { useReveal } from '../hooks/useScroll';
import { prefersReducedMotion } from '../hooks/useEnv';
import ProjectCard from '../components/ProjectCard';

/* 04 — Projects: the filterable grid, then the professional record that the
   grid draws on. Filters derive from projectCategories in data/site.js, so a
   new category appears here automatically. */

export default function Projects() {
  const [filter, setFilter] = useState('All');

  // J.A.R.V.I.S. / palette "show … project": clear the filter, bring the card
  // into view and give it a brief highlight.
  useEffect(() => {
    const on = (e) => {
      setFilter('All');
      setTimeout(() => {
        const el = document.getElementById(`project-${e.detail}`);
        if (!el) return;
        el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
        el.setAttribute('data-flash', '');
        setTimeout(() => el.removeAttribute('data-flash'), 2400);
      }, 60);
    };
    window.addEventListener('rh-project', on);
    return () => window.removeEventListener('rh-project', on);
  }, []);
  const shown = useMemo(
    () => (filter === 'All' ? projects : projects.filter((p) => p.category === filter)),
    [filter]
  );
  // Re-running the reveal observer on filter change means cards that mount
  // after a filter switch still animate in instead of staying invisible.
  const root = useReveal([filter]);

  return (
    <section className="section" id="projects" ref={root}>
      <div className="wrap">
        <div className="section-head" data-reveal>
          <div>
            <span className="section-head__index">02 — Projects</span>
            <h2>Built, used, and still running.</h2>
          </div>
          <p>
            Engineering tools, professional work and personal builds. Most of these exist because
            a real site problem needed solving.
          </p>
        </div>

        <div className="filters" role="group" aria-label="Filter projects by category">
          {projectCategories.map((c) => (
            <button
              key={c}
              type="button"
              className="filter"
              data-on={filter === c}
              aria-pressed={filter === c}
              onClick={() => setFilter(c)}
            >
              {c}
              {c !== 'All' && (
                <span className="mono" style={{ marginLeft: 8, fontSize: '0.62rem' }}>
                  {projects.filter((p) => p.category === c).length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="projects">
          {shown.map((p, i) => (
            <ProjectCard key={p.title} project={p} index={i} />
          ))}
        </div>
        {shown.length === 0 && (
          <p className="mono" style={{ padding: '32px 0' }}>
            No projects in this category yet.
          </p>
        )}

        {/* --- experience ---------------------------------------------------- */}
        <div className="mt-l">
          <div className="section-head" data-reveal style={{ marginBottom: 24 }}>
            <div>
              <span className="section-head__index">Record</span>
              <h2 style={{ fontSize: 'clamp(1.5rem, 3vw, 2.1rem)' }}>Experience</h2>
            </div>
          </div>

          <div className="timeline">
            {experience.map((e, i) => (
              <article className="tl" key={e.role + e.org} data-reveal style={{ '--reveal-delay': `${i * 100}ms` }}>
                <div className="tl__top">
                  <div>
                    <h3 className="tl__role">{e.role}</h3>
                    <span className="tl__org">
                      {e.org} · {e.place}
                    </span>
                  </div>
                  <span className="tl__meta">
                    {e.period} · {e.type}
                  </span>
                </div>
                <p className="tl__summary">{e.summary}</p>
                <ul className="tl__points">
                  {e.points.map((pt) => (
                    <li key={pt}>{pt}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
