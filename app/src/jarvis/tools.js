/* -----------------------------------------------------------------------------
 * Command parser — the deterministic layer. Works with no AI model at all.
 *
 * Each tool:
 *   id, label, stage ('search' | 'execute'), help: [usage, description]
 *   needsNet  true → refused with a clear message in offline mode
 *   match(s, raw, ctx) -> args | null      s = lower-cased, trimmed input
 *   run(args, ctx) -> reply
 * A reply is { text, sources?, file?, list?, results?, buttons?, confirm?, summarize? }.
 *   confirm   { title, detail, yes: () => reply }  — the UI asks first
 *   summarize prompt for the model to turn raw data into an answer
 *
 * Anything that touches the site (navigate, open a tool/lab/project, theme,
 * favourites, engineering maths…) is not done here: the tool resolves the
 * words to a structured call and hands it to os/actions.js → execute(), the
 * same validated door the palette and the language model use.
 * -------------------------------------------------------------------------- */

import { news, cryptoPrice, weather } from './web';
import { calc, looksLikeMath } from './calc';
import { formatOf, FORMATS, specFor, parseJson, makeFile } from './files';
import { remember, recall, forget, bridge, bridgeStatus, syncPending, BRIDGE_EDITOR } from './memory';
import { parseBookmarks, pickFile, cleanUrl } from './bookmarks';
import { parsePipe, parseConvert } from './engineering';
import { execute } from '../os/actions';
import { searchIndex, parseQuery } from '../os/searchIndex';
import { sections, person, experience, education, contact } from '../data/site';
import { switchBrain, brainState, BRAINS, available } from './brain';
import { keyKinds, forgetKeys, KEY_KINDS } from './keys';

const LABS = { rocket: 'rocket', car: 'auto', auto: 'auto', systems: 'systems', gear: 'systems', pipe: 'pipe', sewer: 'pipe', hydraulics: 'pipe', beam: 'beam', engine: 'engine', turbofan: 'engine', jet: 'engine' };
const act = (tool, args = {}) => (a, ctx) => execute({ tool, arguments: typeof args === 'function' ? args(a) : args }, ctx);

/** "projects", "the tools", "engineering labs", "jarvis" → a section, or null. */
function sectionOf(q) {
  const s = q.toLowerCase().replace(/^(the|my)\s+/, '').replace(/\s+(section|page|tab)$/, '').replace(/\./g, '').trim();
  if (!s) return null;
  return sections.find((x) => x.id === s || x.label.toLowerCase().replace(/\./g, '') === s || (x.aliases || []).includes(s)) || null;
}
const fmt = (n, d = 2) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d });
const NOTES = 'rh-jv-notes';
const notes = {
  all() {
    try {
      return JSON.parse(localStorage.getItem(NOTES) || '[]');
    } catch {
      return [];
    }
  },
  save(a) {
    try {
      localStorage.setItem(NOTES, JSON.stringify(a));
    } catch {
      /* storage blocked */
    }
  },
};

/* Returns false when the browser blocked the pop-up — voice commands have no
   click behind them, so the caller then offers a one-tap button instead. */
function openTab(url) {
  const w = window.open(url, '_blank');
  if (!w) return false;
  try {
    w.opener = null;
  } catch {
    /* cross-origin already */
  }
  return true;
}
const opened = (url, text, title) => (openTab(url) ? { text } : { text: `${text.replace(/ (are|is) open\.$/, '')} — tap to open (the browser blocked the automatic tab).`, confirm: { title: title || 'Open it now?', detail: url, yes: () => (openTab(url), { text: 'Opened.' }) } });
const confirmOpen = (url, title) => ({
  text: `Ready to open ${new URL(url).host}.`,
  confirm: { title: title || 'Open this page?', detail: url, yes: () => (openTab(url), { text: `Opened ${new URL(url).host}.` }) },
});

export const TOOLS = [
  /* ------------------------------------------------------------ site --- */
  {
    id: 'help', label: 'Help', stage: 'execute', help: ['help', 'everything I can do'],
    match: (s) => (/^(help|\?|commands|what can you do)$/.test(s) ? {} : null),
    run: () => ({ help: true }),
  },
  {
    id: 'lab', label: 'Lab', stage: 'execute', help: ['lab <name>', 'engine · rocket · car · systems · pipe · beam'],
    match: (s) => {
      const m = s.match(/^(?:lab|open lab|show lab|open the|simulate)\s+(.+?)(?:\s+lab)?$/) || s.match(/^(?:open\s+)?(rocket|car|systems|pipe|beam|engine|turbofan|jet|sewer hydraulics|hydraulics)(?:\s+lab)?$/);
      const k = m && Object.keys(LABS).find((x) => m[1].includes(x));
      return k ? { id: LABS[k] } : null;
    },
    run: act('openLab', ({ id }) => ({ id })),
  },
  {
    id: 'theme', label: 'Theme', stage: 'execute', help: ['theme · light mode · dark mode', 'colour theme'],
    match: (s) => {
      const m = s.match(/^(?:switch to |use |set )?(?:the )?(light|dark)(?: mode| theme)?$/) || s.match(/^(theme|toggle theme|switch theme|change theme)$/);
      return m ? { mode: m[1] === 'light' || m[1] === 'dark' ? m[1] : 'toggle' } : null;
    },
    run: act('setTheme', ({ mode }) => ({ mode })),
  },
  {
    id: 'motion', label: 'Motion', stage: 'execute', help: ['reduce motion · restore motion', 'calm animations on this device'],
    match: (s) => (/^(reduce(d)? motion( on)?|less motion|stop animations?|animations? off|calm mode)$/.test(s) ? { mode: 'reduce' } : /^(restore|normal|full) motion$|^(reduce(d)? motion off|animations? on)$/.test(s) ? { mode: 'system' } : null),
    run: act('setMotion', ({ mode }) => ({ mode })),
  },
  {
    id: 'vault', label: 'Vault', stage: 'execute', help: ['vault', 'encrypted passwords & codes'],
    match: (s) => (/^(vault|open (the )?vault|passwords?|go to vault)$/.test(s) ? {} : null),
    run: act('openVault'),
  },
  {
    id: 'install', label: 'Install', stage: 'execute', help: ['install app', 'add Rahat OS to this device'],
    match: (s) => (/^install( (the )?(app|rahat os|pwa))?$/.test(s) ? {} : null),
    run: act('installApp'),
  },
  {
    id: 'palette', label: 'Palette', stage: 'execute', help: ['palette', 'open the command palette'],
    match: (s) => (/^((open )?(the )?(command )?palette|shortcuts|keyboard shortcuts|keys)$/.test(s) ? { keys: /short|key/.test(s) } : null),
    run: ({ keys }, ctx) => execute({ tool: keys ? 'showShortcuts' : 'openPalette', arguments: {} }, ctx),
  },
  {
    id: 'unlock', label: 'Owner', stage: 'execute', help: ['unlock', 'owner mode (PIN)'],
    match: (s) => (/^(unlock|login|admin|owner)$/.test(s) ? {} : null),
    run: (a, ctx) => (ctx.scrollTo('tools'), setTimeout(() => window.dispatchEvent(new Event('rh-unlock')), 400), { text: 'Owner PIN requested — enter it in the Tools panel.' }),
  },
  {
    id: 'go', label: 'Navigate', stage: 'execute', help: ['go to <section>', 'portfolio · projects · labs · tools · contact'],
    match: (s) => {
      // Longest verbs first: with "go|go to", "go to projects" would leave "to projects".
      const m = s.match(/^(?:take me to|navigate to|scroll to|jump to|go to|goto|show me|show|open|go)\s+(.+)$/) || s.match(/^(portfolio|projects|labs|tools|contact|about|home|jarvis)$/);
      const sec = m && sectionOf(m[1]);
      return sec ? { section: sec.id } : null;
    },
    run: act('navigate', ({ section }) => ({ section })),
  },
  {
    id: 'showtools', label: 'Tools', stage: 'execute', help: ['show my tools', 'the tool index'],
    match: (s) => (/^(show |list |open )?(me )?(my |all )?tools( index)?$/.test(s) && s !== 'tools' ? {} : null),
    run: act('showTools'),
  },
  {
    id: 'favorites', label: 'Quick tools', stage: 'execute', help: ['quick tools · favorite <tool>', 'your starred tools'],
    match: (s, raw, ctx) => {
      if (/^((show |list )?(my )?(quick tools|favou?rites|starred( tools)?|pinned( tools)?))$/.test(s)) return { list: true };
      const m = s.match(/^(?:favou?rite|star|pin|unfavou?rite|unstar|unpin|add)\s+(.+?)(?:\s+to (?:my )?(?:favou?rites|quick tools))?$/);
      if (!m || (/^add\s/.test(s) && !/(favou?rites|quick tools)$/.test(s))) return null;
      const hit = searchIndex(ctx.index, parseQuery(m[1]).terms || m[1], { typeHint: 'tool' }).find((h) => h.type === 'tool');
      return hit ? { id: hit.id } : null;
    },
    run: ({ list, id }, ctx) => execute(list ? { tool: 'showFavorites', arguments: {} } : { tool: 'toggleFavorite', arguments: { id } }, ctx),
  },
  {
    id: 'history', label: 'History', stage: 'execute', help: ['history · clear history', 'recent commands'],
    match: (s) => (/^(history|recent|recent commands|command history|show history)$/.test(s) ? {} : /^clear (command )?history$/.test(s) ? { clear: true } : null),
    run: ({ clear }, ctx) => execute({ tool: clear ? 'clearHistory' : 'showHistory', arguments: {} }, ctx),
  },

  /* ------------------------------------------------------- engineering --- */
  {
    id: 'pipe', label: 'Pipe hydraulics', stage: 'execute', help: ['velocity for 300 mm pipe at 40 L/s', 'pipe velocity · Manning capacity (“400 mm at 0.5% slope”)'],
    match: (s, raw, ctx) =>
      parsePipe(s, ctx.context?.selectedTool?.id === 'pipe' ? ctx.context.selectedTool.inputs : null) ||
      (/\b(calc|calculate|compute)\b.*\b(pipe|velocity|manning|discharge)\b/.test(s) && !/\d/.test(s) ? { incomplete: true } : null),
    run: (call, ctx) =>
      call.incomplete
        ? {
            text: 'Give me the pipe and the flow (or slope), for example:',
            results: ['velocity for 300 mm pipe at 40 L/s', 'capacity of 400 mm pipe at 0.5% slope', 'manning 450 mm rcc slope 1 in 250 60% full'].map((t) => ({ key: t, type: 'command', title: t, desc: 'run', rerun: t })),
            buttons: [{ label: 'Open Sewer Hydraulics lab', action: { tool: 'openLab', arguments: { id: 'pipe' } } }],
            show: true,
          }
        : execute(call, ctx),
  },
  {
    id: 'convert', label: 'Units', stage: 'execute', help: ['convert 25 psi to kpa', 'length · area · flow · pressure · force · katha/bigha'],
    match: (s) => parseConvert(s),
    run: act('convertUnits', (a) => a),
  },

  /* ----------------------------------------------------------- utility --- */
  {
    id: 'time', label: 'Clock', stage: 'execute', help: ['time · date', 'local clock and calendar'],
    match: (s) => {
      const m = s.match(/^(?:what(?:'s| is) the )?(time|date|day)(?: (?:is it )?(?:in|at) (.+))?\??$/) || s.match(/^(?:what )?(time) is it(?: in (.+))?$/);
      return m ? { what: m[1], place: m[2] } : null;
    },
    run: async ({ what, place }) => {
      if (place) {
        const w = await weather(place);
        const t = new Date().toLocaleString('en-GB', { timeZone: w.tz, weekday: 'long', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'long' });
        return { text: `In ${w.place} it is ${t}.`, sources: [{ title: 'Open-Meteo time zone', url: 'https://open-meteo.com' }] };
      }
      const d = new Date();
      return { text: what === 'time' ? `It is ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + '.' };
    },
  },
  {
    id: 'calc', label: 'Calculator', stage: 'execute', help: ['calc <expression>', 'sqrt(2)*15^2, 18% of 5400'],
    match: (s) => {
      let m = s.match(/^(?:calc|calculate|compute|what is|what's|=)\s*(.+?)\??$/);
      const e = m ? m[1] : looksLikeMath(s) ? s : null;
      if (!e) return null;
      if ((m = e.match(/^([\d.]+)\s*%\s*of\s*([\d.,]+)$/))) return { expr: `${m[1]}/100*${m[2]}` };
      return looksLikeMath(e) || (/^(calc|calculate|compute|=)/.test(s) && /\d/.test(e)) ? { expr: e } : null;
    },
    run: ({ expr }) => {
      try {
        return { text: `${expr} = ${fmt(calc(expr), 10)}` };
      } catch (e) {
        return { text: `Can’t compute that: ${e.message}.`, error: true };
      }
    },
  },
  {
    id: 'weather', label: 'Weather', stage: 'search', needsNet: true, help: ['weather <city>', 'live conditions + 3-day outlook'],
    match: (s) => {
      const m = s.match(/(?:weather|temperature|forecast|raining|rain)(?:\s+(?:in|at|for))?\s*([a-z .'-]*)\??$/);
      return m ? { place: m[1].replace(/\b(today|now|tomorrow|like)\b/g, '').trim() || 'Dhaka' } : null;
    },
    run: async ({ place }) => {
      const w = await weather(place);
      const days = w.days.map((d) => `${new Date(d.d).toLocaleDateString([], { weekday: 'short' })} ${Math.round(d.lo)}–${Math.round(d.hi)}°C, rain ${d.rain ?? 0}%`).join(' · ');
      return { text: `${w.place}: ${Math.round(w.temp)}°C (feels ${Math.round(w.feels)}°C), ${w.sky}, humidity ${w.humidity}%, wind ${Math.round(w.wind)} km/h.\n${days}`, sources: [{ title: 'Open-Meteo', url: 'https://open-meteo.com' }] };
    },
  },
  {
    id: 'price', label: 'Crypto price', stage: 'search', needsNet: true, help: ['price <coin>', 'live price from CoinGecko'],
    match: (s) => {
      const m = s.match(/([a-z0-9-]+)\s+(?:price|usd|to usd)\??$/) || s.match(/(?:price|value) (?:of|for)\s+([a-z0-9-]+)(?: today| now)?\??$/) || s.match(/^price\s+([a-z0-9-]+)$/) || s.match(/^how much is (?:one |1 )?([a-z0-9-]+)(?: worth)?\??$/);
      return m && !/^(the|current|a|share|stock)$/.test(m[1]) ? { coin: m[1] } : null;
    },
    run: async ({ coin }) => {
      const p = await cryptoPrice(coin);
      const ch = p.change == null ? '' : ` (${p.change >= 0 ? '+' : ''}${p.change.toFixed(2)}% 24h)`;
      return { text: `${p.id[0].toUpperCase() + p.id.slice(1)}: $${fmt(p.usd, p.usd < 1 ? 6 : 2)}${ch} · ৳${fmt(p.bdt, 0)} · market cap $${fmt(p.cap / 1e9, 1)}B.`, sources: [{ title: 'CoinGecko', url: p.url }] };
    },
  },
  {
    id: 'news', label: 'News', stage: 'search', needsNet: true, help: ['news [topic]', 'last 24 h headlines, summarised'],
    match: (s) => {
      const m = s.match(/^(?:search |show |get |latest |today'?s? )*(?:the )?(?:latest |today'?s? |top )*(?:news|headlines)(?:\s+(?:about|on|for|in))?\s*(.*?)(?: today)?\??$/);
      return m ? { topic: m[1].trim() } : null;
    },
    run: async ({ topic }) => {
      const n = await news(topic);
      return {
        text: `${n.items.length} headlines from ${n.source}${topic ? ` on “${topic}”` : ''}.`,
        sources: n.items.slice(0, 8),
        summarize: `Summarise these news headlines${topic ? ` about ${topic}` : ''} in 4-6 crisp bullet points. Mention only what the headlines state.\n` + n.items.map((x) => `- ${x.title} (${x.snippet})`).join('\n'),
      };
    },
  },
  {
    id: 'youtube', label: 'YouTube', stage: 'execute', needsNet: true, help: ['youtube <query>', 'search YouTube'],
    match: (s, raw) => {
      const m = raw.match(/^(?:youtube|yt|search youtube for|find on youtube|play)\s+(.+)$/i) || raw.match(/^(.+?)\s+on youtube$/i);
      return m ? { q: m[1] } : null;
    },
    run: ({ q }) => opened(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, `YouTube results for “${q}” are open.`, 'Open YouTube?'),
  },
  {
    id: 'google', label: 'Google', stage: 'execute', needsNet: true, help: ['google <query>', 'open a Google search tab'],
    match: (s, raw) => {
      const m = raw.match(/^(?:google|search google for|open google for)\s+(.+)$/i);
      return m ? { q: m[1] } : null;
    },
    run: ({ q }) => opened(`https://www.google.com/search?q=${encodeURIComponent(q)}`, `Google results for “${q}” are open.`, 'Open Google?'),
  },
  {
    id: 'openurl', label: 'Open URL', stage: 'execute', help: ['open <url>', 'any https link (asks first)'],
    match: (s, raw) => {
      const m = raw.match(/^(?:open|go to|visit|launch)?\s*((?:https?:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?)$/i);
      if (!m || !/\./.test(m[1])) return null;
      const u = cleanUrl(/^https?:/i.test(m[1]) ? m[1] : `https://${m[1]}`);
      return u ? { url: u } : null;
    },
    run: ({ url }) => confirmOpen(url, 'Open this link?'),
  },
  {
    // "who is Rahat?" on Rahat's own site is answered from the portfolio, not Wikipedia.
    id: 'about', label: 'About Rahat', stage: 'execute', help: ['who is Rahat?', 'the portfolio in one answer'],
    match: (s) => (/^(who(?:'s| is)|tell me about|about|what does)\s+(md\.?\s+)?(rahat|rahat hossain|the owner|your (owner|creator)|you work for)(\s+hossain)?(\s+do)?\??$/.test(s) || /^(who made this|whose (site|portfolio) is this)\??$/.test(s) ? {} : null),
    run: (a, ctx) => {
      const [job] = experience;
      return {
        text: `**${person.name}** — ${person.role}, ${person.location}. ${person.tagline}`,
        list: [`${job.role}, ${job.org} (${job.period})`, ...education.map((e) => `${e.degree} — ${e.school}`), `Contact: ${contact.email}`],
        buttons: [
          { label: 'Portfolio', action: { tool: 'navigate', arguments: { section: 'explore' } } },
          { label: 'Projects', action: { tool: 'navigate', arguments: { section: 'projects' } } },
          { label: 'Contact', action: { tool: 'navigate', arguments: { section: 'contact' } } },
        ],
        show: true,
      };
    },
  },
  {
    id: 'search', label: 'Web search', stage: 'search', needsNet: true, help: ['search the web for <anything>', 'DuckDuckGo + Wikipedia, summarised'],
    match: (s, raw) => {
      const m = raw.match(/^(?:search (?:the )?(?:web|internet|online)(?: for)?|web search(?: for)?|look up|lookup|who is|who was|what is|what are|tell me about|define)\s+(.+?)\??$/i);
      return m && !looksLikeMath(m[1]) ? { q: m[1], ask: raw } : null;
    },
    run: ({ q, ask }, ctx) => execute({ tool: 'webSearch', arguments: { query: q, question: ask } }, ctx),
  },
  {
    // "search DSIP", "find the rfi", "show my DSIP project", "where is the beam lab"
    // → this site's index first; the web only when nothing here matches.
    id: 'find', label: 'Site search', stage: 'search', help: ['search <words> · show my <x> project', 'projects, tools, labs & sections — then the web'],
    match: (s, raw) => {
      const m = raw.match(/^(?:search(?: for)?|find(?: me)?|where(?:'s| is)|locate|show(?: me)?(?: my)?(?= .*\b(?:project|tool|lab)s?\b))\s+(.+?)\??$/i);
      return m ? { q: m[1], ask: raw } : null;
    },
    run: async ({ q, ask }, ctx) => {
      const local = await execute({ tool: 'searchSite', arguments: { query: ask } }, ctx);
      // "show my DSIP project": a named type whose best hit is that type → open it.
      const { typeHint } = parseQuery(ask);
      const top = local?.results?.[0];
      if (typeHint && top?.type === typeHint && /^(show|open|pull up|bring up)\b/i.test(ask)) {
        const opened = await execute(top.action, ctx);
        const rest = local.results.slice(1, 5);
        return rest.length ? { ...opened, results: rest, list: [...(opened.list || []), 'Also matching:'] } : opened;
      }
      if (local) return local;
      if (!ctx.context?.online) return { text: `Nothing on this site matches “${q}”, and web search needs the internet (offline mode).`, error: true };
      return execute({ tool: 'webSearch', arguments: { query: q, question: ask } }, ctx);
    },
  },
  {
    id: 'clipboard', label: 'Clipboard', stage: 'execute', help: ['copy <text> · read clipboard', 'clipboard in and out'],
    match: (s, raw) => {
      if (/^(read|paste|what'?s in) (my )?clipboard/.test(s)) return { read: true };
      const m = raw.match(/^copy\s+(.+)$/i);
      return m ? { text: m[1] } : /^copy (that|last|answer|reply)$/.test(s) ? { last: true } : null;
    },
    run: async ({ read, text, last }, ctx) => {
      if (read)
        return {
          text: 'Reading the clipboard needs your OK.',
          confirm: { title: 'Let Jarvis read your clipboard?', detail: 'The text stays in this tab.', yes: async () => ({ text: `Clipboard: ${(await navigator.clipboard.readText()).slice(0, 800) || '(empty)'}` }) },
        };
      const v = last ? ctx.lastAnswer() : text;
      await navigator.clipboard.writeText(v);
      return { text: `Copied ${v.length} characters.` };
    },
  },
  {
    id: 'notes', label: 'Notes', stage: 'execute', help: ['note <text> · notes · clear notes', 'quick notes on this device'],
    match: (s, raw) => {
      if (/^(notes|my notes|show notes|list notes)$/.test(s)) return { list: true };
      if (/^(clear|delete) (all )?notes$/.test(s)) return { clear: true };
      const m = raw.match(/^(?:note|add note|jot|write down)[:\s]+(.+)$/i);
      return m ? { add: m[1] } : null;
    },
    run: ({ list, clear, add }) => {
      const a = notes.all();
      if (add) {
        notes.save([{ t: add, at: Date.now() }, ...a]);
        return { text: `Noted. ${a.length + 1} note${a.length ? 's' : ''} on this device.` };
      }
      if (clear) return { text: `Delete ${a.length} notes?`, confirm: { title: 'Delete all notes?', detail: `${a.length} notes on this device`, yes: () => (notes.save([]), { text: 'Notes cleared.' }) } };
      return a.length ? { text: `${a.length} notes:`, list: a.map((n) => `${new Date(n.at).toLocaleDateString()} — ${n.t}`) } : { text: 'No notes yet. Try “note buy rebar samples”.' };
    },
  },

  /* ------------------------------------------------------------- files --- */
  {
    id: 'file', label: 'File maker', stage: 'execute', help: ['make <excel|word|ppt|csv|md> about <topic>', 'generate a real file'],
    match: (s, raw) => {
      if (!/^(make|create|generate|build|write|export|give me)\b/.test(s)) return null;
      const f = formatOf(s);
      if (!f) return null;
      const topic = raw.replace(/^(make|create|generate|build|write|export|give me)\s+(me\s+)?(an?\s+)?/i, '').replace(/\b(excel|xlsx|spreadsheet|sheet|workbook|word|docx|document|powerpoint|pptx|ppt|slides?|deck|presentation|csv|markdown|md|json|html|text|txt)\b( file)?/gi, '').replace(/^\s*(file\s+)?(of|about|on|for|with)\s+/i, '').trim();
      return { format: f, topic: topic || 'my notes' };
    },
    run: async ({ format, topic }, ctx) => {
      ctx.stage('processing');
      let data;
      if (/^(my )?notes$/.test(topic)) {
        const a = notes.all();
        data = format === 'excel' || format === 'csv' ? { title: 'Jarvis notes', columns: ['Date', 'Note'], rows: a.map((n) => [new Date(n.at).toLocaleString(), n.t]) } : { title: 'Jarvis notes', sections: [{ heading: 'Notes', paragraphs: [], bullets: a.map((n) => n.t) }] };
      } else if (/^(my )?(tools|bookmarks|index)$/.test(topic)) {
        const list = ctx.tools.filter((t) => (topic.includes('bookmark') ? t.kind === 'Bookmark' : true));
        data = { title: topic.includes('bookmark') ? 'Bookmarks' : 'Tool index', columns: ['Name', 'Category', 'Project', 'URL'], rows: list.map((t) => [t.name, t.category, t.project, t.url]) };
        if (!['excel', 'csv'].includes(format)) data = { title: data.title, sections: [{ heading: data.title, paragraphs: [], bullets: list.map((t) => `${t.name} — ${t.url}`) }] };
      } else {
        const r = await ctx.think([{ role: 'system', content: 'You produce structured content for office files. ' + specFor(format) }, { role: 'user', content: topic }]);
        data = parseJson(r.text);
      }
      ctx.stage('executing');
      const f = await makeFile(format, data);
      return { text: `${FORMATS[format].label} file ready: ${f.name} (${Math.max(1, Math.round(f.size / 1024))} KB). It is downloading now.`, file: f };
    },
  },

  /* ------------------------------------------------------------ memory --- */
  {
    id: 'remember', label: 'Memory', stage: 'execute', help: ['remember <fact>', 'saved to device + Notion'],
    match: (s, raw) => {
      const m = raw.match(/^(?:remember(?: that)?|memorize|save to memory|don'?t forget(?: that)?)[:\s]+(.+)$/i);
      return m ? { text: m[1] } : null;
    },
    run: async ({ text }, ctx) => {
      const kind = /\b(i like|i prefer|i hate|call me|my favou?rite)\b/i.test(text) ? 'preference' : /\b(todo|need to|must|deadline)\b/i.test(text) ? 'task' : 'fact';
      const r = await remember(text, { kind, pin: ctx.pin });
      return { text: r.synced ? 'Remembered — saved to Notion and this device.' : ctx.pin ? `Remembered on this device. Notion sync pending: ${r.err}` : 'Remembered on this device. Unlock owner mode and connect Notion to sync.' };
    },
  },
  {
    id: 'recall', label: 'Recall', stage: 'search', help: ['recall [words] · forget <words>', 'search or delete memories'],
    match: (s, raw) => {
      let m;
      if ((m = raw.match(/^forget\s+(.+)$/i))) return { forget: m[1] };
      if ((m = s.match(/^(?:recall|memories|what do you (?:know|remember)(?: about)?)\s*(.*?)\??$/))) return { q: m[1].replace(/^(me|about)\s*/, '') };
      return null;
    },
    run: async ({ q, forget: f }, ctx) => {
      if (f)
        return {
          text: 'That deletes memories.',
          confirm: { title: `Forget memories matching “${f}”?`, detail: 'Removed from this device and archived in Notion.', yes: async () => ({ text: `Forgot ${await forget(f, ctx.pin)} memories.` }) },
        };
      const r = await recall(q, ctx.pin);
      if (!r.rows.length) return { text: q ? `Nothing remembered about “${q}”.` : 'No memories yet. Try “remember I prefer metric units”.' };
      return { text: `${r.rows.length} memories (${r.from}):`, list: r.rows.slice(0, 20).map((m) => `${m.kind ? `[${m.kind}] ` : ''}${m.text}`) };
    },
  },
  {
    id: 'notion', label: 'Notion', stage: 'execute', help: ['connect notion · sync memory', 'owner: memory database in Notion'],
    match: (s) => (/^(connect|setup|link) notion$/.test(s) ? { connect: true } : /^(sync|push) (memory|memories)$/.test(s) ? { sync: true } : /^notion status$/.test(s) ? { status: true } : null),
    run: async ({ connect, sync }, ctx) => {
      if (!ctx.pin) return { text: 'Owner only. Say “unlock” first.' };
      const st = await bridgeStatus();
      if (st.unauth) return { text: 'The Notion bridge needs a one-time Google authorisation. Open its editor, pick authorize, press Run, accept.', sources: [{ title: 'Jarvis Notion Bridge — Apps Script', url: BRIDGE_EDITOR }] };
      if (!st.ok) return { text: `Bridge error: ${st.error}`, error: true };
      if (!st.pin) await bridge({ a: 'setup', pin: ctx.pin });
      if (sync) return { text: `Synced ${await syncPending(ctx.pin)} pending memories to Notion.` };
      if (!connect) return { text: st.notion ? 'Notion memory is connected.' : 'Notion is not connected yet — say “connect notion”.' };
      return { form: 'notion', text: 'Paste a Notion internal-integration token and a page shared with it. The token goes straight to the bridge and is never shown again.' };
    },
  },

  /* --------------------------------------------------------- bookmarks --- */
  {
    id: 'bookmark-import', label: 'Import bookmarks', stage: 'execute', help: ['import bookmarks', 'Chrome HTML or Raindrop CSV'],
    match: (s) => (/^(import|upload|load|update|sync) (my )?bookmarks?( file)?$/.test(s) ? {} : null),
    run: async (a, ctx) => {
      if (!ctx.pin) return { text: 'Bookmark writes are owner-only. Say “unlock”, then “import bookmarks”.' };
      const file = await pickFile();
      if (!file) return { text: 'No file chosen.' };
      if (file.size > 5e6) return { text: 'That file is over 5 MB — export a smaller folder.', error: true };
      const { fresh, dupes, total } = parseBookmarks(await file.text(), ctx.tools);
      if (!fresh.length) return { text: `${total} links read, all ${dupes} already indexed. Nothing new.` };
      return {
        text: `${total} links read · ${dupes} already indexed · ${fresh.length} new.`,
        list: fresh.slice(0, 12).map((t) => `${t.category} — ${t.name}`).concat(fresh.length > 12 ? [`…and ${fresh.length - 12} more`] : []),
        confirm: {
          title: `Add ${fresh.length} bookmarks?`,
          detail: 'Saved as private (only you see them). Make any public later from the Tools panel.',
          yes: async () => {
            let saved = 0;
            for (let i = 0; i < fresh.length; i += 150) {
              const j = await ctx.post({ a: 'bulk', pin: ctx.pin, tools: fresh.slice(i, i + 150).map((t) => ({ ...t, visibility: 'private' })) });
              saved += j.saved;
            }
            await ctx.refresh();
            return { text: `Added ${saved} bookmarks. Filter Tools by “Bookmarks” to see them.` };
          },
        },
      };
    },
  },
  {
    id: 'bookmark-add', label: 'Add bookmark', stage: 'execute', help: ['bookmark <url> [as <name>] [in <folder>]', 'save one link'],
    match: (s, raw) => {
      const m = raw.match(/^(?:bookmark|add bookmark|save link|save bookmark)\s+(\S+)(?:\s+as\s+(.+?))?(?:\s+in\s+(.+))?$/i);
      if (!m) return null;
      const url = cleanUrl(/^https?:/i.test(m[1]) ? m[1] : `https://${m[1]}`);
      return url ? { url, name: m[2], folder: m[3] } : null;
    },
    run: async ({ url, name, folder }, ctx) => {
      if (!ctx.pin) return { text: 'Owner only. Say “unlock” first.' };
      const { fresh, dupes } = parseBookmarks(`<DL><DT><H3>${(folder || 'Bookmarks').replace(/[<>&]/g, '')}</H3><DL><DT><A HREF="${url.replace(/"/g, '%22')}">${(name || new URL(url).host).replace(/[<>&]/g, '')}</A></DL></DL>`, ctx.tools);
      if (dupes) return { text: 'Already in your index.' };
      const t = { ...fresh[0], category: folder || 'Bookmarks', visibility: 'private' };
      await ctx.post({ a: 'upsert', pin: ctx.pin, tool: t });
      await ctx.refresh();
      return { text: `Bookmarked ${t.name} (private).`, sources: [{ title: t.name, url: t.url }] };
    },
  },
  {
    id: 'bookmark-list', label: 'Bookmarks', stage: 'search', help: ['bookmarks [words]', 'list saved bookmarks'],
    match: (s) => {
      const m = s.match(/^(?:my |show |list )?bookmarks?(?:\s+(?:for|about|in))?\s*(.*)$/);
      return m && !/^(import|add)/.test(s) ? { q: m[1] } : null;
    },
    run: ({ q }, ctx) => {
      const b = ctx.tools.filter((t) => t.kind === 'Bookmark' && (!q || ctx.score(t, q) > 0));
      window.dispatchEvent(new CustomEvent('rh-tool-search', { detail: q || 'bookmark' }));
      return { text: `${b.length} bookmarks${q ? ` for “${q}”` : ''} — filtered the Tools index.`, sources: b.slice(0, 8).map((t) => ({ title: t.name, url: t.url })) };
    },
  },

  /* ------------------------------------------------------ brain + voice --- */
  {
    id: 'brain', label: 'Brain', stage: 'execute', help: ['switch brain · use claude · brains', 'change the AI model by voice'],
    match: (s) => {
      if (/^(brains|models|list (brains|models)|which (brain|model)( are you using| is active)?|what (brain|model) are you( using)?)\??$/.test(s)) return { list: true };
      if (/\b(switch|change|swap|next|rotate|another)\b.*\b(brain|model|ai)\b|\b(brain|model)\b.*\b(switch|change|next)\b|(ব্রেন|মডেল|brain).*(চেঞ্জ|বদলাও|বদল|পরিবর্তন|change)/.test(s)) {
        const to = s.match(/\bto\s+(.+)$/);
        return { to: to ? to[1].replace(/\s+(brain|model|ai)$/, '') : 'next' };
      }
      const m = s.match(/^(?:use|switch to|talk with|talk to|go with|use the)\s+(.+?)(?:\s+(?:brain|model|ai))?$/);
      if (m && (m[1] === 'auto' || BRAINS.some((b) => b.alias.test(m[1]) || b.label.toLowerCase() === m[1]))) return { to: m[1] };
      return null;
    },
    run: ({ list, to }, ctx) => {
      if (list) {
        const st = brainState();
        const av = available();
        return {
          text: av.length ? `Thinking with ${BRAINS.find((b) => b.id === st.active)?.label || 'nothing'}${st.prefer === 'auto' ? ' (auto)' : ''}. ${av.length} brains online:` : 'No brain online yet — say “add keys”.',
          list: BRAINS.map((b) => `${st.status[b.id]?.ok ? '●' : '○'} ${b.label} — ${b.vendor} · ${st.status[b.id]?.ok ? b.note : st.status[b.id]?.detail || 'not checked'}`),
        };
      }
      if (!available().length) return { text: 'No brain is online yet. Say “add keys” and paste your API keys once — or “enable browser ai”.' };
      if (to === 'next' && available().length === 1) return { text: `Only ${BRAINS.find((b) => b.id === available()[0]).label} is online right now.` };
      const b = switchBrain(to);
      ctx.brainChanged?.();
      if (!b) return { text: `I don't know a brain called “${to}”. Say “brains” for the list.` };
      if (b.unavailable) return { text: `${b.label} is not available: ${b.unavailable}.` };
      return { text: to === 'auto' ? `Auto mode. Best brain right now: ${b.label}.` : `Brain switched. I'm now ${b.label}, via ${b.vendor}.` };
    },
  },
  {
    id: 'keys', label: 'AI keys', stage: 'execute', help: ['add keys · keys · forget keys', 'paste AI keys once on this device'],
    match: (s) =>
      /^(add|paste|set|save|enter|update)( my| the| ai| api)* keys?$|^(set|add|store|save) (an? )?(ai|api|gemini|groq|unikey|opencode|openrouter) key$/.test(s)
        ? { add: true }
        : /^(ai keys|my (ai |api )?keys|api keys|key status|show (my )?(ai |api )?keys)$/.test(s)
          ? { show: true }
          : /^(forget|remove|delete|clear) (all |my )?(ai |api )?keys$/.test(s)
            ? { forget: true }
            : null,
    run: ({ show, forget }) => {
      const k = keyKinds();
      if (forget)
        return {
          text: `This removes ${k.length} keys from this browser.`,
          confirm: { title: 'Forget all AI keys on this device?', detail: k.map((x) => KEY_KINDS[x]?.label || x).join(', ') || 'none stored', yes: () => (forgetKeys(), { text: 'Keys removed from this device.' }) },
        };
      if (show) return { text: k.length ? `Keys on this device: ${k.map((x) => KEY_KINDS[x]?.label || x).join(', ')}.` : 'No keys on this device yet.', form: 'keys' };
      return { form: 'keys', text: 'Paste your keys — any format, all at once. I recognise Unikey, Groq, Google AI Studio, OpenRouter and OpenCode by prefix. They stay in this browser and go straight to each provider.' };
    },
  },
  {
    id: 'voice', label: 'Voice', stage: 'execute', help: ['hands free · stop listening · speak bangla', 'always-on voice with wake word “Jarvis”'],
    match: (s) => {
      if (/^(hands ?free|always listen(ing)?|wake word|voice mode|conversation mode|listen always|start listening|hey jarvis mode)( on)?$/.test(s)) return { hands: true };
      if (/^(stop listening|hands ?free off|voice mode off|go to sleep|sleep|stop voice)$/.test(s)) return { hands: false };
      if (/^(stop|shut up|quiet|silence|be quiet|চুপ( করো)?|থামো)$/.test(s)) return { hush: true };
      if (/^(speak|talk|reply|answer)( in)? (bangla|bengali)$|^বাংলা(য়)?( বলো| কথা বলো)?$/.test(s)) return { lang: 'bn-BD' };
      if (/^(speak|talk|reply|answer)( in)? english$|^ইংরেজি(তে)?( বলো)?$/.test(s)) return { lang: 'en-US' };
      if (/^(mute|voice off|don'?t speak)$/.test(s)) return { mute: true };
      if (/^(unmute|voice on|speak to me)$/.test(s)) return { unmute: true };
      return null;
    },
    run: (a, ctx) => ctx.voice(a),
  },
  {
    id: 'float', label: 'Jarvis mode', stage: 'execute', help: ['jarvis mode · minimise', 'full-screen assistant over any page'],
    match: (s) => (/^(jarvis mode|full ?screen|focus mode|expand|pop ?out|float)$/.test(s) ? { on: true } : /^(minimi[sz]e|dock|close jarvis|exit (jarvis mode|full ?screen)|collapse)$/.test(s) ? { on: false } : null),
    run: ({ on }) => (window.dispatchEvent(new CustomEvent('rh-jv-float', { detail: on })), { text: on ? 'Jarvis mode — the console fills the screen over any page. Esc or “minimise” docks it.' : 'Docked.' }),
  },
  {
    id: 'tool-add', label: 'Add to index', stage: 'execute', help: ['add this tool <url> [as <name>]', 'save a link to your index or bookmarks'],
    match: (s, raw, ctx) => {
      if (!/\b(add|save|put|include)\b/i.test(raw) || /\bnotes?\b|\bremember\b|\bfavou?rites?\b|\bquick tools\b/i.test(raw)) return null;
      const u = raw.match(/(https?:\/\/\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/\S*)?)/i);
      // Without a link in the sentence, only an explicit "tool / index /
      // bookmark" request may reuse the last link from the conversation.
      if (!u && !/\b(tools?|index|bookmarks?)\b/i.test(raw)) return null;
      if (u && !/\b(tools?|index|bookmarks?|link|site|website|this|that|it)\b/i.test(raw)) return null;
      const url = u ? cleanUrl(/^https?:/i.test(u[1]) ? u[1].replace(/[).,]+$/, '') : `https://${u[1].replace(/[).,]+$/, '')}`) : ctx.lastUrl?.();
      if (!url) return /^(add|save) (this|that|it)( tool| link)?( to (my )?(index|bookmarks?|tools))?$/.test(s) ? { need: true } : null;
      const name = raw.match(/\b(?:as|named|called)\s+["“]?([^"”]+?)["”]?(?:\s+(?:in|to|into)\s+.+)?$/i);
      const bookmark = /\bbookmark/i.test(raw) && !/\btool\b/i.test(raw);
      return { url, name: name?.[1], bookmark };
    },
    run: async ({ url, name, bookmark, need }, ctx) => {
      if (need) return { text: 'Which link? Say or paste it, e.g. “add this tool https://example.com”.' };
      if (!ctx.pin)
        return {
          text: 'Adding to the index is owner-only. Unlock with your PIN, then ask again.',
          confirm: { title: 'Unlock owner mode now?', detail: 'Opens the PIN prompt in the Tools panel', yes: () => (ctx.scrollTo('tools'), setTimeout(() => window.dispatchEvent(new Event('rh-unlock')), 400), { text: 'Enter your PIN, then repeat the request.' }) },
        };
      const host = new URL(url).host.replace(/^www\./, '');
      if (ctx.tools.some((t) => cleanUrl(t.url) === url)) return { text: `${host} is already in your index.` };
      let info = { name: name || '', category: '', description: '' };
      if (!name) {
        try {
          const r = await ctx.think([
            { role: 'system', content: 'Return JSON only: {"name":"short product name","category":"one or two words","description":"one sentence"} for the given website. If unsure, infer from the domain.' },
            { role: 'user', content: url },
          ]);
          info = { ...info, ...JSON.parse(r.text.match(/\{[\s\S]*\}/)[0]) };
        } catch {
          /* fall back to the host name */
        }
      }
      const title = String(info.name || host.split('.')[0].replace(/^\w/, (c) => c.toUpperCase())).slice(0, 60);
      const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) + '-' + Date.now().toString(36).slice(-4);
      const tool = bookmark
        ? { id, name: title, url, kind: 'Bookmark', project: 'Bookmarks', category: 'Bookmarks', description: String(info.description || '').slice(0, 200), visibility: 'private' }
        : { id, name: title, url, kind: 'Tool', project: 'Personal', category: String(info.category || 'Web').slice(0, 30), description: String(info.description || host).slice(0, 200), visibility: 'private' };
      return {
        text: `Ready to add ${title} (${host}) to your ${bookmark ? 'bookmarks' : 'tool index'}.`,
        confirm: {
          title: `Add “${title}”?`,
          detail: `${url} · private (make it public from the Tools panel)`,
          yes: async () => {
            await ctx.post({ a: 'upsert', pin: ctx.pin, tool });
            await ctx.refresh();
            return { text: `Added ${title} to your ${bookmark ? 'bookmarks' : 'index'}. Say “open ${title.toLowerCase()}” any time.`, sources: [{ title, url }] };
          },
        },
      };
    },
  },

  /* ----------------------------------------------------------- diagnostics --- */
  {
    id: 'setup', label: 'Setup', stage: 'execute', help: ['setup · enable browser ai · load local model', 're-run setup, add free on-device AI'],
    match: (s) => (/^(setup|diagnostics?|self ?test|status|models?|ai status)$/.test(s) ? {} : /^(load|download|start) (local|offline|webllm) (model|ai)$/.test(s) ? { webllm: true } : /^(use|check|enable) ollama$/.test(s) ? { ollama: true } : /^(enable|download|use|start) (chrome|edge|browser|on-device|nano|gemini nano|phi)( ai| model)?$/.test(s) ? { chromeai: true } : null),
    run: ({ webllm, ollama, chromeai }) => {
      if (chromeai) return { chromeai: true };
      if (ollama)
        try {
          localStorage.setItem('rh-jv-ollama', '1');
        } catch {
          /* storage blocked */
        }
      return webllm ? { webllm: true } : { setup: true };
    },
  },

  /* ------------------------------------------ open anything in the index --- */
  {
    id: 'open', label: 'Open', stage: 'execute', help: ['open <tool | project | lab>', 'launch anything in the index'],
    match: (s, raw, ctx) => {
      const m = s.match(/^(?:open|launch|run|start|pull up|bring up)\s+(.+)$/);
      if (m) {
        const { terms, typeHint } = parseQuery(m[1]);
        const hit = searchIndex(ctx.index, terms || m[1], { context: ctx.context, pins: ctx.pins, typeHint, limit: 5 }).find((h) => h.type !== 'command');
        return hit ? { call: hit.action } : null;
      }
      // Bare words ("rfi", "dsip tracker") open a tool only on a strong title match.
      if (s.split(/\s+/).length > 3) return null;
      const hit = searchIndex(ctx.index, s, { context: ctx.context, pins: ctx.pins, limit: 3 }).find((h) => h.type === 'tool' && h.score > 4);
      return hit ? { call: hit.action } : null;
    },
    run: ({ call }, ctx) => execute(call, ctx),
  },
];

/** Read-only tools the model itself may call mid-conversation. */
export const MODEL_CALLABLE = ['weather', 'price', 'news', 'search', 'calc', 'time'];

// Match order: explicit verbs first, specific parsers (engineering, units)
// before the generic calculator, loose keyword matchers (weather, price, news,
// search) after, the fuzzy opener last.
const ORDER = ['help', 'voice', 'brain', 'keys', 'float', 'setup', 'notion', 'tool-add', 'remember', 'recall', 'notes', 'bookmark-import', 'bookmark-add', 'bookmark-list', 'file', 'clipboard', 'history', 'favorites', 'install', 'palette', 'motion', 'lab', 'theme', 'vault', 'unlock', 'showtools', 'go', 'youtube', 'google', 'openurl', 'pipe', 'convert', 'calc', 'time', 'price', 'weather', 'news', 'about', 'search', 'find', 'open'];
const SORTED = ORDER.map((id) => TOOLS.find((t) => t.id === id)).concat(TOOLS.filter((t) => !ORDER.includes(t.id)));

export function route(raw, ctx) {
  const s = raw.trim().toLowerCase().replace(/[.!]+$/, '');
  for (const t of SORTED) {
    const args = t.match(s, raw.trim(), ctx);
    if (args) return { tool: t, args };
  }
  return null;
}
