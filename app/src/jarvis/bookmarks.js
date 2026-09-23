/* Bookmark import: Chrome/Edge/Firefox "Export bookmarks" HTML and Raindrop
   CSV. Parsing is local (DOMParser — the file is never executed, only read as
   text), then rows go to the Portfolio Index API as private or public tools. */

const TRACK = /^(utm_|gclid|gbraid|wbraid|fbclid|gad_|_gl$|_branch|mc_)/;

export function cleanUrl(u) {
  try {
    const x = new URL(u);
    if (!/^https?:$/.test(x.protocol)) return null;
    for (const k of [...x.searchParams.keys()]) if (TRACK.test(k)) x.searchParams.delete(k);
    return x.toString();
  } catch {
    return null;
  }
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);

function row(name, url, folder, note) {
  const u = cleanUrl(url);
  if (!u) return null;
  const host = new URL(u).host.replace(/^www\./, '');
  const title = (name || host).replace(/\s+/g, ' ').trim().slice(0, 100);
  return {
    id: 'bm-' + slug(title || host),
    name: title,
    owner: 'Rahat',
    project: 'Bookmarks',
    category: folder || 'Bookmarks',
    kind: 'Bookmark',
    status: 'live',
    description: (note || host).slice(0, 300),
    url: u,
    tags: ['bookmark', ...(folder ? [folder.toLowerCase()] : [])],
  };
}

function parseHtml(text) {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const out = [];
  for (const a of doc.querySelectorAll('a[href]')) {
    // Nearest folder heading: the H3 that precedes this link's <DL>.
    let folder = '';
    const dl = a.closest('dl');
    const h = dl?.previousElementSibling?.tagName === 'H3' ? dl.previousElementSibling : dl?.parentElement?.querySelector(':scope > h3');
    if (h && !/bookmarks bar|other bookmarks/i.test(h.textContent)) folder = h.textContent.trim();
    const r = row(a.textContent, a.getAttribute('href'), folder);
    if (r) out.push(r);
  }
  return out;
}

function parseCsv(text) {
  const rows = [];
  let cur = [''], q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') (cur[cur.length - 1] += '"'), i++;
      else if (c === '"') q = false;
      else cur[cur.length - 1] += c;
    } else if (c === '"') q = true;
    else if (c === ',') cur.push('');
    else if (c === '\n') rows.push(cur), (cur = ['']);
    else if (c !== '\r') cur[cur.length - 1] += c;
  }
  if (cur.length > 1 || cur[0]) rows.push(cur);
  const head = rows.shift()?.map((h) => h.trim().toLowerCase()) || [];
  const col = (n) => head.indexOf(n);
  return rows
    .map((r) => row(r[col('title')], r[col('url')], (r[col('tags')] || r[col('folder')] || '').split(',')[0].trim(), r[col('excerpt')] || r[col('note')]))
    .filter(Boolean);
}

/** Parse, clean and de-duplicate against what the index already holds. */
export function parseBookmarks(text, existing = []) {
  const all = /<!DOCTYPE NETSCAPE|<DL>/i.test(text) ? parseHtml(text) : parseCsv(text);
  const key = (u) => {
    const x = new URL(u);
    return (x.host.replace(/^www\./, '') + x.pathname.replace(/\/$/, '')).toLowerCase();
  };
  const seen = new Set(existing.map((t) => key(t.url)));
  const ids = new Set(existing.map((t) => t.id));
  const fresh = [];
  let dupes = 0;
  for (const r of all) {
    const k = key(r.url);
    if (seen.has(k)) {
      dupes++;
      continue;
    }
    seen.add(k);
    while (ids.has(r.id)) r.id += '-2';
    ids.add(r.id);
    fresh.push(r);
  }
  return { fresh, dupes, total: all.length };
}

export function pickFile(accept = '.html,.htm,.csv') {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = accept;
    i.onchange = () => resolve(i.files?.[0] || null);
    i.click();
  });
}
