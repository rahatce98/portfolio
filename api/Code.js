/**
 * Portfolio Index API — backing store for the Tools index on
 * https://rahatce98.github.io/portfolio/
 *
 * Storage: Script Properties (no Drive / Sheets scope, so no OAuth prompt).
 *   t_<id>   one JSON tool record each
 *   pin      SHA-256 of the admin PIN (set by the owner from the site, once)
 *   log      last 200 change events (for recovery)
 * Deletes are soft (record keeps `deleted: true`) and can be restored.
 *
 * GET  ?a=list                     -> { ok, tools:[...] }  (public)
 * POST {a:'setup', pin}            -> sets PIN only if none exists
 * POST {a:'check', pin}
 * POST {a:'upsert', pin, tool}
 * POST {a:'delete', pin, id}       -> soft delete
 * POST {a:'restore', pin, id}
 * POST {a:'trash', pin}            -> deleted records
 * POST {a:'setpin', pin, next}
 *
 * Visibility: every record has `visibility` 'public' | 'private'. GET returns
 * public records only, plus `hidden` — ids the owner has made private, so the
 * site can also hide a matching baseline entry. Private records come back only
 * through POST {a:'all', pin}.
 *
 * Forgot the PIN? Open this project in the Apps Script editor (signed in as the
 * owner Google account) and run resetPin(). The next unlock on the site asks
 * for a new PIN. That keeps recovery tied to the Google login, with nothing
 * secret stored here.
 */

function resetPin() {
  P.deleteProperty('pin');
  Logger.log('PIN cleared. Open the portfolio, press the lock, and choose a new PIN.');
}

/** Internal work portals — seeded once as private (URLs only, never passwords). */
var SEED = [
  { id: 'rfl-hris', name: 'RFL HRIS', project: 'RFL', category: 'Work Portal', kind: 'Portal', url: 'http://hris.prangroup.com:8686/Login.aspx?returnUrl=~/Pages/Admin/Default.aspx', description: 'PRAN-RFL HR information system.', tags: ['rfl', 'hr'] },
  { id: 'rfl-hris-admin', name: 'RFL HRIS Admin', project: 'RFL', category: 'Work Portal', kind: 'Portal', url: 'https://hris.prangroup.com:8685/Login.aspx?returnUrl=~/Pages/Admin/Default.aspx', description: 'HRIS admin login.', tags: ['rfl', 'hr', 'admin'] },
  { id: 'rfl-hire360', name: 'RFL Hire360', project: 'RFL', category: 'Work Portal', kind: 'Portal', url: 'https://hire360.prangroup.com/candidate/dashboard', description: 'Hire360 candidate dashboard.', tags: ['rfl', 'hr'] },
  { id: 'rfl-ontrack', name: 'RFL OnTrack', project: 'RFL', category: 'Work Portal', kind: 'Portal', url: 'https://ontrack.prangroup.com/ords/r/rpro/ontrack/login', description: 'OnTrack (Oracle APEX).', tags: ['rfl', 'ontrack'] },
  { id: 'gh-websitedevelopement', name: 'Website Development', project: 'Code', category: 'Repository', kind: 'Web App', url: 'https://gorgeous-sorbet-a5f643.netlify.app/', description: 'Private repo rahatce98/WebsiteDevelopement (Netlify).', tags: ['github', 'netlify'] },
  { id: 'gh-v0-portfolio', name: 'v0 Portfolio', project: 'Code', category: 'Repository', kind: 'Repository', url: 'https://github.com/rahatce98/v0-portfolio-website', description: 'Private repo.', tags: ['github', 'v0'] }
];

function seed_() {
  if (P.getProperty('seeded_v2')) return;
  SEED.forEach(function (t) {
    if (P.getProperty('t_' + t.id)) return;
    var r = clean_(Object.assign({ owner: 'Rahat', status: 'private', visibility: 'private' }, t));
    P.setProperty('t_' + r.id, JSON.stringify(r));
  });
  P.setProperty('seeded_v2', '1');
}

var P = PropertiesService.getScriptProperties();

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function hash_(s) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'rh-idx:' + String(s || ''));
  return b.map(function (x) { return ('0' + (x & 255).toString(16)).slice(-2); }).join('');
}

function authed_(pin) {
  var h = P.getProperty('pin');
  return !!h && hash_(pin) === h;
}

/* Brute-force guard: 5 wrong PINs lock writes for 15 minutes. CacheService
   needs no OAuth scope, so this adds no permission prompt. */
var C = CacheService.getScriptCache();
function locked_() { return Number(C.get('fails') || 0) >= 5; }
function fail_() { C.put('fails', String(Number(C.get('fails') || 0) + 1), 900); }

/* Encrypted vault. The browser encrypts with the owner's master password
   (PBKDF2 + AES-GCM) before sending; this script only ever holds ciphertext.
   Stored in chunks because one property is capped at 9 KB. The previous
   version is kept as vaultbak_* so a bad save can be rolled back. */
var CHUNK = 8000;
function readBlob_(prefix) {
  var n = Number(P.getProperty(prefix + 'n') || 0), out = '';
  for (var i = 0; i < n; i++) out += P.getProperty(prefix + i) || '';
  return out;
}
function writeBlob_(prefix, str) {
  var old = Number(P.getProperty(prefix + 'n') || 0), n = Math.ceil(str.length / CHUNK), map = {};
  for (var i = 0; i < n; i++) map[prefix + i] = str.slice(i * CHUNK, (i + 1) * CHUNK);
  map[prefix + 'n'] = String(n);
  P.setProperties(map);
  for (var j = n; j < old; j++) P.deleteProperty(prefix + j);
}

function all_() {
  var props = P.getProperties(), list = [];
  Object.keys(props).forEach(function (k) {
    if (k.indexOf('t_') !== 0) return;
    try { list.push(JSON.parse(props[k])); } catch (e) {}
  });
  return list;
}

function log_(ev) {
  var l = [];
  try { l = JSON.parse(P.getProperty('log') || '[]'); } catch (e) {}
  l.unshift(ev);
  P.setProperty('log', JSON.stringify(l.slice(0, 60)));
}

function clean_(t) {
  var id = String(t.id || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  if (!id) throw new Error('id required');
  if (!/^https?:[/][/]\S+$/.test(String(t.url || ''))) throw new Error('valid url required');
  var s = function (v, n) { return String(v == null ? '' : v).slice(0, n || 300); };
  var meta = {};
  if (t.meta && typeof t.meta === 'object') Object.keys(t.meta).slice(0, 12).forEach(function (k) { meta[s(k, 40)] = s(t.meta[k], 400); });
  return {
    id: id, name: s(t.name, 120) || id, owner: s(t.owner, 60), project: s(t.project, 60),
    category: s(t.category, 60), kind: s(t.kind, 60), status: s(t.status, 20) || 'live',
    description: s(t.description, 600), url: s(t.url, 800), short: s(t.short, 300),
    tags: (Array.isArray(t.tags) ? t.tags : []).slice(0, 12).map(function (x) { return s(x, 40); }),
    meta: meta, visibility: t.visibility === 'private' ? 'private' : 'public', added: s(t.added, 10) || Utilities.formatDate(new Date(), 'Asia/Dhaka', 'yyyy-MM-dd'),
    updated: new Date().toISOString(), deleted: false
  };
}

function doGet(e) {
  seed_();
  var list = all_();
  return out_({
    ok: true,
    tools: list.filter(function (t) { return !t.deleted && t.visibility !== 'private'; }),
    hidden: list.filter(function (t) { return t.deleted || t.visibility === 'private'; }).map(function (t) { return t.id; }),
    hasPin: !!P.getProperty('pin')
  });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (b.a === 'setup') {
      if (P.getProperty('pin')) return out_({ ok: false, error: 'PIN already set' });
      if (String(b.pin || '').length < 4) return out_({ ok: false, error: 'PIN must be 4+ characters' });
      P.setProperty('pin', hash_(b.pin));
      return out_({ ok: true });
    }
    if (locked_()) return out_({ ok: false, error: 'Too many wrong PINs. Try again in 15 minutes.' });
    if (!authed_(b.pin)) { fail_(); Utilities.sleep(800); return out_({ ok: false, error: 'Wrong PIN' }); }
    C.remove('fails');
    if (b.a === 'vaultGet') return out_({ ok: true, blob: readBlob_('vault_'), rev: Number(P.getProperty('vault_rev') || 0) });
    if (b.a === 'vaultPut') {
      var rev = Number(P.getProperty('vault_rev') || 0);
      if (b.rev !== rev) return out_({ ok: false, error: 'Vault changed elsewhere — reload first', rev: rev });
      var blob = String(b.blob || '');
      if (!/^[{]"v":1,/.test(blob) || blob.length > 400000) return out_({ ok: false, error: 'Bad vault payload' });
      var prev = readBlob_('vault_');
      if (prev) writeBlob_('vaultbak_', prev);
      writeBlob_('vault_', blob);
      P.setProperty('vault_rev', String(rev + 1));
      return out_({ ok: true, rev: rev + 1 });
    }
    if (b.a === 'vaultUndo') {
      var bak = readBlob_('vaultbak_');
      if (!bak) return out_({ ok: false, error: 'No earlier version' });
      writeBlob_('vault_', bak);
      P.setProperty('vault_rev', String(Number(P.getProperty('vault_rev') || 0) + 1));
      return out_({ ok: true });
    }
    if (b.a === 'check') return out_({ ok: true });
    if (b.a === 'upsert') {
      var t = clean_(b.tool || {});
      P.setProperty('t_' + t.id, JSON.stringify(t));
      log_({ at: t.updated, a: 'upsert', id: t.id });
      return out_({ ok: true, tool: t });
    }
    if (b.a === 'delete' || b.a === 'restore') {
      var k = 't_' + String(b.id || ''), raw = P.getProperty(k), rec;
      if (raw) rec = JSON.parse(raw);
      else if (b.a === 'delete' && b.tool) rec = clean_(b.tool); // hide a baseline entry
      else return out_({ ok: false, error: 'not found' });
      rec.deleted = b.a === 'delete';
      rec.updated = new Date().toISOString();
      P.setProperty(k, JSON.stringify(rec));
      log_({ at: rec.updated, a: b.a, id: rec.id });
      return out_({ ok: true });
    }
    if (b.a === 'trash') return out_({ ok: true, tools: all_().filter(function (t) { return t.deleted; }) });
    if (b.a === 'all') return out_({ ok: true, tools: all_() });
    if (b.a === 'setpin') {
      if (String(b.next || '').length < 4) return out_({ ok: false, error: 'PIN must be 4+ characters' });
      P.setProperty('pin', hash_(b.next));
      return out_({ ok: true });
    }
    return out_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}
