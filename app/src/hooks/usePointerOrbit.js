import { useRef, useMemo, useState } from 'react';

/**
 * Drag-to-rotate that turns the *model* rather than the camera.
 *
 * The hero needs the camera to stay under scroll control, so OrbitControls
 * cannot be used there — the two would write to camera.position in the same
 * frame and fight. This hook gives the same feel by accumulating pointer delta
 * into a ref that the model reads inside useFrame, so dragging never re-renders.
 *
 * Vertical drag is deliberately not captured on touch: the container keeps
 * `touch-action: pan-y`, so a vertical swipe still scrolls the page.
 */
export default function usePointerOrbit({ sensitivity = 0.007, maxPitch = 0.5, damping = 0.94 } = {}) {
  const spin = useRef({ x: 0, y: 0 });
  const velocity = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  // Distance travelled during the current gesture. Lets callers tell a click
  // apart from the end of a drag, so releasing over a part does not also
  // trigger that part's click handler.
  const moved = useRef(0);
  const [isDragging, setDragging] = useState(false);

  const bind = useMemo(
    () => ({
      onPointerDown(e) {
        // Ignore secondary buttons so a right-click menu is not swallowed.
        if (e.button !== undefined && e.button !== 0) return;
        dragging.current = true;
        setDragging(true);
        last.current = { x: e.clientX, y: e.clientY };
        velocity.current = { x: 0, y: 0 };
        moved.current = 0;
        e.currentTarget.setPointerCapture?.(e.pointerId);
      },
      onPointerMove(e) {
        if (!dragging.current) return;
        const dx = e.clientX - last.current.x;
        const dy = e.clientY - last.current.y;
        last.current = { x: e.clientX, y: e.clientY };
        moved.current += Math.abs(dx) + Math.abs(dy);

        spin.current.y += dx * sensitivity;
        spin.current.x = Math.max(-maxPitch, Math.min(maxPitch, spin.current.x + dy * sensitivity * 0.6));
        velocity.current = { x: dy * sensitivity * 0.6, y: dx * sensitivity };
      },
      onPointerUp(e) {
        dragging.current = false;
        setDragging(false);
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      },
      onPointerCancel() {
        dragging.current = false;
        setDragging(false);
      },
      onLostPointerCapture() {
        dragging.current = false;
        setDragging(false);
      },
    }),
    [sensitivity, maxPitch]
  );

  /** Call once per frame to carry the throw after the pointer is released. */
  const tick = useMemo(
    () => () => {
      if (dragging.current) return;
      const v = velocity.current;
      if (Math.abs(v.x) < 1e-5 && Math.abs(v.y) < 1e-5) return;
      spin.current.y += v.y;
      spin.current.x = Math.max(-maxPitch, Math.min(maxPitch, spin.current.x + v.x));
      v.x *= damping;
      v.y *= damping;
    },
    [damping, maxPitch]
  );

  return { bind, spin, tick, isDragging, moved };
}
