import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReveal } from '../hooks/useScroll';
import { toast } from '../components/Toast';

/* -----------------------------------------------------------------------------
 * 02 — Tools index
 *
 * A searchable launchpad for every tool, form, web app and console link.
 *
 * Two sources, merged by id:
 *   1. app/public/tools.json  — baseline shipped with the site
 *   2. Portfolio Index API     — an Apps Script web app the owner writes to
 *                                from this page (Add / Edit / Delete), so new
 *                                links go live without touching code.
 * API records override baseline ones with the same id; `deleted` hides one.
 * Deletes are soft on the server and can be restored from the Trash view.
 * -------------------------------------------------------------------------- */

export const API =
  'https://script.google.com/macros/s/AKfycbz8HA5JTFXdI0nUFWry56DmPWMv-cQ55LB4wz4pgpI00XGfwwJfBbyiHF7EHF5wGpD-/exec';
const API_EDITOR = 'https://script.google.com/d/1Vl4_MfYGLL2DCW31xwEcjg5zOeZntxpwaJqObMBY8ZolzjfY1y-OXteu/edit';
const K_PINS = 'rh-tool-pins';
const K_RECENT = 'rh-tool-recent';
const K_CACHE = 'rh-tool-cache';
const K_SESSION = 'rh-admin';

const store = {
  get(k, d, s = localStorage) {
    try {
      const v = s.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch {
      return d;
    }
  },
  set(k, v, s = localStorage) {
    try {
      if (v == null) s.removeItem(k);
      else s.setItem(k, JSON.stringify(v));
    } catch {
      /* storage blocked */
    }
  },
};

/* ---------------------------------------------------------------- data --- */

export async function post(body) {
  // text/plain keeps this a "simple" request — no CORS preflight, which Apps
  // Script cannot answer.
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'Request failed');
  return j;
}

const bus = new EventTarget();
let state = { base: null, remote: null, hidden: [], owner: null, hasPin: true, ready: false, error: '' };
function emit(patch) {
  state = { ...state, ...patch };
  bus.dispatchEvent(new Event('change'));
}

let loading = null;
export function refreshTools() {
  const base = state.base
    ? Promise.resolve(state.base)
    : Promise.all(
        ['tools.json', 'bookmarks.json'].map((f) =>
          fetch(`${import.meta.env.BASE_URL}${f}`, { cache: 'no-cache' })
            .then((r) => r.json())
            .then((j) => j.tools || [])
            .catch(() => []),
        ),
      ).then((a) => a.flat());
  const remote = fetch(`${API}?a=list&t=${Date.now()}`)
    .then((r) => r.json())
    .then((j) => {
      store.set(K_CACHE, j.tools);
      return j;
    });
  // Owner session: also pull private + trashed records with the PIN.
  const pin = store.get(K_SESSION, '', sessionStorage);
  const owner = pin ? post({ a: 'all', pin }).then((j) => j.tools).catch(() => null) : Promise.resolve(null);
  loading = Promise.all([base, remote.catch((e) => ({ err: e })), owner]).then(([b, r, o]) => {
    if (r.err) emit({ base: b, remote: state.remote || store.get(K_CACHE, []), owner: o, ready: true, error: 'offline' });
    else emit({ base: b, remote: r.tools, hidden: r.hidden || [], owner: o, hasPin: r.hasPin, ready: true, error: '' });
  });
  return loading;
}

export function useTools() {
  const [, force] = useState(0);
  useEffect(() => {
    const on = () => force((n) => n + 1);
    bus.addEventListener('change', on);
    if (!loading) {
      const cached = store.get(K_CACHE, null);
      if (cached) emit({ remote: cached });
      refreshTools();
    }
    return () => bus.removeEventListener('change', on);
  }, []);

  const tools = useMemo(() => {
    const map = new Map();
    for (const t of state.base || []) map.set(t.id, { ...t, source: 'base' });
    for (const id of state.hidden || []) map.delete(id);
    for (const t of state.owner || state.remote || []) map.set(t.id, { ...t, source: 'live' });
    return [...map.values()].filter((t) => !t.deleted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.base, state.remote, state.hidden, state.owner]);

  return { tools, ready: state.ready, hasPin: state.hasPin, error: state.error };
}

/* --------------------------------------------------------------- admin --- */

export function useAdmin() {
  const [pin, setPin] = useState(() => store.get(K_SESSION, '', sessionStorage));
  useEffect(() => {
    const on = () => setPin(store.get(K_SESSION, '', sessionStorage));
    window.addEventListener('rh-admin', on);
    return () => window.removeEventListener('rh-admin', on);
  }, []);
  return pin;
}
function setAdmin(pin) {
  store.set(K_SESSION, pin || null, sessionStorage);
  window.dispatchEvent(new Event('rh-admin'));
  refreshTools();
}

/* ------------------------------------------------------------- helpers --- */

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
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
  const h = hay(t);
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
  const m = url.match(/script\.google\.com\/macros\/s\/([\w-]+)\/(exec|dev)/);
  if (m) return { kind: 'Web App', tags: ['apps-script'], meta: { Deployment: m[1] } };
  if (/docs\.google\.com\/forms|forms\.gle/.test(url)) return { kind: 'Form', tags: ['google-forms'] };
  if (/docs\.google\.com\/spreadsheets/.test(url)) return { kind: 'Sheet', tags: ['google-sheets'] };
  if (/docs\.google\.com\/document/.test(url)) return { kind: 'Doc', tags: ['google-docs'] };
  if (/drive\.google\.com/.test(url)) return { kind: 'File', tags: ['drive'] };
  if (/github\.com/.test(url)) return { kind: 'Repository', tags: ['github'] };
  if (/notion\.(so|site)/.test(url)) return { kind: 'Notion', tags: ['notion'] };
  return {};
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || `tool-${Date.now()}`;
}

export async function copy(text) {
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

const previewOf = (url) => `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=720&h=450`;

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
const Pen = () => <I d={<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />} />;
const Lock = ({ open }) => <I d={<><rect x="5" y="11" width="14" height="9" rx="2" /><path d={open ? 'M8 11V8a4 4 0 0 1 7.8-1.2' : 'M8 11V8a4 4 0 0 1 8 0v3'} /></>} />;
const EyeOff = () => <I d={<><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.1 6.1C3.6 7.9 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5-1.4" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>} />;
const Eye = () => <I d={<><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>} />;

/* ---------------------------------------------------------------- card --- */

function ToolCard({ t, pinned, onPin, view, admin, onEdit, onDelete, onVisibility, index }) {
  const [open, setOpen] = useState(false);
  const [peek, setPeek] = useState(false);
  const ref = useRef(null);
  const timer = useRef(0);
  const hue = hueOf(t.project || t.owner);
  const canPeek = t.status !== 'private' && view === 'grid';

  // Cursor-tracked light + tilt, written straight to CSS vars.
  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    ref.current.style.setProperty('--mx', `${x}px`);
    ref.current.style.setProperty('--my', `${y}px`);
    ref.current.style.setProperty('--rx', `${((y / r.height) - 0.5) * -4}deg`);
    ref.current.style.setProperty('--ry', `${((x / r.width) - 0.5) * 5}deg`);
  };
  const onEnter = () => {
    if (!canPeek) return;
    timer.current = setTimeout(() => setPeek(true), 650);
  };
  const onLeave = () => {
    clearTimeout(timer.current);
    setPeek(false);
    ref.current?.style.setProperty('--rx', '0deg');
    ref.current?.style.setProperty('--ry', '0deg');
  };

  const doCopy = async (text, what) => {
    if (await copy(text)) toast(`${what} copied`);
  };

  const meta = Object.entries(t.meta || {});

  return (
    <article
      ref={ref}
      className="tool"
      data-view={view}
      data-open={open}
      data-status={t.status}
      style={{ '--h': hue, '--i': index }}
      onPointerMove={onMove}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
    >
      <div className="tool__top">
        <span className="tool__glyph" aria-hidden="true">
          {initials(t.name)}
        </span>
        <div className="tool__title">
          <h3>
            <a href={t.url} target="_blank" rel="noreferrer noopener" onClick={() => trackOpen(t.id)} className="tool__link">
              {t.name}
            </a>
          </h3>
          <p className="tool__owner">
            <span className="tool__proj">{t.project || t.owner}</span>
            <span className="tool__sep">/</span>
            {t.kind}
            {t.visibility === 'private' && <span className="tool__priv">private</span>}
          </p>
        </div>
        <button type="button" className="tool__pin" data-on={pinned} onClick={() => onPin(t.id)} aria-label={pinned ? `Unpin ${t.name}` : `Pin ${t.name}`} aria-pressed={pinned}>
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
        <button type="button" className="tbtn" onClick={() => doCopy(t.short || t.url, 'Link')} aria-label="Copy link">
          <CopyI />
        </button>
        {(meta.length > 0 || t.short) && (
          <button type="button" className="tbtn tbtn--more" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <Chevron /> Specs
          </button>
        )}
        {admin && (
          <span className="tool__admin">
            <button
              type="button"
              className="tbtn"
              data-on={t.visibility !== 'private'}
              onClick={() => onVisibility(t)}
              aria-label={t.visibility === 'private' ? `Show ${t.name} publicly` : `Hide ${t.name} from visitors`}
              title={t.visibility === 'private' ? 'Private: only you see this. Click to publish.' : 'Public: click to hide from visitors'}
            >
              {t.visibility === 'private' ? <EyeOff /> : <Eye />}
            </button>
            <button type="button" className="tbtn" onClick={() => onEdit(t)} aria-label={`Edit ${t.name}`}>
              <Pen />
            </button>
            <button type="button" className="tbtn tbtn--danger" onClick={() => onDelete(t)} aria-label={`Delete ${t.name}`}>
              <Trash />
            </button>
          </span>
        )}
      </div>

      {open && (
        <dl className="tool__meta">
          {t.short && (
            <div>
              <dt>Short</dt>
              <dd><button type="button" onClick={() => doCopy(t.short, 'Short link')}>{t.short}</button></dd>
            </div>
          )}
          <div>
            <dt>URL</dt>
            <dd><button type="button" onClick={() => doCopy(t.url, 'URL')}>{t.url}</button></dd>
          </div>
          {meta.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd><button type="button" onClick={() => doCopy(v, k)}>{v}</button></dd>
            </div>
          ))}
        </dl>
      )}

      {peek && (
        <div className="tool__peek" aria-hidden="true">
          <div className="tool__peekbar"><i /><i /><i /><span>{hostOf(t.url)}</span></div>
          <img src={previewOf(t.url)} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.opacity = 0)} />
        </div>
      )}
    </article>
  );
}

/* ---------------------------------------------------------- pin dialog --- */

function PinDialog({ open, onClose, hasPin }) {
  const [v, setV] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const dlg = useRef(null);

  useEffect(() => {
    const d = dlg.current;
    if (open && !d.open) {
      setV('');
      setErr('');
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await post({ a: hasPin ? 'check' : 'setup', pin: v });
      setAdmin(v);
      if (!hasPin) refreshTools();
      toast(hasPin ? 'Editor unlocked' : 'PIN created — editor unlocked');
      onClose();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog ref={dlg} className="addlg addlg--sm" onClose={onClose} onCancel={onClose}>
      <form onSubmit={submit}>
        <header>
          <span className="section-head__index">Owner access</span>
          <h3>{hasPin ? 'Unlock editor' : 'Create your PIN'}</h3>
          <p>{hasPin ? 'Enter your PIN to add, edit or remove tools.' : 'First time: choose a PIN (4+ characters). Only this PIN can change the index.'}</p>
        </header>
        <label className="fld fld--wide">
          <span>PIN</span>
          <input autoFocus type="password" autoComplete="current-password" value={v} onChange={(e) => setV(e.target.value)} minLength={4} required />
        </label>
        {err && <p className="addlg__err">{err}</p>}
        {hasPin && (
          <details className="addlg__forgot">
            <summary>Forgot PIN?</summary>
            <p>
              Recovery is tied to your Google login. Open the{' '}
              <a href={API_EDITOR} target="_blank" rel="noreferrer noopener">API project</a>, sign in with your
              Google account, pick <code>resetPin</code> in the toolbar and press Run. Then come back and set a new PIN.
            </p>
          </details>
        )}
        <footer>
          <button type="button" className="tbtn" onClick={onClose}>Cancel</button>
          <button type="submit" className="tbtn tbtn--go" disabled={busy || v.length < 4}>{busy ? 'Checking…' : hasPin ? 'Unlock' : 'Create PIN'}</button>
        </footer>
      </form>
    </dialog>
  );
}

/* ----------------------------------------------------------- edit dialog --- */

const BLANK = { id: '', name: '', url: '', short: '', owner: 'Rahat', project: '', category: '', kind: '', status: 'live', visibility: 'public', description: '', tags: '', meta: '' };

function toForm(t) {
  if (!t) return BLANK;
  return {
    ...BLANK,
    ...t,
    tags: (t.tags || []).join(', '),
    meta: Object.entries(t.meta || {}).map(([k, v]) => `${k}: ${v}`).join('\n'),
  };
}

function EditDialog({ open, editing, onClose, categories, projects, pin }) {
  const [f, setF] = useState(BLANK);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const dlg = useRef(null);

  useEffect(() => {
    const d = dlg.current;
    if (open && !d.open) {
      setF(toForm(editing));
      setErr('');
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open, editing]);

  const set = (k) => (e) => {
    const v = e.target.value;
    setF((p) => {
      const n = { ...p, [k]: v };
      if (k === 'url' && v && !editing) {
        const g = parseUrl(v);
        if (!p.kind && g.kind) n.kind = g.kind;
        if (!p.tags && g.tags) n.tags = g.tags.join(', ');
        if (!p.meta && g.meta) n.meta = Object.entries(g.meta).map(([a, b]) => `${a}: ${b}`).join('\n');
      }
      return n;
    });
  };

  const valid = /^https?:\/\/\S+$/.test(f.url.trim()) && f.name.trim();

  const save = async (e) => {
    e.preventDefault();
    if (!valid) return;
    const meta = {};
    f.meta.split('\n').forEach((line) => {
      const i = line.indexOf(':');
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    });
    const tool = {
      id: editing?.id || slug(f.name),
      name: f.name.trim(),
      url: f.url.trim(),
      short: f.short.trim(),
      owner: f.owner.trim() || 'Rahat',
      project: f.project.trim() || 'Personal',
      category: f.category.trim() || 'Utility',
      kind: f.kind.trim() || 'Link',
      status: f.status,
      visibility: f.visibility === 'private' ? 'private' : 'public',
      description: f.description.trim(),
      tags: f.tags.split(',').map((s) => s.trim()).filter(Boolean),
      meta,
      added: editing?.added,
    };
    setBusy(true);
    setErr('');
    try {
      await post({ a: 'upsert', pin, tool });
      await refreshTools();
      toast(editing ? `Saved “${tool.name}”` : `Added “${tool.name}” — live for everyone`);
      onClose();
    } catch (x) {
      setErr(x.message);
      if (/PIN/i.test(x.message)) setAdmin('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog ref={dlg} className="addlg" onClose={onClose} onCancel={onClose}>
      <form onSubmit={save}>
        <header>
          <span className="section-head__index">{editing ? 'Edit entry' : 'New entry'}</span>
          <h3>{editing ? editing.name : 'Add a tool'}</h3>
          <p>Paste a link — type, tags and IDs are detected. Saves straight to the live index.</p>
        </header>

        <label className="fld fld--wide">
          <span>URL *</span>
          <input autoFocus required type="url" placeholder="https://…" value={f.url} onChange={set('url')} />
        </label>
        <label className="fld">
          <span>Name *</span>
          <input required value={f.name} onChange={set('name')} placeholder="Tool name" />
        </label>
        <label className="fld">
          <span>Short link</span>
          <input value={f.short} onChange={set('short')} placeholder="https://tinyurl.com/…" />
        </label>
        <label className="fld">
          <span>Project / owner</span>
          <input list="dl-proj" value={f.project} onChange={set('project')} placeholder="e.g. DSIP-WD6B" />
        </label>
        <label className="fld">
          <span>Category</span>
          <input list="dl-cat" value={f.category} onChange={set('category')} placeholder="e.g. Field Data" />
        </label>
        <label className="fld">
          <span>Type</span>
          <input list="dl-kind" value={f.kind} onChange={set('kind')} placeholder="Web App, Form, Sheet…" />
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
        <label className="fld fld--wide">
          <span>Who can see it</span>
          <select value={f.visibility || 'public'} onChange={set('visibility')}>
            <option value="public">Public: everyone</option>
            <option value="private">Private: only me, after unlocking</option>
          </select>
        </label>
        <label className="fld fld--wide">
          <span>Description</span>
          <textarea rows="2" value={f.description} onChange={set('description')} placeholder="What it does, who uses it" />
        </label>
        <label className="fld">
          <span>Tags</span>
          <input value={f.tags} onChange={set('tags')} placeholder="comma, separated" />
        </label>
        <label className="fld">
          <span>Owner</span>
          <input value={f.owner} onChange={set('owner')} />
        </label>
        <label className="fld fld--wide">
          <span>Specs — one per line, “Label: value”</span>
          <textarea rows="3" className="mono-in" value={f.meta} onChange={set('meta')} placeholder={'Script ID: 1abc…\nDeployment: AKfy…'} />
        </label>
        <datalist id="dl-cat">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        <datalist id="dl-proj">{projects.map((c) => <option key={c} value={c} />)}</datalist>
        <datalist id="dl-kind">{['Web App', 'Form', 'Sheet', 'Dashboard', 'Doc', 'File', 'Repository', 'Console', 'Bookmark', 'Link'].map((c) => <option key={c} value={c} />)}</datalist>

        {err && <p className="addlg__err">{err}</p>}

        <footer>
          <button type="button" className="tbtn" onClick={onClose}>Cancel</button>
          <button type="submit" className="tbtn tbtn--go" disabled={!valid || busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add to index'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

/* ---------------------------------------------------------- trash panel --- */

function TrashPanel({ pin, onClose }) {
  const [list, setList] = useState(null);
  const load = useCallback(() => post({ a: 'trash', pin }).then((j) => setList(j.tools)).catch((e) => toast(e.message)), [pin]);
  useEffect(() => {
    load();
  }, [load]);
  const restore = async (t) => {
    await post({ a: 'restore', pin, id: t.id });
    toast(`Restored “${t.name}”`);
    load();
    refreshTools();
  };
  return (
    <div className="trash">
      <div className="trash__head">
        <span className="mono">Trash — removed entries, restorable</span>
        <button type="button" className="tbtn" onClick={onClose}>Close</button>
      </div>
      {!list && <p className="mono">Loading…</p>}
      {list && list.length === 0 && <p className="trash__empty">Nothing in trash.</p>}
      {list?.map((t) => (
        <div className="trash__row" key={t.id}>
          <span>{t.name}</span>
          <span className="mono">{hostOf(t.url)}</span>
          <button type="button" className="tbtn" onClick={() => restore(t)}>Restore</button>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- stats --- */

function Counter({ to }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf;
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 900);
      setN(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{String(n).padStart(2, '0')}</>;
}

/* -------------------------------------------------------------- section --- */

export default function Tools() {
  const root = useReveal();
  const { tools, ready, hasPin, error } = useTools();
  const pin = useAdmin();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [proj, setProj] = useState('All');
  const [view, setView] = useState(() => store.get('rh-tool-view', 'grid'));
  const [pins, setPins] = useState(() => store.get(K_PINS, []));
  const [editing, setEditing] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [trash, setTrash] = useState(false);
  const input = useRef(null);
  const wantAdd = useRef(false);

  useEffect(() => store.set('rh-tool-view', view), [view]);

  const startAdd = useCallback(() => {
    setEditing(null);
    wantAdd.current = true;
    if (store.get(K_SESSION, '', sessionStorage)) setEditOpen(true);
    else setPinOpen(true);
  }, []);

  // "/" jumps to search while the section is on screen; global events let the
  // palette, Jarvis and shortcuts drive this section.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      root.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => input.current?.focus({ preventScroll: true }), 350);
    };
    const onSearch = (e) => {
      setQ(e.detail || '');
      root.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('rh-add-tool', startAdd);
    window.addEventListener('rh-tool-search', onSearch);
    const unlock = () => {
      wantAdd.current = false;
      setPinOpen(true);
    };
    window.addEventListener('rh-unlock', unlock);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('rh-add-tool', startAdd);
      window.removeEventListener('rh-tool-search', onSearch);
      window.removeEventListener('rh-unlock', unlock);
    };
  }, [root, startAdd]);

  const categories = useMemo(() => [...new Set(tools.map((t) => t.category).filter(Boolean))].sort(), [tools]);
  const projects = useMemo(() => [...new Set(tools.map((t) => t.project || t.owner).filter(Boolean))].sort(), [tools]);
  const countBy = (k, v) => tools.filter((t) => (k === 'p' ? (t.project || t.owner) === v : t.category === v)).length;

  const shown = useMemo(() => {
    const pinSet = new Set(pins);
    return tools
      .map((t) => ({ t, s: score(t, q.trim()) }))
      .filter(({ t, s }) => s > 0 && (cat === 'All' || t.category === cat) && (proj === 'All' || (t.project || t.owner) === proj))
      // Bookmarks stay out of the default grid; search, a filter or the chip shows them.
      .filter(({ t }) => t.kind !== 'Bookmark' || q.trim() || cat !== 'All' || proj !== 'All')
      .sort((a, b) => pinSet.has(b.t.id) - pinSet.has(a.t.id) || b.s - a.s || a.t.name.localeCompare(b.t.name))
      .map(({ t }) => t);
  }, [tools, q, cat, proj, pins]);

  const togglePin = useCallback((id) => {
    setPins((p) => {
      const n = p.includes(id) ? p.filter((x) => x !== id) : [...p, id];
      store.set(K_PINS, n);
      return n;
    });
  }, []);

  const onEdit = (t) => {
    setEditing(t);
    setEditOpen(true);
  };
  const onVisibility = async (t) => {
    const next = t.visibility === 'private' ? 'public' : 'private';
    const { source, ...clean } = t;
    try {
      await post({ a: 'upsert', pin, tool: { ...clean, visibility: next } });
      await refreshTools();
      toast(next === 'private' ? `Hidden from visitors: ${t.name}` : `Now public: ${t.name}`);
    } catch (x) {
      toast(x.message);
    }
  };
  const onDelete = async (t) => {
    if (!confirm(`Remove “${t.name}” from the index?\nIt goes to Trash and can be restored.`)) return;
    try {
      await post({ a: 'delete', pin, id: t.id, tool: t });
      await refreshTools();
      toast(`Moved “${t.name}” to Trash`);
    } catch (x) {
      toast(x.message);
    }
  };

  const exportAll = () => {
    const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), tools }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tool-index-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const live = tools.filter((t) => t.status === 'live').length;
  const latest = [...tools].sort((a, b) => String(b.updated || b.added).localeCompare(String(a.updated || a.added)))[0];

  return (
    <section className="section tools" id="tools" ref={root}>
      <div className="wrap">
        <div className="section-head" data-reveal>
          <div>
            <span className="section-head__index">03 — Index</span>
            <h2>
              Everything I&rsquo;ve built<span className="dim">, one keystroke away.</span>
            </h2>
          </div>
          <p>
            Web apps, field forms, dashboards and consoles — searchable, filterable, and
            open in one click. <kbd>/</kbd> search · <kbd>Ctrl</kbd>+<kbd>K</kbd> anywhere.
          </p>
        </div>

        <div className="tstats" data-reveal>
          <div><b><Counter to={tools.length} /></b><span>Indexed</span></div>
          <div><b><Counter to={live} /></b><span>Live now</span></div>
          <div><b><Counter to={projects.length} /></b><span>Projects</span></div>
          <div className="tstats__latest">
            <span>Latest</span>
            <strong>{latest?.name || '—'}</strong>
          </div>
          <div className="tstats__sync" data-state={error ? 'off' : ready ? 'on' : 'wait'}>
            <i />
            {error ? 'Cached copy' : ready ? 'Synced' : 'Syncing'}
          </div>
        </div>

        <div className="tbar" data-reveal>
          <label className="tsearch">
            <Search />
            <input
              ref={input}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, project, tag, script ID…"
              aria-label="Search tools"
              onKeyDown={(e) => {
                if (e.key === 'Escape') setQ('');
                if (e.key === 'Enter' && shown[0]) {
                  trackOpen(shown[0].id);
                  window.open(shown[0].url, '_blank', 'noopener');
                }
              }}
            />
            <span className="tsearch__count mono">{ready ? `${shown.length}/${tools.length}` : 'sync…'}</span>
          </label>
          <div className="tbar__right">
            <div className="seg" role="group" aria-label="Layout">
              <button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')} aria-label="Grid view"><GridI /></button>
              <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')} aria-label="List view"><ListI /></button>
            </div>
            <button
              type="button"
              className="tbtn tbtn--icon"
              data-on={!!pin}
              onClick={() => {
                wantAdd.current = false;
                if (pin) {
                  setAdmin('');
                  toast('Editor locked');
                } else setPinOpen(true);
              }}
              aria-label={pin ? 'Lock editor' : 'Unlock editor'}
              title={pin ? 'Editor unlocked — click to lock' : 'Owner: unlock editor'}
            >
              <Lock open={!!pin} />
            </button>
            <button type="button" className="tbtn tbtn--go" onClick={startAdd}>
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

        {pin && (
          <div className="tadmin">
            <span><i /> Owner mode: private links are visible to you only. The eye button sets what visitors see.</span>
            <button type="button" className="tbtn" onClick={() => setTrash((v) => !v)}><Trash /> Trash</button>
            <button type="button" className="tbtn" onClick={exportAll}><Eye /> Export backup</button>
          </div>
        )}
        {pin && trash && <TrashPanel pin={pin} onClose={() => setTrash(false)} />}

        <div className="tgrid" data-view={view}>
          {shown.map((t, i) => (
            <ToolCard key={t.id} index={i} t={t} view={view} pinned={pins.includes(t.id)} onPin={togglePin} admin={!!pin} onEdit={onEdit} onDelete={onDelete} onVisibility={onVisibility} />
          ))}
          <button type="button" className="tool tool--add" data-view={view} onClick={startAdd}>
            <span className="tool--add__plus"><Plus /></span>
            <span>Add a tool</span>
            <span className="mono">paste a link · no code</span>
          </button>
          {ready && shown.length === 0 && (
            <div className="tempty">
              <p>Nothing matches “{q}”.</p>
              <button type="button" className="tbtn" onClick={() => { setQ(''); setCat('All'); setProj('All'); }}>
                Clear filters
              </button>
            </div>
          )}
        </div>
      </div>

      <PinDialog open={pinOpen} hasPin={hasPin} onClose={() => {
        setPinOpen(false);
        if (store.get(K_SESSION, '', sessionStorage) && wantAdd.current) setEditOpen(true);
        wantAdd.current = false;
      }} />
      <EditDialog open={editOpen} editing={editing} pin={pin} onClose={() => setEditOpen(false)} categories={categories} projects={projects} />
    </section>
  );
}
