/* -----------------------------------------------------------------------------
 * J.A.R.V.I.S. brain — many models, one voice, automatic fallback.
 *
 * A "brain" is a provider + model. Jarvis ranks every brain it can reach and
 * streams from the best one; if it fails before the first word, the next
 * brain takes over silently. "Switch your brain" cycles to the next one.
 *
 *   keyed (owner's device)  Groq · Unikey (GPT / Claude / Gemini / DeepSeek)
 *                           · Google AI Studio · OpenRouter — keys pasted once,
 *                           stored only in this browser (see keys.js)
 *   browser                 the browser's own model: Chrome (Gemini Nano) or
 *                           Edge (Phi-4-mini) through the Prompt API
 *   free                    Apps Script bridge · Ollama · WebLLM · Pollinations
 *
 * Auto order: the owner's keyed brains first (best answers), then this
 * computer (Ollama), then the browser, then free cloud tiers. Offline, only
 * local and in-browser brains are tried. Messages flagged { private: true }
 * (what J.A.R.V.I.S. remembers about the owner) never go to a cloud brain.
 *
 * No secret lives in this file.
 * -------------------------------------------------------------------------- */

import { bridge, bridgeStatus } from './memory';
import { getKey, keyKinds } from './keys';

const POLL = 'https://gen.pollinations.ai/v1/chat/completions';
const OLLAMA = 'http://localhost:11434';
const WEBLLM_MODEL = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';
const K = 'rh-jv-brain';
const FIRST_MS = 14000;

const EP = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  unikey: 'https://www.getunikey.ai/v1/chat/completions',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
};

const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;

const isEdge = typeof navigator !== 'undefined' && /\bEdg\//.test(navigator.userAgent);
const BROWSER_LABEL = isEdge ? 'Edge AI' : 'Chrome AI';

/* Ranked best-first for Auto. `key` = which pasted key unlocks it. */
export const BRAINS = [
  { id: 'groq-qwen', label: 'Qwen 3.8', vendor: 'Groq', key: 'groq', model: 'qwen/qwen3.8-27b', note: 'instant (~0.5 s)', alias: /\b(qwen|groq|fast(est)?|quick|instant)\b/ },
  { id: 'uk-opus', label: 'Claude Opus 4.8', vendor: 'Unikey', key: 'unikey', model: 'claude-opus-4-8', note: 'deep reasoning', alias: /\b(claude|opus|anthropic|smart(est)?|best)\b/ },
  { id: 'uk-gpt', label: 'GPT-5.5', vendor: 'Unikey', key: 'unikey', model: 'gpt-5.5', note: 'OpenAI flagship', alias: /\b(gpt|chat ?gpt|openai|open ai)\b/ },
  { id: 'uk-gemini', label: 'Gemini 3.5 Flash', vendor: 'Unikey', key: 'unikey', model: 'gemini-3.5-flash', note: 'Google, fast', alias: /\b(gemini|google)\b/ },
  { id: 'groq-oss', label: 'GPT-OSS 120B', vendor: 'Groq', key: 'groq', model: 'openai/gpt-oss-120b', note: 'open-weight, fast', alias: /\b(oss|open ?source|open weight)\b/ },
  { id: 'uk-haiku', label: 'Claude Haiku 4.5', vendor: 'Unikey', key: 'unikey', model: 'claude-haiku-4-5-20251001', note: 'light Claude', alias: /\bhaiku\b/ },
  { id: 'uk-deepseek', label: 'DeepSeek V4', vendor: 'Unikey', key: 'unikey', model: 'deepseek-v4-flash', note: 'DeepSeek', alias: /\bdeep ?seek\b/ },
  { id: 'gemini', label: 'Gemini (AI Studio)', vendor: 'Google', key: 'gemini', models: ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'], note: 'direct from Google', alias: /\b(ai studio|studio|nano banana)\b/ },
  { id: 'openrouter', label: 'OpenRouter', vendor: 'OpenRouter', key: 'openrouter', model: 'openrouter/auto', note: 'router', alias: /\bopen ?router\b/ },
  { id: 'bridge', label: 'Cloud bridge', vendor: 'Apps Script', note: 'owner’s server-side keys', alias: /\b(bridge|cloud|server)\b/ },
  { id: 'ollama', label: 'Ollama', vendor: 'this PC', note: 'local open model', alias: /\b(ollama|local pc|llama)\b/ },
  { id: 'chrome', label: BROWSER_LABEL, vendor: isEdge ? 'Phi-4-mini' : 'Gemini Nano', note: 'on-device, offline', alias: /\b(browser|chrome|edge|on ?device|offline|nano|phi)\b/ },
  { id: 'webllm', label: 'WebLLM', vendor: 'in tab', note: 'Qwen 2.5 on WebGPU', alias: /\b(web ?llm|webgpu)\b/ },
  { id: 'pollinations', label: 'Pollinations', vendor: 'free', note: 'anonymous tier', alias: /\bpollinations?\b/ },
];
const KIND = { ollama: 'Local', chrome: 'Browser', webllm: 'Browser' };
for (const b of BRAINS) b.kind = KIND[b.id] || 'Cloud';
export const brainById = (id) => BRAINS.find((b) => b.id === id);
const CLOUD = new Set(BRAINS.filter((b) => b.kind === 'Cloud').map((b) => b.id));

/** 'Local' | 'Browser' | 'Cloud' for a brain id, or null. */
export const brainKind = (id) => brainById(id)?.kind || null;

/* The console's model switcher reads this list. */
export const PROVIDERS = BRAINS.map((b) => ({ id: b.id, label: b.label, note: `${b.vendor} · ${b.note}`, kind: b.kind, key: b.key }));

/** Drop private context for cloud brains; merge system messages into one
    leading message (WebLLM rejects a system prompt anywhere but first). */
export const forProvider = (id, messages) => {
  const kept = messages.filter((m) => !(m.private && CLOUD.has(id)));
  const sys = kept.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const rest = kept.filter((m) => m.role !== 'system').map(({ role, content }) => ({ role, content }));
  return sys ? [{ role: 'system', content: sys }, ...rest] : rest;
};

const status = {}; // id -> { ok, detail, can? }
const down = {}; // id -> timestamp until which it is skipped after a failure
let prefer = 'auto';
let webllm = null;
let ollamaModel = '';
try {
  prefer = localStorage.getItem(K) || 'auto';
} catch {
  /* storage blocked */
}

export const brainState = () => ({ status: { ...status }, prefer, active: activeProvider() });
export function setPrefer(p) {
  prefer = p;
  if (p !== 'auto') delete down[p];
  try {
    localStorage.setItem(K, p);
  } catch {
    /* storage blocked */
  }
}

function timeout(ms) {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

/* ---------------------------------------------------------- detection --- */

async function detectOllama() {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: timeout(1500) });
    const j = await r.json();
    const m = (j.models || []).map((x) => x.name);
    if (!m.length) return { ok: false, detail: 'running, but no model pulled — run: ollama pull llama3.2' };
    ollamaModel = m.find((x) => /llama3|qwen|mistral|gemma|phi/i.test(x)) || m[0];
    return { ok: true, detail: ollamaModel };
  } catch {
    // From the published https site Ollama must also allow the origin.
    return { ok: false, detail: location.hostname === 'localhost' ? 'not running — start Ollama (optional)' : 'not reachable — run Ollama with OLLAMA_ORIGINS=https://rahatce98.github.io' };
  }
}

/* Chrome (Gemini Nano) and Edge (Phi-4-mini) share the Prompt API. Older
   builds used window.ai.languageModel. Some builds expose a stub that echoes
   the prompt, so a question with a known answer proves a real model. */
const LM = () => (typeof window === 'undefined' ? null : window.LanguageModel || window.ai?.languageModel || null);

async function browserWorks() {
  try {
    const s = await LM().create();
    const r = await s.prompt('What is 2 + 2? Reply with only the digit.');
    s.destroy?.();
    return /\b4\b/.test(r) && !/2 \+ 2|not available|echo/i.test(r);
  } catch {
    return false;
  }
}

async function detectBrowser() {
  const lm = LM();
  if (!lm) return { ok: false, detail: isEdge ? 'turn on edge://flags “Prompt API for Phi mini”' : 'needs Chrome 138+ desktop' };
  try {
    const a = await (lm.availability ? lm.availability() : lm.capabilities?.().then((c) => (c.available === 'readily' ? 'available' : c.available)));
    if (a === 'available') return (await browserWorks()) ? { ok: true, detail: brainById('chrome').vendor } : { ok: false, detail: 'API present but no real model' };
    if (a === 'downloadable' || a === 'downloading' || a === 'after-download') return { ok: false, detail: 'free on-device model — say “enable browser ai”', can: true };
    return { ok: false, detail: `model ${a}` };
  } catch {
    return { ok: false, detail: 'unavailable' };
  }
}

async function detectPollinations() {
  try {
    const c = sessionStorage.getItem('rh-jv-poll');
    if (c) return JSON.parse(c);
  } catch {
    /* storage blocked */
  }
  try {
    const t0 = performance.now();
    const text = await callPollinations([{ role: 'user', content: 'Reply with the single word: ready' }], 12000, 1);
    const r = { ok: /\w/.test(text), detail: `${Math.round(performance.now() - t0)} ms` };
    try {
      sessionStorage.setItem('rh-jv-poll', JSON.stringify(r));
    } catch {
      /* storage blocked */
    }
    return r;
  } catch (e) {
    return { ok: false, detail: String(e.message || e).slice(0, 60) };
  }
}

/* The owner's Apps Script bridge holds the AI keys server-side, so every
   browser and device gets the keyed brains with no setup. */
const viaBridge = new Set(); // brain ids the bridge can serve
async function detectBridge() {
  const s = await bridgeStatus();
  viaBridge.clear();
  if (s.unauth) return { ok: false, detail: 'awaiting one-time authorisation' };
  if (!s.ok) return { ok: false, detail: s.error || 'unreachable' };
  (s.brains || []).forEach((id) => viaBridge.add(id));
  return s.ai?.length ? { ok: true, detail: `${s.ai.length} keys server-side` } : { ok: false, detail: 'no key stored on the bridge' };
}
const bridged = (b) => b.key && !getKey(b.key) && viaBridge.has(b.id);

/* A keyed vendor is checked once with its free model-list endpoint. */
const vendorProbe = {};
async function probeVendor(kind) {
  const key = getKey(kind);
  if (!key) return { ok: false, detail: 'no key — say “add keys”' };
  if (vendorProbe[kind]?.key === key) return vendorProbe[kind].r;
  const url = { groq: 'https://api.groq.com/openai/v1/models', unikey: 'https://www.getunikey.ai/v1/models', gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/models', openrouter: 'https://openrouter.ai/api/v1/key' }[kind];
  let r;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: timeout(8000) });
    r = res.ok ? { ok: true, detail: 'key ok' } : { ok: false, detail: res.status === 401 || res.status === 403 ? 'key rejected' : `HTTP ${res.status}` };
  } catch {
    // Network blips shouldn't disable a brain; the call itself will fall back.
    r = { ok: true, detail: 'key stored (probe offline)' };
  }
  vendorProbe[kind] = { key, r };
  return r;
}

function detectWebllm() {
  if (webllm) return { ok: true, detail: WEBLLM_MODEL };
  return navigator.gpu ? { ok: false, detail: 'available — say “load local model”', can: true } : { ok: false, detail: 'needs WebGPU' };
}

/** Probe every brain; `onStep(id, result)` fires as each settles. */
export async function detect(onStep, { local = false, owner = false } = {}) {
  void owner;
  status.bridge = online() ? await detectBridge() : { ok: false, detail: 'offline' };
  onStep?.('bridge', status.bridge);
  const kinds = [...new Set(BRAINS.filter((b) => b.key).map((b) => b.key))];
  const vendors = Object.fromEntries(await Promise.all(kinds.map(async (k) => [k, online() ? await probeVendor(k) : getKey(k) ? { ok: true, detail: 'key stored (offline now)' } : { ok: false, detail: 'no key — say “add keys”' }])));
  for (const b of BRAINS.filter((x) => x.key)) {
    status[b.id] = keyedStatus(b, vendors[b.key]);
    onStep?.(b.id, status[b.id]);
  }
  // Probing localhost can trigger a local-network permission prompt, so
  // Ollama is only checked for the owner or after "use ollama".
  const jobs = {
    ollama: local ? detectOllama : async () => ({ ok: false, detail: 'say “use ollama” to check this computer' }),
    chrome: detectBrowser,
    // The bridge is the owner's own Apps Script — visitors never need it, so
    // it is only contacted in an unlocked owner session.
    webllm: async () => detectWebllm(),
    // The anonymous tier is a last resort; don't spend a request on it when
    // a keyed brain is already available.
    pollinations: !online() ? async () => ({ ok: false, detail: 'offline' }) : keyKinds().length ? async () => ({ ok: true, detail: 'last-resort fallback' }) : detectPollinations,
  };
  await Promise.all(
    Object.entries(jobs).map(async ([id, fn]) => {
      status[id] = await fn();
      onStep?.(id, status[id]);
    }),
  );
  return brainState();
}

/** Re-check keyed brains only (after keys are pasted). */
export async function refreshKeyed() {
  for (const k of Object.keys(vendorProbe)) delete vendorProbe[k];
  const kinds = [...new Set(BRAINS.filter((b) => b.key).map((b) => b.key))];
  const vendors = Object.fromEntries(await Promise.all(kinds.map(async (k) => [k, await probeVendor(k)])));
  for (const b of BRAINS.filter((x) => x.key)) status[b.id] = keyedStatus(b, vendors[b.key]);
  if (status.pollinations && keyKinds().length) status.pollinations = { ok: true, detail: 'last-resort fallback' };
  return brainState();
}

/* A key on this device wins (direct, streamed); otherwise the bridge serves it. */
function keyedStatus(b, direct) {
  if (direct?.ok) return direct;
  if (viaBridge.has(b.id) && online()) return { ok: true, detail: 'via your cloud bridge' };
  return direct;
}

export const available = () => BRAINS.filter((b) => status[b.id]?.ok && (online() || !CLOUD.has(b.id))).map((b) => b.id);
function order() {
  const now = Date.now();
  const ranked = available().filter((id) => !(down[id] > now));
  // Brains that failed recently go to the back rather than vanishing.
  const cooling = available().filter((id) => down[id] > now);
  const all = [...ranked, ...cooling];
  if (prefer !== 'auto' && status[prefer]?.ok) return [prefer, ...all.filter((x) => x !== prefer)];
  return all;
}
export const activeProvider = () => order()[0] || null;

/** Voice / text brain switching. Returns the brain now in front, or null. */
export function switchBrain(to) {
  const av = available();
  if (!av.length) return null;
  if (to === 'auto') {
    setPrefer('auto');
    return brainById(activeProvider());
  }
  if (to && to !== 'next') {
    const b = BRAINS.find((x) => x.id === to) || BRAINS.find((x) => x.alias.test(to) || x.label.toLowerCase().includes(to));
    if (!b) return null;
    if (!status[b.id]?.ok) return { ...b, unavailable: status[b.id]?.detail || 'not available' };
    setPrefer(b.id);
    return b;
  }
  const cur = activeProvider();
  const next = av[(av.indexOf(cur) + 1) % av.length];
  setPrefer(next);
  return brainById(next);
}

/* -------------------------------------------------------------- calls --- */

/* Reasoning models sometimes wrap private thoughts in <think>…</think>;
   those never reach the screen or the speaker. */
function thinkFilter(onToken) {
  let buf = '';
  let inThink = false;
  let out = '';
  return {
    push(t) {
      buf += t;
      for (;;) {
        if (inThink) {
          const e = buf.indexOf('</think>');
          if (e < 0) return;
          buf = buf.slice(e + 8);
          inThink = false;
        } else {
          const s = buf.indexOf('<think>');
          if (s < 0) {
            // hold back a partial "<thi" at the end
            const keep = buf.lastIndexOf('<');
            const safe = keep >= 0 && buf.length - keep < 7 ? buf.slice(0, keep) : buf;
            if (safe) {
              out += safe;
              onToken?.(safe, out);
            }
            buf = buf.slice(safe.length);
            return;
          }
          const pre = buf.slice(0, s);
          if (pre) {
            out += pre;
            onToken?.(pre, out);
          }
          buf = buf.slice(s + 7);
          inThink = true;
        }
      }
    },
    end() {
      if (!inThink && buf) {
        out += buf;
        onToken?.(buf, out);
      }
      buf = '';
      return out;
    },
  };
}

/** OpenAI-compatible streaming call. Throws before the first token on failure. */
async function streamOpenAI(url, key, model, messages, onToken, extra = {}) {
  // A brain that hasn't said its first word in FIRST_MS hands over to the
  // next one; once words flow, it gets the full minute.
  const ctl = new AbortController();
  let timer = setTimeout(() => ctl.abort(), extra.firstMs || FIRST_MS);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...(extra.headers || {}) },
    body: JSON.stringify({ model, messages, stream: true, temperature: 0.5, ...(extra.body || {}) }),
    signal: ctl.signal,
  }).catch((e) => {
    throw new Error(ctl.signal.aborted ? 'too slow to start' : e.message || 'network');
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j.error?.message || j.message || msg;
    } catch {
      /* not JSON */
    }
    throw Object.assign(new Error(String(msg).slice(0, 140)), { status: res.status });
  }
  const f = thinkFilter(onToken);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let pending = '';
  let got = false;
  for (;;) {
    let chunk;
    try {
      chunk = await reader.read();
    } catch (e) {
      if (got) break; // cut off mid-answer: keep what arrived
      throw new Error(ctl.signal.aborted ? 'too slow to start' : e.message || 'stream broke');
    }
    const { value, done } = chunk;
    if (done) break;
    pending += dec.decode(value, { stream: true });
    const lines = pending.split('\n');
    pending = lines.pop();
    for (const ln of lines) {
      const d = ln.replace(/^data:\s*/, '').trim();
      if (!d || d === '[DONE]' || !ln.startsWith('data:')) continue;
      let j;
      try {
        j = JSON.parse(d);
      } catch {
        continue; // keep-alive or partial frame
      }
      if (j.error) {
        if (!got) throw new Error(j.error.message || 'stream error');
        break;
      }
      const t = j.choices?.[0]?.delta?.content;
      if (t) {
        if (!got) {
          clearTimeout(timer);
          timer = setTimeout(() => ctl.abort(), 60000);
        }
        got = true;
        f.push(t);
      }
    }
  }
  clearTimeout(timer);
  const text = f.end().trim();
  if (!text) throw new Error('empty reply');
  return text;
}

async function callPollinations(messages, ms = 45000, tries = 2) {
  let r;
  for (let i = 0; i < tries; i++) {
    try {
      r = await fetch(POLL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'openai', messages }), signal: timeout(ms) });
    } catch (e) {
      r = { ok: false, status: 0, err: e };
    }
    if (r.ok || ![0, 429, 500, 502, 503].includes(r.status)) break;
    await new Promise((res) => setTimeout(res, 900 * (i + 1)));
  }
  if (!r.ok) throw new Error(r.status === 401 ? 'anonymous tier closed to new prompts' : r.status === 429 ? 'free tier busy' : r.status ? `HTTP ${r.status}` : 'network');
  const j = await r.json();
  const t = j.choices?.[0]?.message?.content;
  if (!t) throw new Error('empty reply');
  return t;
}

async function callOllama(messages) {
  const r = await fetch(`${OLLAMA}/api/chat`, { method: 'POST', body: JSON.stringify({ model: ollamaModel, messages, stream: false }), signal: timeout(90000) });
  const j = await r.json();
  if (!j.message?.content) throw new Error(j.error || 'empty reply');
  return j.message.content;
}

async function callBrowser(messages, onToken) {
  const sys = messages.find((m) => m.role === 'system')?.content;
  const s = await LM().create(sys ? { initialPrompts: [{ role: 'system', content: sys.slice(0, 4000) }] } : {});
  try {
    const turns = messages.filter((m) => m.role !== 'system');
    const last = turns.pop();
    const ctx = turns.slice(-6).map((m) => `${m.role}: ${m.content}`).join('\n');
    const prompt = (ctx ? ctx + '\n' : '') + last.content;
    if (s.promptStreaming && onToken) {
      let out = '';
      for await (const chunk of s.promptStreaming(prompt)) {
        // Older builds yield the whole text so far, newer ones yield deltas.
        const delta = chunk.startsWith(out) ? chunk.slice(out.length) : chunk;
        out += delta;
        if (delta) onToken(delta, out);
      }
      return out;
    }
    return await s.prompt(prompt);
  } finally {
    s.destroy?.();
  }
}

async function callWebllm(messages, onToken) {
  if (!onToken) return (await webllm.chat.completions.create({ messages, temperature: 0.4 })).choices[0].message.content;
  let out = '';
  const chunks = await webllm.chat.completions.create({ messages, temperature: 0.4, stream: true });
  for await (const c of chunks) {
    const t = c.choices[0]?.delta?.content || '';
    out += t;
    if (t) onToken(t, out);
  }
  return out;
}

async function callBridge(messages, brain) {
  try {
    const j = await bridge({ a: 'ai', messages, pin: bridgePin, brain });
    return j.text;
  } catch (e) {
    // The bridge already tried its whole chain — don't ask it again per brain.
    throw Object.assign(e, { bridge: true });
  }
}
let bridgePin = '';
export const setBridgePin = (p) => (bridgePin = p || '');

async function callBrain(b, messages, onToken) {
  // A brain the user picked by name gets longer to start thinking.
  const firstMs = prefer === b.id ? 35000 : FIRST_MS;
  if (bridged(b)) {
    const t = await callBridge(messages, b.id);
    onToken?.(t, t);
    return t;
  }
  if (b.key) {
    const key = getKey(b.key);
    if (!key) throw new Error('no key');
    if (b.models) {
      // One vendor, several models: the first that is not overloaded wins.
      let last;
      for (const m of b.models) {
        try {
          return await streamOpenAI(EP[b.key], key, m, messages, onToken, { firstMs });
        } catch (e) {
          last = e;
          if (e.status === 401 || e.status === 403) break;
        }
      }
      throw last;
    }
    const extra = { firstMs, ...(b.key === 'groq' && /qwen/.test(b.model) ? { body: { reasoning_effort: 'none' } } : b.key === 'openrouter' ? { headers: { 'X-Title': 'JARVIS' } } : {}) };
    try {
      return await streamOpenAI(EP[b.key], key, b.model, messages, onToken, extra);
    } catch (e) {
      // Some models reject reasoning_effort — retry plain once.
      if (extra.body && e.status === 400) return streamOpenAI(EP[b.key], key, b.model, messages, onToken, { firstMs });
      throw e;
    }
  }
  const once = async (p) => {
    const t = await p;
    onToken?.(t, t);
    return t;
  };
  if (b.id === 'chrome') return callBrowser(messages, onToken);
  if (b.id === 'webllm') return callWebllm(messages, onToken);
  if (b.id === 'ollama') return once(callOllama(messages));
  if (b.id === 'bridge') return once(callBridge(messages, ''));
  if (b.id === 'pollinations') return once(callPollinations(messages));
  throw new Error('unknown brain');
}

/**
 * Ask the best available brain; falls through the chain on any failure.
 * `opts.onToken(delta, full)` streams; `opts.onTry(id)` fires per attempt;
 * `opts.onReset()` fires when a brain failed mid-answer and the next restarts.
 */
export async function think(messages, opts = {}) {
  const o = typeof opts === 'function' ? { onTry: opts } : opts;
  const errors = [];
  const tried = new Set();
  const attempt = async (id) => {
    tried.add(id);
    o.onTry?.(id);
    let started = false;
    const t0 = performance.now();
    const text = await callBrain(brainById(id), forProvider(id, messages), o.onToken && ((d, full) => ((started = true), o.onToken(d, full))));
    delete down[id];
    return { text: text.trim(), provider: id, label: brainById(id).label, ms: Math.round(performance.now() - t0), started };
  };
  let bridgeDead = false;
  for (const id of order()) {
    if (bridgeDead && (id === 'bridge' || bridged(brainById(id)))) continue;
    try {
      return await attempt(id);
    } catch (e) {
      errors.push(`${brainById(id).label}: ${e.message || e}`);
      down[id] = Date.now() + (e.status === 401 || e.status === 403 ? 3600e3 : 60e3);
      if (e.bridge) {
        bridgeDead = true;
        for (const b of BRAINS) if (bridged(b) || b.id === 'bridge') down[b.id] = Date.now() + 45e3;
      }
      o.onReset?.(id, e);
    }
  }
  if (!tried.has('pollinations') && online()) {
    try {
      const r = await attempt('pollinations');
      status.pollinations = { ok: true, detail: 'recovered' };
      return r;
    } catch (e) {
      errors.push(`Pollinations: ${e.message || e}`);
    }
  }
  const err = new Error(errors.length ? `All models failed (${errors.join('; ')})` : 'No AI model reachable');
  err.offline = true;
  throw err;
}

/* -------------------------------------------------- speech-to-text (STT) --- */

/** Whisper on Groq — used when the browser has no speech recognition. */
export async function transcribe(blob, lang) {
  const key = getKey('groq');
  if (!key) throw new Error('no Groq key for speech');
  const fd = new FormData();
  fd.append('file', blob, 'speech.webm');
  fd.append('model', 'whisper-large-v3-turbo');
  if (lang) fd.append('language', lang.slice(0, 2));
  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd, signal: timeout(30000) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || `HTTP ${r.status}`);
  return (j.text || '').trim();
}

/* ------------------------------------------------------------ opt-ins --- */

export async function loadWebllm(onProgress) {
  if (webllm) return;
  if (!navigator.gpu) throw new Error('This browser has no WebGPU');
  const lib = await import(/* @vite-ignore */ 'https://esm.run/@mlc-ai/web-llm@0.2.85');
  webllm = await lib.CreateMLCEngine(WEBLLM_MODEL, { initProgressCallback: (p) => onProgress?.(p.text, p.progress) });
  status.webllm = { ok: true, detail: WEBLLM_MODEL };
}

/** Have Chrome / Edge download their free on-device model (needs a click). */
export async function loadChrome(onProgress) {
  const lm = LM();
  if (!lm) throw new Error(isEdge ? 'Enable edge://flags → “Prompt API for Phi mini”, then restart Edge' : 'This browser has no built-in model');
  const s = await lm.create({
    monitor(m) {
      m.addEventListener('downloadprogress', (e) => onProgress?.(`${BROWSER_LABEL} model ${Math.round(e.loaded * 100)}%`, e.loaded));
    },
  });
  s.destroy?.();
  if (!(await browserWorks())) throw new Error('this browser exposes the API without a real model');
  status.chrome = { ok: true, detail: brainById('chrome').vendor };
}
