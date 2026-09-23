/**
 * Jarvis Notion Bridge — lets the portfolio's J.A.R.V.I.S. console keep its
 * long-term memory in Notion. The browser cannot call the Notion API directly
 * (no CORS), and the Notion token must never reach the browser, so it lives
 * here in Script Properties and is never returned by any action.
 *
 * One-time owner setup:
 *   1. Open this project in the Apps Script editor and run authorize() once
 *      (grants the "connect to external service" permission).
 *   2. In Jarvis: "connect notion" -> paste an internal-integration token
 *      (notion.so/profile/integrations, free) and the URL of a Notion page
 *      shared with that integration. The bridge creates the "JARVIS Memory"
 *      database under that page by itself.
 *
 * It also proxies free-tier AI (Gemini / Groq / Pollinations keys set by the
 * owner) so Jarvis has a reliable cloud fallback without any key in the site.
 *
 * POST {a:'status'}                          -> { ok, pin, notion, ai:[kinds] }
 * POST {a:'ai', messages}                    -> { ok, text, provider } (public, capped)
 * POST {a:'setkey', pin, kind, key}          -> stores + tests a free-tier key
 * POST {a:'setup', pin}                      -> sets PIN only if none exists
 * POST {a:'connect', pin, token, page}       -> stores token, creates database
 * POST {a:'put', pin, text, kind, tags}      -> new memory row
 * POST {a:'list', pin, q}                    -> latest 50 rows (optional search)
 * POST {a:'forget', pin, id}                 -> archives a row
 */

var P = PropertiesService.getScriptProperties();
var C = CacheService.getScriptCache();
var NV = '2022-06-28';

function authorize() {
  UrlFetchApp.fetch('https://api.notion.com/v1/users/me', { muteHttpExceptions: true });
  Logger.log('Authorized. Jarvis can now reach Notion.');
}

function resetPin() { P.deleteProperty('pin'); }

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function hash_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'jv-bridge:' + String(s || ''))
    .map(function (x) { return ('0' + (x & 255).toString(16)).slice(-2); }).join('');
}

function notion_(method, path, body) {
  var r = UrlFetchApp.fetch('https://api.notion.com/v1' + path, {
    method: method, muteHttpExceptions: true, contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + P.getProperty('token'), 'Notion-Version': NV },
    payload: body ? JSON.stringify(body) : undefined
  });
  var j = JSON.parse(r.getContentText() || '{}');
  if (r.getResponseCode() >= 300) throw new Error('Notion: ' + (j.message || r.getResponseCode()));
  return j;
}

function pageId_(s) {
  var m = String(s || '').replace(/-/g, '').match(/[0-9a-f]{32}/i);
  if (!m) throw new Error('Could not read a Notion page id from that link');
  return m[0];
}

function row_(p) {
  var pr = p.properties || {};
  var t = function (x) { return ((x && (x.title || x.rich_text)) || []).map(function (y) { return y.plain_text; }).join(''); };
  return {
    id: p.id, text: t(pr.Memory), kind: pr.Kind && pr.Kind.select ? pr.Kind.select.name : '',
    tags: pr.Tags ? pr.Tags.multi_select.map(function (x) { return x.name; }) : [], at: p.created_time
  };
}

/* ------------------------------------------------------------------ AI --- */
/* Server-side free-tier models, used when the browser-side free options are
   busy. Anyone on the site may use this path, so it is capped per day. */

var AI_DAILY_CAP = 500;

function aiKinds_() {
  return ['gemini', 'groq', 'pollinations'].filter(function (k) { return !!P.getProperty({ gemini: 'k_gemini', pollinations: 'k_poll', groq: 'k_groq' }[k]); });
}

function ai_(messages, only) {
  if (!Array.isArray(messages) || !messages.length) return { ok: false, error: 'no messages' };
  var msgs = messages.slice(-14).map(function (m) {
    return { role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user', content: String(m.content || '').slice(0, 6000) };
  });
  var day = 'ai_' + Utilities.formatDate(new Date(), 'Asia/Dhaka', 'yyyyMMdd');
  var used = Number(C.get(day) || 0);
  if (!only && used >= AI_DAILY_CAP) return { ok: false, error: 'daily cap reached' };
  C.put(day, String(used + 1), 21600);
  var order = only ? [only] : aiKinds_();
  var errs = [];
  for (var i = 0; i < order.length; i++) {
    try {
      var text = order[i] === 'gemini' ? gemini_(msgs) : openaiLike_(order[i], msgs);
      if (text) return { ok: true, text: text, provider: order[i] };
    } catch (err) {
      errs.push(order[i] + ': ' + (err && err.message || err));
    }
  }
  return { ok: false, error: errs.join('; ') || 'no server-side AI key set' };
}

function gemini_(msgs) {
  var sys = msgs.filter(function (m) { return m.role === 'system'; }).map(function (m) { return m.content; }).join('\n');
  var body = {
    contents: msgs.filter(function (m) { return m.role !== 'system'; }).map(function (m) {
      return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] };
    }),
    generationConfig: { temperature: 0.5, maxOutputTokens: 2048 }
  };
  if (sys) body.systemInstruction = { parts: [{ text: sys }] };
  var r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-goog-api-key': P.getProperty('k_gemini') }, payload: JSON.stringify(body)
  });
  var j = JSON.parse(r.getContentText() || '{}');
  if (r.getResponseCode() >= 300) throw new Error((j.error && j.error.message) || r.getResponseCode());
  return ((j.candidates || [])[0] || {}).content.parts.map(function (p) { return p.text || ''; }).join('');
}

function openaiLike_(kind, msgs) {
  var cfg = {
    groq: ['https://api.groq.com/openai/v1/chat/completions', 'k_groq', 'llama-3.3-70b-versatile'],
    pollinations: ['https://gen.pollinations.ai/v1/chat/completions', 'k_poll', 'openai']
  }[kind];
  var r = UrlFetchApp.fetch(cfg[0], {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + P.getProperty(cfg[1]) },
    payload: JSON.stringify({ model: cfg[2], messages: msgs })
  });
  var j = JSON.parse(r.getContentText() || '{}');
  if (r.getResponseCode() >= 300) throw new Error((j.error && (j.error.message || j.error)) || r.getResponseCode());
  return j.choices[0].message.content;
}

function doGet() { return out_({ ok: true, service: 'jarvis-notion-bridge', notion: !!P.getProperty('db') }); }

function doPost(e) {
  // AI calls are stateless and slow — keep them outside the script lock.
  try {
    var pre = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (pre.a === 'ai') return out_(ai_(pre.messages));
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (b.a === 'status') return out_({ ok: true, pin: !!P.getProperty('pin'), notion: !!P.getProperty('db'), ai: aiKinds_() });
    if (b.a === 'setup') {
      if (P.getProperty('pin')) return out_({ ok: false, error: 'PIN already set' });
      if (String(b.pin || '').length < 4) return out_({ ok: false, error: 'PIN must be 4+ characters' });
      P.setProperty('pin', hash_(b.pin));
      return out_({ ok: true });
    }
    if (Number(C.get('fails') || 0) >= 5) return out_({ ok: false, error: 'Too many wrong PINs. Try again in 15 minutes.' });
    if (!P.getProperty('pin') || hash_(b.pin) !== P.getProperty('pin')) {
      C.put('fails', String(Number(C.get('fails') || 0) + 1), 900);
      Utilities.sleep(800);
      return out_({ ok: false, error: 'Wrong PIN' });
    }
    C.remove('fails');

    if (b.a === 'setkey') {
      // Free-tier AI keys (Gemini from aistudio.google.com, Pollinations from
      // enter.pollinations.ai). Stored here, never sent back to any browser.
      var kind = { gemini: 'k_gemini', pollinations: 'k_poll', groq: 'k_groq' }[b.kind];
      if (!kind) return out_({ ok: false, error: 'unknown key kind' });
      var key = String(b.key || '').trim();
      if (!key) P.deleteProperty(kind);
      else if (key.length < 20 || key.length > 200 || /\s/.test(key)) return out_({ ok: false, error: 'That does not look like an API key' });
      else P.setProperty(kind, key);
      var test = key ? ai_([{ role: 'user', content: 'Reply with the word ready.' }], b.kind) : { ok: true };
      return out_({ ok: test.ok, error: test.error, ai: aiKinds_() });
    }
    if (b.a === 'connect') {
      if (!/^(secret_|ntn_)\w{20,}$/.test(String(b.token || ''))) return out_({ ok: false, error: 'That does not look like a Notion integration token' });
      P.setProperty('token', String(b.token));
      var parent = pageId_(b.page);
      var db = notion_('post', '/databases', {
        parent: { type: 'page_id', page_id: parent },
        title: [{ type: 'text', text: { content: 'JARVIS Memory' } }],
        properties: {
          Memory: { title: {} },
          Kind: { select: { options: [{ name: 'fact' }, { name: 'preference' }, { name: 'note' }, { name: 'task' }, { name: 'bookmark' }] } },
          Tags: { multi_select: {} },
          Source: { rich_text: {} }
        }
      });
      P.setProperty('db', db.id);
      return out_({ ok: true, url: db.url });
    }
    if (!P.getProperty('db')) return out_({ ok: false, error: 'Notion not connected yet' });
    var dbId = P.getProperty('db');

    if (b.a === 'put') {
      var text = String(b.text || '').slice(0, 1900);
      if (!text) return out_({ ok: false, error: 'empty' });
      var pg = notion_('post', '/pages', {
        parent: { database_id: dbId },
        properties: {
          Memory: { title: [{ text: { content: text } }] },
          Kind: { select: { name: String(b.kind || 'note').slice(0, 40) } },
          Tags: { multi_select: (Array.isArray(b.tags) ? b.tags : []).slice(0, 8).map(function (x) { return { name: String(x).replace(/,/g, ' ').slice(0, 40) }; }) },
          Source: { rich_text: [{ text: { content: 'jarvis' } }] }
        }
      });
      return out_({ ok: true, row: row_(pg) });
    }
    if (b.a === 'list') {
      var q = { page_size: 50, sorts: [{ timestamp: 'created_time', direction: 'descending' }] };
      if (b.q) q.filter = { property: 'Memory', title: { contains: String(b.q).slice(0, 100) } };
      var res = notion_('post', '/databases/' + dbId + '/query', q);
      return out_({ ok: true, rows: res.results.map(row_) });
    }
    if (b.a === 'forget') {
      notion_('patch', '/pages/' + String(b.id || '').replace(/[^0-9a-f-]/gi, ''), { archived: true });
      return out_({ ok: true });
    }
    return out_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}
