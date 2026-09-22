import { useEffect, useMemo, useRef, useState } from 'react';
import { sections } from '../data/site';
import { useTools, score, hostOf, hueOf, trackOpen } from '../sections/Tools';
import { useScrollTo } from '../hooks/useScroll';

/* Ctrl/⌘ K — jump to any tool or section from anywhere on the page. */

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const { tools } = useTools();
  const scrollTo = useScrollTo();
  const input = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('rh-palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('rh-palette', onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ('');
      setI(0);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);

  const items = useMemo(() => {
    const recent = (() => {
      try {
        return JSON.parse(localStorage.getItem('rh-tool-recent') || '[]');
      } catch {
        return [];
      }
    })();
    const t = tools
      .map((x) => ({ x, s: score(x, q.trim()) + (q ? 0 : Math.max(0, 12 - recent.indexOf(x.id)) * (recent.includes(x.id) ? 1 : 0)) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 9)
      .map(({ x }) => ({ type: 'tool', id: x.id, label: x.name, sub: `${x.project || x.owner} · ${x.kind} · ${hostOf(x.url)}`, hue: hueOf(x.project || x.owner), run: () => { trackOpen(x.id); window.open(x.url, '_blank', 'noopener'); } }));
    const s = sections
      .filter((x) => !q || x.label.toLowerCase().includes(q.toLowerCase()))
      .map((x) => ({ type: 'section', id: x.id, label: x.label, sub: `Section ${x.index}`, run: () => scrollTo(x.id) }));
    const a = !q || 'add tool new link'.includes(q.toLowerCase())
      ? [{ type: 'action', id: 'add', label: 'Add a tool…', sub: 'New index entry', run: () => { scrollTo('tools'); setTimeout(() => window.dispatchEvent(new Event('rh-add-tool')), 350); } }]
      : [];
    return [...t, ...a, ...s];
  }, [tools, q, scrollTo]);

  useEffect(() => setI(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [i]);

  if (!open) return null;

  const run = (it) => {
    setOpen(false);
    it.run();
  };

  return (
    <div className="cmdk" role="dialog" aria-modal="true" aria-label="Command palette" onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="cmdk__panel">
        <div className="cmdk__in">
          <span className="mono">⌘K</span>
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tools, jump to a section…"
            aria-label="Command"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              if (e.key === 'ArrowDown') { e.preventDefault(); setI((v) => Math.min(items.length - 1, v + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setI((v) => Math.max(0, v - 1)); }
              if (e.key === 'Enter' && items[i]) run(items[i]);
            }}
          />
          <kbd>esc</kbd>
        </div>
        <ul className="cmdk__list" ref={listRef}>
          {items.map((it, n) => (
            <li key={it.type + it.id}>
              <button type="button" data-active={n === i} data-type={it.type} onPointerEnter={() => setI(n)} onClick={() => run(it)} style={it.hue != null ? { '--h': it.hue } : undefined}>
                <span className="cmdk__dot" />
                <span className="cmdk__label">{it.label}</span>
                <span className="cmdk__sub">{it.sub}</span>
                <span className="cmdk__type mono">{it.type}</span>
              </button>
            </li>
          ))}
          {items.length === 0 && <li className="cmdk__none">No results</li>}
        </ul>
        <div className="cmdk__foot mono">↑↓ navigate · ↵ open · esc close</div>
      </div>
    </div>
  );
}
