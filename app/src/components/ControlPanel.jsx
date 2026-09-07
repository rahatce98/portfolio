/**
 * Generic 3D control bar. Each item is { id, label, icon, onClick, active,
 * title }. `sep` inserts a divider. Rendering is driven entirely by the array
 * so each lab can expose only the controls that mean something for its scene.
 */
export default function ControlPanel({ items, className = '' }) {
  return (
    <div className={`controls ${className}`.trim()} role="group" aria-label="3D view controls">
      {items.map((it, i) =>
        it.sep ? (
          <span key={`sep-${i}`} className="ctrl__sep" aria-hidden="true" />
        ) : (
          <button
            key={it.id}
            type="button"
            className="ctrl"
            onClick={it.onClick}
            data-on={it.active ? 'true' : undefined}
            aria-pressed={typeof it.active === 'boolean' ? it.active : undefined}
            title={it.title ?? it.label}
          >
            {it.icon}
            <span className={it.compact ? 'sr-only' : undefined}>{it.label}</span>
          </button>
        )
      )}
    </div>
  );
}
