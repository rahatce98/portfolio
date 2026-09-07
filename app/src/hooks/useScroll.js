import { useEffect, useRef, useState, useCallback } from 'react';

/* -----------------------------------------------------------------------------
 * Scroll plumbing.
 *
 * One rAF-throttled scroll listener per hook instance, and the hot paths write
 * to a ref rather than to React state so the 3D scenes can read scroll progress
 * every frame without triggering a re-render.
 * -------------------------------------------------------------------------- */

/** Page scroll 0..1, as React state. Used only by the thin progress bar. */
export function useScrollProgress() {
  const [p, setP] = useState(0);

  useEffect(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setP(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return p;
}

/**
 * Progress of one element through the viewport, written to a ref (no renders).
 *
 * 0 when the element's top reaches the bottom of the viewport,
 * 1 when its bottom leaves the top of the viewport.
 *
 * Returns [elementRef, progressRef]. The 3D scenes sample progressRef.current
 * inside useFrame, which is what makes scroll-driven camera work cost nothing.
 */
export function useSectionProgress() {
  const el = useRef(null);
  const progress = useRef(0);

  useEffect(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      const node = el.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      const span = r.height + window.innerHeight;
      if (span <= 0) return;
      const travelled = window.innerHeight - r.top;
      progress.current = Math.min(1, Math.max(0, travelled / span));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return [el, progress];
}

/**
 * Scroll-spy over section ids. Picks the section whose top is closest to — but
 * not past — a line a third of the way down the viewport, which tracks a
 * reader's attention better than a plain intersection ratio on tall sections.
 */
export function useActiveSection(ids) {
  const [active, setActive] = useState(ids[0]);

  useEffect(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      const line = window.innerHeight * 0.34;
      let best = ids[0];
      let bestDist = Infinity;

      for (const id of ids) {
        const node = document.getElementById(id);
        if (!node) continue;
        const top = node.getBoundingClientRect().top;
        if (top <= line) {
          const d = line - top;
          if (d < bestDist) {
            bestDist = d;
            best = id;
          }
        }
      }

      // Bottom of the page always resolves to the final section, otherwise a
      // short last section can never become active.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        best = ids[ids.length - 1];
      }
      setActive((cur) => (cur === best ? cur : best));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [ids]);

  return active;
}

/** True once the page has scrolled past `offset` — drives the nav background. */
export function useScrolled(offset = 24) {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      setStuck(window.scrollY > offset);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, [offset]);
  return stuck;
}

/**
 * Visibility gate for the 3D scenes. `rootMargin` is generous so a canvas has
 * warmed up by the time it scrolls into view instead of popping in cold.
 */
export function useInView({ rootMargin = '220px 0px', threshold = 0 } = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin, threshold }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [rootMargin, threshold]);

  return [ref, inView];
}

/** Adds [data-reveal] enter animation to every matching descendant, once. */
export function useReveal(deps = []) {
  const root = useRef(null);

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const targets = node.querySelectorAll('[data-reveal]');
    if (!targets.length) return;

    if (typeof IntersectionObserver === 'undefined') {
      targets.forEach((t) => t.setAttribute('data-reveal', 'in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.setAttribute('data-reveal', 'in');
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.06 }
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return root;
}

/** Smooth-scrolls to a section id, accounting for the fixed header. */
export function useScrollTo() {
  return useCallback((id) => {
    const node = document.getElementById(id);
    if (!node) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const top = node.getBoundingClientRect().top + window.scrollY - 76;
    window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
  }, []);
}
