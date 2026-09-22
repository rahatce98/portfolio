import { useEffect, useMemo, useRef, useState } from 'react';
import Tesseract from '../components/Tesseract';
import { useTools, score, trackOpen } from './Tools';
import { sections, person, contact } from '../data/site';
import { useScrollTo } from '../hooks/useScroll';
import { useReveal } from '../hooks/useScroll';

/* -----------------------------------------------------------------------------
 * 01b — J.A.R.V.I.S.
 *
 * A command console for the whole site. Typed or spoken (Web Speech API where
 * the browser has it) commands open tools, jump to sections, launch labs and
 * switch theme. Replies are typed out and optionally spoken. Nothing leaves
 * the browser — the parser below is local and deterministic.
 * -------------------------------------------------------------------------- */

const LABS = {
  rocket: 'rocket', launch: 'rocket', vehicle: 'rocket',
  car: 'auto', auto: 'auto', automotive: 'auto', supercar: 'auto',
  systems: 'systems', mechanism: 'systems', mechanisms: 'systems', gear: 'systems',
  pipe: 'pipe', sewer: 'pipe', hydraulics: 'pipe', manning: 'pipe', flow: 'pipe',
  beam: 'beam', structure: 'beam', moment: 'beam', shear: 'beam',
};

const HELP = [
  ['open <tool>', 'launch a tool — “open rfi”'],
  ['find <words>', 'filter the tool index'],
  ['go <section>', 'tools · projects · lab · contact'],
  ['lab <name>', 'rocket · car · systems · pipe · beam'],
  ['add tool', 'new index entry (owner)'],
  ['theme', 'toggle light / dark'],
  ['time · date · stats', 'system readouts'],
  ['shortcuts', 'keyboard map'],
  ['clear', 'wipe the console'],
];

function greet() {
  const h = new Date().getHours();
  return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function Jarvis() {
  const root = useReveal();
  const { tools } = useTools();
  const scrollTo = useScrollTo();
  const [log, setLog] = useState(() => [
    { who: 'sys', text: 'J.A.R.V.I.S. online · all systems nominal' },
    { who: 'ai', text: `${greet()}. I index ${'{n}'} tools and five labs. Type “help”, or just name what you need.` },
  ]);
  const [q, setQ] = useState('');
  const [listening, setListening] = useState(false);
  const [speak, setSpeak] = useState(false);
  const [energy, setEnergy] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [hist, setHist] = useState([]);
  const [hi, setHi] = useState(-1);
  const input = useRef(null);
  const body = useRef(null);
  const rec = useRef(null);

  const canListen = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    body.current?.scrollTo({ top: body.current.scrollHeight, behavior: 'smooth' });
  }, [log]);

  useEffect(() => {
    const focus = () => {
      root.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => input.current?.focus({ preventScroll: true }), 450);
    };
    window.addEventListener('rh-jarvis', focus);
    return () => window.removeEventListener('rh-jarvis', focus);
  }, [root]);

  const suggestions = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return ['help', 'open rfi', 'lab pipe', 'find dsip', 'go projects'];
    const verbs = ['open ', 'find ', 'go ', 'lab ', 'add tool', 'theme', 'time', 'stats', 'shortcuts', 'help', 'clear'];
    const v = verbs.filter((x) => x.startsWith(s) && x !== s);
    const m = s.replace(/^(open|launch|run|start)\s+/, '');
    const t = /^(open|launch|run|start)\s+/.test(s)
      ? tools.filter((x) => score(x, m) > 0).slice(0, 4).map((x) => `open ${x.name.toLowerCase()}`)
      : [];
    return [...v, ...t].slice(0, 5);
  }, [q, tools]);

  const say = (text) => {
    setLog((l) => [...l, { who: 'ai', text }]);
    setEnergy(1);
    setTimeout(() => setEnergy(0), 900);
    if (speak && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(text.replace(/[“”]/g, ''));
      u.rate = 1.03;
      u.pitch = 0.9;
      const v = speechSynthesis.getVoices().find((x) => /en-GB/i.test(x.lang) && /male|daniel|george|ryan/i.test(x.name)) || speechSynthesis.getVoices().find((x) => /en-GB/i.test(x.lang));
      if (v) u.voice = v;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    }
  };

  const run = (raw) => {
    const text = raw.trim();
    if (!text) return;
    setLog((l) => [...l, { who: 'me', text }]);
    setHist((h) => [text, ...h.filter((x) => x !== text)].slice(0, 30));
    setHi(-1);
    const s = text.toLowerCase().replace(/[?.!]+$/, '');
    let m;

    if (s === 'clear' || s === 'cls') return setLog([{ who: 'sys', text: 'Console cleared.' }]);
    if (s === 'help' || s === '?' || s === 'commands') return setLog((l) => [...l, { who: 'help' }]);
    if (/^(hi|hello|hey|yo|salam|assalamu)/.test(s)) return say(`${greet()}. What are we building today?`);
    if (/(who are you|what are you|jarvis)$/.test(s)) return say('Just A Rather Very Intelligent System — this site’s console. I find and launch things so you don’t have to.');
    if (/^(who is|about) (rahat|you|him|owner)|^whoami$|^about$/.test(s))
      return say(`${person.name} — ${person.role}, ${person.location}. Autodidact; builds the tools in this index.`);
    if (/^(time|clock)/.test(s)) return say(`It is ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, Dhaka time on your clock.`);
    if (/^(date|today)/.test(s)) return say(new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + '.');
    if (/^(stats|status|system)/.test(s)) {
      const live = tools.filter((t) => t.status === 'live').length;
      const proj = new Set(tools.map((t) => t.project)).size;
      return say(`${tools.length} tools indexed, ${live} live, across ${proj} projects. Five labs standing by.`);
    }
    if (/^(theme|dark|light|lights?)/.test(s)) {
      window.dispatchEvent(new Event('rh-theme'));
      return say('Theme switched.');
    }
    if (/^(shortcuts|keys|keyboard)/.test(s)) {
      window.dispatchEvent(new Event('rh-shortcuts'));
      return say('Keyboard map is on screen.');
    }
    if (/^(add|new) (a )?(tool|link|entry)/.test(s)) {
      window.dispatchEvent(new Event('rh-add-tool'));
      scrollTo('tools');
      return say('Opening a new entry. Paste the link — I’ll do the rest.');
    }
    if (/^(unlock|login|admin)/.test(s)) {
      scrollTo('tools');
      setTimeout(() => window.dispatchEvent(new Event('rh-unlock')), 400);
      return say('Owner access requested.');
    }
    if (/^(email|mail|contact)/.test(s)) {
      scrollTo('contact');
      return say(`Reach Rahat at ${contact.email}. Contact section is below.`);
    }
    if ((m = s.match(/^(?:lab|launch lab|open lab|show lab|simulate)\s+(.+)$/)) || (m = s.match(/^(rocket|car|supercar|systems|pipe|beam)$/))) {
      const key = Object.keys(LABS).find((k) => m[1].includes(k));
      if (key) {
        window.dispatchEvent(new CustomEvent('rh-lab', { detail: LABS[key] }));
        return say(`Loading the ${LABS[key] === 'auto' ? 'automotive' : LABS[key]} lab. Esc brings you back.`);
      }
      return say('Labs: rocket, car, systems, pipe, beam.');
    }
    if ((m = s.match(/^(?:go|goto|go to|show|scroll to|take me to)\s+(.+)$/))) {
      const sec = sections.find((x) => x.label.toLowerCase().startsWith(m[1]) || x.id.startsWith(m[1]));
      if (sec) {
        scrollTo(sec.id);
        return say(`${sec.label}.`);
      }
    }
    if ((m = s.match(/^(?:find|search|filter|list)\s+(.+)$/))) {
      window.dispatchEvent(new CustomEvent('rh-tool-search', { detail: m[1] }));
      const n = tools.filter((t) => score(t, m[1]) > 0).length;
      return say(n ? `${n} match${n > 1 ? 'es' : ''} for “${m[1]}” — filtered the index.` : `Nothing indexed for “${m[1]}” yet.`);
    }
    const target = (m = s.match(/^(?:open|launch|run|start)\s+(.+)$/)) ? m[1] : s;
    const hit = tools.map((t) => ({ t, sc: score(t, target) })).filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc)[0];
    if (hit) {
      trackOpen(hit.t.id);
      window.open(hit.t.url, '_blank', 'noopener');
      return say(`Launching ${hit.t.name}.`);
    }
    const sec = sections.find((x) => x.label.toLowerCase() === s || x.id === s);
    if (sec) {
      scrollTo(sec.id);
      return say(`${sec.label}.`);
    }
    say(`I don’t have “${text}” yet. Try “help”, or add it with “add tool”.`);
  };

  const listen = () => {
    if (!canListen) return;
    if (listening) {
      rec.current?.stop();
      return;
    }
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new R();
    r.lang = 'en-US';
    r.interimResults = true;
    r.onresult = (e) => {
      const t = [...e.results].map((x) => x[0].transcript).join('');
      setQ(t);
      if (e.results[e.results.length - 1].isFinal) {
        run(t);
        setQ('');
      }
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    setSpeak(true);
    r.start();
  };

  const n = tools.length;

  return (
    <section className="section jarvis" id="jarvis" ref={root}>
      <div className="wrap">
        <div className="section-head" data-reveal>
          <div>
            <span className="section-head__index">02 — Console</span>
            <h2>
              J.A.R.V.I.S.<span className="dim"> — ask, don’t browse.</span>
            </h2>
          </div>
          <p>
            A command line for this site. Open any tool by name, jump anywhere, launch a lab —
            by keyboard or voice. Press <kbd>J</kbd> from anywhere.
          </p>
        </div>

        <div className="jv" data-reveal data-energy={energy} data-listening={listening}>
          <div className="jv__core">
            <svg className="jv__rings" viewBox="0 0 400 400" aria-hidden="true">
              <defs>
                <linearGradient id="jvg" x1="0" x2="1">
                  <stop offset="0" stopColor="var(--accent)" stopOpacity="0.9" />
                  <stop offset="1" stopColor="var(--accent-2)" stopOpacity="0.2" />
                </linearGradient>
              </defs>
              <g className="r1"><circle cx="200" cy="200" r="186" fill="none" stroke="url(#jvg)" strokeWidth="1" strokeDasharray="2 6" /></g>
              <g className="r2"><circle cx="200" cy="200" r="170" fill="none" stroke="var(--accent)" strokeOpacity=".5" strokeWidth="2" strokeDasharray="120 40 20 40 60 300" /></g>
              <g className="r3"><circle cx="200" cy="200" r="150" fill="none" stroke="var(--accent-2)" strokeOpacity=".45" strokeWidth="6" strokeDasharray="1 11" /></g>
              <g className="r4"><circle cx="200" cy="200" r="132" fill="none" stroke="var(--line-2)" strokeWidth="1" /><path d="M200 60 v14 M340 200 h-14 M200 340 v-14 M60 200 h14" stroke="var(--accent)" strokeWidth="2" /></g>
            </svg>
            <Tesseract className="jv__cube" energy={energy} speed={listening ? 2 : 1} />
            <div className="jv__hud jv__hud--tl mono">
              <b>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</b>
              <span>{now.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            </div>
            <div className="jv__hud jv__hud--tr mono">
              <b>{String(n).padStart(2, '0')}</b>
              <span>tools indexed</span>
            </div>
            <div className="jv__hud jv__hud--bl mono">
              <span>4D · hypercube</span>
              <span>xw · zw rotation</span>
            </div>
            <div className="jv__hud jv__hud--br mono">
              <span className="jv__state">{listening ? '● listening' : energy ? '◆ responding' : '○ standby'}</span>
            </div>
          </div>

          <div className="jv__term">
            <div className="jv__bar">
              <i /><i /><i />
              <span className="mono">jarvis@rahat — console</span>
              <button type="button" className="jv__tog" aria-pressed={speak} onClick={() => { setSpeak((v) => !v); speechSynthesis?.cancel(); }} title="Spoken replies">
                {speak ? 'voice on' : 'voice off'}
              </button>
            </div>
            <div className="jv__log" ref={body}>
              {log.map((l, i) =>
                l.who === 'help' ? (
                  <div className="jv__help" key={i}>
                    {HELP.map(([c, d]) => (
                      <button type="button" key={c} onClick={() => { const cmd = c.replace(/ <.+>/, ''); setQ(cmd + (c.includes('<') ? ' ' : '')); input.current?.focus(); }}>
                        <code>{c}</code>
                        <span>{d}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p key={i} data-who={l.who}>
                    <span className="jv__who">{l.who === 'me' ? '›' : l.who === 'ai' ? '◆' : '#'}</span>
                    <Typed text={l.text.replace('{n}', String(n))} instant={l.who !== 'ai'} />
                  </p>
                ),
              )}
            </div>
            <div className="jv__sugg">
              {suggestions.map((s) => (
                <button type="button" key={s} onClick={() => { if (s.endsWith(' ')) { setQ(s); input.current?.focus(); } else { run(s); setQ(''); } }}>
                  {s}
                </button>
              ))}
            </div>
            <form
              className="jv__in"
              onSubmit={(e) => {
                e.preventDefault();
                run(q);
                setQ('');
              }}
            >
              <span className="jv__prompt mono">›</span>
              <input
                ref={input}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={listening ? 'Listening…' : 'Try “open rfi” or “lab pipe”'}
                aria-label="Command"
                autoComplete="off"
                spellCheck="false"
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp' && hist.length) {
                    e.preventDefault();
                    const k = Math.min(hist.length - 1, hi + 1);
                    setHi(k);
                    setQ(hist[k]);
                  }
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const k = Math.max(-1, hi - 1);
                    setHi(k);
                    setQ(k < 0 ? '' : hist[k]);
                  }
                  if (e.key === 'Tab' && suggestions[0] && q) {
                    e.preventDefault();
                    setQ(suggestions[0]);
                  }
                }}
              />
              {canListen && (
                <button type="button" className="jv__mic" data-on={listening} onClick={listen} aria-label={listening ? 'Stop listening' : 'Speak a command'}>
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
                </button>
              )}
              <button type="submit" className="jv__go" aria-label="Run">↵</button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}

function Typed({ text, instant }) {
  const [n, setN] = useState(instant ? text.length : 0);
  useEffect(() => {
    if (instant) return;
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      setN(i);
      if (i >= text.length) clearInterval(id);
    }, 14);
    return () => clearInterval(id);
  }, [text, instant]);
  return (
    <span>
      {text.slice(0, n)}
      {n < text.length && <span className="jv__caret" />}
    </span>
  );
}
