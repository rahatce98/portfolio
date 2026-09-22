import { person, contact, socials } from '../data/site';
import { useReveal } from '../hooks/useScroll';
import { Icon, ArrowRight, Pin } from '../components/Icons';

/* 07 — Contact. Every entry is a live link built from data/site.js: mailto for
   email, wa.me for WhatsApp, https for the rest. No form, because a static
   GitHub Pages site has nowhere to post one — a broken form would be exactly
   the fake interaction this build is meant to avoid. */

export default function Contact() {
  const root = useReveal();

  return (
    <section className="section" id="contact" ref={root}>
      <div className="wrap">
        <div className="contact">
          <div>
            <span className="section-head__index" data-reveal>
              07 — Contact
            </span>
            <h2 data-reveal>
              Let&rsquo;s build something
              <br />
              worth engineering.
            </h2>
            <p style={{ color: 'var(--ink-2)', maxWidth: '42ch' }} data-reveal>
              Open to engineering roles, digital-engineering work and collaboration on tools that
              make infrastructure projects easier to run.
            </p>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 26 }} data-reveal>
              <a className="btn btn--primary" href={`mailto:${contact.email}`}>
                Email me <ArrowRight />
              </a>
              <a className="btn btn--ghost" href={contact.whatsapp} target="_blank" rel="noreferrer noopener">
                WhatsApp
              </a>
              {person.resume && (
                <a className="btn" href={`${import.meta.env.BASE_URL}${person.resume}`} download>
                  Download CV
                </a>
              )}
            </div>

            <p className="mono" style={{ marginTop: 26, display: 'flex', alignItems: 'center', gap: 8 }} data-reveal>
              <Pin style={{ width: 14, height: 14 }} />
              {contact.location}
            </p>
          </div>

          <div className="links">
            {socials.map((s, i) => (
              <a
                className="link"
                key={s.id}
                href={s.url}
                target={s.url.startsWith('mailto:') ? undefined : '_blank'}
                rel={s.url.startsWith('mailto:') ? undefined : 'noreferrer noopener'}
                data-reveal
                style={{ '--reveal-delay': `${i * 70}ms` }}
              >
                <Icon name={s.id} />
                <span>
                  <span className="link__label">{s.label}</span>
                  <span className="link__handle">{s.handle}</span>
                </span>
                <ArrowRight className="link__go" style={{ width: 16, height: 16 }} />
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
