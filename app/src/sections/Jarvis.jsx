import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JarvisCore from '../jarvis/JarvisCore';
import { useTools, useAdmin, score, trackOpen, post, refreshTools } from './Tools';
import { sections, person } from '../data/site';
import { useScrollTo, useReveal } from '../hooks/useScroll';
import { detect, think, brainState, setPrefer, loadWebllm, loadChrome, activeProvider, PROVIDERS } from '../jarvis/brain';
import { route, TOOLS, MODEL_CALLABLE } from '../jarvis/tools';
import { pingWeb } from '../jarvis/web';
import { memoryContext, bridge, bridgeStatus } from '../jarvis/memory';

/* -----------------------------------------------------------------------------
 * 02 — J.A.R.V.I.S. command center
 *
 * Input → tool router (local, deterministic) → free AI brain (auto fallback)
 * → answer, spoken if voice is on. The model may ask for read-only live data
 * with a CALL line; anything with side effects goes through a confirm card.
 * -------------------------------------------------------------------------- */

const STAGES = ['understanding', 'searching', 'processing', 'executing', 'responding'];
const STATE_LABEL = { idle: 'Standby', listening: 'Listening', thinking: 'Thinking', searching: 'Searching', executing: 'Executing', speaking: 'Speaking', success: 'Done', error: 'Error' };
const SETUP = [
  ['deps', 'Load modules'],
  ['ai', 'Detect free AI'],
  ['config', 'Configure AI'],
  ['voice', 'Configure voice'],
  ['web', 'Configure web tools'],
  ['memory', 'Memory link'],
  ['test', 'Test everything'],
  ['start', 'Start J.A.R.V.I.S.'],
];

function greet() {
  const h = new Date().getHours();
  return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function system(tools) {
  return `You are J.A.R.V.I.S., the assistant inside ${person.name}'s portfolio site (${person.role}, ${person.location}). Be concise, warm and precise; British-butler wit is welcome but brief. Today is ${new Date().toDateString()}, local time ${new Date().toLocaleTimeString()}.
If the user needs live or current information, reply with ONLY one line of the form
CALL: <command>
where <command> is one of: weather <place> | <coin> price | news <topic> | search <query> | calc <expression> | time in <place>
Never invent live data such as prices, weather or news. Never claim to have done an action you did not do.
The site has these tools (open with "open <name>"): ${tools.slice(0, 40).map((t) => t.name).join(', ')}.
What you remember about the owner:
${memoryContext() || '- nothing yet'}`;
}

export default function Jarvis() {
  const root = useReveal();
  const { tools } = useTools();
  const pin = useAdmin();
  const scrollTo = useScrollTo();
  const [log, setLog] = useState([]);
  const [q, setQ] = useState('');
  const [state, setState] = useState('idle');
  const [stage, setStage] = useState(-1);
  const [setup, setSetup] = useState({});
  const [brain, setBrain] = useState(brainState());
  const [speak, setSpeak] = useState(() => {
    try {
      return localStorage.getItem('rh-jv-voice') === '1';
    } catch {
      return false;
    }
  });
  const [listening, setListening] = useState(false);
  const [hist, setHist] = useState([]);
  const [hi, setHi] = useState(-1);
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const body = useRef(null);
  const rec = useRef(null);
  const level = useRef(0);
  const audio = useRef(null);
  const convo = useRef([]);
  const lastAnswer = useRef('');
  const settle = useRef(0);
  const booted = useRef(false);

  const canListen = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const push = useCallback((m) => setLog((l) => [...l, { id: Math.random().toString(36).slice(2), ...m }]), []);
  const patch = useCallback((id, p) => setLog((l) => l.map((m) => (m.id === id ? { ...m, ...p } : m))), []);

  const flash = (s) => {
    setState(s);
    clearTimeout(settle.current);
    settle.current = setTimeout(() => setState((x) => (x === s ? 'idle' : x)), 1600);
  };

  /* ------------------------------------------------------------ voice --- */
  const voice = useMemo(() => {
    if (!canSpeak) return null;
    const pick = () => {
      const v = speechSynthesis.getVoices();
      return v.find((x) => /en-GB/i.test(x.lang) && /daniel|george|ryan|male/i.test(x.name)) || v.find((x) => /en-GB/i.test(x.lang)) || v.find((x) => /^en/i.test(x.lang)) || null;
    };
    return { pick };
  }, [canSpeak]);

  const talk = useCallback(
    (text) => {
      if (!speak || !canSpeak) return flash('success');
      const u = new SpeechSynthesisUtterance(text.replace(/[*_`#>[\]]/g, '').replace(/https?:\/\/\S+/g, 'link').slice(0, 600));
      u.rate = 1.03;
      u.pitch = 0.92;
      const v = voice?.pick();
      if (v) u.voice = v;
      u.onstart = () => setState('speaking');
      u.onboundary = () => (level.current = 0.55 + Math.random() * 0.35);
      u.onend = () => {
        level.current = 0;
        flash('success');
      };
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [speak, canSpeak, voice],
  );

  /* ------------------------------------------------------- auto setup --- */
  const runSetup = useCallback(async () => {
    const mark = (k, s, d) => setSetup((x) => ({ ...x, [k]: { s, d } }));
    setSetup({});
    const id = 'setup';
    setLog((l) => [...l.filter((m) => m.id !== id), { id, who: 'setup' }]);
    setState('executing');
    mark('deps', 'run');
    await Promise.all([import('../jarvis/files'), import('../jarvis/bookmarks')]);
    mark('deps', 'ok', `${TOOLS.length} tools registered`);
    mark('ai', 'run', 'probing Ollama · Chrome AI · Pollinations · WebLLM');
    let local = !!pin;
    try {
      local = local || localStorage.getItem('rh-jv-ollama') === '1';
    } catch {
      /* storage blocked */
    }
    const b = await detect((pid, r) => mark('ai', 'run', `${pid}: ${r.ok ? 'ready' : r.detail}`), { local });
    setBrain(b);
    const act = activeProvider();
    const up = Object.entries(b.status).filter(([, v]) => v.ok).map(([k]) => k);
    mark('ai', up.length ? 'ok' : 'warn', up.length ? `${up.length} free model${up.length > 1 ? 's' : ''}: ${up.join(', ')}` : 'none reachable — local tools still work');
    mark('config', act ? 'ok' : 'warn', act ? `primary ${PROVIDERS.find((p) => p.id === act).label}, fallback ${up.filter((x) => x !== act).join(' → ') || 'local router'}` : navigator.gpu ? 'tools only — say “load local model” (free, in-browser) or owner “set ai key”' : 'tools only — owner: “set ai key” (free Gemini / Groq)');
    mark('voice', canSpeak || canListen ? 'ok' : 'warn', `${canListen ? 'speech input' : 'no speech input in this browser'} · ${canSpeak ? `voice ${voice?.pick()?.name?.split(' ')[0] || 'default'}` : 'no speech output'}`);
    mark('web', 'run');
    const n = await pingWeb();
    mark('web', n ? 'ok' : 'warn', `${n}/3 live data sources reachable (CoinGecko, Open-Meteo, Wikipedia)`);
    mark('memory', 'run');
    const ms = await bridgeStatus();
    mark('memory', ms.notion ? 'ok' : 'warn', ms.notion ? 'Notion connected' : ms.unauth ? 'on device · Notion bridge awaits one-time authorisation' : 'on device · say “connect notion” (owner)');
    mark('test', 'run');
    let test = 'skipped (no model)';
    if (act === 'pollinations') test = `pollinations answered in ${b.status.pollinations.detail}`;
    else if (act) {
      try {
        const t0 = performance.now();
        const r = await think([{ role: 'user', content: 'Reply with exactly: online' }]);
        test = `${r.provider} answered in ${Math.round(performance.now() - t0)} ms`;
      } catch (e) {
        test = e.message;
      }
    }
    mark('test', /answered/.test(test) ? 'ok' : 'warn', test);
    setBrain(brainState());
    mark('start', 'ok', 'ready');
    flash('success');
  }, [canListen, canSpeak, voice, pin]);

  // Setup runs the first time the console scrolls into view (or J is pressed),
  // so visitors who never reach it cost nothing.
  useEffect(() => {
    const boot = () => {
      if (booted.current) return;
      booted.current = true;
      push({ who: 'ai', text: `${greet()}. I’m J.A.R.V.I.S. — ask anything, search the web, make files, open tools. Running auto setup…` });
      runSetup();
    };
    const io = new IntersectionObserver(([e]) => e.isIntersecting && boot(), { rootMargin: '200px' });
    if (root.current) io.observe(root.current);
    window.addEventListener('rh-jarvis', boot);
    return () => {
      io.disconnect();
      window.removeEventListener('rh-jarvis', boot);
    };
  }, [push, runSetup, root]);

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

  /* -------------------------------------------------------------- run --- */
  const ctx = useMemo(
    () => ({
      tools,
      pin,
      sections,
      score,
      trackOpen,
      scrollTo,
      post,
      refresh: refreshTools,
      lastAnswer: () => lastAnswer.current,
      stage: (s) => {
        setStage(STAGES.indexOf(s));
        setState(s === 'searching' ? 'searching' : s === 'executing' ? 'executing' : 'thinking');
      },
      think: (messages) => think(messages, () => setState('thinking')),
    }),
    [tools, pin, scrollTo],
  );

  const answer = useCallback(
    (reply, meta = {}) => {
      setStage(4);
      const text = reply.text || '';
      lastAnswer.current = text;
      push({ who: 'ai', ...reply, ...meta });
      if (reply.error) {
        setState('error');
        setTimeout(() => setState('idle'), 1800);
      } else talk(text);
      setTimeout(() => setStage(-1), 1400);
    },
    [push, talk],
  );

  const ask = useCallback(
    async (text) => {
      convo.current = [...convo.current, { role: 'user', content: text }].slice(-12);
      setStage(2);
      setState('thinking');
      let r = await think([{ role: 'system', content: system(tools) }, ...convo.current], () => setState('thinking'));
      const call = r.text.match(/^CALL:\s*(.+)$/m);
      if (call) {
        const hit = route(call[1], ctx);
        if (hit && MODEL_CALLABLE.includes(hit.tool.id)) {
          setStage(1);
          setState('searching');
          const out = await hit.tool.run(hit.args, ctx);
          setStage(2);
          setState('thinking');
          const data = out.summarize || `${out.text}\n${(out.sources || []).map((s) => `- ${s.title}: ${s.snippet || ''} ${s.url}`).join('\n')}`;
          r = await think([{ role: 'system', content: system(tools) }, ...convo.current, { role: 'assistant', content: r.text }, { role: 'user', content: `Tool result for "${call[1]}":\n${data}\nNow answer my original question using only this data. Do not output CALL again.` }]);
          r.sources = out.sources;
        }
      }
      convo.current = [...convo.current, { role: 'assistant', content: r.text }];
      return r;
    },
    [ctx, tools],
  );

  const run = useCallback(
    async (raw) => {
      const text = raw.trim();
      if (!text || busy) return;
      push({ who: 'me', text });
      setHist((h) => [text, ...h.filter((x) => x !== text)].slice(0, 40));
      setHi(-1);
      if (/^(clear|cls)$/i.test(text)) return setLog([{ id: 'c', who: 'sys', text: 'Console cleared.' }]);
      setBusy(true);
      setStage(0);
      setState('thinking');
      await new Promise((r) => setTimeout(r, 180));
      try {
        const hit = route(text, ctx);
        if (hit) {
          if (hit.tool.stage === 'search') {
            setStage(1);
            setState('searching');
          } else {
            setStage(3);
            setState('executing');
          }
          const out = await hit.tool.run(hit.args, ctx);
          if (out.help) return answer({ help: true, text: 'Here is what I can do.' });
          if (out.setup) {
            answer({ text: 'Re-running setup.' });
            return runSetup();
          }
          if (out.webllm) return loadLocal('webllm');
          if (out.chromeai) return loadLocal('chrome');
          if (out.summarize) {
            setStage(2);
            setState('thinking');
            try {
              const s = await think([{ role: 'system', content: 'You summarise search results accurately and briefly. Use plain sentences or short bullets. Cite result numbers like [1] when useful.' }, { role: 'user', content: out.summarize }]);
              return answer({ ...out, text: s.text }, { via: s.provider });
            } catch {
              return answer({ ...out, text: `${out.text} (No AI model reachable to summarise — sources below.)` });
            }
          }
          return answer(out, { via: hit.tool.label });
        }
        const r = await ask(text);
        answer({ text: r.text, sources: r.sources }, { via: r.provider });
      } catch (e) {
        answer({ text: e.offline ? `No AI model is connected yet, so I can only run tools (search, prices, weather, files from your data, bookmarks). ${navigator.gpu ? 'Say “load local model” to run a free open-source model in this tab, or ' : ''}the owner can say “set ai key” to add a free Gemini key.` : `That failed: ${e.message}`, error: true });
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, ctx, push, answer, ask, runSetup],
  );

  const loadLocal = async (which) => {
    const id = which + Date.now();
    push({ id, who: 'sys', text: which === 'chrome' ? 'Asking Chrome to download Gemini Nano (free, on-device)…' : 'Downloading the open-source model (one time, ~1 GB, then offline)…' });
    setState('executing');
    try {
      await (which === 'chrome' ? loadChrome : loadWebllm)((t, p) => patch(id, { text: `${Math.round((p || 0) * 100)}% · ${t.slice(0, 90)}` }));
      setBrain(brainState());
      patch(id, { text: 'Local model ready — works offline from now on in this browser.' });
      flash('success');
    } catch (e) {
      patch(id, { text: `Local model failed: ${e.message}` });
      setState('error');
    }
  };

  const confirm = async (m, yes) => {
    patch(m.id, { confirm: { ...m.confirm, done: yes ? 'yes' : 'no' } });
    if (!yes) return push({ who: 'sys', text: 'Cancelled.' });
    setBusy(true);
    setState('executing');
    setStage(3);
    try {
      answer(await m.confirm.yes());
    } catch (e) {
      answer({ text: `That failed: ${e.message}`, error: true });
    } finally {
      setBusy(false);
    }
  };

  /* ------------------------------------------------------------ mic --- */
  const stopMeter = () => {
    audio.current?.stream.getTracks().forEach((t) => t.stop());
    audio.current?.ctx.close();
    audio.current = null;
    level.current = 0;
  };
  const startMeter = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ac = new AudioContext();
      const an = ac.createAnalyser();
      an.fftSize = 256;
      ac.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      audio.current = { stream, ctx: ac };
      const tick = () => {
        if (!audio.current) return;
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        level.current = Math.min(1, Math.sqrt(sum / buf.length) * 4);
        requestAnimationFrame(tick);
      };
      tick();
    } catch {
      /* meter is cosmetic */
    }
  };

  const listen = () => {
    if (!canListen) return;
    if (listening) return rec.current?.stop();
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new R();
    r.lang = 'en-US';
    r.interimResults = true;
    r.onresult = (e) => {
      const t = [...e.results].map((x) => x[0].transcript).join('');
      setQ(t);
      if (e.results[e.results.length - 1].isFinal) {
        r.stop();
        run(t);
        setQ('');
      }
    };
    r.onend = () => {
      setListening(false);
      stopMeter();
      setState((s) => (s === 'listening' ? 'idle' : s));
    };
    r.onerror = r.onend;
    rec.current = r;
    setListening(true);
    setState('listening');
    if (!speak) toggleVoice(true);
    speechSynthesis?.cancel();
    startMeter();
    r.start();
  };

  const toggleVoice = (on) => {
    setSpeak(on);
    try {
      localStorage.setItem('rh-jv-voice', on ? '1' : '0');
    } catch {
      /* storage blocked */
    }
    if (!on) speechSynthesis?.cancel();
  };

  const suggestions = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return ["search today's news", 'bitcoin price', 'weather in Dhaka', 'make a ppt about pile foundations', 'find the React documentation', 'import bookmarks'];
    const v = TOOLS.flatMap((t) => (t.help ? [t.help[0].replace(/ [<[].*$/, '')] : [])).filter((x) => x.startsWith(s) && x !== s);
    const t = /^(open|launch)\s+/.test(s) ? tools.filter((x) => score(x, s.replace(/^\w+\s+/, '')) > 0).slice(0, 4).map((x) => `open ${x.name.toLowerCase()}`) : [];
    return [...new Set([...v, ...t])].slice(0, 6);
  }, [q, tools]);

  const act = activeProvider();

  return (
    <section className="section jarvis" id="jarvis" ref={root}>
      <div className="wrap">
        <div className="section-head" data-reveal>
          <div>
            <span className="section-head__index">02 — Command center</span>
            <h2>
              J.A.R.V.I.S.<span className="dim"> — ask, search, make, open.</span>
            </h2>
          </div>
          <p>
            A personal AI console on free models with automatic fallback. Live web data, office files,
            bookmarks and memory — by keyboard or voice. Press <kbd>J</kbd> from anywhere.
          </p>
        </div>

        <div className="jv2" data-reveal data-state={state}>
          <div className="jv2__stage">
            <JarvisCore state={state} level={level} />
            <div className="jv2__status">
              <span className="jv2__dot" />
              <b>{STATE_LABEL[state]}</b>
              <span className="mono">{act ? PROVIDERS.find((p) => p.id === act)?.label : 'local tools'}</span>
            </div>
            <ol className="jv2__pipe" aria-label="Task progress">
              {STAGES.map((s, i) => (
                <li key={s} data-on={stage === i} data-done={stage > i}>
                  <i />
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            <div className="jv2__models" role="group" aria-label="AI model">
              <button type="button" aria-pressed={brain.prefer === 'auto'} onClick={() => (setPrefer('auto'), setBrain(brainState()))}>
                Auto
              </button>
              {PROVIDERS.map((p) => {
                const s = brain.status[p.id];
                return (
                  <button
                    type="button"
                    key={p.id}
                    aria-pressed={brain.prefer === p.id}
                    data-ok={!!s?.ok}
                    title={`${p.note} — ${s?.detail || 'not checked'}`}
                    onClick={() => (!s?.ok && s?.can ? loadLocal(p.id) : (setPrefer(p.id), setBrain(brainState())))}
                  >
                    <i />
                    {p.label.split(' ')[0]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="jv2__term">
            <div className="jv2__bar">
              <span className="mono">jarvis@rahat</span>
              <span className="jv2__cost mono">$0 · no keys in browser</span>
              {canSpeak && (
                <button type="button" className="jv2__tog" aria-pressed={speak} onClick={() => toggleVoice(!speak)}>
                  {speak ? 'voice on' : 'voice off'}
                </button>
              )}
            </div>
            <div className="jv2__log" ref={body} aria-live="polite">
              {log.map((m) => (
                <Message key={m.id} m={m} setup={setup} onConfirm={confirm} onPick={(c) => { setQ(c); input.current?.focus(); }} pin={pin} push={push} />
              ))}
              {busy && (
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
                <button type="button" key={s} onClick={() => (s.endsWith(' ') ? (setQ(s), input.current?.focus()) : (run(s), setQ('')))}>
                  {s}
                </button>
              ))}
            </div>
            <form
              className="jv2__in"
              onSubmit={(e) => {
                e.preventDefault();
                run(q);
                setQ('');
              }}
            >
              <span className="jv2__prompt mono">›</span>
              <input
                ref={input}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={listening ? 'Listening…' : 'Ask anything, or “help”'}
                aria-label="Message J.A.R.V.I.S."
                autoComplete="off"
                spellCheck="false"
                disabled={busy && !listening}
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
                <button type="button" className="jv2__mic" data-on={listening} onClick={listen} aria-label={listening ? 'Stop listening' : 'Speak'}>
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <rect x="9" y="3" width="6" height="12" rx="3" />
                    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                  </svg>
                </button>
              )}
              <button type="submit" className="jv2__go" aria-label="Send" disabled={busy}>
                ↵
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- messages --- */

function Message({ m, setup, onConfirm, onPick, pin, push }) {
  if (m.who === 'setup')
    return (
      <div className="jv2__setup">
        <b className="mono">AUTO SETUP</b>
        {SETUP.map(([k, label]) => {
          const s = setup[k];
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
        {TOOLS.filter((t) => t.help).map((t) => (
          <button type="button" key={t.id} onClick={() => onPick(t.help[0].replace(/<.+?>|\[.+?\]/g, '').replace(/\s+·.*$/, '').trim() + ' ')}>
            <code>{t.help[0]}</code>
            <span>{t.help[1]}</span>
          </button>
        ))}
      </div>
    );
  return (
    <div className="jv2__msg" data-who={m.who} data-error={!!m.error}>
      <span className="jv2__who">{m.who === 'me' ? '›' : m.who === 'ai' ? '◆' : '#'}</span>
      <div>
        {m.who === 'ai' ? <Rich text={m.text} /> : <span>{m.text}</span>}
        {m.list && (
          <ul className="jv2__list">
            {m.list.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
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
                <button type="button" className="is-yes" onClick={() => onConfirm(m, true)}>
                  Confirm
                </button>
                <button type="button" onClick={() => onConfirm(m, false)}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
        {m.form === 'notion' && <NotionForm pin={pin} push={push} />}
        {m.form === 'aikey' && <KeyForm pin={pin} push={push} />}
        {m.via && <small className="jv2__via mono">via {m.via}</small>}
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

function KeyForm({ pin, push }) {
  const [kind, setKind] = useState('gemini');
  const [key, setKey] = useState('');
  const [state, setState] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setState('Saving and testing…');
    try {
      const j = await bridge({ a: 'setkey', pin, kind, key: key.trim() });
      setKey('');
      setState('done');
      push({ who: 'ai', text: `Key stored on the bridge and tested. Server-side models: ${j.ai.join(', ')}. Say “setup” to re-rank.` });
    } catch (x) {
      setState(x.message);
    }
  };
  if (state === 'done') return null;
  return (
    <form className="jv2__form" onSubmit={submit}>
      <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Provider">
        <option value="gemini">Google Gemini (free tier)</option>
        <option value="groq">Groq (free tier)</option>
        <option value="pollinations">Pollinations (free account)</option>
      </select>
      <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="API key" autoComplete="off" required />
      <button type="submit">Save key</button>
      {state && <small>{state}</small>}
    </form>
  );
}

/* Minimal, safe markdown: **bold**, `code`, [links](url), bullets, line
   breaks. Builds React nodes — never innerHTML. */
function Rich({ text = '' }) {
  const inline = (s, k) =>
    s.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g).map((p, i) => {
      if (/^\*\*/.test(p)) return <b key={k + i}>{p.slice(2, -2)}</b>;
      if (/^`/.test(p)) return <code key={k + i}>{p.slice(1, -1)}</code>;
      const l = p.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if (l) return <a key={k + i} href={l[2]} target="_blank" rel="noreferrer noopener">{l[1]}</a>;
      return p;
    });
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
