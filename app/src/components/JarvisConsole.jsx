import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { useJarvis, suggest, SETUP, COMMANDS, STATE_LABEL } from '../jarvis/engine';
import { PROVIDERS, BRAINS, brainById, refreshKeyed, available, activeProvider } from '../jarvis/brain';
import { bridge } from '../jarvis/memory';
import { parseKeys, addKeys, KEY_KINDS, mask } from '../jarvis/keys';
import { useHistory } from '../os/history';
import { TYPES } from '../os/searchIndex';

/* -----------------------------------------------------------------------------
 * The J.A.R.V.I.S. console — log, suggestions, input, mic. Rendered by the
 * Jarvis section and by the global dock; both read the one engine, so a
 * command typed in either shows up in both.
 * -------------------------------------------------------------------------- */

/* --------------------------------------------------------- status pill --- */

/** JARVIS ● ONLINE · Brain: Local — or OFFLINE MODE. */
export function JarvisStatus({ compact }) {
  const { state, online, kind, booted, providerLabel, hands } = useJarvis();
  const brain = providerLabel || kind || (booted ? 'Built-in' : '—');
  return (
    <div className="jstat" data-online={online} data-state={state} title={online ? 'Online' : 'Offline — navigation, tools, calculators and local AI still work'}>
      <span className="jstat__dot" aria-hidden="true" />
      <b>{online ? (state === 'idle' ? (hands ? 'Listening for “Jarvis”' : 'Online') : STATE_LABEL[state]) : 'Offline mode'}</b>
      {!compact && (
        <span className="jstat__brain mono" title={kind ? `${kind} model` : 'No AI model — every command still works'}>
          Brain: {brain}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------ advanced AI settings --- */

export function ProviderPanel({ variant = 'chips' }) {
  const { brain, choose, loadLocal, run, online, keys } = useJarvis();
  // Chips show what can think right now (plus one-click local installs);
  // the full list shows everything with its status.
  const list = variant === 'chips' ? PROVIDERS.filter((p) => brain.status[p.id]?.ok || brain.status[p.id]?.can) : PROVIDERS;
  return (
    <div className={variant === 'chips' ? 'jv2__models' : 'jprov'} role="group" aria-label="AI model">
      {variant !== 'chips' && (
        <p className="jprov__note">
          Auto uses your keyed brains first (best answers), then this computer, the browser, and free tiers — falling back instantly if one fails. Say “switch brain” or “use claude” any time. With none, every command still works.
        </p>
      )}
      <button type="button" aria-pressed={brain.prefer === 'auto'} onClick={() => choose('auto')}>
        {variant !== 'chips' && <i data-ok="true" />}Auto
      </button>
      {list.map((p) => {
        const s = brain.status[p.id];
        const off = p.kind === 'Cloud' && !online;
        return (
          <button
            type="button"
            key={p.id}
            aria-pressed={brain.prefer === p.id}
            data-ok={!!s?.ok && !off}
            data-front={brain.active === p.id || undefined}
            title={`${p.kind} · ${p.note} — ${off ? 'offline' : s?.detail || 'not checked yet'}`}
            onClick={() => (!s?.ok && s?.can ? loadLocal(p.id) : p.id === 'ollama' && !s?.ok ? run('use ollama') : choose(p.id))}
          >
            <i />
            {p.label}
            {variant !== 'chips' && <em>{off ? 'offline' : s?.detail || p.kind}</em>}
          </button>
        );
      })}
      {!keys && (
        <button type="button" className="jv2__addkeys" onClick={() => run('add keys')}>
          + add keys
        </button>
      )}
      {variant !== 'chips' && (
        <button type="button" className="jprov__rerun" onClick={() => run('setup')}>
          Re-run setup
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ console --- */

const Mic = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="12" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);

const Wave = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <path d="M3 12h2M7 8v8M11 5v14M15 8v8M19 11v2" />
  </svg>
);

const JarvisConsole = forwardRef(function JarvisConsole({ compact = false }, input) {
  const j = useJarvis();
  const history = useHistory();
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(-1);
  const body = useRef(null);

  useEffect(() => {
    body.current?.scrollTo({ top: body.current.scrollHeight, behavior: 'smooth' });
  }, [j.log, j.busy]);

  // Live transcript while the mic is open.
  useEffect(() => {
    const on = (e) => setQ(e.detail || '');
    window.addEventListener('rh-jarvis-interim', on);
    return () => window.removeEventListener('rh-jarvis-interim', on);
  }, []);

  const suggestions = useMemo(() => suggest(q, j.tools), [q, j.tools]);
  const submit = (text) => {
    j.run(text);
    setQ('');
    setHi(-1);
  };
  const pick = (c) => {
    setQ(c);
    input?.current?.focus();
  };
  const micUnavailable = !j.canListen ? 'Voice input isn’t supported in this browser — try Chrome or Edge' : !j.online ? 'Voice input needs the internet in this browser' : '';
  const typing = j.busy && !j.log.some((m) => m.streaming && (m.text || m.tool));

  return (
    <div className="jv2__term" data-compact={compact}>
      {!compact && (
        <div className="jv2__bar">
          <span className="mono">jarvis@rahat-os</span>
          <span className="jv2__cost mono">{j.keys ? `${j.keys} key${j.keys > 1 ? 's' : ''} · this device only` : 'no keys in the site'}</span>
          {j.canSpeak && (
            <button type="button" className="jv2__tog" aria-pressed={j.speak} onClick={() => j.toggleVoice(!j.speak)}>
              {j.speak ? 'voice on' : 'voice off'}
            </button>
          )}
          <button type="button" className="jv2__tog" aria-pressed={j.lang === 'bn-BD'} onClick={() => j.setLang(j.lang === 'bn-BD' ? 'en-US' : 'bn-BD')} title="Speech language (English / বাংলা)">
            {j.lang === 'bn-BD' ? 'বাং' : 'EN'}
          </button>
        </div>
      )}
      <div className="jv2__log" ref={body} aria-live="polite">
        {j.log.length === 0 && (
          <div className="jv2__empty">
            <b>Ask, or give a command.</b>
            <span>Works without AI — “open RFI”, “go to projects”, “velocity for 300 mm pipe at 40 L/s”, “help”.</span>
          </div>
        )}
        {j.log.map((m) => (
          <Message key={m.id} m={m} onPick={pick} />
        ))}
        {typing && (
          <p className="jv2__typing" data-who="ai">
            <span className="jv2__who">◆</span>
            <span>
              <i />
              <i />
              <i />
            </span>
          </p>
        )}
      </div>
      <div className="jv2__sugg">
        {suggestions.map((s) => (
          <button type="button" key={s} onClick={() => (s.endsWith(' ') ? pick(s) : submit(s))}>
            {s}
          </button>
        ))}
      </div>
      <form
        className="jv2__in"
        onSubmit={(e) => {
          e.preventDefault();
          submit(q);
        }}
      >
        <span className="jv2__prompt mono">›</span>
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={j.listening ? (j.hands ? 'Say “Jarvis, …”' : 'Listening…') : j.lang === 'bn-BD' ? 'কিছু জিজ্ঞেস করুন, বা “help”' : 'Ask J.A.R.V.I.S. anything, or “help”'}
          aria-label="Message J.A.R.V.I.S."
          autoComplete="off"
          spellCheck="false"
          enterKeyHint="send"
          disabled={j.busy && !j.listening}
          onKeyDown={(e) => {
            // ↑ ↓ walk the saved command history (persisted on this device).
            if (e.key === 'ArrowUp' && history.length) {
              e.preventDefault();
              const k = Math.min(history.length - 1, hi + 1);
              setHi(k);
              setQ(history[k].text);
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              const k = Math.max(-1, hi - 1);
              setHi(k);
              setQ(k < 0 ? '' : history[k].text);
            }
            if (e.key === 'Tab' && suggestions[0] && q) {
              e.preventDefault();
              setQ(suggestions[0]);
            }
          }}
        />
        <button
          type="button"
          className="jv2__hf"
          data-on={j.hands}
          onClick={() => j.setHandsFree(!j.hands)}
          disabled={!!micUnavailable}
          aria-label={j.hands ? 'Turn hands-free off' : 'Hands-free: always listening for “Jarvis”'}
          title={micUnavailable || 'Hands-free — wake word “Jarvis”'}
        >
          <Wave />
        </button>
        <button
          type="button"
          className="jv2__mic"
          data-on={j.listening && !j.hands}
          onClick={j.listen}
          disabled={!!micUnavailable}
          aria-label={micUnavailable || (j.listening ? 'Stop listening' : 'Speak a command')}
          title={micUnavailable || (j.listening ? 'Stop listening' : 'Speak a command')}
        >
          <Mic />
        </button>
        <button type="submit" className="jv2__go" aria-label="Send" disabled={j.busy || !q.trim()}>
          ↵
        </button>
      </form>
    </div>
  );
});
export default JarvisConsole;

/* ---------------------------------------------------------- messages --- */

function Message({ m, onPick }) {
  const j = useJarvis();
  if (m.who === 'setup')
    return (
      <div className="jv2__setup">
        <b className="mono">AUTO SETUP</b>
        {SETUP.map(([k, label]) => {
          const s = j.setup[k];
          return (
            <div key={k} data-s={s?.s || 'wait'}>
              <i />
              <span>{label}</span>
              <em>{s?.d || ''}</em>
            </div>
          );
        })}
      </div>
    );
  if (m.help)
    return (
      <div className="jv2__help">
        {COMMANDS.map((c) => (
          <button type="button" key={c.id} onClick={() => onPick(c.prefill)}>
            <code>{c.usage}</code>
            <span>{c.desc}</span>
          </button>
        ))}
      </div>
    );
  return (
    <div className="jv2__msg" data-who={m.who} data-error={!!m.error} data-streaming={m.streaming || undefined}>
      <span className="jv2__who" title={m.source === 'voice' ? 'spoken' : undefined}>{m.who === 'me' ? (m.source === 'voice' ? '◉' : '›') : m.who === 'ai' ? '◆' : '#'}</span>
      <div>
        {m.tool && !m.text && <span className="jv2__toolrun mono">running {m.tool}…</span>}
        {m.who === 'ai' ? <Rich text={m.text} /> : <span>{m.text}</span>}
        {m.list && (
          <ul className="jv2__list">
            {m.list.map((x, i) => (
              <li key={i}>
                <Rich text={x} inline />
              </li>
            ))}
          </ul>
        )}
        {m.results?.length > 0 && (
          <div className="jres" role="list">
            {m.results.map((r) => (
              <button
                type="button"
                role="listitem"
                key={r.key}
                className="jres__row"
                data-type={r.type}
                style={r.hue != null ? { '--h': r.hue } : undefined}
                onClick={() => (r.rerun ? j.run(r.rerun, { via: 'history' }) : r.prefill ? onPick(r.prefill) : j.runAction(r.action, r.title))}
              >
                <span className="jres__ico" aria-hidden="true" />
                <span className="jres__t">{r.title}</span>
                <span className="jres__d">{r.desc}</span>
                <span className="jres__k mono">{TYPES[r.type]?.label || (r.type === 'history' ? 'run again' : r.type)}</span>
              </button>
            ))}
          </div>
        )}
        {m.buttons?.length > 0 && (
          <div className="jv2__btns">
            {m.buttons.map((b) => (
              <button type="button" key={b.label} onClick={() => j.runAction(b.action, b.label)}>
                {b.label} →
              </button>
            ))}
          </div>
        )}
        {m.sources?.length > 0 && (
          <div className="jv2__src">
            {m.sources.map((s, i) => (
              <a key={i} href={s.url} target="_blank" rel="noreferrer noopener" title={s.snippet || s.url}>
                <b>{i + 1}</b>
                {s.title?.slice(0, 60)}
              </a>
            ))}
          </div>
        )}
        {m.file && (
          <a className="jv2__file" href={m.file.url} download={m.file.name}>
            <b>{m.file.name.split('.').pop().toUpperCase()}</b>
            <span>{m.file.name}</span>
            <em>download again</em>
          </a>
        )}
        {m.confirm && (
          <div className="jv2__confirm" data-done={m.confirm.done || ''}>
            <b>{m.confirm.title}</b>
            <code>{m.confirm.detail}</code>
            {m.confirm.done ? (
              <span className="mono">{m.confirm.done === 'yes' ? 'approved' : 'cancelled'}</span>
            ) : (
              <div>
                <button type="button" className="is-yes" onClick={() => j.confirm(m, true)}>
                  Confirm
                </button>
                <button type="button" onClick={() => j.confirm(m, false)}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
        {m.form === 'notion' && <NotionForm pin={j.pin} push={j.push} />}
        {m.form === 'keys' && <KeysForm pin={j.pin} push={j.push} setBrain={j.setBrain} />}
        {m.via && (
          <small className="jv2__via mono">
            via {m.via}
            {m.ms ? ` · ${(m.ms / 1000).toFixed(1)} s` : ''}
          </small>
        )}
      </div>
    </div>
  );
}

function NotionForm({ pin, push }) {
  const [token, setToken] = useState('');
  const [page, setPage] = useState('');
  const [state, setState] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setState('Connecting…');
    try {
      const j = await bridge({ a: 'connect', pin, token: token.trim(), page: page.trim() });
      setToken('');
      setState('done');
      push({ who: 'ai', text: 'Notion connected. A “JARVIS Memory” database now lives under that page; new memories sync there.', sources: [{ title: 'JARVIS Memory', url: j.url }] });
    } catch (x) {
      setState(x.message);
    }
  };
  if (state === 'done') return null;
  return (
    <form className="jv2__form" onSubmit={submit}>
      <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Notion integration token (ntn_…)" autoComplete="off" required />
      <input value={page} onChange={(e) => setPage(e.target.value)} placeholder="Notion page URL shared with the integration" required />
      <button type="submit">Connect</button>
      {state && <small>{state}</small>}
    </form>
  );
}

/* Paste-anything key form. Keys are detected by prefix, kept in this
   browser, and (optionally, owner only) copied to the Apps Script bridge so
   other devices can use them server-side. */
function KeysForm({ pin, push, setBrain }) {
  const [text, setText] = useState('');
  const [share, setShare] = useState(false);
  const [msg, setMsg] = useState('');
  const found = parseKeys(text);
  const n = Object.keys(found).length;
  const submit = async (e) => {
    e.preventDefault();
    if (!n) return setMsg('No key recognised. Paste the full key(s).');
    addKeys(found);
    setText('');
    setMsg('Checking…');
    const b = await refreshKeyed();
    setBrain(b);
    const lines = Object.entries(found).map(([k, v]) => `${KEY_KINDS[k].label} ${mask(v)}: ${b.status[BRAINS.find((x) => x.key === k)?.id]?.detail || 'stored'}`);
    if (share && pin) {
      for (const [k, v] of Object.entries(found)) {
        if (!['gemini', 'groq', 'unikey', 'opencode'].includes(k)) continue;
        try {
          await bridge({ a: 'setkey', pin, kind: k, key: v });
          lines.push(`${KEY_KINDS[k].label}: copied to the bridge`);
        } catch (x) {
          lines.push(`${KEY_KINDS[k].label}: bridge — ${x.message}`);
        }
      }
    }
    setMsg('done');
    push({ who: 'ai', text: `Keys saved on this device.\n${lines.map((l) => `- ${l}`).join('\n')}\n${available().length} brains online — primary **${brainById(activeProvider())?.label || 'none'}**. Say “switch brain” to change.` });
  };
  if (msg === 'done') return null;
  return (
    <form className="jv2__form" onSubmit={submit}>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste keys here — e.g. sk-…, gsk_…, AQ.…, AIza…, oc_sk_…" rows={3} autoComplete="off" spellCheck="false" aria-label="API keys" />
      <div className="jv2__found mono">
        {n ? Object.entries(found).map(([k, v]) => <span key={k}>✓ {KEY_KINDS[k].label} {mask(v)}</span>) : <span className="is-hint">keys are recognised as you paste</span>}
      </div>
      {pin && (
        <label className="jv2__chk">
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} /> also store on my bridge for other devices
        </label>
      )}
      <button type="submit" disabled={!n}>
        Save {n || ''} key{n === 1 ? '' : 's'}
      </button>
      {msg && <small>{msg}</small>}
    </form>
  );
}

/* Minimal, safe markdown: **bold**, `code`, [links](url), bullets, line
   breaks. Builds React nodes — never innerHTML. */
function Rich({ text = '', inline: only }) {
  const inline = (s, k) =>
    s.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g).map((p, i) => {
      if (/^\*\*/.test(p)) return <b key={k + i}>{p.slice(2, -2)}</b>;
      if (/^`/.test(p)) return <code key={k + i}>{p.slice(1, -1)}</code>;
      const l = p.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if (l)
        return (
          <a key={k + i} href={l[2]} target="_blank" rel="noreferrer noopener">
            {l[1]}
          </a>
        );
      return p;
    });
  if (only) return <>{inline(text, 'i')}</>;
  const lines = text.split('\n');
  const out = [];
  let list = [];
  const flush = () => {
    if (list.length) out.push(<ul key={'u' + out.length}>{list}</ul>);
    list = [];
  };
  lines.forEach((ln, i) => {
    const b = ln.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    if (b) return list.push(<li key={i}>{inline(b[1], i + '-')}</li>);
    flush();
    if (ln.trim()) out.push(<p key={i}>{inline(ln.replace(/^#+\s*/, ''), i + '-')}</p>);
  });
  flush();
  return <div className="jv2__rich">{out}</div>;
}
