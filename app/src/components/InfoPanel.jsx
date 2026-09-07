/**
 * Information panel for a selected assembly component, plus the stepper that
 * selects one. Both are pure presentation — the component list comes from
 * data/assemblies.js so a new part appears in the UI automatically.
 */

export function Stepper({ items, selected, onSelect }) {
  return (
    <div className="stepper" role="listbox" aria-label="Assembly components">
      {items.map((c) => (
        <button
          key={c.id}
          type="button"
          className="step"
          data-active={selected === c.id}
          role="option"
          aria-selected={selected === c.id}
          onClick={() => onSelect(c.id)}
        >
          <span className="step__bar" aria-hidden="true" />
          <span>
            <span className="step__code">{c.code}</span>
            <br />
            {c.label}
          </span>
          <span className="step__code" aria-hidden="true">
            {selected === c.id ? '●' : ''}
          </span>
        </button>
      ))}
    </div>
  );
}

export default function InfoPanel({ component, empty }) {
  if (!component) {
    return (
      <div className="info">
        <span className="info__code">Standby</span>
        <p className="info__blurb">{empty}</p>
      </div>
    );
  }

  return (
    <div className="info" aria-live="polite">
      <span className="info__code">{component.code}</span>
      <h3 className="info__title">{component.label}</h3>
      <p className="info__blurb">{component.blurb}</p>
      {component.specs?.length > 0 && (
        <dl className="info__specs">
          {component.specs.map(([k, v]) => (
            <div className="info__row" key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
