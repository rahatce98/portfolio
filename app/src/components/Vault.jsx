import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API, copy } from '../sections/Tools';
import { toast } from './Toast';

/* -----------------------------------------------------------------------------
 * Vault — zero-knowledge password / code store.
 *
 * Two locks:
 *   1. Owner PIN  — lets the server hand over the (encrypted) vault blob.
 *   2. Master password — never leaves this browser. It derives an AES-256-GCM
 *      key with PBKDF2-SHA256 (310 000 iterations, random 16-byte salt), and
 *      the whole entry list is encrypted before upload. The server, GitHub and
 *      anyone reading the network only ever see ciphertext.
 *
 * Forgetting the master password means the vault cannot be opened — there is
 * deliberately no reset. Keep the "Download encrypted backup" file somewhere.
 * Auto-locks after 5 minutes idle; copied secrets are wiped from the clipboard
 * after 30 seconds.
 * -------------------------------------------------------------------------- */

const IT = 310000;
const IDLE_MS = 5 * 60 * 1000;
const CATS = ['Work', 'Personal', 'Finance', 'Dev / API', 'Device', 'Other'];
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (u8) => btoa(String.fromCharCode(...new Uint8Array(u8)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(pass, salt, it = IT) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: it }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function seal(entries, key, salt) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify({ entries, saved: new Date().toISOString() })));
  return JSON.stringify({ v: 1, kdf: 'pbkdf2-sha256', it: IT, salt: b64(salt), iv: b64(iv), ct: b64(ct) });
}
async function open(blob, pass) {
  const o = JSON.parse(blob);
  const salt = unb64(o.salt);
  const key = await deriveKey(pass, salt, o.it);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, key, unb64(o.ct));
  return { key, salt, data: JSON.parse(dec.decode(pt)) };
}
async function call(body) {
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!j.ok) throw Object.assign(new Error(j.error || 'Request failed'), { rev: j.rev });
  return j;
}
function genPass(n = 20) {
  const cs = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+?';
  const r = crypto.getRandomValues(new Uint32Array(n));
  return Array.from(r, (x) => cs[x % cs.length]).join('');
}
function strength(p) {
  let s = 0;
  if (p.length >= 12) s++;
  if (p.length >= 16) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(4, s);
}
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const getPin = () => {
  try {
    return JSON.parse(sessionStorage.getItem('rh-admin') || '""');
  } catch {
    return '';
  }
};

async function wipeClipboard(val) {
  setTimeout(async () => {
    try {
      if ((await navigator.clipboard.readText()) === val) await navigator.clipboard.writeText('');
    } catch {
      /* no read permission — best effort */
    }
  }, 30000);
}

/* ------------------------------------------------------------ entry row --- */

function Entry({ e, onEdit, onDelete }) {
  const [show, setShow] = useState(false);
  const cp = async (v, what) => {
    if (!v) return;
    await copy(v);
    wipeClipboard(v);
    toast(`${what} copied — clears in 30 s`);
  };
  return (
    <div className="ve">
      <div className="ve__head">
        <span className="ve__glyph">{(e.title || '?').slice(0, 2).toUpperCase()}</span>
        <div className="ve__title">
          <strong>{e.title}</strong>
          <span>{e.cat}{e.url && <> · <a href={e.url} target="_blank" rel="noreferrer noopener">{e.url.replace(/^https?:\/\//, '').slice(0, 40)}</a></>}</span>
        </div>
        <button type="button" className="tbtn" onClick={() => onEdit(e)} aria-label="Edit">Edit</button>
        <button type="button" className="tbtn tbtn--danger" onClick={() => onDelete(e)} aria-label="Delete">✕</button>
      </div>
      {e.user && (
        <div className="ve__row">
          <span>ID</span>
          <code>{e.user}</code>
          <button type="button" className="tbtn" onClick={() => cp(e.user, 'ID')}>Copy</button>
        </div>
      )}
      {e.secret && (
        <div className="ve__row">
          <span>Secret</span>
          <code className="ve__secret">{show ? e.secret : '•'.repeat(Math.min(14, e.secret.length))}</code>
          <button type="button" className="tbtn" onClick={() => setShow((v) => !v)}>{show ? 'Hide' : 'Show'}</button>
          <button type="button" className="tbtn tbtn--go" onClick={() => cp(e.secret, 'Secret')}>Copy</button>
        </div>
      )}
      {e.notes && <p className="ve__notes">{show ? e.notes : 'Notes hidden — press Show'}</p>}
    </div>
  );
}

/* --------------------------------------------------------------- vault --- */

export default function Vault() {
  const [openV, setOpenV] = useState(() => location.hash === '#vault');
  const [stage, setStage] = useState('pin'); // pin | load | create | unlock | open
  const [pin, setPin] = useState(getPin);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [entries, setEntries] = useState([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [form, setForm] = useState(null);
  const blobRef = useRef('');
  const revRef = useRef(0);
  const keyRef = useRef(null);
  const saltRef = useRef(null);
  const idle = useRef(0);

  const lock = useCallback((msg) => {
    keyRef.current = null;
    setEntries([]);
    setPass('');
    setPass2('');
    setForm(null);
    setStage(blobRef.current ? 'unlock' : 'load');
    if (msg) toast(msg);
  }, []);

  // open via #vault, the Tools card or Jarvis
  useEffect(() => {
    const onHash = () => location.hash === '#vault' && setOpenV(true);
    const onEv = () => setOpenV(true);
    window.addEventListener('hashchange', onHash);
    window.addEventListener('rh-vault', onEv);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('rh-vault', onEv);
    };
  }, []);

  const close = () => {
    lock();
    setOpenV(false);
    if (location.hash === '#vault') history.replaceState(null, '', location.pathname);
  };

  // fetch ciphertext once PIN is known
  const load = useCallback(async (p) => {
    setBusy(true);
    setErr('');
    try {
      // First visit ever: no PIN on the server yet — this PIN becomes it.
      const info = await fetch(`${API}?a=list&t=${Date.now()}`).then((r) => r.json()).catch(() => ({ hasPin: true }));
      if (info.hasPin === false) await call({ a: 'setup', pin: p });
      const j = await call({ a: 'vaultGet', pin: p });
      blobRef.current = j.blob || '';
      revRef.current = j.rev || 0;
      try {
        sessionStorage.setItem('rh-admin', JSON.stringify(p));
        window.dispatchEvent(new Event('rh-admin'));
      } catch {
        /* ignore */
      }
      setStage(j.blob ? 'unlock' : 'create');
    } catch (x) {
      setErr(x.message);
      setStage('pin');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!openV) return;
    const p = getPin();
    if (p) {
      setPin(p);
      load(p);
    } else setStage('pin');
  }, [openV, load]);

  // idle auto-lock + Esc
  useEffect(() => {
    if (stage !== 'open') return;
    const bump = () => {
      clearTimeout(idle.current);
      idle.current = setTimeout(() => lock('Vault locked after 5 minutes idle'), IDLE_MS);
    };
    bump();
    const ev = ['pointerdown', 'keydown', 'scroll'];
    ev.forEach((x) => window.addEventListener(x, bump, { passive: true }));
    return () => {
      clearTimeout(idle.current);
      ev.forEach((x) => window.removeEventListener(x, bump));
    };
  }, [stage, lock]);
  useEffect(() => {
    if (!openV) return;
    const k = (e) => e.key === 'Escape' && !form && close();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openV, form]);

  const persist = async (list) => {
    const blob = await seal(list, keyRef.current, saltRef.current);
    const j = await call({ a: 'vaultPut', pin, blob, rev: revRef.current });
    blobRef.current = blob;
    revRef.current = j.rev;
    setEntries(list);
  };

  const create = async (e) => {
    e.preventDefault();
    if (pass.length < 10) return setErr('Use at least 10 characters.');
    if (pass !== pass2) return setErr('The two passwords differ.');
    setBusy(true);
    setErr('');
    try {
      saltRef.current = crypto.getRandomValues(new Uint8Array(16));
      keyRef.current = await deriveKey(pass, saltRef.current);
      await persist([]);
      setPass('');
      setPass2('');
      setStage('open');
      toast('Vault created and encrypted');
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };

  const unlock = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const { key, salt, data } = await open(blobRef.current, pass);
      keyRef.current = key;
      saltRef.current = salt;
      setEntries(data.entries || []);
      setPass('');
      setStage('open');
    } catch {
      setErr('Wrong master password.');
    } finally {
      setBusy(false);
    }
  };

  const saveEntry = async (ev) => {
    ev.preventDefault();
    if (!form.title.trim()) return;
    setBusy(true);
    try {
      const item = { ...form, title: form.title.trim(), updated: new Date().toISOString() };
      const list = form.id ? entries.map((x) => (x.id === form.id ? item : x)) : [{ ...item, id: uid() }, ...entries];
      await persist(list);
      setForm(null);
      toast('Saved — encrypted');
    } catch (x) {
      toast(x.message);
      if (x.rev != null) lock('Vault changed on another device — unlock again');
    } finally {
      setBusy(false);
    }
  };

  const del = async (e) => {
    if (!confirm(`Delete “${e.title}” from the vault?`)) return;
    try {
      await persist(entries.filter((x) => x.id !== e.id));
      toast('Deleted');
    } catch (x) {
      toast(x.message);
    }
  };

  const backup = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([blobRef.current], { type: 'application/json' }));
    a.download = `vault-encrypted-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Encrypted backup downloaded — useless without your master password');
  };

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return entries.filter((e) => (cat === 'All' || e.cat === cat) && (!t || [e.title, e.user, e.url, e.cat].join(' ').toLowerCase().includes(t)));
  }, [entries, q, cat]);

  if (!openV) return null;
  const st = strength(pass);

  return (
    <div className="vault" role="dialog" aria-modal="true" aria-label="Vault">
      <div className="vault__panel">
        <header className="vault__top">
          <div className="vault__brand">
            <span className="vault__lock" data-open={stage === 'open'} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="11" width="14" height="9" rx="2" /><path d={stage === 'open' ? 'M8 11V8a4 4 0 0 1 7.8-1.2' : 'M8 11V8a4 4 0 0 1 8 0v3'} /></svg>
            </span>
            <div>
              <strong>Vault</strong>
              <span className="mono">AES-256-GCM · PBKDF2 310k · zero-knowledge</span>
            </div>
          </div>
          <div className="vault__acts">
            {stage === 'open' && (
              <>
                <button type="button" className="tbtn" onClick={backup}>Backup</button>
                <button type="button" className="tbtn" onClick={() => lock('Vault locked')}>Lock</button>
              </>
            )}
            <button type="button" className="tbtn" onClick={close}>Close <kbd>Esc</kbd></button>
          </div>
        </header>

        {stage === 'pin' && (
          <form className="vault__gate" onSubmit={(e) => { e.preventDefault(); load(pin); }}>
            <h3>Owner PIN</h3>
            <p>Same PIN as the tool index (first time: the PIN you type here is created). It only unlocks the encrypted file — your secrets still need the master password.</p>
            <input type="password" autoFocus value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" autoComplete="current-password" />
            {err && <p className="addlg__err">{err}</p>}
            <button type="submit" className="tbtn tbtn--go" disabled={busy || pin.length < 4}>{busy ? 'Checking…' : 'Continue'}</button>
          </form>
        )}
        {stage === 'load' && <div className="vault__gate"><span className="lab__spinner" /></div>}

        {stage === 'create' && (
          <form className="vault__gate" onSubmit={create}>
            <h3>Create your master password</h3>
            <p>
              It encrypts everything in this browser before upload. <b>It cannot be reset</b> — if you forget it, the vault is
              unreadable, even to the site owner. Use a long sentence you will remember.
            </p>
            <input type="password" autoFocus value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Master password (10+ characters)" autoComplete="new-password" />
            <div className="vault__meter" data-s={st}><i /><i /><i /><i /></div>
            <input type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} placeholder="Repeat it" autoComplete="new-password" />
            {err && <p className="addlg__err">{err}</p>}
            <button type="submit" className="tbtn tbtn--go" disabled={busy}>{busy ? 'Encrypting…' : 'Create vault'}</button>
          </form>
        )}

        {stage === 'unlock' && (
          <form className="vault__gate" onSubmit={unlock}>
            <h3>Unlock vault</h3>
            <p>Decryption happens here, on your device.</p>
            <input type="password" autoFocus value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Master password" autoComplete="current-password" />
            {err && <p className="addlg__err">{err}</p>}
            <button type="submit" className="tbtn tbtn--go" disabled={busy || !pass}>{busy ? 'Decrypting…' : 'Unlock'}</button>
          </form>
        )}

        {stage === 'open' && (
          <div className="vault__body">
            <form
              className="vault__quick"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                setForm({ title: String(f.get('t') || ''), user: String(f.get('u') || ''), secret: String(f.get('s') || ''), url: '', notes: '', cat: 'Work' });
                e.currentTarget.reset();
              }}
            >
              <input name="t" placeholder="Name — e.g. RFL HRIS" required />
              <input name="u" placeholder="ID / username" />
              <input name="s" type="password" placeholder="Password / code / key" />
              <button type="submit" className="tbtn tbtn--go">+ Save</button>
            </form>

            <div className="vault__filter">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${entries.length} entries…`} />
              {['All', ...CATS].map((c) => (
                <button type="button" key={c} className="fchip" aria-pressed={cat === c} onClick={() => setCat(c)}>
                  {c}
                  <b>{c === 'All' ? entries.length : entries.filter((e) => e.cat === c).length}</b>
                </button>
              ))}
            </div>

            <div className="vault__list">
              {shown.map((e) => <Entry key={e.id} e={e} onEdit={setForm} onDelete={del} />)}
              {shown.length === 0 && <p className="vault__empty">{entries.length ? 'No match.' : 'Empty. Add your first entry above — one line, one click.'}</p>}
            </div>
          </div>
        )}

        {form && (
          <form className="vault__form" onSubmit={saveEntry}>
            <h3>{form.id ? 'Edit entry' : 'New entry'}</h3>
            <label className="fld"><span>Name *</span><input autoFocus required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            <label className="fld"><span>Category</span>
              <select value={form.cat} onChange={(e) => setForm({ ...form, cat: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
            </label>
            <label className="fld"><span>ID / username</span><input value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} autoComplete="off" /></label>
            <label className="fld"><span>Password / code / key</span>
              <div className="vault__pw">
                <input type="text" className="mono-in" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} autoComplete="off" spellCheck="false" />
                <button type="button" className="tbtn" onClick={() => setForm({ ...form, secret: genPass() })} title="Generate a strong password">Generate</button>
              </div>
            </label>
            <label className="fld fld--wide"><span>URL</span><input type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" /></label>
            <label className="fld fld--wide"><span>Notes</span><textarea rows="3" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
            <footer>
              <button type="button" className="tbtn" onClick={() => setForm(null)}>Cancel</button>
              <button type="submit" className="tbtn tbtn--go" disabled={busy}>{busy ? 'Encrypting…' : 'Save encrypted'}</button>
            </footer>
          </form>
        )}
      </div>
    </div>
  );
}
