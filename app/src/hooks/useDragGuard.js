import { useMemo, useRef } from 'react';

/**
 * Tells a click apart from the end of an orbit drag.
 *
 * Browsers still fire `click` after a long pointer drag as long as press and
 * release land on the same element, so a viewer using OrbitControls would
 * select a component every time the user finished rotating. Callers wrap their
 * select handler in `guard()` and the stray selection is dropped.
 */
export default function useDragGuard(threshold = 6) {
  const start = useRef({ x: 0, y: 0 });
  const moved = useRef(0);

  const bind = useMemo(
    () => ({
      onPointerDown(e) {
        start.current = { x: e.clientX, y: e.clientY };
        moved.current = 0;
      },
      onPointerMove(e) {
        if (e.buttons === 0) return;
        moved.current = Math.abs(e.clientX - start.current.x) + Math.abs(e.clientY - start.current.y);
      },
    }),
    []
  );

  /** Wrap a handler so it only runs when the gesture was a genuine click. */
  const guard = useMemo(
    () => (fn) => (...args) => {
      if (moved.current > threshold) return;
      fn?.(...args);
    },
    [threshold]
  );

  return { bind, guard, moved };
}
