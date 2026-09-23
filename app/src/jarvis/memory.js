/* Memory: always kept on this device; mirrored to Notion through the Jarvis
   Notion Bridge (Apps Script) once the owner connects it. The Notion token
   lives only in the bridge's Script Properties — never in this bundle. */

export const BRIDGE =
  'https://script.google.com/macros/s/AKfycbxr1b2o1d3fUJ8TueKh6wb8KozRxnN_OYXsTX9RZBFmes_SvzDVUwLQ_LiLhhmISGkzWg/exec';
export const BRIDGE_EDITOR = 'https://script.google.com/d/1kSwreFEGViG-gZOVJfR8Srkt3WjMJH4nII_V19QPJCsTFanELYwQ4Paj/edit';

const K = 'rh-jv-memory';
const load = () => {
  try {
    return JSON.parse(localStorage.getItem(K) || '[]');
  } catch {
    return [];
  }
};
const keep = (a) => {
  try {
    localStorage.setItem(K, JSON.stringify(a.slice(0, 300)));
  } catch {
    /* storage blocked */
  }
};

export const localMemories = load;

export async function bridge(body) {
  let r;
  try {
    r = await fetch(BRIDGE, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
  } catch {
    // An unauthorised Apps Script answers without CORS headers, which the
    // browser reports as a network failure.
    throw Object.assign(new Error('Bridge unreachable — it likely still needs its one-time authorize() run'), { unauth: true });
  }
  const t = await r.text();
  let j;
  try {
    j = JSON.parse(t);
  } catch {
    // Apps Script answers with an HTML sign-in page until the owner authorises it.
    throw Object.assign(new Error('Bridge not authorised yet — run authorize() once in its Apps Script editor'), { unauth: true });
  }
  if (!j.ok) throw new Error(j.error || 'Bridge error');
  return j;
}

export async function bridgeStatus() {
  try {
    return await bridge({ a: 'status' });
  } catch (e) {
    return { ok: false, error: e.message, unauth: e.unauth };
  }
}

export async function remember(text, { kind = 'note', tags = [], pin } = {}) {
  const row = { id: 'l' + Date.now().toString(36), text, kind, tags, at: new Date().toISOString(), synced: false };
  if (pin) {
    try {
      const j = await bridge({ a: 'put', pin, text, kind, tags });
      row.synced = true;
      row.nid = j.row.id;
    } catch (e) {
      row.err = e.message;
    }
  }
  keep([row, ...load()]);
  return row;
}

export async function recall(q = '', pin) {
  const s = q.toLowerCase();
  const local = load().filter((m) => !s || m.text.toLowerCase().includes(s));
  if (!pin) return { rows: local, from: 'device' };
  try {
    const j = await bridge({ a: 'list', pin, q });
    const seen = new Set(j.rows.map((r) => r.text));
    return { rows: [...j.rows, ...local.filter((m) => !seen.has(m.text))], from: 'Notion + device' };
  } catch (e) {
    return { rows: local, from: 'device', err: e.message };
  }
}

export async function forget(q, pin) {
  const s = q.toLowerCase();
  const all = load();
  const hit = all.filter((m) => m.text.toLowerCase().includes(s));
  keep(all.filter((m) => !hit.includes(m)));
  if (pin)
    for (const m of hit)
      if (m.nid)
        await bridge({ a: 'forget', pin, id: m.nid }).catch(() => {
          /* keep going */
        });
  return hit.length;
}

/** Push rows saved while the bridge was offline. */
export async function syncPending(pin) {
  const all = load();
  let n = 0;
  for (const m of all.filter((x) => !x.synced)) {
    try {
      const j = await bridge({ a: 'put', pin, text: m.text, kind: m.kind, tags: m.tags });
      m.synced = true;
      m.nid = j.row.id;
      delete m.err;
      n++;
    } catch {
      break;
    }
  }
  keep(all);
  return n;
}

/** Short context string handed to the model so it "knows" the owner. */
export function memoryContext() {
  return load()
    .slice(0, 20)
    .map((m) => `- ${m.text}`)
    .join('\n');
}
