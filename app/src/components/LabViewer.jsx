import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Viewer frame shared by every 3D lab: HUD chrome, a readout, a control slot
 * and real fullscreen. The canvas itself is passed in as children so this file
 * never needs to know which scene it is framing.
 */

export function useFullscreen(ref) {
  const [isFull, setFull] = useState(false);

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [ref]);

  const toggle = useCallback(async () => {
    const node = ref.current;
    if (!node) return;
    try {
      if (document.fullscreenElement === node) await document.exitFullscreen();
      else if (node.requestFullscreen) await node.requestFullscreen();
      // Safari on iPhone exposes no element fullscreen; the button simply does
      // nothing there rather than throwing into the console.
    } catch {
      /* user gesture rejected or API unavailable — leave the view as it is */
    }
  }, [ref]);

  return [isFull, toggle, typeof document !== 'undefined' && !!document.documentElement.requestFullscreen];
}

export default function LabViewer({
  children,
  controls,
  readout,
  hint,
  height = 'clamp(360px, 58vh, 620px)',
  viewerRef,
}) {
  const inner = useRef(null);
  const ref = viewerRef ?? inner;

  return (
    <div
      className="lab__viewer"
      ref={ref}
      style={{ height, minHeight: height === undefined ? undefined : 0 }}
    >
      {readout && (
        <div className="lab__readout" aria-hidden="true">
          {readout.map((line, i) => (
            <span key={i}>{line}</span>
          ))}
        </div>
      )}

      <div className="stage" style={{ position: 'absolute', inset: 0 }}>
        {children}
      </div>

      {hint && <span className="stage__hint">{hint}</span>}
      {controls && <div className="lab__bar">{controls}</div>}
    </div>
  );
}
