import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTools, useAdmin, score, trackOpen, post, refreshTools } from '../sections/Tools';
import { sections, person } from '../data/site';
import { useScrollTo } from '../hooks/useScroll';
import { detect, think, brainState, setPrefer, loadWebllm, loadChrome, activeProvider, PROVIDERS, brainKind, brainById, refreshKeyed, setBridgePin, available } from './brain';
import { route, TOOLS, MODEL_CALLABLE } from './tools';
import { pingWeb } from './web';
import { memoryContext, bridgeStatus } from './memory';
import { parseKeys, addKeys, keyKinds, onKeys, KEY_KINDS, mask } from './keys';
import { Speaker, Listener, WAKE, canSpeak as CAN_SPEAK, canRecognise, canRecord } from './voice';
import { execute, validate, actionCatalog, ACTIONS } from '../os/actions';
import { buildIndex } from '../os/searchIndex';
import { getContext, useOs } from '../os/context';
import { addHistory } from '../os/history';
import { usePins } from '../os/favorites';

/* -----------------------------------------------------------------------------
 * J.A.R.V.I.S. engine — one instance for the whole app.
 *
 * The section console, the floating dock, the command palette and voice all
 * talk to this provider and see the same conversation.
 *
 *   input → command parser (tools.js, no AI needed)
 *         → action registry (os/actions.js: validate → confirm? → run)
 *         → otherwise the brain (brain.js: many models, auto fallback,
 *           streamed), which may answer, CALL a read-only data tool, or
 *           propose an ACTION that goes through the same validated registry.
 *
 * Voice (voice.js): answers are spoken sentence by sentence while they
 * stream; hands-free mode keeps the mic open for the wake word "Jarvis".
 * -------------------------------------------------------------------------- */

export const STAGES = ['understanding', 'searching', 'processing', 'executing', 'responding'];
export const STATE_LABEL = { idle: 'Standby', listening: 'Listening', thinking: 'Thinking', searching: 'Searching', executing: 'Executing', speaking: 'Speaking', success: 'Done', error: 'Error' };
export const SETUP = [
  ['deps', 'Load modules'],
  ['ai', 'Detect brains'],
  ['config', 'Rank brains'],
  ['voice', 'Configure voice'],
  ['web', 'Configure web tools'],
  ['memory', 'Memory link'],
  ['test', 'Test the brain'],
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

const ls = {
  get: (k, d) => {
    try {
      return localStorage.getItem(k) ?? d;
    } catch {
      return d;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage blocked */
    }
  },
};

function greet() {
  const h = new Date().getHours();
  return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** System prompt. The owner's memories go in a separate message flagged
    private, which brain.js never forwards to a cloud provider. */
function systemMessages(tools, context, { voice, lang } = {}) {
  const brain = brainById(activeProvider());
  const pub = `You are J.A.R.V.I.S., the assistant built into Rahat OS — the portfolio and personal engineering workspace of ${person.name} (${person.role}, ${person.location}). Be concise, warm and precise; brief British-butler wit is welcome. Today is ${new Date().toDateString()}, local time ${new Date().toLocaleTimeString()}.
You are currently thinking with ${brain ? `${brain.label} (${brain.vendor})` : 'a language model'}; if asked which model or brain you are, say so. The user can say "switch brain" or "use claude / gpt / gemini / qwen" to change it.
Language: reply in the language the user used — Bangla (বাংলা) if they wrote or spoke Bangla, otherwise English.${lang === 'bn-BD' ? ' The user prefers Bangla right now.' : ''}
${voice ? 'This is a spoken conversation: answer in 1-3 short natural sentences, no markdown, no lists, unless asked for detail.' : 'Use short paragraphs or bullets; markdown **bold**, `code` and [links](url) render.'}
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
  if (!s)
    return keyKinds().length
      ? ['switch brain', 'hands free', 'open RFI', 'velocity for 300 mm pipe at 40 L/s', 'weather in Dhaka', 'brains']
      : ['add keys', 'hands free', 'open RFI', 'velocity for 300 mm pipe at 40 L/s', 'weather in Dhaka', 'quick tools'];
  const v = COMMANDS.map((c) => c.prefill.trim()).filter((x) => x && x.startsWith(s) && x !== s);
  const t = /^(open|launch)\s+/.test(s) ? tools.filter((x) => x.kind !== 'Bookmark' && score(x, s.replace(/^\w+\s+/, '')) > 0).slice(0, 4).map((x) => `open ${x.name.toLowerCase()}`) : [];
  return [...new Set([...v, ...t])].slice(0, 6);
}

const loud = (r) => !!(r.show || r.error || r.confirm || r.results || r.sources || r.list || r.file || r.help || r.form || r.ai);
// Hide a streaming tool call ("CALL: …" / "ACTION: {…}") until it is complete.
const TOOLISH = /^(C(A(L(L(:)?)?)?)?|A(C(T(I(O(N(:)?)?)?)?)?)?)$/;

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
  const [hands, setHands] = useState(false);
  const [lang, setLangState] = useState(() => ls.get('rh-jv-lang', 'en-US'));
  const [booted, setBooted] = useState(false);
  const [keys, setKeys] = useState(() => keyKinds().length);
  const [speak, setSpeak] = useState(() => ls.get('rh-jv-voice', '0') === '1');

  const level = useRef(0);
  const convo = useRef([]);
  const lastAnswer = useRef('');
  const lastUrl = useRef('');
  const settle = useRef(0);
  const busyRef = useRef(false);
  const bootedRef = useRef(false);
  const runRef = useRef(null);
  const listenerRef = useRef(null);

  const canListen = canRecognise || canRecord;
  const canSpeak = CAN_SPEAK;

  const push = useCallback((m) => {
    const id = m.id || Math.random().toString(36).slice(2);
    setLog((l) => [...l, { ...m, id }].slice(-120));
    return id;
  }, []);
  const patch = useCallback((id, p) => setLog((l) => l.map((m) => (m.id === id ? { ...m, ...p } : m))), []);

  const flash = useCallback((s) => {
    setState(s);
    clearTimeout(settle.current);
    settle.current = setTimeout(() => setState((x) => (x === s ? (listenerRef.current?.alive ? 'listening' : 'idle') : x)), 1600);
  }, []);

  useEffect(() => {
    setBridgePin(pin);
  }, [pin]);

  /* ------------------------------------------------------------ voice --- */
  const speaker = useMemo(
    () =>
      new Speaker({
        onStart: () => setState('speaking'),
        onLevel: (v) => (level.current = v),
        onIdle: () => {
          level.current = 0;
          setState((s) => (s === 'speaking' ? 'success' : s));
          const L = listenerRef.current;
          if (L?.hands) {
            L.wake(9000); // follow-ups need no wake word for a few seconds
            setTimeout(() => L.resume(), 250);
          }
        },
      }),
    [],
  );
  speaker.on = speak && canSpeak;

  const listener = useMemo(() => {
    const L = new Listener({
      onText: (text, { wake }) => {
        window.dispatchEvent(new CustomEvent('rh-jarvis-interim', { detail: '' }));
        if (wake) {
          if (speaker.on) L.pause();
          speaker.say(L.lang === 'bn-BD' ? 'জি, বলুন?' : 'Yes?');
          return;
        }
        if (!text) return;
        if (/^(stop|cancel|quiet|shut up|চুপ|থামো)\b/i.test(text)) return speaker.cancel();
        if (busyRef.current) return;
        // Jarvis must not hear itself: close the mic while it answers.
        if (speaker.on && L.hands) L.pause();
        runRef.current?.(text, { via: 'voice' });
      },
      onInterim: (t) => {
        window.dispatchEvent(new CustomEvent('rh-jarvis-interim', { detail: t }));
        if (speaker.speaking && t.length > 3) speaker.cancel(); // barge-in
      },
      onState: (on) => {
        setListening(on);
        setState((s) => (on ? (s === 'idle' || s === 'success' ? 'listening' : s) : s === 'listening' ? 'idle' : s));
        if (!on) window.dispatchEvent(new CustomEvent('rh-jarvis-interim', { detail: '' }));
      },
      onLevel: (v) => (level.current = v),
      onError: (msg) => push({ who: 'sys', text: msg }),
      onDenied: () => setHands(false),
    });
    listenerRef.current = L;
    return L;
  }, [speaker, push]);
  listener.lang = lang;
  useEffect(() => () => listener.stop(), [listener]);

  const talk = useCallback((text) => (speaker.on && text ? speaker.say(text) : flash('success')), [speaker, flash]);

  const toggleVoice = useCallback(
    (on) => {
      setSpeak(on);
      ls.set('rh-jv-voice', on ? '1' : '0');
      if (!on) speaker.cancel();
    },
    [speaker],
  );

  const setLang = useCallback(
    (l) => {
      setLangState(l);
      ls.set('rh-jv-lang', l);
      listener.lang = l;
      if (listener.alive && listener.hands) {
        listener.pause();
        setTimeout(() => listener.resume(), 300);
      }
    },
    [listener],
  );

  const setHandsFree = useCallback(
    async (on) => {
      if (!on) {
        listener.stop();
        setHands(false);
        return false;
      }
      if (!listener.engine) {
        push({ who: 'sys', text: canRecord ? 'This browser has no speech recognition. Add a Groq key (“add keys”) and I will use Whisper instead.' : 'This browser cannot use the microphone.' });
        return false;
      }
      speaker.cancel();
      if (!speak) toggleVoice(true);
      const ok = await listener.start({ hands: true });
      setHands(ok);
      if (ok) push({ who: 'sys', text: `Hands-free on (${listener.engine === 'whisper' ? 'Whisper' : 'browser speech'}, ${listener.lang === 'bn-BD' ? 'বাংলা' : 'English'}). Say “Jarvis, …” any time — follow-ups need no wake word for a few seconds. “Stop listening” ends it.` });
      return ok;
    },
    [listener, speaker, speak, toggleVoice, push],
  );

  /* ------------------------------------------------------- auto setup --- */
  const runSetup = useCallback(async () => {
    const mark = (k, s, d) => setSetup((x) => ({ ...x, [k]: { s, d } }));
    setSetup({});
    setLog((l) => [...l.filter((m) => m.id !== 'setup'), { id: 'setup', who: 'setup' }]);
    setState('executing');
    mark('deps', 'run');
    await import('./files').catch(() => null); // warm the office-file makers
    mark('deps', 'ok', `${TOOLS.length} commands · ${Object.keys(ACTIONS).length} actions registered`);
    mark('ai', 'run', 'probing your keyed brains · browser AI · local · cloud');
    const local = !!pin || ls.get('rh-jv-ollama', '') === '1';
    const b = await detect((pid, r) => mark('ai', 'run', `${brainById(pid)?.label}: ${r.ok ? 'ready' : r.detail}`), { local, owner: !!pin });
    setBrain(b);
    const act = activeProvider();
    const up = available();
    const keyed = up.filter((x) => brainById(x).key);
    mark('ai', up.length ? 'ok' : 'warn', up.length ? `${up.length} brains online${keyed.length ? ` · ${keyed.length} through your keys` : ' · say “add keys” for GPT / Claude / Gemini'}` : 'none reachable — every command still works without AI');
    mark('config', act ? 'ok' : 'warn', act ? `primary ${brainById(act).label}, then ${up.filter((x) => x !== act).slice(0, 4).map((x) => brainById(x).label).join(' → ') || 'built-in commands'}` : 'built-in commands — say “add keys” (paste once, stays on this device) or “load local model”');
    mark('voice', listener.engine || canSpeak ? 'ok' : 'warn', `${listener.engine === 'browser' ? 'speech input' : listener.engine === 'whisper' ? 'Whisper input (Groq)' : 'no speech input here'} · ${canSpeak ? 'voice output' : 'no voice output'} · wake word “Jarvis” · EN / বাংলা`);
    mark('web', 'run');
    const n = navigator.onLine ? await pingWeb() : 0;
    mark('web', n ? 'ok' : 'warn', navigator.onLine ? `${n}/3 live data sources reachable (CoinGecko, Open-Meteo, Wikipedia)` : 'offline mode — web tools paused');
    mark('memory', 'run');
    const ms = navigator.onLine && pin ? await bridgeStatus() : { ok: false };
    mark('memory', ms.notion ? 'ok' : pin ? 'warn' : 'ok', ms.notion ? 'Notion connected' : ms.unauth ? 'on device · Notion bridge awaits one-time authorisation' : 'on this device');
    mark('test', 'run');
    let test = 'skipped (no model)';
    let ok = false;
    if (act) {
      try {
        const r = await think([{ role: 'user', content: 'Reply with exactly: online' }]);
        test = `${r.label} answered in ${r.ms} ms`;
        ok = true;
      } catch (e) {
        test = e.message.slice(0, 140);
      }
    }
    mark('test', ok ? 'ok' : 'warn', test);
    setBrain(brainState());
    mark('start', 'ok', 'ready');
    flash('success');
  }, [canSpeak, pin, flash, listener]);

  /** First use anywhere (dock opened, section scrolled into view) starts setup. */
  const boot = useCallback(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    setBooted(true);
    push({ who: 'ai', text: `${greet()}. I’m J.A.R.V.I.S. — open tools, projects and labs, run engineering calculations, search this site or the web. Say “switch brain” to change model, “hands free” for always-on voice. Running auto setup…` });
    runSetup();
  }, [push, runSetup]);

  // Keys pasted anywhere re-rank the brains.
  useEffect(
    () =>
      onKeys(async () => {
        setKeys(keyKinds().length);
        setBrain(await refreshKeyed());
      }),
    [],
  );

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
      lastUrl: () => lastUrl.current,
      brainChanged: () => setBrain(brainState()),
      stage: (s) => {
        setStage(STAGES.indexOf(s));
        setState(s === 'searching' ? 'searching' : s === 'executing' ? 'executing' : 'thinking');
      },
      think: (messages) => think(messages, { onTry: () => setState('thinking') }),
      /** Run words through the parser (used by model actions). */
      say(text) {
        const hit = route(text, this);
        return hit ? hit.tool.run(hit.args, this) : { text: 'Nothing matched.', error: true };
      },
      voice: (a) => {
        if (a.hands !== undefined) {
          setHandsFree(a.hands);
          return { text: a.hands ? 'Listening. Call me Jarvis.' : 'Hands-free off.' };
        }
        if (a.hush) {
          speaker.cancel();
          return { text: 'Quiet.', silent: true };
        }
        if (a.lang) {
          setLang(a.lang);
          return { text: a.lang === 'bn-BD' ? 'ঠিক আছে, এখন থেকে বাংলায় শুনব ও বলব।' : 'Switched to English.' };
        }
        if (a.mute) return toggleVoice(false), { text: 'Voice off. I will reply in text.' };
        if (a.unmute) return toggleVoice(true), { text: 'Voice on.' };
        return { text: 'OK.' };
      },
    }),
    [tools, pin, pins, index, scrollTo, setHandsFree, speaker, setLang, toggleVoice],
  );

  const answer = useCallback(
    (reply, meta = {}, id, streamed) => {
      if (!reply) return;
      setStage(4);
      const text = reply.text || '';
      lastAnswer.current = text;
      const url = (reply.sources || []).map((s) => s.url).find(Boolean) || text.match(/https?:\/\/\S+/)?.[0];
      if (url) lastUrl.current = url;
      const m = { who: 'ai', ...reply, ...meta, streaming: false };
      if (id) patch(id, m);
      else push(m);
      if (reply.error) {
        setState('error');
        setTimeout(() => setState((s) => (s === 'error' ? 'idle' : s)), 1800);
      } else if (streamed) speaker.flush();
      else if (!reply.silent) talk(text);
      if (loud({ ...reply, ...meta })) window.dispatchEvent(new Event('rh-jarvis-reveal'));
      setTimeout(() => setStage(-1), 1400);
    },
    [push, patch, talk, speaker],
  );

  /* A streaming message: tokens patch it (once per frame) and feed the
     speaker; tool calls stay hidden. */
  const streamer = useCallback(
    (id) => {
      let raf = 0;
      let shown = '';
      const s = {
        hidden: false,
        onTry: () => setState('thinking'),
        onReset: () => {
          shown = '';
          patch(id, { text: '' });
          speaker.cancel();
        },
        onToken: (delta, full) => {
          const f = full.trimStart();
          if (TOOLISH.test(f) || f.startsWith('CALL:') || f.startsWith('ACTION:')) return (s.hidden = true);
          s.hidden = false;
          speaker.feed(full.slice(shown.length));
          shown = full;
          if (!raf)
            raf = requestAnimationFrame(() => {
              raf = 0;
              patch(id, { text: shown });
            });
        },
        done: () => cancelAnimationFrame(raf),
      };
      return s;
    },
    [patch, speaker],
  );

  const summarizeOr = useCallback(
    async (out, via, voice) => {
      if (!out.summarize) return answer(out, { via });
      setStage(2);
      setState('thinking');
      const id = push({ who: 'ai', text: '', streaming: true });
      const st = streamer(id);
      try {
        const s = await think([{ role: 'system', content: `You summarise search results accurately and briefly. Use plain sentences${voice ? '' : ' or short bullets'}. Cite result numbers like [1] when useful. Reply in the language of the question.` }, { role: 'user', content: out.summarize }], st);
        st.done();
        return answer({ ...out, text: s.text }, { via: s.label, ms: s.ms }, id, true);
      } catch {
        st.done();
        return answer({ ...out, text: `${out.text} (No AI model reachable to summarise — sources below.)` }, {}, id);
      }
    },
    [answer, push, streamer],
  );

  /** Ask the model. It may answer, CALL a read-only tool, or propose an ACTION. */
  const ask = useCallback(
    async (text, voice) => {
      convo.current = [...convo.current, { role: 'user', content: text }].slice(-14);
      setStage(2);
      setState('thinking');
      const sys = systemMessages(tools, ctx.context, { voice: voice || listenerRef.current?.hands, lang });
      const id = push({ who: 'ai', text: '', streaming: true });
      const st = streamer(id);
      let r = await think([...sys, ...convo.current], st);
      st.done();

      const action = r.text.match(/^\s*ACTION:\s*(\{[\s\S]*\})\s*$/m);
      if (action) {
        let call;
        const refuse = (msg) => {
          convo.current = [...convo.current, { role: 'assistant', content: `(refused: ${msg})` }];
          return { text: msg, error: true, via: r.label, id };
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
        patch(id, { text: '', tool: call.tool });
        const out = (await execute(call, ctx)) || { text: 'Nothing matched.' };
        convo.current = [...convo.current, { role: 'assistant', content: `(ran ${call.tool}) ${out.text || ''}` }];
        return { ...out, via: `${r.label} → ${call.tool}`, id };
      }

      const c = r.text.match(/^\s*CALL:\s*(.+)$/m);
      if (c) {
        const hit = route(c[1], ctx);
        if (hit && MODEL_CALLABLE.includes(hit.tool.id)) {
          if (hit.tool.needsNet && !navigator.onLine) return { text: 'That needs live data and I’m offline.', error: true, id };
          setStage(1);
          setState('searching');
          patch(id, { text: '', tool: hit.tool.label });
          const out = await hit.tool.run(hit.args, ctx);
          setStage(2);
          setState('thinking');
          const data = out.summarize || `${out.text}\n${(out.sources || []).map((s) => `- ${s.title}: ${s.snippet || ''} ${s.url}`).join('\n')}`;
          const st2 = streamer(id);
          r = await think([...sys, ...convo.current, { role: 'assistant', content: r.text }, { role: 'user', content: `Tool result for "${c[1]}":\n${data}\nNow answer my original question using only this data. Do not output CALL or ACTION.` }], st2);
          st2.done();
          r.sources = out.sources;
        } else if (st.hidden) r.text = r.text.replace(/^\s*CALL:.*$/m, '').trim() || 'I couldn’t run that lookup.';
      }
      convo.current = [...convo.current, { role: 'assistant', content: r.text }];
      return { text: r.text, sources: r.sources, via: r.label, ms: r.ms, ai: true, id, streamed: true };
    },
    [ctx, tools, lang, push, patch, streamer],
  );

  const loadLocal = useCallback(
    async (which) => {
      const id = push({ who: 'sys', text: which === 'chrome' ? 'Asking the browser to download its free on-device model…' : 'Downloading the open-source model (one time, ~1 GB, then offline)…' });
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
      const shown = String(raw || '').trim();
      // "Jarvis, …" — the name is a greeting, not part of the command.
      // A command that itself names Jarvis ("jarvis mode") is kept as typed.
      const stripped = shown.replace(WAKE, ' ').replace(/\s+/g, ' ').trim();
      const text = !stripped || (stripped !== shown && route(shown, ctx)) ? shown : stripped;
      if (!text || busyRef.current) return;
      boot();
      // Keys pasted into the console are stored, never shown, never sent to a model.
      const found = parseKeys(text);
      if (Object.keys(found).length) {
        push({ who: 'me', text: '•••• API keys (hidden)', source: via });
        addKeys(found);
        const b = await refreshKeyed();
        setBrain(b);
        return answer({ text: `Stored ${Object.entries(found).map(([k, v]) => `${KEY_KINDS[k].label} (${mask(v)})`).join(', ')} on this device only. ${available().length} brains online — primary **${brainById(activeProvider())?.label || 'none'}**.` });
      }
      push({ who: 'me', text: shown, source: via });
      addHistory(shown, via);
      if (/^(clear|cls)$/i.test(text)) return setLog([{ id: 'c', who: 'sys', text: 'Console cleared.' }]);
      const url = text.match(/https?:\/\/\S+/)?.[0];
      if (url) lastUrl.current = url;
      const voice = via === 'voice';
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
          if (out.help) return answer({ help: true, text: 'Here is what I can do — no AI needed for any of it.', silent: true });
          if (out.setup) {
            answer({ text: 'Re-running setup.' });
            return runSetup();
          }
          if (out.webllm) return loadLocal('webllm');
          if (out.chromeai) return loadLocal('chrome');
          return summarizeOr(out, hit.tool.label, voice);
        }
        const r = await ask(text, voice);
        const { id, streamed, ...rest } = r;
        answer(rest, {}, id, streamed);
      } catch (e) {
        if (e.offline) {
          // No model anywhere: still try to be useful from the local index.
          const local = await execute({ tool: 'searchSite', arguments: { query: text } }, ctx).catch(() => null);
          answer(
            local
              ? { ...local, text: `No AI brain is reachable, but this is what I found on the site for “${text}”:` }
              : { text: `No AI brain is reachable, so I work from commands — say “help” for the list. Say “add keys” to connect GPT / Claude / Gemini${navigator.gpu ? ', or “load local model” for a free AI in this tab' : ''}.`, error: true },
          );
        } else answer({ text: `That failed: ${e.message}`, error: true });
      } finally {
        busyRef.current = false;
        setBusy(false);
        setLog((l) => l.filter((m) => !(m.streaming && !m.text && !m.tool)).map((m) => (m.streaming ? { ...m, streaming: false } : m)));
        // Hands-free: reopen the mic if nothing is being spoken.
        setTimeout(() => {
          const L = listenerRef.current;
          if (L?.hands && L.paused && !speaker.speaking) {
            L.wake(9000);
            L.resume();
          }
        }, 500);
      }
    },
    [ctx, push, answer, ask, runSetup, loadLocal, summarizeOr, boot, speaker],
  );
  runRef.current = run;

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

  /** Mic button: one utterance (or stops hands-free). Returns false when voice can't start. */
  const listen = useCallback(() => {
    if (hands) {
      setHandsFree(false);
      return true;
    }
    if (listening) {
      listener.stop();
      return true;
    }
    if (!listener.engine) {
      push({ who: 'sys', text: 'No speech recognition in this browser — try Chrome or Edge, or add a Groq key for Whisper.' });
      return false;
    }
    if (listener.engine === 'browser' && !navigator.onLine) {
      push({ who: 'sys', text: 'Voice input needs the internet in this browser — type instead.' });
      return false;
    }
    boot();
    speaker.cancel();
    if (!speak) toggleVoice(true);
    listener.start({ hands: false });
    return true;
  }, [hands, listening, listener, speaker, speak, toggleVoice, push, boot, setHandsFree]);

  const choose = useCallback((p) => {
    setPrefer(p);
    setBrain(brainState());
  }, []);

  // Mirror state on <body> so the floating orb can glow with it.
  useEffect(() => {
    document.body.dataset.jv = state;
    document.body.dataset.jvHands = hands ? '1' : '';
  }, [state, hands]);

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
    hands,
    lang,
    keys,
    canListen,
    canSpeak,
    level,
    online,
    provider,
    providerLabel: brainById(provider)?.label || '',
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
    setHandsFree,
    setLang,
    loadLocal,
    choose,
    push,
    setBrain,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export { PROVIDERS };
