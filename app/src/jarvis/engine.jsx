import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTools, useAdmin, score, trackOpen, post, refreshTools } from '../sections/Tools';
import { sections, person } from '../data/site';
import { useScrollTo } from '../hooks/useScroll';
import { detect, think, brainState, setPrefer, loadWebllm, loadChrome, activeProvider, PROVIDERS, brainKind } from './brain';
import { route, TOOLS, MODEL_CALLABLE } from './tools';
import { pingWeb } from './web';
import { memoryContext, bridgeStatus } from './memory';
import { execute, validate, actionCatalog, ACTIONS } from '../os/actions';
import { buildIndex } from '../os/searchIndex';
import { getContext, useOs } from '../os/context';
import { addHistory } from '../os/history';
import { usePins } from '../os/favorites';

/* -----------------------------------------------------------------------------
 * J.A.R.V.I.S. engine — one instance for the whole app.
 *
 * Until Rahat OS this logic lived inside the Jarvis section, so the assistant
 * only existed when that section was on screen. It now sits above every page:
 * the section console, the floating dock, the command palette and voice all
 * talk to this provider and see the same conversation.
 *
 *   input → command parser (tools.js, no AI needed)
 *         → action registry (os/actions.js: validate → confirm? → run)
 *         → otherwise the free AI brain (brain.js, local first), which may
 *           answer, CALL a read-only data tool, or propose an ACTION that goes
 *           through the same validated registry.
 * -------------------------------------------------------------------------- */

export const STAGES = ['understanding', 'searching', 'processing', 'executing', 'responding'];
export const STATE_LABEL = { idle: 'Standby', listening: 'Listening', thinking: 'Thinking', searching: 'Searching', executing: 'Executing', speaking: 'Speaking', success: 'Done', error: 'Error' };
export const SETUP = [
  ['deps', 'Load modules'],
  ['ai', 'Detect free AI'],
  ['config', 'Configure AI'],
  ['voice', 'Configure voice'],
  ['web', 'Configure web tools'],
  ['memory', 'Memory link'],
  ['test', 'Test everything'],
  ['start', 'Start J.A.R.V.I.S.'],
];

/** Every command the parser knows, for help cards and the palette. */
export const COMMANDS = TOOLS.filter((t) => t.help).map((t) => ({
  id: t.id,
  usage: t.help[0],
  desc: t.help[1],
  prefill: t.help[0].replace(/<.+?>|\[.+?\]/g, '').replace(/\s+·.*$/, '').trim() + ' ',
}));

const Ctx = createContext(null);
export const useJarvis = () => useContext(Ctx);

function greet() {
  const h = new Date().getHours();
  return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** System prompt. The owner's memories go in a separate message flagged
    private, which brain.js never forwards to a cloud provider. */
function systemMessages(tools, context) {
  const pub = `You are J.A.R.V.I.S., the assistant built into Rahat OS — the portfolio and personal engineering workspace of ${person.name} (${person.role}, ${person.location}). Be concise, warm and precise; brief British-butler wit is welcome. Today is ${new Date().toDateString()}, local time ${new Date().toLocaleTimeString()}.
Current app context: ${JSON.stringify({ ...context, availableActions: undefined })}

For live or current information reply with ONLY one line:
CALL: <command>
where <command> is one of: weather <place> | <coin> price | news <topic> | search <query> | calc <expression> | time in <place>

To do something in the app reply with ONLY one line of JSON:
ACTION: {"tool": "<name>", "arguments": {…}}
using one of these actions:
${actionCatalog()}
Tool ids for openTool: ${tools
    .filter((t) => t.kind !== 'Bookmark')
    .slice(0, 45)
    .map((t) => `${t.id}=${t.name}`)
    .join('; ')}

Never invent live data such as prices, weather or news. Never claim to have done an action yourself — only an ACTION line does anything, and the app may ask the user to confirm it.`;
  const mem = memoryContext();
  return [{ role: 'system', content: pub }, ...(mem ? [{ role: 'system', content: `What you remember about the owner:\n${mem}`, private: true }] : [])];
}

/** Commands to offer while typing: parser verbs, then tools that match. */
export function suggest(q, tools) {
  const s = q.trim().toLowerCase();
  if (!s) return ['open RFI', 'velocity for 300 mm pipe at 40 L/s', 'show my DSIP project', 'weather in Dhaka', 'search the web for pile foundations', 'quick tools'];
  const v = COMMANDS.map((c) => c.prefill.trim()).filter((x) => x && x.startsWith(s) && x !== s);
  const t = /^(open|launch)\s+/.test(s) ? tools.filter((x) => x.kind !== 'Bookmark' && score(x, s.replace(/^\w+\s+/, '')) > 0).slice(0, 4).map((x) => `open ${x.name.toLowerCase()}`) : [];
  return [...new Set([...v, ...t])].slice(0, 6);
}

const loud = (r) => !!(r.show || r.error || r.confirm || r.results || r.sources || r.list || r.file || r.help || r.form || r.ai);

export function JarvisProvider({ children }) {
  const { tools } = useTools();
  const pin = useAdmin();
  const scrollTo = useScrollTo();
  const pins = usePins();
  const { online } = useOs();

  const [log, setLog] = useState([]);
  const [state, setState] = useState('idle');
  const [stage, setStage] = useState(-1);
  const [setup, setSetup] = useState({});
  const [brain, setBrain] = useState(brainState());
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [booted, setBooted] = useState(false);
  const [speak, setSpeak] = useState(() => {
    try {
      return localStorage.getItem('rh-jv-voice') === '1';
    } catch {
      return false;
    }
  });

  const rec = useRef(null);
  const level = useRef(0);
  const audio = useRef(null);
  const convo = useRef([]);
  const lastAnswer = useRef('');
  const settle = useRef(0);
  const busyRef = useRef(false);
  const bootedRef = useRef(false);

  const canListen = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const push = useCallback((m) => setLog((l) => [...l, { id: Math.random().toString(36).slice(2), ...m }].slice(-120)), []);
  const patch = useCallback((id, p) => setLog((l) => l.map((m) => (m.id === id ? { ...m, ...p } : m))), []);

  const flash = useCallback((s) => {
    setState(s);
    clearTimeout(settle.current);
    settle.current = setTimeout(() => setState((x) => (x === s ? 'idle' : x)), 1600);
  }, []);

  /* ------------------------------------------------------------ voice --- */
  const pickVoice = useCallback(() => {
    if (!canSpeak) return null;
    const v = speechSynthesis.getVoices();
    return v.find((x) => /en-GB/i.test(x.lang) && /daniel|george|ryan|male/i.test(x.name)) || v.find((x) => /en-GB/i.test(x.lang)) || v.find((x) => /^en/i.test(x.lang)) || null;
  }, [canSpeak]);

  const talk = useCallback(
    (text) => {
      if (!speak || !canSpeak || !text) return flash('success');
      const u = new SpeechSynthesisUtterance(text.replace(/[*_`#>[\]]/g, '').replace(/https?:\/\/\S+/g, 'link').slice(0, 600));
      u.rate = 1.03;
      u.pitch = 0.92;
      const v = pickVoice();
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
    [speak, canSpeak, pickVoice, flash],
  );

  const toggleVoice = useCallback((on) => {
    setSpeak(on);
    try {
      localStorage.setItem('rh-jv-voice', on ? '1' : '0');
    } catch {
      /* storage blocked */
    }
    if (!on && 'speechSynthesis' in window) speechSynthesis.cancel();
  }, []);

  /* ------------------------------------------------------- auto setup --- */
  const runSetup = useCallback(async () => {
    const mark = (k, s, d) => setSetup((x) => ({ ...x, [k]: { s, d } }));
    setSetup({});
    setLog((l) => [...l.filter((m) => m.id !== 'setup'), { id: 'setup', who: 'setup' }]);
    setState('executing');
    mark('deps', 'run');
    await import('./files').catch(() => null); // warm the office-file makers
    mark('deps', 'ok', `${TOOLS.length} commands · ${Object.keys(ACTIONS).length} actions registered`);
    mark('ai', 'run', 'probing Ollama · Chrome AI · WebLLM · cloud');
    let local = !!pin;
    try {
      local = local || localStorage.getItem('rh-jv-ollama') === '1';
    } catch {
      /* storage blocked */
    }
    const b = await detect((pid, r) => mark('ai', 'run', `${pid}: ${r.ok ? 'ready' : r.detail}`), { local, owner: !!pin });
    setBrain(b);
    const act = activeProvider();
    const up = Object.entries(b.status).filter(([, v]) => v.ok).map(([k]) => k);
    mark('ai', up.length ? 'ok' : 'warn', up.length ? `${up.length} free model${up.length > 1 ? 's' : ''}: ${up.join(', ')}` : 'none reachable — every command still works without AI');
    mark('config', act ? 'ok' : 'warn', act ? `primary ${PROVIDERS.find((p) => p.id === act).label}, fallback ${up.filter((x) => x !== act).join(' → ') || 'built-in commands'}` : navigator.gpu ? 'built-in commands — say “load local model” for free in-browser AI' : 'built-in commands — say “use ollama” if it runs on this computer');
    mark('voice', canSpeak || canListen ? 'ok' : 'warn', `${canListen ? 'speech input' : 'no speech input in this browser'} · ${canSpeak ? `voice ${pickVoice()?.name?.split(' ')[0] || 'default'}` : 'no speech output'}`);
    mark('web', 'run');
    const n = navigator.onLine ? await pingWeb() : 0;
    mark('web', n ? 'ok' : 'warn', navigator.onLine ? `${n}/3 live data sources reachable (CoinGecko, Open-Meteo, Wikipedia)` : 'offline mode — web tools paused');
    mark('memory', 'run');
    const ms = navigator.onLine && pin ? await bridgeStatus() : { ok: false };
    mark('memory', ms.notion ? 'ok' : pin ? 'warn' : 'ok', ms.notion ? 'Notion connected' : ms.unauth ? 'on device · Notion bridge awaits one-time authorisation' : 'on this device');
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
  }, [canListen, canSpeak, pickVoice, pin, flash]);

  /** First use anywhere (dock opened, section scrolled into view) starts setup. */
  const boot = useCallback(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    setBooted(true);
    push({ who: 'ai', text: `${greet()}. I’m J.A.R.V.I.S. — open tools, projects and labs, run engineering calculations, search this site or the web. Running auto setup…` });
    runSetup();
  }, [push, runSetup]);

  /* -------------------------------------------------------------- run --- */
  const index = useMemo(() => buildIndex({ tools, commands: COMMANDS }), [tools]);

  const ctx = useMemo(
    () => ({
      tools,
      pin,
      pins,
      sections,
      index,
      score,
      trackOpen,
      scrollTo,
      post,
      refresh: refreshTools,
      get context() {
        return getContext(Object.keys(ACTIONS));
      },
      lastAnswer: () => lastAnswer.current,
      stage: (s) => {
        setStage(STAGES.indexOf(s));
        setState(s === 'searching' ? 'searching' : s === 'executing' ? 'executing' : 'thinking');
      },
      think: (messages) => think(messages, () => setState('thinking')),
    }),
    [tools, pin, pins, index, scrollTo],
  );

  const answer = useCallback(
    (reply, meta = {}) => {
      if (!reply) return;
      setStage(4);
      const text = reply.text || '';
      lastAnswer.current = text;
      push({ who: 'ai', ...reply, ...meta });
      if (reply.error) {
        setState('error');
        setTimeout(() => setState((s) => (s === 'error' ? 'idle' : s)), 1800);
      } else talk(text);
      if (loud({ ...reply, ...meta })) window.dispatchEvent(new Event('rh-jarvis-reveal'));
      setTimeout(() => setStage(-1), 1400);
    },
    [push, talk],
  );

  const summarizeOr = useCallback(
    async (out, via) => {
      if (!out.summarize) return answer(out, { via });
      setStage(2);
      setState('thinking');
      try {
        const s = await think([{ role: 'system', content: 'You summarise search results accurately and briefly. Use plain sentences or short bullets. Cite result numbers like [1] when useful.' }, { role: 'user', content: out.summarize }]);
        return answer({ ...out, text: s.text }, { via: s.provider });
      } catch {
        return answer({ ...out, text: `${out.text} (No AI model reachable to summarise — sources below.)` });
      }
    },
    [answer],
  );

  /** Ask the model. It may answer, CALL a read-only tool, or propose an ACTION. */
  const ask = useCallback(
    async (text) => {
      convo.current = [...convo.current, { role: 'user', content: text }].slice(-12);
      setStage(2);
      setState('thinking');
      const sys = systemMessages(tools, ctx.context);
      let r = await think([...sys, ...convo.current], () => setState('thinking'));

      const action = r.text.match(/^\s*ACTION:\s*(\{[\s\S]*\})\s*$/m);
      if (action) {
        let call;
        const refuse = (text) => {
          convo.current = [...convo.current, { role: 'assistant', content: `(refused: ${text})` }];
          return { text, error: true, via: r.provider };
        };
        try {
          call = JSON.parse(action[1]);
        } catch {
          return refuse('The model proposed an action I couldn’t read, so I did nothing.');
        }
        const v = validate(call);
        if (!v.ok) return refuse(`The model asked for something I won’t run (${v.error}).`);
        setStage(3);
        setState('executing');
        const out = (await execute(call, ctx)) || { text: 'Nothing matched.' };
        convo.current = [...convo.current, { role: 'assistant', content: `(ran ${call.tool}) ${out.text || ''}` }];
        return { ...out, via: `${r.provider} → ${call.tool}` };
      }

      const c = r.text.match(/^CALL:\s*(.+)$/m);
      if (c) {
        const hit = route(c[1], ctx);
        if (hit && MODEL_CALLABLE.includes(hit.tool.id)) {
          if (hit.tool.needsNet && !navigator.onLine) return { text: 'That needs live data and I’m offline.', error: true };
          setStage(1);
          setState('searching');
          const out = await hit.tool.run(hit.args, ctx);
          setStage(2);
          setState('thinking');
          const data = out.summarize || `${out.text}\n${(out.sources || []).map((s) => `- ${s.title}: ${s.snippet || ''} ${s.url}`).join('\n')}`;
          r = await think([...sys, ...convo.current, { role: 'assistant', content: r.text }, { role: 'user', content: `Tool result for "${c[1]}":\n${data}\nNow answer my original question using only this data. Do not output CALL or ACTION.` }]);
          r.sources = out.sources;
        }
      }
      convo.current = [...convo.current, { role: 'assistant', content: r.text }];
      return { text: r.text, sources: r.sources, via: r.provider, ai: true };
    },
    [ctx, tools],
  );

  const loadLocal = useCallback(
    async (which) => {
      const id = which + Date.now();
      push({ id, who: 'sys', text: which === 'chrome' ? 'Asking Chrome to download Gemini Nano (free, on-device)…' : 'Downloading the open-source model (one time, ~1 GB, then offline)…' });
      window.dispatchEvent(new Event('rh-jarvis-reveal'));
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
    },
    [push, patch, flash],
  );

  const run = useCallback(
    async (raw, { via = 'typed' } = {}) => {
      const text = String(raw || '').trim();
      if (!text || busyRef.current) return;
      boot();
      push({ who: 'me', text, source: via });
      addHistory(text, via);
      if (/^(clear|cls)$/i.test(text)) return setLog([{ id: 'c', who: 'sys', text: 'Console cleared.' }]);
      busyRef.current = true;
      setBusy(true);
      setStage(0);
      setState('thinking');
      try {
        const hit = route(text, ctx);
        if (hit) {
          if (hit.tool.needsNet && !navigator.onLine) return answer({ text: `${hit.tool.label} needs the internet — Rahat OS is in offline mode. Navigation, tools, calculators and history still work.`, error: true });
          setStage(hit.tool.stage === 'search' ? 1 : 3);
          setState(hit.tool.stage === 'search' ? 'searching' : 'executing');
          const out = await hit.tool.run(hit.args, ctx);
          if (!out) return answer({ text: 'Nothing matched that.', error: true });
          if (out.help) return answer({ help: true, text: 'Here is what I can do — no AI needed for any of it.' });
          if (out.setup) {
            answer({ text: 'Re-running setup.' });
            return runSetup();
          }
          if (out.webllm) return loadLocal('webllm');
          if (out.chromeai) return loadLocal('chrome');
          return summarizeOr(out, hit.tool.label);
        }
        const r = await ask(text);
        answer(r);
      } catch (e) {
        if (e.offline) {
          // No model anywhere: still try to be useful from the local index.
          const local = await execute({ tool: 'searchSite', arguments: { query: text } }, ctx).catch(() => null);
          answer(
            local
              ? { ...local, text: `No AI model is connected, but this is what I found on the site for “${text}”:` }
              : { text: `No AI model is connected, so I work from commands — say “help” for the list.${navigator.gpu ? ' Say “load local model” for a free AI that runs in this tab.' : ''}`, error: true },
          );
        } else answer({ text: `That failed: ${e.message}`, error: true });
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [ctx, push, answer, ask, runSetup, loadLocal, summarizeOr, boot],
  );

  /** Run a structured action directly (result buttons, palette). */
  const runAction = useCallback(
    async (call, label) => {
      if (busyRef.current) return;
      if (label) push({ who: 'sys', text: `→ ${label}` });
      busyRef.current = true;
      setBusy(true);
      setState('executing');
      setStage(3);
      try {
        const out = await execute(call, ctx);
        if (out) await summarizeOr(out, call.tool);
      } catch (e) {
        answer({ text: `That failed: ${e.message}`, error: true });
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [ctx, push, answer, summarizeOr],
  );

  const confirm = useCallback(
    async (m, yes) => {
      patch(m.id, { confirm: { ...m.confirm, done: yes ? 'yes' : 'no' } });
      if (!yes) return push({ who: 'sys', text: 'Cancelled.' });
      busyRef.current = true;
      setBusy(true);
      setState('executing');
      setStage(3);
      try {
        answer(await m.confirm.yes());
      } catch (e) {
        answer({ text: `That failed: ${e.message}`, error: true });
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [patch, push, answer],
  );

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
      /* the meter is cosmetic */
    }
  };

  const VOICE_ERR = {
    'not-allowed': 'Microphone access was blocked — allow it in the address bar to talk to me.',
    'service-not-allowed': 'This browser doesn’t allow speech recognition here.',
    network: 'Speech recognition needs the internet in this browser.',
    'audio-capture': 'No microphone found.',
    'no-speech': 'I didn’t catch that.',
  };

  /** Mic → speech recognition → run(). Returns false when voice can't start. */
  const listen = useCallback(() => {
    if (!canListen) return false;
    if (!navigator.onLine) {
      push({ who: 'sys', text: 'Voice input needs the internet in this browser — type instead.' });
      return false;
    }
    if (listening) {
      rec.current?.stop();
      return true;
    }
    boot();
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new R();
    r.lang = 'en-US';
    r.interimResults = true;
    let finalText = '';
    r.onresult = (e) => {
      const t = [...e.results].map((x) => x[0].transcript).join('');
      window.dispatchEvent(new CustomEvent('rh-jarvis-interim', { detail: t }));
      if (e.results[e.results.length - 1].isFinal) {
        finalText = t;
        r.stop();
      }
    };
    r.onerror = (e) => {
      if (VOICE_ERR[e.error] && e.error !== 'aborted') push({ who: 'sys', text: VOICE_ERR[e.error] });
    };
    r.onend = () => {
      setListening(false);
      stopMeter();
      window.dispatchEvent(new CustomEvent('rh-jarvis-interim', { detail: '' }));
      setState((s) => (s === 'listening' ? 'idle' : s));
      if (finalText) run(finalText, { via: 'voice' });
    };
    rec.current = r;
    setListening(true);
    setState('listening');
    if (!speak) toggleVoice(true);
    if (canSpeak) speechSynthesis.cancel();
    startMeter();
    try {
      r.start();
    } catch {
      setListening(false);
      return false;
    }
    return true;
  }, [canListen, canSpeak, listening, speak, toggleVoice, push, run, boot]);

  const choose = useCallback((p) => {
    setPrefer(p);
    setBrain(brainState());
  }, []);

  const provider = activeProvider();
  const value = {
    log,
    state,
    stage,
    setup,
    brain,
    busy,
    booted,
    speak,
    listening,
    canListen,
    canSpeak,
    level,
    online,
    provider,
    kind: brainKind(provider),
    tools,
    index,
    pin,
    boot,
    run,
    runAction,
    confirm,
    toggleVoice,
    listen,
    loadLocal,
    choose,
    push,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
