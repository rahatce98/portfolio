import { useEffect, useMemo, useRef, useState } from 'react';
import { pageSections } from '../data/site';
import { useJarvis } from '../jarvis/engine';
import { searchIndex, parseQuery, TYPES } from '../os/searchIndex';
import { getContext } from '../os/context';
import { usePins, togglePin } from '../os/favorites';
import { useHistory, clock } from '../os/history';

/* -----------------------------------------------------------------------------
 * Universal command palette — Ctrl/⌘ K, or "/" when not typing.
 *
 * Searches one index (os/searchIndex.js): sections, projects, labs, tools,
 * bookmarks, system actions and J.A.R.V.I.S. commands. Destinations open
 * immediately through the action registry; anything else ("calculate …",
 * "weather in …") is handed to J.A.R.V.I.S. as a command.
 * -------------------------------------------------------------------------- */

// Queries that read as an instruction, not a destination.
const INTENT = /^(calc|calculate|compute|convert|velocity|capacity|manning|weather|price|news|search the web|web search|what|who|why|how|when|define|remember|note|make|create|generate|translate|summari[sz]e|tell|\d)/i;

const GLYPH = {
  section: <path d="M4 6h16M4 12h10M4 18h7" />,
  project: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M4 10h16" /></>,
  lab: <path d="M9 3v6L4 19a1.5 1.5 0 0 0 1.3 2h13.4A1.5 1.5 0 0 0 20 19l-5-10V3M8 3h8" />,
  tool: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" />,
  action: <path d="M13 3 4 14h7l-1 7 9-11h-7z" />,
  command: <path d="m5 8 4 4-4 4M12 16h7" />,
  history: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  ask: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></>,
};
const Glyph = ({ type }) => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {GLYPH[type] || GLYPH.action}
  </svg>
);

export default function CommandPalette() {
  const j = useJarvis();
  const pins = usePins();
  const history = useHistory();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const input = useRef(null);
  const listRef = useRef(null);
  const back = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
      if (document.querySelector('dialog[open]') || document.body.hasAttribute('data-theater')) return;
      e.preventDefault();
      setOpen(true);
    };
    const onOpen = (e) => {
      setOpen(true);
      if (typeof e.detail === 'string') setTimeout(() => setQ(e.detail), 0);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('rh-palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('rh-palette', onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      back.current = document.activeElement;
      setQ('');
      setI(0);
      requestAnimationFrame(() => input.current?.focus());
    } else back.current?.focus?.({ preventScroll: true });
  }, [open]);

  const items = useMemo(() => {
    const act = (e) => () => j.runAction(e.action);
    const text = q.trim();
    if (!text) {
      const recent = history.slice(0, 5).map((h) => ({ key: `h:${h.at}`, group: 'Recent', type: 'history', title: h.text, desc: clock(h.at), hint: '↵ run', run: () => j.run(h.text, { via: 'history' }) }));
      const quick = pins
        .map((id) => j.tools.find((t) => t.id === id))
        .filter(Boolean)
        .slice(0, 8)
        .map((t) => ({ key: `q:${t.id}`, group: 'My quick tools', type: 'tool', id: t.id, title: t.name, desc: t.project || t.owner, hint: '↗', run: () => j.runAction({ tool: 'openTool', arguments: { id: t.id } }) }));
      const go = pageSections
        .filter((s) => s.nav !== false)
        .map((s) => ({ key: `s:${s.id}`, group: 'Go to', type: 'section', title: s.label, desc: `Section ${s.index}`, run: () => j.runAction({ tool: 'navigate', arguments: { section: s.id } }) }));
      const system = j.index
        .filter((e) => e.type === 'action')
        .map((e) => ({ key: e.key, group: 'Actions', type: 'action', title: e.title, desc: e.desc, hint: e.hint, run: act(e) }));
      return [...recent, ...quick, ...go, ...system];
    }
    const { terms, typeHint } = parseQuery(text);
    const hits = searchIndex(j.index, terms || text, { context: getContext(), pins, typeHint, limit: 14 }).map((e) => ({
      key: e.key,
      group: 'Results',
      type: e.type,
      id: e.id,
      hue: e.hue,
      title: e.title,
      desc: e.desc,
      hint: e.hint || (e.type === 'tool' ? '↗' : e.type === 'command' ? 'fill' : '↵'),
      run: e.type === 'command' ? () => (window.dispatchEvent(new Event('rh-jarvis')), setTimeout(() => window.dispatchEvent(new CustomEvent('rh-jarvis-interim', { detail: e.prefill })), 120)) : act(e),
    }));
    const ask = { key: 'ask', group: 'J.A.R.V.I.S.', type: 'ask', title: `Ask J.A.R.V.I.S.: “${text}”`, desc: j.provider ? `${j.kind} model` : 'commands work without AI', hint: 'Ctrl J', run: () => j.run(text, { via: 'palette' }) };
    return INTENT.test(text) || !hits.length ? [ask, ...hits] : [...hits, ask];
  }, [q, j, pins, history]);

  useEffect(() => setI(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [i]);

  if (!open) return null;

  const pick = (it) => {
    setOpen(false);
    it.run();
  };

  let lastGroup = '';
  return (
    <div className="cmdk" role="dialog" aria-modal="true" aria-label="Command palette" onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="cmdk__panel">
        <div className="cmdk__in">
          <span className="cmdk__orb" data-state={j.state} aria-hidden="true" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search Rahat OS or ask J.A.R.V.I.S.…"
            aria-label="Search or command"
            aria-controls="cmdk-list"
            aria-activedescendant={items[i] ? `cmdk-${i}` : undefined}
            role="combobox"
            aria-expanded="true"
            autoComplete="off"
            spellCheck="false"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setI((v) => Math.min(items.length - 1, v + 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setI((v) => Math.max(0, v - 1));
              }
              if (e.key === 'Enter' && items[i]) pick(items[i]);
            }}
          />
          <kbd>esc</kbd>
        </div>
        <ul className="cmdk__list" id="cmdk-list" role="listbox" ref={listRef}>
          {items.map((it, n) => {
            const head = it.group !== lastGroup ? (lastGroup = it.group) : null;
            return (
              <li key={it.key} role="presentation">
                {head && <span className="cmdk__group mono">{head}</span>}
                <div className="cmdk__row" data-active={n === i} data-type={it.type} style={it.hue != null ? { '--h': it.hue } : undefined}>
                  <button type="button" id={`cmdk-${n}`} role="option" aria-selected={n === i} onPointerEnter={() => setI(n)} onClick={() => pick(it)}>
                    <span className="cmdk__ico">
                      <Glyph type={it.type} />
                    </span>
                    <span className="cmdk__label">{it.title}</span>
                    <span className="cmdk__sub">{it.desc}</span>
                    <span className="cmdk__type mono">{TYPES[it.type]?.label || (it.type === 'ask' ? 'Assistant' : 'Recent')}</span>
                    {it.hint && <kbd className="cmdk__hint">{it.hint}</kbd>}
                  </button>
                  {it.type === 'tool' && it.id && (
                    <button type="button" className="cmdk__star" aria-pressed={pins.includes(it.id)} aria-label={pins.includes(it.id) ? `Remove ${it.title} from quick tools` : `Add ${it.title} to quick tools`} title="Quick tool" onClick={() => togglePin(it.id)}>
                      ★
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="cmdk__foot mono">
          <span>↑↓ navigate · ↵ open · ★ quick tool</span>
          <span>
            <kbd>/</kbd> or <kbd>Ctrl K</kbd> · <kbd>Ctrl J</kbd> J.A.R.V.I.S.
          </span>
        </div>
      </div>
    </div>
  );
}
