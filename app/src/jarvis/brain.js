/* -----------------------------------------------------------------------------
 * J.A.R.V.I.S. brain — free language-model providers with automatic fallback.
 *
 * Every provider here costs $0 and needs no key, card or account:
 *   ollama      a local Ollama server (open-source models on this machine)
 *   chrome      Chrome's built-in on-device model (window.LanguageModel)
 *   pollinations  Pollinations anonymous tier (gen.pollinations.ai) — tried
 *               opportunistically; it often demands a key for new prompts
 *   bridge      the owner's Apps Script bridge calling free-tier Gemini / Groq /
 *               Pollinations keys server-side (keys never reach the browser)
 *   webllm      open-source model run in the browser on WebGPU (opt-in, ~1 GB
 *               one-time download, then fully offline)
 * If none answer, the console still works: the tool router is local.
 *
 * No secrets live in this file — none of these providers use one.
 * -------------------------------------------------------------------------- */

import { bridge, bridgeStatus } from './memory';

const POLL = 'https://gen.pollinations.ai/v1/chat/completions';
const OLLAMA = 'http://localhost:11434';
const WEBLLM_MODEL = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';
const K = 'rh-jv-brain';

export const PROVIDERS = [
  { id: 'ollama', label: 'Ollama (local)', note: 'open-source model on this computer' },
  { id: 'chrome', label: 'Chrome on-device', note: 'Gemini Nano built into Chrome' },
  { id: 'bridge', label: 'Cloud (bridge)', note: 'free-tier Gemini / Groq via the owner’s Apps Script' },
  { id: 'pollinations', label: 'Pollinations', note: 'free anonymous cloud tier' },
  { id: 'webllm', label: 'WebLLM', note: 'Qwen 2.5 1.5B in this tab (WebGPU)' },
];

const status = {}; // id -> { ok, detail, model }
let prefer = 'auto';
let webllm = null;
let ollamaModel = '';
try {
  prefer = localStorage.getItem(K) || 'auto';
} catch {
  /* storage blocked */
}

export const brainState = () => ({ status: { ...status }, prefer });
export function setPrefer(p) {
  prefer = p;
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
    return { ok: true, detail: ollamaModel, model: ollamaModel };
  } catch {
    return { ok: false, detail: 'not running (optional)' };
  }
}

// Some Chromium builds expose LanguageModel as a stub that echoes the prompt.
// Ask a question with a known answer so a stub is never reported as working.
async function chromeWorks() {
  try {
    const s = await window.LanguageModel.create();
    const r = await s.prompt('What is 2 + 2? Reply with only the digit.');
    s.destroy?.();
    return /\b4\b/.test(r) && !/2 \+ 2|not available|echo/i.test(r);
  } catch {
    return false;
  }
}

async function detectChrome() {
  const LM = window.LanguageModel;
  if (!LM?.availability) return { ok: false, detail: 'not in this browser' };
  try {
    const a = await LM.availability();
    if (a === 'available') return (await chromeWorks()) ? { ok: true, detail: 'Gemini Nano' } : { ok: false, detail: 'API present but no real model (stub)' };
    if (a === 'downloadable' || a === 'downloading') return { ok: false, detail: 'free on-device model — say “enable chrome ai”', can: true };
    return { ok: false, detail: `model ${a}` };
  } catch {
    return { ok: false, detail: 'unavailable' };
  }
}

async function detectPollinations() {
  // One tiny real completion, cached for the session, proves the path end to end.
  try {
    const c = sessionStorage.getItem('rh-jv-poll');
    if (c) return JSON.parse(c);
  } catch {
    /* storage blocked */
  }
  try {
    const t0 = performance.now();
    const text = await callPollinations([{ role: 'user', content: 'Reply with the single word: ready' }], 12000);
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

async function detectBridge() {
  const s = await bridgeStatus();
  if (s.unauth) return { ok: false, detail: 'awaiting one-time authorisation' };
  if (!s.ok) return { ok: false, detail: s.error || 'unreachable' };
  return s.ai?.length ? { ok: true, detail: s.ai.join(' → ') } : { ok: false, detail: 'no free key stored — owner: “set ai key”' };
}

function detectWebllm() {
  if (webllm) return { ok: true, detail: WEBLLM_MODEL };
  return navigator.gpu ? { ok: false, detail: 'available — say “load local model”', can: true } : { ok: false, detail: 'needs WebGPU' };
}

/** Probe every provider; `onStep(id, result)` fires as each one settles. */
export async function detect(onStep, { local = false } = {}) {
  // Probing localhost can trigger Chrome's local-network permission prompt, so
  // Ollama is only checked for the owner or after "use ollama".
  const jobs = {
    ollama: local ? detectOllama : async () => ({ ok: false, detail: 'say “use ollama” to check this computer' }),
    chrome: detectChrome,
    pollinations: detectPollinations,
    bridge: detectBridge,
    webllm: async () => detectWebllm(),
  };
  await Promise.all(
    Object.entries(jobs).map(async ([id, fn]) => {
      status[id] = await fn();
      onStep?.(id, status[id]);
    }),
  );
  return brainState();
}

export const activeProvider = () => order()[0] || null;
function order() {
  const ranked = ['bridge', 'ollama', 'chrome', 'webllm', 'pollinations'].filter((id) => status[id]?.ok);
  if (prefer !== 'auto' && status[prefer]?.ok) return [prefer, ...ranked.filter((x) => x !== prefer)];
  return ranked;
}

/* -------------------------------------------------------------- calls --- */

async function callPollinations(messages, ms = 45000, tries = 2) {
  let r;
  for (let i = 0; i < tries; i++) {
    try {
      r = await fetch(POLL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'openai', messages }),
        signal: timeout(ms),
      });
    } catch (e) {
      r = { ok: false, status: 0, err: e };
    }
    // The anonymous tier answers 401/429 when it is busy; a short back-off
    // usually clears it.
    if (r.ok || ![0, 429, 500, 502, 503].includes(r.status)) break;
    await new Promise((res) => setTimeout(res, 900 * (i + 1)));
  }
  if (!r.ok) throw new Error(r.status === 401 ? 'anonymous tier closed to new prompts right now' : r.status === 429 ? 'free tier busy' : r.status ? `HTTP ${r.status}` : 'network');
  const j = await r.json();
  const t = j.choices?.[0]?.message?.content;
  if (!t) throw new Error('empty reply');
  return t;
}

async function callOllama(messages) {
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    body: JSON.stringify({ model: ollamaModel, messages, stream: false }),
    signal: timeout(90000),
  });
  const j = await r.json();
  if (!j.message?.content) throw new Error(j.error || 'empty reply');
  return j.message.content;
}

async function callChrome(messages) {
  const sys = messages.find((m) => m.role === 'system')?.content;
  const s = await window.LanguageModel.create(sys ? { initialPrompts: [{ role: 'system', content: sys }] } : {});
  try {
    const turns = messages.filter((m) => m.role !== 'system');
    const last = turns.pop();
    const ctx = turns.map((m) => `${m.role}: ${m.content}`).join('\n');
    return await s.prompt((ctx ? ctx + '\n' : '') + last.content);
  } finally {
    s.destroy?.();
  }
}

async function callWebllm(messages) {
  const r = await webllm.chat.completions.create({ messages, temperature: 0.4 });
  return r.choices[0].message.content;
}

async function callBridge(messages) {
  const j = await bridge({ a: 'ai', messages });
  return j.text;
}

const CALL = { bridge: callBridge, pollinations: callPollinations, ollama: callOllama, chrome: callChrome, webllm: callWebllm };

/** Ask the best available model; falls through the chain on any failure. */
export async function think(messages, onTry) {
  const errors = [];
  for (const id of order()) {
    onTry?.(id);
    try {
      const text = await CALL[id](messages);
      return { text: text.trim(), provider: id };
    } catch (e) {
      errors.push(`${id}: ${e.message || e}`);
    }
  }
  // Last chance: the cloud tier may have been down only during boot.
  if (!order().includes('pollinations')) {
    onTry?.('pollinations');
    try {
      const text = await callPollinations(messages);
      status.pollinations = { ok: true, detail: 'recovered' };
      return { text: text.trim(), provider: 'pollinations' };
    } catch (e) {
      errors.push(`pollinations: ${e.message || e}`);
    }
  }
  const err = new Error(errors.length ? `All models failed (${errors.join('; ')})` : 'No AI model reachable');
  err.offline = true;
  throw err;
}

/** Opt-in: download and start the in-browser model. */
export async function loadWebllm(onProgress) {
  if (webllm) return;
  if (!navigator.gpu) throw new Error('This browser has no WebGPU');
  const lib = await import(/* @vite-ignore */ 'https://esm.run/@mlc-ai/web-llm@0.2.85');
  webllm = await lib.CreateMLCEngine(WEBLLM_MODEL, { initProgressCallback: (p) => onProgress?.(p.text, p.progress) });
  status.webllm = { ok: true, detail: WEBLLM_MODEL };
}

/** Opt-in: have Chrome download its free on-device model (needs a click). */
export async function loadChrome(onProgress) {
  const LM = window.LanguageModel;
  if (!LM) throw new Error('This browser has no built-in model');
  const s = await LM.create({
    monitor(m) {
      m.addEventListener('downloadprogress', (e) => onProgress?.(`Gemini Nano ${Math.round(e.loaded * 100)}%`, e.loaded));
    },
  });
  s.destroy?.();
  if (!(await chromeWorks())) throw new Error('this browser exposes the API without a real model');
  status.chrome = { ok: true, detail: 'Gemini Nano' };
}
