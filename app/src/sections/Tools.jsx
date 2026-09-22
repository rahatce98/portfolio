import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReveal } from '../hooks/useScroll';

/* -----------------------------------------------------------------------------
 * 02 — Tools index
 *
 * A searchable launchpad for every tool, form, web app and console link.
 *
 * Source of truth is app/public/tools.json. The live site reads it straight
 * from GitHub (raw), so committing an edit to that one file is enough — no
 * rebuild. If GitHub is unreachable the copy bundled with the build is used.
 * Links added through the "Add" dialog are kept in this browser as drafts
 * until they are committed.
 * -------------------------------------------------------------------------- */

const REPO = 'rahatce98/portfolio';
const FILE = 'app/public/tools.json';
const RAW = `https://raw.githubusercontent.com/${REPO}/main/${FILE}`;
const EDIT = `https://github.com/${REPO}/edit/main/${FILE}`;
const K_DRAFTS = 'rh-tool-drafts';
const K_PINS = 'rh-tool-pins';
const K_RECENT = 'rh-tool-recent';

const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* storage blocked — feature degrades to session only */
    }
  },
};

/* ---------------------------------------------------------------- data --- */

let cache = null;
async function loadTools() {
  if (cache) return cache;
  const local = `${import.meta.env.BASE_URL}tools.json`;
  const tryUrl = async (u) => {
    const r = await fetch(u, { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    if (!Array.isArray(j.tools)) throw new Error('shape');
    return j.tools;
  };
  let list;
  try {
    list = import.meta.env.DEV ? await tryUrl(local) : await tryUrl(RAW);
  } catch {
    list = await tryUrl(local).catch(() => []);
  }
  cache = list;
  return list;
}

export function useTools() {
  const [remote, setRemote] = useState(cache || []);
  const [ready, setReady] = useState(!!cache);
  const [drafts, setDrafts] = useState(() => store.get(K_DRAFTS, []));

  useEffect(() => {
    let live = true;
    loadTools().then((l) => {
      if (!live) return;
      setRemote(l);
      setReady(true);
    });
    const sync = () => setDrafts(store.get(K_DRAFTS, []));
    window.addEventListener('rh-drafts', sync);
    return () => {
      live = false;
      window.removeEventListener('rh-drafts', sync);
    };
  }, []);

  const tools = useMemo(() => {
    const ids = new Set(remote.map((t) => t.id));
    return [...remote, ...drafts.filter((d) => !ids.has(d.id)).map((d) => ({ ...d, draft: true }))];
  }, [remote, drafts]);

  return { tools, ready };
}

function saveDrafts(list) {
  store.set(K_DRAFTS, list);
  window.dispatchEvent(new Event('rh-drafts'));
}

/* ------------------------------------------------------------- helpers --- */

export function hostOf(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Stable hue per project so the same owner always reads the same colour. */
export function hueOf(s = '') {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return (h + 190) % 360;
}

function initials(name = '') {
  const w = name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] || '') + (w[1]?.[0] || w[0]?.[1] || '')).toUpperCase();
}

function hay(t) {
  return [t.name, t.owner, t.project, t.category, t.kind, t.status, t.description, t.url, t.short, ...(t.tags || []), ...Object.values(t.meta || {})]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Multi-word AND search, `-word` excludes. Returns a score (0 = no match). */
export function score(t, q) {
  if (!q) return 1;
  const h = t.__h || (t.__h = hay(t));
  const name = t.name.toLowerCase();
  let s = 0;
  for (const raw of q.toLowerCase().split(/\s+/).filter(Boolean)) {
    if (raw[0] === '-' && raw.length > 1) {
      if (h.includes(raw.slice(1))) return 0;
      continue;
    }
    if (!h.includes(raw)) return 0;
    s += name.startsWith(raw) ? 6 : name.includes(raw) ? 4 : 1;
  }
  return s || 1;
}

function parseUrl(url) {
  const out = {};
  const m = url.match(/script\.google\.com\/macros\/s\/([\w-]+)\/(exec|dev)/);
  if (m) {
    out.kind = 'Web App';
    out.tags = ['apps-script'];
    out.meta = { Deployment: m[1] };
  } else if (/docs\.google\.com\/forms|forms\.gle/.test(url)) {
    out.kind = 'Form';
    out.tags = ['google-forms'];
  } else if (/docs\.google\.com\/spreadsheets/.test(url)) {
    out.kind = 'Sheet';
    out.tags = ['google-sheets'];
  } else if (/github\.com/.test(url)) {
    out.kind = 'Repository';
    out.tags = ['github'];
  } else if (/drive\.google\.com/.test(url)) {
    out.kind = 'File';
    out.tags = ['drive'];
  }
  return out;
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || `tool-${Date.now()}`;
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function trackOpen(id) {
  const r = store.get(K_RECENT, []).filter((x) => x !== id);
  r.unshift(id);
  store.set(K_RECENT, r.slice(0, 12));
}

/* ---------------------------------------------------------------- icons --- */

const I = ({ d, ...p }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    {d}
  </svg>
);
const Search = () => <I d={<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>} />;
const Ext = () => <I d={<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />} />;
const CopyI = () => <I d={<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a1 1 0 0 1 1-1h10" /></>} />;
const Star = ({ on }) => <I fill={on ? 'currentColor' : 'none'} d={<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />} />;
const Plus = () => <I d={<path d="M12 5v14M5 12h14" />} />;
const GridI = () => <I d={<><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>} />;
const ListI = () => <I d={<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />} />;
const Chevron = () => <I d={<path d="m9 6 6 6-6 6" />} />;
const Trash = () => <I d={<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />} />;

/* ---------------------------------------------------------------- card --- */

function ToolCard({ t, pinned, onPin, view, onDeleteDraft }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState('');
  const ref = useRef(null);
  const hue = hueOf(t.project || t.owner);

  // Cursor-tracked light — written straight to CSS vars, no React re-render.
  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty('--mx', `${e.clientX - r.left}px`);
    ref.current.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  const doCopy = async (text, what) => {
    if (await copy(text)) {
      setCopied(what);
      setTimeout(() => setCopied(''), 1300);
    }
  };

  const meta = Object.entries(t.meta || {});

  return (
    <article
      ref={ref}
      className="tool"
      data-view={view}
      data-open={open}
      data-status={t.status}
      style={{ '--h': hue }}
      onPointerMove={onMove}
    >
      <div className="tool__top">
        <span className="tool__glyph" aria-hidden="true">{initials(t.name)}</span>
        <div className="tool__title">
          <h3>
            <a
              href={t.url}
              target="_blank"
              rel="noreferrer noopener"
              onClick={() => trackOpen(t.id)}
              className="tool__link"
            >
              {t.name}
            </a>
          </h3>
          <p className="tool__owner">
            <span className="tool__proj">{t.project || t.owner}</span>
            <span className="tool__sep">/</span>
            {t.kind}
            {t.draft && <span className="tool__draft">draft</span>}
          </p>
        </div>
        <button
          type="button"
          className="tool__pin"
          data-on={pinned}
          onClick={() => onPin(t.id)}
          aria-label={pinned ? `Unpin ${t.name}` : `Pin ${t.name}`}
          aria-pressed={pinned}
        >
          <Star on={pinned} />
        </button>
      </div>

      <p className="tool__desc">{t.description}</p>

      <div className="tool__foot">
        <span className="tool__status" data-s={t.status}>
          <i />
          {t.status}
        </span>
        <span className="tool__host">{hostOf(t.short || t.url)}</span>
        <span className="tool__cat">{t.category}</span>
      </div>

      <div className="tool__actions">
        <a className="tbtn tbtn--go" href={t.url} target="_blank" rel="noreferrer noopener" onClick={() => trackOpen(t.id)}>
          Open <Ext />
        </a>
        <button type="button" className="tbtn" onClick={() => doCopy(t.short || t.url, 'link')}>
          <CopyI /> {copied === 'link' ? 'Copied' : 'Copy link'}
        </button>
        {(meta.length > 0 || t.short) && (
          <button type="button" className="tbtn tbtn--more" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <Chevron /> Specs
          </button>
        )}
        {t.draft && (
          <button type="button" className="tbtn" onClick={() => onDeleteDraft(t.id)} aria-label="Remove local draft">
            <Trash />
          </button>
        )}
      </div>

      {open && (
        <dl className="tool__meta">
          {t.short && (
            <div>
              <dt>Short</dt>
              <dd>
                <button type="button" onClick={() => doCopy(t.short, 'Short')}>{t.short}</button>
              </dd>
            </div>
          )}
          <div>
            <dt>URL</dt>
            <dd>
              <button type="button" onClick={() => doCopy(t.url, 'URL')}>{t.url}</button>
            </dd>
          </div>
          {meta.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>
                <button type="button" onClick={() => doCopy(v, k)}>{v}</button>
              </dd>
            </div>
          ))}
          {copied && copied !== 'link' && <p className="tool__toast">{copied} copied</p>}
        </dl>
      )}
    </article>
  );
}

/* ----------------------------------------------------------- add dialog --- */

function AddDialog({ open, onClose, categories, projects }) {
  const blank = { name: '', url: '', short: '', owner: 'Rahat', project: '', category: '', kind: '', status: 'live', description: '', tags: '', scriptId: '' };
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState('');
  const dlg = useRef(null);

  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (open && !d.open) {
      setF(blank);
      setMsg('');
      d.showModal();
    }
    if (!open && d.open) d.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (k) => (e) => {
    const v = e.target.value;
    setF((p) => {
      const n = { ...p, [k]: v };
      if (k === 'url' && v) {
        const g = parseUrl(v);
        if (!p.kind && g.kind) n.kind = g.kind;
        if (!p.tags && g.tags) n.tags = g.tags.join(', ');
        if (!p.name) {
          const h = hostOf(v).split('.')[0];
          if (h && !/script|docs|drive/.test(h)) n.name = h.charAt(0).toUpperCase() + h.slice(1);
        }
      }
      return n;
    });
  };

  const build = () => {
    const g = parseUrl(f.url);
    const meta = { ...(g.meta || {}) };
    if (f.scriptId.trim()) meta['Script ID'] = f.scriptId.trim();
    const t = {
      id: slug(f.name || hostOf(f.url)),
      name: f.name.trim() || hostOf(f.url),
      owner: f.owner.trim() || 'Rahat',
      project: f.project.trim() || 'Personal',
      category: f.category.trim() || 'Utility',
      kind: f.kind.trim() || 'Link',
      status: f.status,
      description: f.description.trim(),
      url: f.url.trim(),
      ...(f.short.trim() ? { short: f.short.trim() } : {}),
      tags: f.tags.split(',').map((s) => s.trim()).filter(Boolean),
      ...(Object.keys(meta).length ? { meta } : {}),
      added: new Date().toISOString().slice(0, 10),
    };
    return t;
  };

  const valid = /^https?:\/\/\S+$/.test(f.url.trim());

  const saveLocal = () => {
    const t = build();
    const d = store.get(K_DRAFTS, []).filter((x) => x.id !== t.id);
    saveDrafts([...d, t]);
    return t;
  };

  const publish = async () => {
    const t = saveLocal();
    const ok = await copy(JSON.stringify(t, null, 2) + ',');
    setMsg(ok ? 'Entry copied. In the GitHub editor, paste it as the first item inside "tools": [ … ] and commit.' : 'Saved locally. Copy failed — use Export.');
    window.open(EDIT, '_blank', 'noopener');
  };

  return (
    <dialog ref={dlg} className="addlg" onClose={onClose} onCancel={onClose}>
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          saveLocal();
          onClose();
        }}
      >
        <header>
          <span className="section-head__index">New entry</span>
          <h3>Add a tool</h3>
          <p>Paste a link — type and tags are filled in for you.</p>
        </header>

        <label className="fld fld--wide">
          <span>URL *</span>
          <input autoFocus required type="url" placeholder="https://…" value={f.url} onChange={set('url')} />
        </label>
        <label className="fld">
          <span>Name</span>
          <input value={f.name} onChange={set('name')} placeholder="Tool name" />
        </label>
        <label className="fld">
          <span>Short link</span>
          <input value={f.short} onChange={set('short')} placeholder="https://tinyurl.com/…" />
        </label>
        <label className="fld">
          <span>Owner</span>
          <input value={f.owner} onChange={set('owner')} />
        </label>
        <label className="fld">
          <span>Project</span>
          <input list="dl-proj" value={f.project} onChange={set('project')} placeholder="e.g. DSIP-WD6B" />
        </label>
        <label className="fld">
          <span>Category</span>
          <input list="dl-cat" value={f.category} onChange={set('category')} placeholder="e.g. Field Data" />
        </label>
        <label className="fld">
          <span>Type</span>
          <input value={f.kind} onChange={set('kind')} placeholder="Web App, Form, Sheet…" />
        </label>
        <label className="fld">
          <span>Status</span>
          <select value={f.status} onChange={set('status')}>
            <option value="live">live</option>
            <option value="beta">beta</option>
            <option value="private">private</option>
            <option value="archived">archived</option>
          </select>
        </label>
        <label className="fld">
          <span>Script ID</span>
          <input value={f.scriptId} onChange={set('scriptId')} placeholder="optional" />
        </label>
        <label className="fld fld--wide">
          <span>Description</span>
          <textarea rows="2" value={f.description} onChange={set('description')} />
        </label>
        <label className="fld fld--wide">
          <span>Tags</span>
          <input value={f.tags} onChange={set('tags')} placeholder="comma, separated" />
        </label>
        <datalist id="dl-cat">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        <datalist id="dl-proj">{projects.map((c) => <option key={c} value={c} />)}</datalist>

        {msg && <p className="addlg__msg">{msg}</p>}

        <footer>
          <button type="button" className="tbtn" onClick={onClose}>Cancel</button>
          <button type="submit" className="tbtn" disabled={!valid}>Save in this browser</button>
          <button type="button" className="tbtn tbtn--go" disabled={!valid} onClick={publish}>
            Publish to site <Ext />
          </button>
        </footer>
      </form>
    </dialog>
  );
}

/* -------------------------------------------------------------- section --- */

export default function Tools() {
  const root = useReveal();
  const { tools, ready } = useTools();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [proj, setProj] = useState('All');
  const [view, setView] = useState(() => store.get('rh-tool-view', 'grid'));
  const [pins, setPins] = useState(() => store.get(K_PINS, []));
  const [adding, setAdding] = useState(false);
  const input = useRef(null);

  useEffect(() => store.set('rh-tool-view', view), [view]);

  // "/" jumps to the search field, as on GitHub.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const r = root.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > innerHeight) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    const openAdd = () => setAdding(true);
    window.addEventListener('rh-add-tool', openAdd);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('rh-add-tool', openAdd);
    };
  }, [root]);

  const categories = useMemo(() => [...new Set(tools.map((t) => t.category).filter(Boolean))].sort(), [tools]);
  const projects = useMemo(() => [...new Set(tools.map((t) => t.project || t.owner).filter(Boolean))].sort(), [tools]);
  const countBy = (k, v) => tools.filter((t) => (k === 'p' ? (t.project || t.owner) === v : t.category === v)).length;

  const shown = useMemo(() => {
    const pinSet = new Set(pins);
    return tools
      .map((t) => ({ t, s: score(t, q.trim()) }))
      .filter(({ t, s }) => s > 0 && (cat === 'All' || t.category === cat) && (proj === 'All' || (t.project || t.owner) === proj))
      .sort((a, b) => (pinSet.has(b.t.id) - pinSet.has(a.t.id)) || b.s - a.s || a.t.name.localeCompare(b.t.name))
      .map(({ t }) => t);
  }, [tools, q, cat, proj, pins]);

  const togglePin = useCallback((id) => {
    setPins((p) => {
      const n = p.includes(id) ? p.filter((x) => x !== id) : [...p, id];
      store.set(K_PINS, n);
      return n;
    });
  }, []);

  const deleteDraft = useCallback((id) => {
    saveDrafts(store.get(K_DRAFTS, []).filter((d) => d.id !== id));
  }, []);

  const drafts = tools.filter((t) => t.draft);
  const exportDrafts = () => copy(drafts.map(({ draft, __h, ...t }) => JSON.stringify(t, null, 2)).join(',\n') + ',');

  return (
    <section className="section tools" id="tools" ref={root}>
      <div className="wrap">
        <div className="section-head" data-reveal>
          <div>
            <span className="section-head__index">02 — Index</span>
            <h2>
              Tools, forms &amp; systems<span className="dim">.</span>
            </h2>
          </div>
          <p>
            Every web app, form and console I build or use, in one searchable place.
            Press <kbd>/</kbd> to search here, or <kbd>Ctrl</kbd> <kbd>K</kbd> from anywhere.
          </p>
        </div>

        <div className="tbar" data-reveal>
          <label className="tsearch">
            <Search />
            <input
              ref={input}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, project, tag, script ID…  (-word to exclude)"
              aria-label="Search tools"
              onKeyDown={(e) => {
                if (e.key === 'Escape') setQ('');
                if (e.key === 'Enter' && shown[0]) {
                  trackOpen(shown[0].id);
                  window.open(shown[0].url, '_blank', 'noopener');
                }
              }}
            />
            <span className="tsearch__count mono">
              {ready ? `${shown.length}/${tools.length}` : 'sync…'}
            </span>
          </label>
          <div className="tbar__right">
            <div className="seg" role="group" aria-label="Layout">
              <button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')} aria-label="Grid view">
                <GridI />
              </button>
              <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')} aria-label="List view">
                <ListI />
              </button>
            </div>
            <button type="button" className="tbtn tbtn--go" onClick={() => setAdding(true)}>
              <Plus /> Add tool
            </button>
          </div>
        </div>

        <div className="tfilters" data-reveal>
          <div className="tfilters__row">
            <span className="mono">Project</span>
            {['All', ...projects].map((p) => (
              <button key={p} type="button" className="fchip" aria-pressed={proj === p} onClick={() => setProj(p)} style={p !== 'All' ? { '--h': hueOf(p) } : undefined}>
                {p !== 'All' && <i />}
                {p}
                <b>{p === 'All' ? tools.length : countBy('p', p)}</b>
              </button>
            ))}
          </div>
          <div className="tfilters__row">
            <span className="mono">Category</span>
            {['All', ...categories].map((c) => (
              <button key={c} type="button" className="fchip" aria-pressed={cat === c} onClick={() => setCat(c)}>
                {c}
                <b>{c === 'All' ? tools.length : countBy('c', c)}</b>
              </button>
            ))}
          </div>
        </div>

        <div className="tgrid" data-view={view}>
          {shown.map((t) => (
            <ToolCard key={t.id} t={t} view={view} pinned={pins.includes(t.id)} onPin={togglePin} onDeleteDraft={deleteDraft} />
          ))}
          {ready && shown.length === 0 && (
            <div className="tempty">
              <p>Nothing matches “{q}”.</p>
              <button type="button" className="tbtn" onClick={() => { setQ(''); setCat('All'); setProj('All'); }}>
                Clear filters
              </button>
            </div>
          )}
        </div>

        {drafts.length > 0 && (
          <div className="tdrafts">
            <span className="mono">{drafts.length} local draft{drafts.length > 1 ? 's' : ''} — visible only in this browser</span>
            <button type="button" className="tbtn" onClick={exportDrafts}>
              <CopyI /> Copy JSON
            </button>
            <a className="tbtn tbtn--go" href={EDIT} target="_blank" rel="noreferrer noopener">
              Commit on GitHub <Ext />
            </a>
          </div>
        )}
      </div>

      <AddDialog open={adding} onClose={() => setAdding(false)} categories={categories} projects={projects} />
    </section>
  );
}
