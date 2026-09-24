import { pageSections, sections, projects } from '../data/site';
import { LABS } from '../sections/Lab';
import { score, trackOpen } from '../sections/Tools';
import { pipeVelocity, pipeFlow, convert } from '../jarvis/engineering';
import { calc } from '../jarvis/calc';
import { webSearch } from '../jarvis/web';
import { togglePin, pinStore } from './favorites';
import { historyStore, clearHistory, clock } from './history';
import { osStore } from './context';
import { installApp, pwaStore } from './pwa';
import { searchIndex, parseQuery, slug } from './searchIndex';

/* -----------------------------------------------------------------------------
 * Rahat OS action registry — the only door from a command to a side effect.
 *
 * Commands arrive as structured calls:
 *     { "tool": "openTool", "arguments": { "id": "rfi-survey" } }
 * from the deterministic parser, the palette, result buttons, or a language
 * model. `execute()` validates the call against the action's schema, refuses
 * anything unknown, routes confirm-gated actions through a confirmation card,
 * and only then runs it. A model can therefore *ask* for an action but never
 * touch the DOM, storage or network directly.
 *
 * Schema field: { type: 'string'|'number'|'boolean', required?, enum?, max? }
 * Reply shape:   { text, list?, sources?, results?, buttons?, confirm?, error?,
 *                  summarize?, show? }   (show = open the J.A.R.V.I.S. panel)
 * -------------------------------------------------------------------------- */

const str = (required = true, max = 400) => ({ type: 'string', required, max });
const numf = (required = true) => ({ type: 'number', required });

function openTab(url) {
  // Not using the 'noopener' feature: with it, window.open always returns null
  // and a blocked pop-up is indistinguishable from success. Cutting `opener`
  // straight away gives the same protection.
  const w = window.open(url, '_blank');
  if (w) {
    try {
      w.opener = null;
    } catch {
      /* cross-origin already */
    }
  }
  return !!w;
}

const findSection = (q) => {
  const s = String(q).toLowerCase().replace(/^the\s+/, '').trim();
  return (
    sections.find((x) => x.id === s || x.label.toLowerCase() === s) ||
    sections.find((x) => (x.aliases || []).includes(s)) ||
    sections.find((x) => x.label.toLowerCase().replace(/\./g, '').startsWith(s.replace(/\./g, '')) || x.id.startsWith(s))
  );
};

const results = (hits) => hits.map((h) => ({ key: h.key, type: h.type, title: h.title, desc: h.desc, hue: h.hue, action: h.action, prefill: h.prefill }));

export const ACTIONS = {
  /* ------------------------------------------------------- navigation --- */
  navigate: {
    label: 'Go to a section',
    schema: { section: str() },
    run({ section }, env) {
      const s = findSection(section);
      if (!s) return { text: `There’s no “${section}” section. Try: ${pageSections.filter((x) => x.nav !== false).map((x) => x.label).join(', ')}.`, error: true };
      if (s.event) return ACTIONS.openVault.run({}, env);
      env.scrollTo(s.id);
      if (history.replaceState) history.replaceState(null, '', `#${s.id}`);
      return { text: `${s.label}.` };
    },
  },
  openTool: {
    label: 'Open a tool from the index',
    schema: { id: str() },
    run({ id }, env) {
      const t = env.tools.find((x) => x.id === id) || env.tools.find((x) => x.name.toLowerCase() === String(id).toLowerCase());
      if (!t) return { text: `No tool with id “${id}” in the index.`, error: true };
      trackOpen(t.id);
      if (/#vault$/.test(t.url)) return ACTIONS.openVault.run({}, env);
      const offline = !osStore.get().online;
      if (!openTab(t.url)) return { text: `Your browser blocked the new tab — open ${t.name} here:`, sources: [{ title: t.name, url: t.url }], show: true };
      return { text: `Opening ${t.name}.${offline ? ' You’re offline, so it may not load until you reconnect.' : ''}` };
    },
  },
  openLab: {
    label: 'Open an engineering lab',
    schema: { id: { type: 'string', required: true, enum: LABS.map((l) => l.id) } },
    run({ id }) {
      const l = LABS.find((x) => x.id === id);
      window.dispatchEvent(new CustomEvent('rh-lab', { detail: id }));
      return { text: `Opening ${l.label}. Esc brings you back.` };
    },
  },
  openProject: {
    label: 'Show a portfolio project',
    schema: { id: str() },
    run({ id }, env) {
      const p = projects.find((x) => slug(x.title) === id) || projects.find((x) => slug(x.title).includes(slug(id)));
      if (!p) return { text: `No project matches “${id}”.`, error: true };
      env.scrollTo('projects');
      setTimeout(() => window.dispatchEvent(new CustomEvent('rh-project', { detail: slug(p.title) })), 350);
      return { text: `**${p.title}** — ${p.description}`, list: [`${p.category} · ${p.badge}`, `Role: ${p.role}`, `Tech: ${p.tech.join(', ')}`] };
    },
  },
  searchSite: {
    label: 'Search this site (sections, projects, labs, tools)',
    schema: { query: str() },
    run({ query }, env) {
      const { terms, typeHint } = parseQuery(query);
      const hits = searchIndex(env.index, terms || query, { context: env.context, pins: pinStore.get().ids, limit: 8, typeHint });
      if (!hits.length) return null; // caller decides whether to fall back to the web
      return { text: `${hits.length} match${hits.length > 1 ? 'es' : ''} on this site for “${terms || query}”:`, results: results(hits), show: true };
    },
  },
  webSearch: {
    label: 'Search the web (DuckDuckGo + Wikipedia)',
    schema: { query: str(), question: str(false) },
    needsNet: true,
    async run({ query, question }, env) {
      const tool = env.tools.map((t) => ({ t, sc: score(t, query) })).filter((x) => x.sc > 2).sort((a, b) => b.sc - a.sc)[0];
      const r = await webSearch(query);
      if (!r.length && tool) return { text: `Top match in your index: ${tool.t.name}.`, sources: [{ title: tool.t.name, url: tool.t.url }] };
      if (!r.length) return { text: `No free source had “${query}”.`, confirm: { title: 'Search Google instead?', detail: query, yes: () => (openTab(`https://www.google.com/search?q=${encodeURIComponent(query)}`), { text: 'Google is open.' }) } };
      const src = tool ? [{ title: `${tool.t.name} (your index)`, url: tool.t.url }, ...r] : r;
      return {
        text: `${r.length} results.`,
        sources: src.slice(0, 6),
        show: true,
        summarize: `Question: ${question || query}\nAnswer in 2-5 sentences from these search results only. If a result is the official site or documentation, name it.\n` + r.map((x, i) => `[${i + 1}] ${x.title} — ${x.snippet} (${x.url})`).join('\n'),
      };
    },
  },
  openUrl: {
    label: 'Open an external link',
    schema: { url: str(true, 2000) },
    confirm: ({ url }) => ({ title: 'Open this page?', detail: url }),
    validate: ({ url }) => /^https:\/\//i.test(url) || 'only https links',
    run: ({ url }) => (openTab(url) ? { text: `Opened ${new URL(url).host}.` } : { text: 'The browser blocked the tab:', sources: [{ title: url, url }] }),
  },

  /* ------------------------------------------------------ engineering --- */
  pipeVelocity: {
    label: 'Pipe velocity from flow and diameter (continuity, full bore)',
    schema: { diameter_mm: numf(), flow_lps: numf() },
    run(a) {
      const r = pipeVelocity(a);
      return { text: r.text, list: r.list, buttons: [{ label: 'Open Sewer Hydraulics lab', action: { tool: 'openLab', arguments: { id: 'pipe' } } }], show: true };
    },
  },
  pipeFlow: {
    label: 'Manning capacity of a circular pipe',
    schema: { diameter_mm: numf(), slope_pct: numf(), n: numf(false), depth_ratio: numf(false) },
    validate: (a) => (a.depth_ratio == null || (a.depth_ratio > 0 && a.depth_ratio <= 1)) || 'depth_ratio must be 0–1',
    run(a) {
      const r = pipeFlow(a);
      return { text: r.text, list: r.list, buttons: [{ label: 'Open Sewer Hydraulics lab', action: { tool: 'openLab', arguments: { id: 'pipe' } } }], show: true };
    },
  },
  convertUnits: {
    label: 'Convert engineering units',
    schema: { value: numf(), from: str(true, 30), to: str(true, 30) },
    run: (a) => ({ text: convert(a).text, show: true }),
  },
  calculate: {
    label: 'Evaluate an arithmetic expression (safe parser, no eval)',
    schema: { expression: str(true, 200) },
    run: ({ expression }) => ({ text: `${expression} = ${Number(calc(expression)).toLocaleString('en-US', { maximumFractionDigits: 10 })}`, show: true }),
  },

  /* ----------------------------------------------------- productivity --- */
  copyText: {
    label: 'Copy text to the clipboard',
    schema: { text: str(true, 5000) },
    async run({ text }) {
      await navigator.clipboard.writeText(text);
      return { text: `Copied ${text.length} characters.` };
    },
  },
  toggleFavorite: {
    label: 'Add or remove a quick tool',
    schema: { id: str() },
    run({ id }, env) {
      const t = env.tools.find((x) => x.id === id);
      if (!t) return { text: `No tool with id “${id}”.`, error: true };
      return { text: togglePin(t.id) ? `★ ${t.name} added to your quick tools.` : `${t.name} removed from your quick tools.` };
    },
  },
  showFavorites: {
    label: 'List quick tools',
    schema: {},
    run(_, env) {
      const favs = pinStore.get().ids.map((id) => env.tools.find((t) => t.id === id)).filter(Boolean);
      if (!favs.length) return { text: 'No quick tools yet. Star a tool in the Tools index, or say “favorite RFI”.', show: true };
      return { text: 'MY QUICK TOOLS', results: favs.map((t) => ({ key: `tool:${t.id}`, type: 'tool', title: t.name, desc: t.project || t.owner, action: { tool: 'openTool', arguments: { id: t.id } } })), show: true };
    },
  },
  showTools: {
    label: 'Show the tool index',
    schema: {},
    run(_, env) {
      env.scrollTo('tools');
      const favs = pinStore.get().ids.length;
      const n = env.tools.filter((t) => t.kind !== 'Bookmark').length;
      return { text: `${n} tools in the index${favs ? `, ${favs} starred` : ''}. Type to filter, or say “open <tool>”.` };
    },
  },
  addLink: {
    label: 'Save a link to the tool index or bookmarks (owner; asks first)',
    schema: { url: str(true, 2000), name: str(false, 80), bookmark: { type: 'boolean' } },
    validate: ({ url }) => /^https?:\/\//i.test(url) || 'only http(s) links',
    run: ({ url, name, bookmark }, env) => env.say(`add this ${bookmark ? 'bookmark' : 'tool'} ${url}${name ? ` as ${name}` : ''}`),
  },
  switchBrain: {
    label: 'Switch the AI model J.A.R.V.I.S. thinks with',
    schema: { to: str(false, 60) },
    run: ({ to }, env) => env.say(to ? `use ${to}` : 'switch brain'),
  },
  addTool: {
    label: 'Add a tool to the index (owner)',
    schema: {},
    run(_, env) {
      env.scrollTo('tools');
      setTimeout(() => window.dispatchEvent(new Event('rh-add-tool')), 350);
      return { text: 'Opening the add-tool form (owner PIN required).' };
    },
  },

  /* ----------------------------------------------------------- memory --- */
  showHistory: {
    label: 'Show recent commands',
    schema: {},
    run() {
      const h = historyStore.get().items.slice(0, 12);
      if (!h.length) return { text: 'No commands yet.', show: true };
      return { text: 'RECENT', results: h.map((x) => ({ key: `h:${x.at}`, type: 'history', title: x.text, desc: clock(x.at), rerun: x.text })), show: true };
    },
  },
  clearHistory: {
    label: 'Clear command history on this device',
    schema: {},
    confirm: () => ({ title: 'Clear command history?', detail: `${historyStore.get().items.length} commands on this device` }),
    run: () => (clearHistory(), { text: 'History cleared.' }),
  },

  /* ----------------------------------------------------------- system --- */
  setTheme: {
    label: 'Set the colour theme',
    schema: { mode: { type: 'string', required: true, enum: ['light', 'dark', 'toggle'] } },
    run({ mode }) {
      const cur = document.documentElement.getAttribute('data-theme') || 'dark';
      if (mode === 'toggle' || mode !== cur) window.dispatchEvent(new Event('rh-theme'));
      return { text: `${mode === 'toggle' ? (cur === 'dark' ? 'Light' : 'Dark') : mode[0].toUpperCase() + mode.slice(1)} theme.` };
    },
  },
  setMotion: {
    label: 'Reduce or restore motion',
    schema: { mode: { type: 'string', required: true, enum: ['reduce', 'system', 'toggle'] } },
    run({ mode }) {
      const on = document.documentElement.getAttribute('data-motion') === 'reduce';
      const reduce = mode === 'toggle' ? !on : mode === 'reduce';
      document.documentElement.toggleAttribute('data-motion', reduce);
      if (reduce) document.documentElement.setAttribute('data-motion', 'reduce');
      try {
        if (reduce) localStorage.setItem('rh-motion', 'reduce');
        else localStorage.removeItem('rh-motion');
      } catch {
        /* storage blocked */
      }
      window.dispatchEvent(new Event('rh-motion'));
      return { text: reduce ? 'Reduced motion on — animations are calmed on this device.' : 'Motion follows your system setting again.' };
    },
  },
  openVault: {
    label: 'Open the encrypted vault',
    schema: {},
    run: () => (window.dispatchEvent(new Event('rh-vault')), { text: 'Opening the vault. Your master password never leaves this device.' }),
  },
  openPalette: {
    label: 'Open the command palette',
    schema: { query: str(false, 120) },
    run: ({ query }) => (window.dispatchEvent(new CustomEvent('rh-palette', { detail: query || '' })), { text: 'Command palette.' }),
  },
  openJarvis: {
    label: 'Open the J.A.R.V.I.S. panel',
    schema: {},
    run: () => (window.dispatchEvent(new Event('rh-jarvis')), { text: 'Here.' }),
  },
  showShortcuts: {
    label: 'Show keyboard shortcuts',
    schema: {},
    run: () => (window.dispatchEvent(new Event('rh-shortcuts')), { text: 'Keyboard map.' }),
  },
  installApp: {
    label: 'Install Rahat OS as an app',
    schema: {},
    async run() {
      const r = await installApp();
      if (r.ok) return { text: 'Installing Rahat OS.' };
      if (r.reason === 'installed') return { text: 'Rahat OS is already installed on this device.' };
      if (r.reason === 'dismissed') return { text: 'Install cancelled.' };
      return { text: pwaStore.get().sw === 'active' ? 'Your browser hasn’t offered installation yet — use its menu → “Install Rahat OS” (Chrome / Edge), or “Add to Home Screen” (Safari, Android).' : 'Installation needs the published site (https) in Chrome, Edge or Android.', show: true };
    },
  },
};

/** Names + one-line descriptions, handed to the model so it knows what exists. */
export const actionCatalog = () =>
  Object.entries(ACTIONS)
    .map(([k, a]) => `${k}(${Object.entries(a.schema).map(([n, f]) => `${n}${f.required ? '' : '?'}: ${f.enum ? f.enum.join('|') : f.type}`).join(', ')}) — ${a.label}${a.confirm ? ' [asks user first]' : ''}`)
    .join('\n');

/** Validate { tool, arguments } against the registry. Coerces numeric strings. */
export function validate(call) {
  if (!call || typeof call !== 'object') return { ok: false, error: 'not an action object' };
  const a = ACTIONS[call.tool];
  if (!a) return { ok: false, error: `unknown action “${call.tool}”` };
  const input = call.arguments && typeof call.arguments === 'object' ? call.arguments : {};
  const args = {};
  for (const [k, f] of Object.entries(a.schema)) {
    let v = input[k];
    if (v == null || v === '') {
      if (f.required) return { ok: false, error: `${call.tool}: “${k}” is required` };
      continue;
    }
    if (f.type === 'number' && typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) v = Number(v);
    if (f.type === 'number' && !(typeof v === 'number' && Number.isFinite(v))) return { ok: false, error: `${call.tool}: “${k}” must be a number` };
    if (f.type === 'string' && typeof v !== 'string') return { ok: false, error: `${call.tool}: “${k}” must be text` };
    if (f.type === 'string' && f.max && v.length > f.max) return { ok: false, error: `${call.tool}: “${k}” is too long` };
    if (f.enum && !f.enum.includes(v)) return { ok: false, error: `${call.tool}: “${k}” must be one of ${f.enum.join(', ')}` };
    args[k] = v;
  }
  const extra = a.validate?.(args);
  if (extra !== undefined && extra !== true) return { ok: false, error: `${call.tool}: ${extra}` };
  return { ok: true, action: a, args };
}

/**
 * Validate and run. Offline-only guards and confirmations happen here, so every
 * caller — parser, palette, buttons, model — gets identical safety.
 */
export async function execute(call, env) {
  const v = validate(call);
  if (!v.ok) return { text: `I can’t do that: ${v.error}.`, error: true };
  if (v.action.needsNet && !osStore.get().online)
    return { text: 'That needs the internet and Rahat OS is in offline mode. Navigation, tools, calculators and history still work.', error: true, offline: true };
  if (v.action.confirm && !call.confirmed) {
    const c = v.action.confirm(v.args);
    return { text: `${v.action.label} — waiting for your OK.`, confirm: { ...c, yes: () => v.action.run(v.args, env) }, show: true };
  }
  return v.action.run(v.args, env);
}
