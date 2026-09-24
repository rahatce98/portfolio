/* -----------------------------------------------------------------------------
 * On-device AI key store (bring-your-own-key).
 *
 * Keys are pasted by the owner once per device and kept in this browser's
 * localStorage only. They are sent to nothing but the provider they belong
 * to, directly, over HTTPS. None are in this bundle or the repository — a key
 * in a public site would be scraped within hours.
 *
 * Paste anything: a block of text, a .env, JSON — keys are recognised by
 * their prefix.
 * -------------------------------------------------------------------------- */

const K = 'rh-jv-keys';

export const KEY_KINDS = {
  unikey: { label: 'Unikey gateway', re: /^sk-(?!or-)[A-Za-z0-9]{32,80}$/, where: 'getunikey.ai' },
  groq: { label: 'Groq', re: /^gsk_[A-Za-z0-9]{40,80}$/, where: 'console.groq.com/keys' },
  gemini: { label: 'Google AI Studio', re: /^(AIza[\w-]{35}|AQ\.[\w-]{30,100})$/, where: 'aistudio.google.com/apikey' },
  openrouter: { label: 'OpenRouter', re: /^sk-or-v1-[a-f0-9]{40,90}$/, where: 'openrouter.ai/keys' },
  opencode: { label: 'OpenCode Zen', re: /^oc_sk_[\w-]{20,80}$/, where: 'opencode.ai/zen' },
};

const TOKEN = /(?:sk-or-v1-[a-f0-9]{40,90}|AQ\.[\w-]{30,100}|AIza[\w-]{35}|gsk_[A-Za-z0-9]{40,80}|oc_sk_[\w-]{20,80}|sk-[A-Za-z0-9]{32,80})/g;

let cache = null;
const bus = new EventTarget();

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(K) || '{}') || {};
  } catch {
    cache = {};
  }
  return cache;
}
function save(o) {
  cache = o;
  try {
    localStorage.setItem(K, JSON.stringify(o));
  } catch {
    /* storage blocked — keys live for this tab only */
  }
  bus.dispatchEvent(new Event('change'));
}

export const getKey = (kind) => load()[kind] || '';
export const keyKinds = () => Object.keys(load()).filter((k) => load()[k]);
export const onKeys = (fn) => (bus.addEventListener('change', fn), () => bus.removeEventListener('change', fn));

/** Find every recognisable key in free text. Returns { kind: key }. */
export function parseKeys(text) {
  const found = {};
  for (const tok of String(text || '').match(TOKEN) || []) {
    const kind = Object.keys(KEY_KINDS).find((k) => KEY_KINDS[k].re.test(tok));
    if (kind && !found[kind]) found[kind] = tok;
  }
  return found;
}

export function addKeys(found) {
  save({ ...load(), ...found });
  return keyKinds();
}

export function forgetKeys(kind) {
  if (!kind) return save({});
  const o = { ...load() };
  delete o[kind];
  save(o);
}

/** "sk-qy…ldm5" — enough to recognise, useless to anyone else. */
export const mask = (k) => (k ? `${k.slice(0, 5)}…${k.slice(-4)}` : '');
