// Builds app/public/bookmarks.json from scripts/bookmarks-src.json.
// Skips anything already in tools.json (same host + path).
import { readFileSync, writeFileSync } from 'node:fs';

const src = JSON.parse(readFileSync('scripts/bookmarks-src.json', 'utf8'));
const base = JSON.parse(readFileSync('app/public/tools.json', 'utf8')).tools;
const norm = (u) => {
  const x = new URL(u);
  return (x.host.replace(/^www\./, '') + x.pathname.replace(/\/$/, '')).toLowerCase();
};
const have = new Set(base.map((t) => norm(t.url)));
const ids = new Set();
const tools = [];
for (const [category, name, url, description] of src) {
  if (have.has(norm(url))) continue;
  have.add(norm(url));
  let id = 'bm-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
  while (ids.has(id)) id += '-2';
  ids.add(id);
  tools.push({ id, name, owner: 'Rahat', project: 'Bookmarks', category, kind: 'Bookmark', status: 'live', description, url, tags: ['bookmark', category.toLowerCase()], added: '2026-09-23' });
}
writeFileSync('app/public/bookmarks.json', JSON.stringify({ _readme: 'Public bookmarks. Jarvis adds more through the owner API.', tools }, null, 1) + '\n');
console.log(tools.length, 'bookmarks');
