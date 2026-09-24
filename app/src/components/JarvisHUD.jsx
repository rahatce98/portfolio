import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import JarvisCore from '../jarvis/JarvisCore';
import JarvisConsole from './JarvisConsole';
import { useJarvis, STAGES, STATE_LABEL } from '../jarvis/engine';
import { PROVIDERS, BRAINS } from '../jarvis/brain';
import { TOOLS } from '../jarvis/tools';
import { localMemories } from '../jarvis/memory';
import { weather } from '../jarvis/web';
import { useHistory, clock } from '../os/history';

const Core3D = lazy(() => import('../jarvis/Core3D'));

/* -----------------------------------------------------------------------------
 * J.A.R.V.I.S. command center (HUD).
 *
 * One screen for the whole assistant: the 3D core, the agents at work, every
 * brain and its status, a live intelligence feed, the mission timeline, a
 * system monitor and the conversation. Every number is real — derived from
 * the engine, this device or a live API — nothing is decorative data.
 *
 * Rendered embedded in the Jarvis section and full-screen ("Jarvis mode").
 * -------------------------------------------------------------------------- */

/* Agents are groups of the parser's commands; one lights up when its commands run. */
const AGENTS = [
  { id: 'research', name: 'Research Agent', desc: 'Search · Read · Summarise', ico: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3', tools: ['search', 'find', 'news', 'about', 'youtube', 'google', 'briefing', 'price', 'weather'] },
  { id: 'browser', name: 'Browser Agent', desc: 'Open · Navigate · Links', ico: 'M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18', tools: ['open', 'openurl', 'go', 'lab', 'showtools', 'favorites', 'palette', 'bookmark-add', 'bookmark-list', 'bookmark-import', 'tool-add', 'float', 'vault'] },
  { id: 'memory', name: 'Memory Agent', desc: 'Notes · Knowledge · Context', ico: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3', tools: ['remember', 'recall', 'notes', 'notion', 'history'] },
  { id: 'task', name: 'Task Agent', desc: 'Files · Excel · Reports', ico: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01', tools: ['file', 'clipboard', 'time', 'unlock', 'install'] },
  { id: 'eng', name: 'Engineering Agent', desc: 'Hydraulics · Units · Maths', ico: 'M12 2 3 7v10l9 5 9-5V7zM3 7l9 5 9-5M12 12v10', tools: ['pipe', 'convert', 'calc'] },
  { id: 'system', name: 'System Agent', desc: 'Brains · Voice · Setup', ico: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12h2M3 12h2M12 3v2M12 19v2M17 7l1.4-1.4M5.6 18.4 7 17M17 17l1.4 1.4M5.6 5.6 7 7', tools: ['brain', 'keys', 'voice', 'setup', 'theme', 'motion', 'help'] },
];
const LABEL_TO_ID = Object.fromEntries(TOOLS.map((t) => [t.label, t.id]));
const agentOf = (via = '') => {
  const id = LABEL_TO_ID[via] || LABEL_TO_ID[via.split(' → ')[0]];
  if (id) return AGENTS.find((a) => a.tools.includes(id))?.id;
  return via && BRAINS.some((b) => via.startsWith(b.label)) ? 'brain' : null;
};

const hasGL = () => {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
};

const Ico = ({ d, size = 16 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

/* ------------------------------------------------ live device telemetry --- */
function useTelemetry(active) {
  const [t, set] = useState({ fps: 0, load: 0, heap: null, net: null, rtt: null, storage: null });
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let frames = 0;
    let last = performance.now();
    let lagSum = 0;
    let lagN = 0;
    let expect = performance.now() + 100;
    const lagT = setInterval(() => {
      const now = performance.now();
      lagSum += Math.max(0, now - expect);
      lagN++;
      expect = now + 100;
    }, 100);
    const loop = () => {
      frames++;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const sample = setInterval(async () => {
      const now = performance.now();
      const fps = Math.round((frames * 1000) / (now - last));
      frames = 0;
      last = now;
      const lag = lagN ? lagSum / lagN : 0;
      lagSum = lagN = 0;
      const m = performance.memory; // Chromium only — shown when present
      const c = navigator.connection;
      let storage = null;
      try {
        const e = await navigator.storage?.estimate?.();
        if (e?.quota) storage = Math.max(1, Math.round((e.usage / e.quota) * 100));
      } catch {
        /* not supported */
      }
      set({
        fps,
        load: Math.min(100, Math.round((lag / 50) * 100)),
        heap: m ? Math.round((m.usedJSHeapSize / m.jsHeapSizeLimit) * 100) : null,
        net: c?.effectiveType ? c.effectiveType.toUpperCase() : navigator.onLine ? 'Online' : 'Offline',
        rtt: c?.rtt ?? null,
        storage,
      });
    }, 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(lagT);
      clearInterval(sample);
    };
  }, [active]);
  return t;
}

function Gauge({ label, value, unit = '%', max = 100, sub }) {
  const pct = value == null ? 0 : Math.min(1, value / max);
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="hud-gauge">
      <svg viewBox="0 0 64 64" width="72" height="72" aria-hidden="true">
        <circle cx="32" cy="32" r={r} className="hud-gauge__track" />
        <circle cx="32" cy="32" r={r} className="hud-gauge__val" strokeDasharray={`${pct * c} ${c}`} />
        <circle cx="32" cy="32" r={r - 7} className="hud-gauge__inner" />
      </svg>
      <b>
        {value == null ? '—' : value}
        {value == null ? '' : unit}
      </b>
      <span className="mono">{label}</span>
      {sub && <em className="mono">{sub}</em>}
    </div>
  );
}

/* Voice waveform: bars driven by the live mic / speech level. */
function Wave({ level, state, bars = 42 }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const kids = [...el.children];
    let raf = 0;
    let t = 0;
    const tick = () => {
      t += 0.06;
      const l = level?.current || 0;
      const base = state === 'listening' || state === 'speaking' ? 0.25 : state === 'thinking' ? 0.14 : 0.06;
      kids.forEach((k, i) => {
        const v = Math.max(0.05, Math.min(1, (base + l * 0.9) * (0.45 + 0.55 * Math.abs(Math.sin(i * 0.55 + t * 3) * Math.sin(i * 0.17 - t)))));
        k.style.transform = `scaleY(${v})`;
      });
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [level, state]);
  return (
    <div className="hud-wave" ref={ref} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <i key={i} />
      ))}
    </div>
  );
}

function Panel({ title, action, children, className = '', area }) {
  return (
    <section className={`hud-panel ${className}`} style={area ? { gridArea: area } : undefined}>
      <header>
        <h3>{title}</h3>
        {action}
      </header>
      {children}
    </section>
  );
}

/* Constellation of memories — one star per memory, links between neighbours. */
function Constellation({ n }) {
  const pts = useMemo(() => {
    const k = Math.max(5, Math.min(18, n || 5));
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: k }, (_, i) => [10 + (i / (k - 1)) * 180 + (rnd() - 0.5) * 16, 18 + rnd() * 52]);
  }, [n]);
  return (
    <svg className="hud-const" viewBox="0 0 200 88" aria-hidden="true">
      <polyline points={pts.map((p) => p.join(',')).join(' ')} />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 4 === 0 ? 2.6 : 1.6} style={{ animationDelay: `${i * 0.21}s` }} />
      ))}
    </svg>
  );
}

export default function JarvisHUD({ overlay = false, onClose }) {
  const j = useJarvis();
  const history = useHistory();
  const [tab, setTab] = useState('chat');
  const [now, setNow] = useState(() => new Date());
  const [wx, setWx] = useState(null);
  const [q, setQ] = useState('');
  const gl = useMemo(hasGL, []);
  const paused = !overlay && j.full; // the overlay's core runs instead
  const tele = useTelemetry(!paused);
  const input = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const rootRef = useRef(null);
  // The dock hands focus here when this section is already on screen.
  useEffect(() => {
    if (overlay) return;
    const f = () => (setTab('chat'), setTimeout(() => rootRef.current?.querySelector('.jv2__in input')?.focus({ preventScroll: true }), 40));
    window.addEventListener('rh-jarvis-focus', f);
    return () => window.removeEventListener('rh-jarvis-focus', f);
  }, [overlay]);
  useEffect(() => {
    if (!navigator.onLine) return;
    weather('Dhaka').then(setWx).catch(() => null);
  }, []);
  useEffect(() => {
    if (!overlay) return;
    const esc = (e) => e.key === 'Escape' && onClose?.();
    addEventListener('keydown', esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      removeEventListener('keydown', esc);
      document.body.style.overflow = prev;
    };
  }, [overlay, onClose]);

  // What is each agent doing? Active if one of its commands ran in the last 10 s.
  const active = useMemo(() => {
    const out = {};
    const since = Date.now() - 10000;
    for (const m of j.log) {
      if (!m.via || (m.at || 0) < since) continue;
      const a = agentOf(m.via);
      if (a) out[a] = true;
    }
    if (j.busy) out[j.stage === 1 ? 'research' : 'system'] = true;
    if (j.listening || j.state === 'speaking') out.system = true;
    return out;
  }, [j.log, j.busy, j.stage, j.listening, j.state]);

  const brains = PROVIDERS.map((p) => ({ ...p, s: j.brain.status[p.id] }));
  const online = brains.filter((b) => b.s?.ok);
  const mems = localMemories().length;
  const turns = j.log.filter((m) => m.who === 'me').length;
  const calls = j.log.filter((m) => m.who === 'ai' && m.via && !BRAINS.some((b) => m.via === b.label)).length;
  const feed = j.log.filter((m) => (m.who === 'ai' || m.who === 'sys') && m.text && m.id !== 'setup').slice(-8).reverse();
  const nActive = Object.keys(active).length;
  const sysOk = j.online && online.length > 0;

  const submit = (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    j.run(q);
    setQ('');
    setTab('chat');
  };
  const mode = (pre) => {
    setTab('chat');
    j.prefill(pre);
  };

  const Core = (
    <div className="hud-core" data-state={j.state}>
      {gl ? (
        <Suspense fallback={<JarvisCore state={j.state} level={j.level} />}>{!paused && <Core3D state={j.state} level={j.level} />}</Suspense>
      ) : (
        <JarvisCore state={j.state} level={j.level} />
      )}
      <div className="hud-core__label">
        <b>JARVIS</b>
        <span>AI CORE</span>
        <em className="mono">v6 · {j.provider ? PROVIDERS.find((p) => p.id === j.provider)?.label : 'built-in'}</em>
      </div>
      <div className="hud-core__state mono">
        <i />
        {j.online ? STATE_LABEL[j.state] : 'Offline mode'}
        {j.hands && <span> · listening for “Jarvis”</span>}
      </div>
      <ol className="hud-core__pipe mono" aria-label="Task progress">
        {STAGES.map((s, i) => (
          <li key={s} data-on={j.stage === i} data-done={j.stage > i}>
            {s}
          </li>
        ))}
      </ol>
    </div>
  );

  return (
    <div ref={rootRef} className="hud" data-overlay={overlay || undefined} data-state={j.state} role={overlay ? 'dialog' : undefined} aria-modal={overlay ? 'true' : undefined} aria-label="J.A.R.V.I.S. command center">
      <div className="hud__bg" aria-hidden="true" />

      {/* ---------------------------------------------------------- top --- */}
      <header className="hud__top">
        <div className="hud-brand">
          <span className="hud-brand__mark" aria-hidden="true">
            <i />
          </span>
          <div>
            <b>JARVIS</b>
            <span className="mono">Command center</span>
          </div>
        </div>
        <div className="hud-pill mono" data-ok={sysOk}>
          <i />
          System {j.online ? (sysOk ? 'optimal' : 'online · no brain') : 'offline'}
        </div>
        <div className="hud-clock">
          <span className="mono">{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
          <b>{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</b>
        </div>
        <form className="hud-search" onSubmit={submit}>
          <Ico d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Command or question…" aria-label="Command J.A.R.V.I.S." />
        </form>
        <div className="hud-acts">
          <button type="button" className="hud-ib" aria-pressed={j.speak} onClick={() => j.toggleVoice(!j.speak)} title={j.speak ? 'Spoken replies on' : 'Spoken replies off'} aria-label="Spoken replies">
            <Ico d={j.speak ? 'M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13' : 'M11 5 6 9H3v6h3l5 4zM22 9l-6 6M16 9l6 6'} />
          </button>
          <button type="button" className="hud-ib hud-ib--txt mono" aria-pressed={j.lang === 'bn-BD'} onClick={() => j.setLang(j.lang === 'bn-BD' ? 'en-US' : 'bn-BD')} title="Speech language">
            {j.lang === 'bn-BD' ? 'বাং' : 'EN'}
          </button>
          {overlay ? (
            <button type="button" className="hud-ib" onClick={onClose} title="Close (Esc)" aria-label="Close command center">
              <Ico d="M6 6l12 12M18 6 6 18" />
            </button>
          ) : (
            <button type="button" className="hud-ib" onClick={() => j.setFull(true)} title="Full screen (Jarvis mode)" aria-label="Open full screen">
              <Ico d="M3 9V3h6M21 15v6h-6M3 3l7 7M21 21l-7-7" />
            </button>
          )}
        </div>
      </header>

      {/* --------------------------------------------------------- left --- */}
      <div className="hud__left">
        <Panel title="AI core overview">
          <ul className="hud-ov">
            <li data-ok={!!j.provider}>
              <Ico d="M12 3a4 4 0 0 0-4 4v1a4 4 0 0 0-2 7 4 4 0 0 0 6 4 4 4 0 0 0 6-4 4 4 0 0 0-2-7V7a4 4 0 0 0-4-4z" />
              <b>Brain</b>
              <span>{j.provider ? PROVIDERS.find((p) => p.id === j.provider)?.label : 'Built-in commands'}</span>
            </li>
            <li data-ok>
              <Ico d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
              <b>Memory</b>
              <span>{mems} stored</span>
            </li>
            <li data-ok={j.canListen}>
              <Ico d="M9 3h6v10a3 3 0 0 1-6 0zM5 11a7 7 0 0 0 14 0M12 18v3" />
              <b>Voice</b>
              <span>{j.hands ? 'Hands-free' : j.listening ? 'Listening' : j.canListen ? 'Ready' : 'Text only'}</span>
            </li>
            <li data-ok={nActive > 0} data-live={nActive > 0 || undefined}>
              <Ico d="M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 22a8 8 0 0 1 16 0" />
              <b>Agents</b>
              <span>{nActive ? `${nActive} running` : `${AGENTS.length} standing by`}</span>
            </li>
            <li data-ok={online.length > 0}>
              <Ico d="M4 4h16v16H4zM9 9h6v6H9zM9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
              <b>LLMs</b>
              <span>{online.length} connected</span>
            </li>
            <li data-ok={sysOk}>
              <Ico d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <b>System</b>
              <span>{sysOk ? 'Optimal' : j.online ? 'Needs a brain' : 'Offline'}</span>
            </li>
          </ul>
        </Panel>

        <Panel title="Voice" className="hud-voice" action={<span className="mono hud-tag" data-on={j.hands}>{j.hands ? 'ALWAYS ON' : j.listening ? 'LIVE' : 'READY'}</span>}>
          <Wave level={j.level} state={j.state} />
          <p className="mono">{j.listening ? (j.hands ? 'Say “Jarvis, …”' : 'Listening…') : j.state === 'speaking' ? 'Speaking…' : 'Tap to speak'}</p>
          <button type="button" className="hud-mic" data-on={j.listening} onClick={j.listen} disabled={!j.canListen} aria-label={j.listening ? 'Stop listening' : 'Speak to J.A.R.V.I.S.'}>
            <span />
            <Ico size={26} d="M9 3h6v10a3 3 0 0 1-6 0zM5 11a7 7 0 0 0 14 0M12 18v3" />
          </button>
          <button type="button" className="hud-hands" aria-pressed={j.hands} onClick={() => j.setHandsFree(!j.hands)} disabled={!j.canListen}>
            <Ico d="M3 12h2M7 8v8M11 5v14M15 8v8M19 11v2" />
            {j.hands ? 'Hands-free on' : 'Hands-free mode'}
          </button>
        </Panel>
      </div>

      {/* ------------------------------------------------------- centre --- */}
      <div className="hud__core">{Core}</div>

      <div className="hud__agents">
        <Panel title="Active agents" action={<span className="mono hud-tag" data-on={nActive > 0}>{nActive} / {AGENTS.length}</span>}>
          <div className="hud-agents">
            {AGENTS.map((a) => (
              <button type="button" key={a.id} className="hud-agent" data-on={!!active[a.id]} onClick={() => mode(a.id === 'research' ? 'search the web for ' : a.id === 'browser' ? 'open ' : a.id === 'memory' ? 'remember ' : a.id === 'task' ? 'make an excel about ' : a.id === 'eng' ? 'velocity for ' : 'brains')}>
                <span className="hud-agent__ico">
                  <Ico d={a.ico} size={18} />
                </span>
                <b>{a.name}</b>
                <span className="mono">{active[a.id] ? '● Active' : '○ Standby'}</span>
                <em>{a.desc}</em>
                <i className="hud-agent__bars" aria-hidden="true">
                  {Array.from({ length: 14 }, (_, k) => (
                    <s key={k} style={{ animationDelay: `${(k * 0.07).toFixed(2)}s` }} />
                  ))}
                </i>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      {/* -------------------------------------------------------- right --- */}
      <div className="hud__right">
        <div className="hud-tabs" role="tablist">
          {[
            ['chat', 'Chat'],
            ['feed', 'Intelligence'],
            ['brains', 'Brains'],
          ].map(([k, l]) => (
            <button type="button" role="tab" key={k} aria-selected={tab === k} onClick={() => setTab(k)}>
              {l}
              {k === 'brains' && <em className="mono">{online.length}</em>}
            </button>
          ))}
        </div>
        <div className="hud-tabbody" hidden={tab !== 'chat'}>
          <JarvisConsole compact />
        </div>
        {tab === 'feed' && (
          <div className="hud-tabbody hud-feed">
            <h4 className="mono">Live intelligence feed</h4>
            {feed.length === 0 && <p className="hud-empty">Nothing yet — ask something.</p>}
            <ul>
              {feed.map((m) => (
                <li key={m.id} data-err={!!m.error}>
                  <i data-agent={agentOf(m.via) || 'system'} />
                  <div>
                    <b>{(m.text || '').replace(/[*`#]/g, '').slice(0, 90)}</b>
                    <span className="mono">
                      {m.via || (m.who === 'sys' ? 'system' : 'jarvis')} · {clock(m.at || Date.now())}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <h4 className="mono">Mission timeline</h4>
            <ol className="hud-time">
              {history.slice(0, 6).map((h) => (
                <li key={h.at}>
                  <span className="mono">{clock(h.at)}</span>
                  <button type="button" onClick={() => (setTab('chat'), j.run(h.text, { via: 'history' }))}>
                    {h.text}
                  </button>
                  <em className="mono">{h.via || 'typed'}</em>
                </li>
              ))}
              {history.length === 0 && <li className="hud-empty">Your commands will appear here.</li>}
            </ol>
          </div>
        )}
        {tab === 'brains' && (
          <div className="hud-tabbody hud-brains">
            <p className="hud-note">Auto picks the best brain and falls back instantly. Tap one to lead — or say “use claude”, “switch brain”.</p>
            <button type="button" className="hud-brain" aria-pressed={j.brain.prefer === 'auto'} data-ok="true" onClick={() => j.choose('auto')}>
              <i />
              <b>Auto</b>
              <span className="mono">best available · fallback</span>
            </button>
            {brains.map((b) => (
              <button
                type="button"
                key={b.id}
                className="hud-brain"
                aria-pressed={j.brain.prefer === b.id}
                data-ok={!!b.s?.ok}
                data-front={j.provider === b.id || undefined}
                onClick={() => (!b.s?.ok && b.s?.can ? j.loadLocal(b.id) : b.s?.ok ? j.choose(b.id) : b.key ? j.run('add keys') : j.run('setup'))}
                title={b.note}
              >
                <i />
                <b>{b.label}</b>
                <span className="mono">{b.s?.ok ? (j.provider === b.id ? 'Leading' : 'Connected') : b.s?.can ? 'Tap to install' : b.s?.detail || 'Not checked'}</span>
              </button>
            ))}
            {!j.keys && (
              <button type="button" className="hud-cta" onClick={() => (setTab('chat'), j.run('add keys'))}>
                + Add API keys (once per browser)
              </button>
            )}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------- bottom --- */}
      <div className="hud__bottom">
        <Panel title="System monitor">
          <div className="hud-gauges">
            <Gauge label="FPS" value={tele.fps} unit="" max={60} />
            <Gauge label="Load" value={tele.load} sub="main thread" />
            <Gauge label={tele.heap != null ? 'Memory' : 'Storage'} value={tele.heap != null ? tele.heap : tele.storage} sub={tele.heap != null ? 'JS heap' : 'site data'} />
          </div>
        </Panel>
        <Panel title="Memory insights">
          <div className="hud-mem">
            <Constellation n={mems} />
            <dl>
              <dt>Memories</dt>
              <dd>{mems}</dd>
              <dt>Session turns</dt>
              <dd>{turns}</dd>
              <dt>Tool calls</dt>
              <dd>{calls}</dd>
            </dl>
          </div>
        </Panel>
        <Panel title="Quick commands">
          <div className="hud-quick">
            {[
              ['Executive briefing', 'briefing', 'M4 4h16v12H5.2L4 17.2zM8 9h8M8 12h5'],
              ['Switch brain', 'switch brain', 'M4 12a8 8 0 0 1 14-5.3M20 4v4h-4M20 12a8 8 0 0 1-14 5.3M4 20v-4h4'],
              ['Today’s news', "today's news", 'M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5'],
              ['Open my tools', 'show my tools', 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'],
            ].map(([l, c, d]) => (
              <button type="button" key={l} onClick={() => (setTab('chat'), j.run(c))}>
                <Ico d={d} />
                {l}
              </button>
            ))}
          </div>
        </Panel>
      </div>

      {/* --------------------------------------------------------- dock --- */}
      <footer className="hud__dock">
        <div className="hud-chips">
          <span className="hud-chip">
            <Ico d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12zM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
            <span>
              <em className="mono">Location</em>
              {wx?.place || 'Dhaka'}
            </span>
          </span>
          <span className="hud-chip">
            <Ico d="M12 3v2M12 19v2M5 5l1.4 1.4M17.6 17.6 19 19M3 12h2M19 12h2M5 19l1.4-1.4M17.6 6.4 19 5M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
            <span>
              <em className="mono">Weather</em>
              {wx ? `${Math.round(wx.temp)}°C ${wx.sky}` : '—'}
            </span>
          </span>
          <span className="hud-chip">
            <Ico d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01" />
            <span>
              <em className="mono">Network</em>
              {tele.net || (j.online ? 'Online' : 'Offline')}
              {tele.rtt != null ? ` · ${tele.rtt} ms` : ''}
            </span>
          </span>
        </div>
        <div className="hud-modes">
          {[
            ['Research', 'search the web for '],
            ['Browser', 'open '],
            ['Files', 'make a ppt about '],
            ['Engineering', 'velocity for '],
          ].map(([l, p]) => (
            <button type="button" key={l} onClick={() => mode(p)}>
              {l}
            </button>
          ))}
        </div>
        <button type="button" className="hud-talk" data-on={j.hands} onClick={() => j.setHandsFree(!j.hands)} disabled={!j.canListen}>
          <Wave level={j.level} state={j.state} bars={9} />
          <span>
            <b>{j.hands ? 'Listening…' : 'Talk to Jarvis'}</b>
            <em className="mono">{j.hands ? 'say “Jarvis, …” · tap to stop' : 'hands-free · wake word'}</em>
          </span>
          <Wave level={j.level} state={j.state} bars={9} />
        </button>
        <button type="button" className="hud-brief" onClick={() => (setTab('chat'), j.run('briefing'))}>
          <Ico d="M4 4h16v12H5.2L4 17.2zM8 9h8M8 12h5" />
          Executive briefing
        </button>
      </footer>
    </div>
  );
}
