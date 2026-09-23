/* Free, keyless, CORS-open data sources. Each returns plain data plus the
   sources used, so answers can cite where facts came from. */

const get = async (url, ms = 12000) => {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
};
const strip = (s = '') => s.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'");

/** DuckDuckGo instant answer + Wikipedia search, merged. */
export async function webSearch(q) {
  const [ddg, wiki] = await Promise.allSettled([
    get(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`),
    get(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=5&format=json&origin=*`),
  ]);
  const results = [];
  if (ddg.status === 'fulfilled') {
    const d = ddg.value;
    if (d.AbstractText) results.push({ title: d.Heading || q, url: d.AbstractURL, snippet: d.AbstractText });
    if (d.Answer) results.push({ title: 'Instant answer', url: `https://duckduckgo.com/?q=${encodeURIComponent(q)}`, snippet: String(d.Answer) });
    if (d.OfficialWebsite || d.Results?.[0]) {
      const o = d.Results?.[0];
      results.push({ title: o ? strip(o.Text) : 'Official site', url: o?.FirstURL || d.OfficialWebsite, snippet: 'Official website' });
    }
    for (const t of (d.RelatedTopics || []).flatMap((x) => x.Topics || [x]).slice(0, 4))
      if (t.FirstURL && t.Text) results.push({ title: t.Text.split(' - ')[0].slice(0, 80), url: t.FirstURL, snippet: t.Text });
  }
  if (wiki.status === 'fulfilled')
    for (const w of wiki.value.query?.search || [])
      results.push({ title: w.title, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(w.title.replace(/ /g, '_'))}`, snippet: strip(w.snippet) });
  return results.slice(0, 8);
}

/** Latest headlines: GDELT (global news, updated every 15 min), HN as fallback. */
export async function news(topic = '') {
  const q = topic.trim() || 'sourcelang:english';
  try {
    const j = await get(`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(topic.trim() ? `${topic} sourcelang:english` : q)}&mode=artlist&format=json&maxrecords=10&sort=datedesc&timespan=24h`);
    const a = (j.articles || []).map((x) => ({ title: x.title, url: x.url, snippet: `${x.domain} · ${x.seendate?.slice(0, 8)}` }));
    if (a.length) return { source: 'GDELT', items: a };
  } catch {
    /* rate limited — fall through */
  }
  const h = await get(`https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=10${topic ? `&query=${encodeURIComponent(topic)}` : ''}`);
  return { source: 'Hacker News', items: h.hits.filter((x) => x.title).map((x) => ({ title: x.title, url: x.url || `https://news.ycombinator.com/item?id=${x.objectID}`, snippet: `${x.points ?? 0} points` })) };
}

const COIN = { btc: 'bitcoin', bitcoin: 'bitcoin', eth: 'ethereum', ethereum: 'ethereum', sol: 'solana', solana: 'solana', bnb: 'binancecoin', xrp: 'ripple', doge: 'dogecoin', ada: 'cardano', near: 'near', ton: 'the-open-network', trx: 'tron', dot: 'polkadot', ltc: 'litecoin', usdt: 'tether' };

export async function cryptoPrice(name) {
  const n = name.toLowerCase().trim();
  let id = COIN[n];
  if (!id) {
    const s = await get(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(n)}`);
    id = s.coins?.[0]?.id;
  }
  if (!id) throw new Error(`No coin called “${name}”`);
  const j = await get(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd,bdt&include_24hr_change=true&include_market_cap=true`);
  const p = j[id];
  if (!p) throw new Error('No price');
  return { id, usd: p.usd, bdt: p.bdt, change: p.usd_24h_change, cap: p.usd_market_cap, source: 'CoinGecko', url: `https://www.coingecko.com/en/coins/${id}` };
}

const WMO = { 0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'rime fog', 51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain', 71: 'light snow', 73: 'snow', 75: 'heavy snow', 80: 'rain showers', 81: 'heavy showers', 82: 'violent showers', 95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'severe thunderstorm' };

export async function weather(place = 'Dhaka') {
  const g = await get(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1`);
  const loc = g.results?.[0];
  if (!loc) throw new Error(`Can’t find “${place}”`);
  const w = await get(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=3`);
  return {
    place: `${loc.name}${loc.country ? ', ' + loc.country : ''}`,
    temp: w.current.temperature_2m,
    feels: w.current.apparent_temperature,
    humidity: w.current.relative_humidity_2m,
    wind: w.current.wind_speed_10m,
    sky: WMO[w.current.weather_code] || 'unknown',
    days: w.daily.time.map((d, i) => ({ d, hi: w.daily.temperature_2m_max[i], lo: w.daily.temperature_2m_min[i], rain: w.daily.precipitation_probability_max[i] })),
    tz: w.timezone,
    source: 'Open-Meteo',
  };
}

/** Quick reachability check used by setup. */
export async function pingWeb() {
  const r = await Promise.allSettled([
    get('https://api.coingecko.com/api/v3/ping', 6000),
    get('https://api.open-meteo.com/v1/forecast?latitude=23.8&longitude=90.4&current=temperature_2m', 6000),
    get('https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json&origin=*', 6000),
  ]);
  return r.filter((x) => x.status === 'fulfilled').length;
}
