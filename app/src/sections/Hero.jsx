import { lazy, Suspense, useRef, useState, useCallback } from 'react';
import { person, capabilities } from '../data/site';
import { useSectionProgress, useInView, useScrollTo } from '../hooks/useScroll';
import usePointerOrbit from '../hooks/usePointerOrbit';
import { hasWebGL } from '../hooks/useEnv';
import { Flame, ArrowRight, Rotate } from '../components/Icons';

/* -----------------------------------------------------------------------------
 * Hero — the vehicle is the page, not an ornament placed on it.
 *
 * Five inputs drive the scene, per the brief:
 *   pointer move → camera parallax sway
 *   drag         → free rotation of the vehicle
 *   scroll       → camera dollies in and rises, throttle spools, vehicle climbs
 *   hover        → pointer cursor over any component
 *   click        → ignition latch
 *
 * Drag rotates the *model*, not the camera. The camera belongs to the scroll
 * director, so adding OrbitControls here would put two systems in charge of
 * camera.position in the same frame. Rotating the model gives the same feel
 * with a single owner per transform.
 * -------------------------------------------------------------------------- */

const HeroCanvas = lazy(() => import('./HeroCanvas'));

export default function Hero({ onSceneReady }) {
  const [sectionRef, progressRef] = useSectionProgress();
  const [viewRef, inView] = useInView({ rootMargin: '120px 0px' });
  const { bind, spin, tick, isDragging, moved } = usePointerOrbit();
  const ignitedRef = useRef(false);
  const [ignited, setIgnited] = useState(false);
  const scrollTo = useScrollTo();
  const webgl = hasWebGL();

  const toggleIgnition = useCallback(() => {
    ignitedRef.current = !ignitedRef.current;
    setIgnited(ignitedRef.current);
  }, []);

  // Releasing a drag over the vehicle must not also count as a click on it.
  const igniteFromModel = useCallback(() => {
    if (moved.current > 6) return;
    toggleIgnition();
  }, [moved, toggleIgnition]);

  // One node carries both the scroll measurement and the visibility gate.
  const setRefs = useCallback(
    (node) => {
      sectionRef.current = node;
      viewRef.current = node;
    },
    [sectionRef, viewRef]
  );

  return (
    <section className="hero" id="home" ref={setRefs}>
      <div
        className="hero__canvas stage"
        style={{ cursor: webgl ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
        {...bind}
      >
        <Suspense fallback={null}>
          <HeroCanvas
            active={inView}
            progressRef={progressRef}
            ignitedRef={ignitedRef}
            spin={spin}
            tick={tick}
            onIgnite={igniteFromModel}
            onReady={onSceneReady}
          />
        </Suspense>
      </div>

      <div className="hero__inner wrap">
        <div className="hero__grid">
          <div>
            <span className="hero__eyebrow">{person.eyebrow}</span>
            <h1>
              Building smarter <em>infrastructure</em> with digital technology.
            </h1>
            <p className="hero__lead">{person.intro}</p>

            <div className="hero__cta">
              <a
                className="btn btn--primary"
                href="#tools"
                onClick={(e) => {
                  e.preventDefault();
                  scrollTo('tools');
                }}
              >
                Open the tool index <ArrowRight />
              </a>
              {webgl && (
                <button className="btn btn--ghost" type="button" onClick={toggleIgnition}>
                  <Flame />
                  {ignited ? 'Cut thrust' : 'Ignite engine'}
                </button>
              )}
            </div>

            <dl className="hero__stats">
              {capabilities.map((c) => (
                <div className="hero__stat" key={c.k}>
                  <dt>{c.k}</dt>
                  <dd>{c.v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Right column holds no copy — it is the volume the vehicle occupies,
              and it collapses away on narrow screens. */}
          <div className="hero__viewport" aria-hidden="true" />
        </div>
      </div>

      {webgl && (
        <span className="hero__scroll">
          <Rotate style={{ width: 14, height: 14 }} />
          Drag to orbit · scroll to launch
          <i />
        </span>
      )}
    </section>
  );
}
