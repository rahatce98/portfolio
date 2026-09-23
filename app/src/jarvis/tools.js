/* -----------------------------------------------------------------------------
 * Tool registry. Each tool:
 *   id, label, stage ('search' | 'execute'), help: [usage, description]
 *   match(s, raw) -> args | null      s = lower-cased, trimmed input
 *   run(args, ctx) -> reply
 * A reply is { text, sources?, file?, list?, confirm?, summarize? }.
 *   confirm   { title, detail, yes: () => reply }  — the UI asks first
 *   summarize prompt for the model to turn raw data into an answer
 * Add a tool = add an object here. Nothing runs shell commands; side effects
 * are limited to opening tabs, downloads, clipboard, and the owner APIs.
 * -------------------------------------------------------------------------- */

import { webSearch, news, cryptoPrice, weather } from './web';
import { calc, looksLikeMath } from './calc';
import { formatOf, FORMATS, specFor, parseJson, makeFile } from './files';
import { remember, recall, forget, bridge, bridgeStatus, syncPending, BRIDGE_EDITOR } from './memory';
import { parseBookmarks, pickFile, cleanUrl } from './bookmarks';

const LABS = { rocket: 'rocket', car: 'auto', auto: 'auto', systems: 'systems', gear: 'systems', pipe: 'pipe', sewer: 'pipe', beam: 'beam', engine: 'engine', turbofan: 'engine', jet: 'engine' };
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

function openTab(url) {
  window.open(url, '_blank', 'noopener,noreferrer');
}
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
      const m = s.match(/^(?:lab|open lab|show lab|simulate)\s+(.+)$/) || s.match(/^(rocket|car|systems|pipe|beam|engine|turbofan|jet)$/);
      const k = m && Object.keys(LABS).find((x) => m[1].includes(x));
      return k ? { lab: LABS[k] } : null;
    },
    run: ({ lab }) => (window.dispatchEvent(new CustomEvent('rh-lab', { detail: lab })), { text: `Loading the ${lab === 'auto' ? 'automotive' : lab} lab. Esc brings you back.` }),
  },
  {
    id: 'theme', label: 'Theme', stage: 'execute', help: ['theme', 'toggle light / dark'],
    match: (s) => (/^(theme|dark mode|light mode|toggle theme)$/.test(s) ? {} : null),
    run: () => (window.dispatchEvent(new Event('rh-theme')), { text: 'Theme switched.' }),
  },
  {
    id: 'vault', label: 'Vault', stage: 'execute', help: ['vault', 'encrypted passwords & codes'],
    match: (s) => (/^(vault|open vault|passwords?)$/.test(s) ? {} : null),
    run: () => (window.dispatchEvent(new Event('rh-vault')), { text: 'Opening the vault. Your master password never leaves this device.' }),
  },
  {
    id: 'unlock', label: 'Owner', stage: 'execute', help: ['unlock', 'owner mode (PIN)'],
    match: (s) => (/^(unlock|login|admin|owner)$/.test(s) ? {} : null),
    run: (a, ctx) => (ctx.scrollTo('tools'), setTimeout(() => window.dispatchEvent(new Event('rh-unlock')), 400), { text: 'Owner PIN requested — enter it in the Tools panel.' }),
  },
  {
    id: 'go', label: 'Navigate', stage: 'execute', help: ['go <section>', 'tools · projects · lab · contact'],
    match: (s, raw, ctx) => {
      const m = s.match(/^(?:go|goto|go to|show|scroll to|take me to)\s+(.+)$/);
      const sec = m && ctx.sections.find((x) => x.label.toLowerCase().startsWith(m[1]) || x.id.startsWith(m[1]));
      return sec ? { sec } : null;
    },
    run: ({ sec }, ctx) => (ctx.scrollTo(sec.id), { text: `${sec.label}.` }),
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
    id: 'weather', label: 'Weather', stage: 'search', help: ['weather <city>', 'live conditions + 3-day outlook'],
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
    id: 'price', label: 'Crypto price', stage: 'search', help: ['price <coin>', 'live price from CoinGecko'],
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
    id: 'news', label: 'News', stage: 'search', help: ['news [topic]', 'last 24 h headlines, summarised'],
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
    id: 'youtube', label: 'YouTube', stage: 'execute', help: ['youtube <query>', 'search YouTube'],
    match: (s, raw) => {
      const m = raw.match(/^(?:youtube|yt|search youtube for|find on youtube|play)\s+(.+)$/i) || raw.match(/^(.+?)\s+on youtube$/i);
      return m ? { q: m[1] } : null;
    },
    run: ({ q }) => (openTab(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`), { text: `YouTube results for “${q}” are open.` }),
  },
  {
    id: 'google', label: 'Google', stage: 'execute', help: ['google <query>', 'open a Google search tab'],
    match: (s, raw) => {
      const m = raw.match(/^(?:google|search google for|open google for)\s+(.+)$/i);
      return m ? { q: m[1] } : null;
    },
    run: ({ q }) => (openTab(`https://www.google.com/search?q=${encodeURIComponent(q)}`), { text: `Google results for “${q}” are open.` }),
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
    id: 'search', label: 'Web search', stage: 'search', help: ['search <anything>', 'DuckDuckGo + Wikipedia, summarised'],
    match: (s, raw) => {
      const m = raw.match(/^(?:search(?: the web)?(?: for)?|look up|lookup|find(?: me)?(?: the)?|who is|who was|what is|what are|tell me about|define)\s+(.+?)\??$/i);
      return m ? { q: m[1], ask: raw } : null;
    },
    run: async ({ q, ask }, ctx) => {
      const tool = ctx.tools.map((t) => ({ t, sc: ctx.score(t, q) })).filter((x) => x.sc > 2).sort((a, b) => b.sc - a.sc)[0];
      const r = await webSearch(q);
      if (!r.length && tool) return { text: `Top match in your index: ${tool.t.name}.`, sources: [{ title: tool.t.name, url: tool.t.url }] };
      if (!r.length) return { text: `No free source had “${q}”.`, confirm: { title: 'Search Google instead?', detail: q, yes: () => (openTab(`https://www.google.com/search?q=${encodeURIComponent(q)}`), { text: 'Google is open.' }) } };
      const src = tool ? [{ title: `${tool.t.name} (your index)`, url: tool.t.url }, ...r] : r;
      return {
        text: `${r.length} results.`,
        sources: src.slice(0, 6),
        summarize: `Question: ${ask}\nAnswer in 2-5 sentences from these search results only. If a result is the official site or documentation, name it.\n` + r.map((x, i) => `[${i + 1}] ${x.title} — ${x.snippet} (${x.url})`).join('\n'),
      };
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

  {
    id: 'aikey', label: 'AI key', stage: 'execute', help: ['set ai key', 'owner: store a free Gemini / Groq key server-side'],
    match: (s) => (/^(set|add|store|save) (an? )?(ai|gemini|groq|pollinations) key$/.test(s) ? {} : null),
    run: async (a, ctx) => {
      if (!ctx.pin) return { text: 'Owner only. Say “unlock” first.' };
      const st = await bridgeStatus();
      if (st.unauth) return { text: 'The bridge needs its one-time Google authorisation first: open it, choose authorize, press Run.', sources: [{ title: 'Jarvis Notion Bridge — Apps Script', url: BRIDGE_EDITOR }] };
      if (st.ok && !st.pin) await bridge({ a: 'setup', pin: ctx.pin });
      return {
        form: 'aikey',
        text: 'Paste a free key. It is sent once to your Apps Script bridge, tested, and never shown again. Gemini (aistudio.google.com/apikey) and Groq (console.groq.com/keys) are free with no card.',
      };
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

  /* ----------------------------------------------------------- diagnostics --- */
  {
    id: 'setup', label: 'Setup', stage: 'execute', help: ['setup · enable chrome ai · load local model', 're-run setup, add free on-device AI'],
    match: (s) => (/^(setup|diagnostics?|self ?test|status|models?|ai status)$/.test(s) ? {} : /^(load|download|start) (local|offline|webllm) (model|ai)$/.test(s) ? { webllm: true } : /^(use|check|enable) ollama$/.test(s) ? { ollama: true } : /^(enable|download|use|start) (chrome|on-device|nano|gemini nano)( ai| model)?$/.test(s) ? { chromeai: true } : null),
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

  /* ------------------------------------------------ open an indexed tool --- */
  {
    id: 'open', label: 'Open tool', stage: 'execute', help: ['open <tool>', 'launch anything in the index'],
    match: (s, raw, ctx) => {
      const m = s.match(/^(?:open|launch|run|start)\s+(.+)$/);
      const q = m ? m[1] : s.split(/\s+/).length <= 3 ? s : null;
      if (!q) return null;
      const hit = ctx.tools.map((t) => ({ t, sc: ctx.score(t, q) })).filter((x) => x.sc > (m ? 0 : 3)).sort((a, b) => b.sc - a.sc)[0];
      return hit ? { t: hit.t } : null;
    },
    run: ({ t }, ctx) => (ctx.trackOpen(t.id), openTab(t.url), { text: `Launching ${t.name}.` }),
  },
];

/** Read-only tools the model itself may call mid-conversation. */
export const MODEL_CALLABLE = ['weather', 'price', 'news', 'search', 'calc', 'time'];

// Match order: explicit verbs first, loose keyword matchers (weather, price,
// news, search) after, the fuzzy tool opener last.
const ORDER = ['help', 'setup', 'aikey', 'notion', 'remember', 'recall', 'notes', 'bookmark-import', 'bookmark-add', 'bookmark-list', 'file', 'clipboard', 'lab', 'theme', 'vault', 'unlock', 'go', 'youtube', 'google', 'openurl', 'calc', 'time', 'price', 'weather', 'news', 'search', 'open'];
const SORTED = ORDER.map((id) => TOOLS.find((t) => t.id === id)).concat(TOOLS.filter((t) => !ORDER.includes(t.id)));

export function route(raw, ctx) {
  const s = raw.trim().toLowerCase().replace(/[.!]+$/, '');
  for (const t of SORTED) {
    const args = t.match(s, raw.trim(), ctx);
    if (args) return { tool: t, args };
  }
  return null;
}
