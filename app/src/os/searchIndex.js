import { sections, projects } from '../data/site';
import { LABS } from '../sections/Lab';
import { hay as toolHay, hostOf, hueOf } from '../sections/Tools';

/* -----------------------------------------------------------------------------
 * Universal search index — one list, one scorer, used by the command palette
 * and by J.A.R.V.I.S. ("open …", "search …", "show my … project").
 *
 * Nothing here is a second registry: sections and projects come from
 * data/site.js, labs from sections/Lab.jsx, tools from the live tool index
 * (tools.json + bookmarks.json + the owner API). Each entry carries a
 * structured action ({ tool, arguments }) that os/actions.js validates and runs.
 * -------------------------------------------------------------------------- */

export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const TYPES = {
  section: { label: 'Section', weight: 1.25 },
  project: { label: 'Project', weight: 1.2 },
  lab: { label: 'Lab', weight: 1.15 },
  action: { label: 'Action', weight: 1.1 },
  tool: { label: 'Tool', weight: 1 },
  command: { label: 'Command', weight: 0.85 },
};

/** Built-in system actions, surfaced in the palette and by name to J.A.R.V.I.S. */
const SYSTEM = [
  { id: 'jarvis', title: 'Ask J.A.R.V.I.S.', desc: 'Open the assistant', words: 'jarvis ai assistant chat ask voice', action: { tool: 'openJarvis', arguments: {} }, hint: 'Ctrl J' },
  { id: 'theme', title: 'Toggle light / dark', desc: 'Switch the colour theme', words: 'theme dark light mode appearance', action: { tool: 'setTheme', arguments: { mode: 'toggle' } }, hint: 'T' },
  { id: 'motion', title: 'Reduce motion', desc: 'Calm animations on this device', words: 'reduced motion animation accessibility calm performance', action: { tool: 'setMotion', arguments: { mode: 'toggle' } } },
  { id: 'vault', title: 'Open Vault', desc: 'Encrypted passwords & codes', words: 'vault password passcode secure encrypted', action: { tool: 'openVault', arguments: {} } },
  { id: 'install', title: 'Install Rahat OS', desc: 'Add the app to this device — works offline', words: 'install app pwa desktop offline', action: { tool: 'installApp', arguments: {} } },
  { id: 'favs', title: 'My quick tools', desc: 'Favourite tools', words: 'favorites favourites quick tools pinned starred', action: { tool: 'showFavorites', arguments: {} } },
  { id: 'history', title: 'Command history', desc: 'Recent commands on this device', words: 'history recent commands', action: { tool: 'showHistory', arguments: {} } },
  { id: 'add', title: 'Add a tool…', desc: 'New index entry (owner)', words: 'add tool new link create', action: { tool: 'addTool', arguments: {} }, hint: 'N' },
  { id: 'keys', title: 'Keyboard shortcuts', desc: 'Every key, on one card', words: 'keyboard shortcuts keys help hotkeys', action: { tool: 'showShortcuts', arguments: {} }, hint: '?' },
];

export function buildIndex({ tools = [], commands = [] } = {}) {
  const out = [];
  for (const s of sections)
    out.push({
      key: `section:${s.id}`,
      type: 'section',
      title: s.label,
      desc: s.event ? 'Encrypted passwords & codes' : `Section ${s.index}`,
      hay: [s.label, s.id, ...(s.aliases || [])].join(' ').toLowerCase(),
      action: s.event ? { tool: 'openVault', arguments: {} } : { tool: 'navigate', arguments: { section: s.id } },
    });
  for (const p of projects)
    out.push({
      key: `project:${slug(p.title)}`,
      type: 'project',
      title: p.title,
      desc: `${p.category} · ${p.badge}`,
      hay: [p.title, p.category, p.badge, p.description, p.role, ...(p.tech || []), ...(p.keywords || [])].join(' ').toLowerCase(),
      action: { tool: 'openProject', arguments: { id: slug(p.title) } },
    });
  for (const l of LABS)
    out.push({
      key: `lab:${l.id}`,
      type: 'lab',
      title: l.label,
      desc: `${l.code} · ${l.group} lab`,
      hay: [l.label, l.id, l.code, l.group, l.note, 'lab simulation'].join(' ').toLowerCase(),
      action: { tool: 'openLab', arguments: { id: l.id } },
    });
  for (const t of tools)
    out.push({
      key: `tool:${t.id}`,
      id: t.id,
      type: 'tool',
      title: t.name,
      desc: `${t.project || t.owner} · ${t.kind || 'Link'} · ${hostOf(t.url)}`,
      hay: toolHay(t),
      hue: hueOf(t.project || t.owner),
      bookmark: t.kind === 'Bookmark',
      action: { tool: 'openTool', arguments: { id: t.id } },
    });
  for (const a of SYSTEM) out.push({ key: `action:${a.id}`, type: 'action', title: a.title, desc: a.desc, hint: a.hint, hay: `${a.title} ${a.desc} ${a.words}`.toLowerCase(), action: a.action });
  for (const c of commands) out.push({ key: `command:${c.id}`, type: 'command', title: c.usage, desc: c.desc, hay: `${c.usage} ${c.desc} ${c.id}`.toLowerCase(), prefill: c.prefill });
  return out;
}

/* ------------------------------------------------------------ query --- */

const FILLER = /\b(show|open|launch|find|search|look|for|me|my|the|a|an|please|can|you|go|to|where|is|pull|up|bring|get|jarvis)\b/g;
const HINTS = { project: /\bprojects?\b/, tool: /\b(tools?|apps?)\b/, lab: /\blabs?\b/, section: /\bsections?\b/ };

/** Split "show my DSIP project" into search terms ("dsip") and a type hint ("project"). */
export function parseQuery(q) {
  const s = q.toLowerCase();
  const typeHint = Object.keys(HINTS).find((k) => HINTS[k].test(s)) || null;
  let terms = s.replace(FILLER, ' ');
  if (typeHint) terms = terms.replace(HINTS[typeHint], ' ');
  return { terms: terms.replace(/[^\w\s./-]/g, ' ').replace(/\s+/g, ' ').trim(), typeHint };
}

/** Multi-word AND match; title hits beat body hits; `-word` excludes. 0 = no match. */
export function scoreEntry(e, q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  const title = e.title.toLowerCase();
  let s = 0;
  for (const w of words) {
    if (w[0] === '-' && w.length > 1) {
      if (e.hay.includes(w.slice(1))) return 0;
      continue;
    }
    if (title.startsWith(w) || title.includes(` ${w}`)) s += 6;
    else if (title.includes(w)) s += 4;
    else if (e.hay.includes(w)) s += 1;
    else return 0;
  }
  if (title === q.toLowerCase().trim()) s += 10;
  return s;
}

/**
 * How much the current place in the app should favour an entry. Multiplies the
 * text score, so it re-orders close matches without inventing weak ones.
 */
const SECTION_TYPE = { projects: 'project', tools: 'tool', lab: 'lab', jarvis: 'command' };
export function contextBoost(entry, context) {
  if (!context) return 1;
  // TODO(human): tune how "where I am" re-ranks results. The default below
  // boosts the entry type that matches the current section (×1.4) and labs
  // while a lab is open (×1.5). Consider: favouring recently-run commands
  // (context.recentCommands), or damping external tools while offline
  // (context.online === false). Return a multiplier; 1 = neutral.
  if (context.selectedTool?.type === 'lab' && entry.type === 'lab') return 1.5;
  return SECTION_TYPE[context.section] === entry.type ? 1.4 : 1;
}

/**
 * Rank the index for a query. With a type hint ("… project"), entries of that
 * type come first whenever any of them match.
 */
export function searchIndex(index, raw, { context, pins = [], limit = 12, typeHint } = {}) {
  const q = raw.trim();
  if (!q) return [];
  const pinSet = new Set(pins);
  const hits = [];
  for (const e of index) {
    let s = scoreEntry(e, q);
    if (!s) continue;
    s *= TYPES[e.type].weight * contextBoost(e, context);
    if (e.bookmark) s *= 0.7; // 1 300 bookmarks must not drown the curated tools
    if (e.type === 'tool' && pinSet.has(e.id)) s += 3;
    hits.push({ ...e, score: s });
  }
  hits.sort((a, b) => (typeHint ? (b.type === typeHint) - (a.type === typeHint) : 0) || b.score - a.score);
  return hits.slice(0, limit);
}
