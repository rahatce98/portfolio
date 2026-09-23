/* File makers. Libraries load only when a file is requested, so the site's
   first paint pays nothing for them. Everything runs in the browser. */

export const FORMATS = {
  excel: { ext: 'xlsx', label: 'Excel' },
  word: { ext: 'docx', label: 'Word' },
  powerpoint: { ext: 'pptx', label: 'PowerPoint' },
  csv: { ext: 'csv', label: 'CSV' },
  markdown: { ext: 'md', label: 'Markdown' },
  json: { ext: 'json', label: 'JSON' },
  text: { ext: 'txt', label: 'Text' },
  html: { ext: 'html', label: 'HTML' },
};

export function formatOf(s) {
  if (/\b(excel|xlsx|spreadsheet|sheet|workbook)\b/.test(s)) return 'excel';
  if (/\b(word|docx|document|doc|report|letter)\b/.test(s)) return 'word';
  if (/\b(powerpoint|pptx|ppt|slides?|deck|presentation)\b/.test(s)) return 'powerpoint';
  if (/\bcsv\b/.test(s)) return 'csv';
  if (/\b(markdown|md)\b/.test(s)) return 'markdown';
  if (/\bjson\b/.test(s)) return 'json';
  if (/\bhtml\b/.test(s)) return 'html';
  if (/\b(txt|text file|text)\b/.test(s)) return 'text';
  return null;
}

/* What the model is asked to return for each format. Plain JSON keeps the
   output checkable before anything is written. */
export const SPEC = {
  table: 'Return ONLY JSON: {"title": string, "columns": [string], "rows": [[cell,...]]}. Up to 40 rows. Numbers as numbers.',
  doc: 'Return ONLY JSON: {"title": string, "sections": [{"heading": string, "paragraphs": [string], "bullets": [string]}]}.',
  deck: 'Return ONLY JSON: {"title": string, "subtitle": string, "slides": [{"title": string, "bullets": [string], "notes": string}]}. 5 to 10 slides, max 6 bullets each.',
};
export const specFor = (f) => (f === 'excel' || f === 'csv' ? SPEC.table : f === 'powerpoint' ? SPEC.deck : SPEC.doc);

export function parseJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Model did not return JSON');
  return JSON.parse(m[0]);
}

function save(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { url, name, size: blob.size };
}

const slug = (s) => (s || 'jarvis').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'jarvis';

export async function makeFile(format, data) {
  const name = `${slug(data.title)}.${FORMATS[format].ext}`;

  if (format === 'excel') {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([data.columns, ...data.rows]);
    ws['!cols'] = data.columns.map((c, i) => ({ wch: Math.min(48, Math.max(String(c).length, ...data.rows.map((r) => String(r[i] ?? '').length)) + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, String(data.title || 'Sheet1').slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    return save(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
  }
  if (format === 'csv') {
    const esc = (v) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));
    const csv = [data.columns, ...data.rows].map((r) => r.map(esc).join(',')).join('\r\n');
    return save(new Blob(['﻿' + csv], { type: 'text/csv' }), name);
  }
  if (format === 'word') {
    const d = await import('docx');
    const children = [new d.Paragraph({ text: data.title, heading: d.HeadingLevel.TITLE })];
    for (const s of data.sections || []) {
      if (s.heading) children.push(new d.Paragraph({ text: s.heading, heading: d.HeadingLevel.HEADING_1 }));
      for (const p of s.paragraphs || []) children.push(new d.Paragraph({ children: [new d.TextRun(p)], spacing: { after: 160 } }));
      for (const b of s.bullets || []) children.push(new d.Paragraph({ text: b, bullet: { level: 0 } }));
    }
    const doc = new d.Document({ creator: 'J.A.R.V.I.S.', title: data.title, sections: [{ children }] });
    return save(await d.Packer.toBlob(doc), name);
  }
  if (format === 'powerpoint') {
    const { default: PptxGenJS } = await import('pptxgenjs');
    const p = new PptxGenJS();
    p.layout = 'LAYOUT_WIDE';
    const bg = '0B1220', ink = 'E8EEF7', accent = '56DCFF';
    const t = p.addSlide();
    t.background = { color: bg };
    t.addText(data.title, { x: 0.7, y: 2.4, w: 12, h: 1.2, fontSize: 40, bold: true, color: ink, fontFace: 'Segoe UI' });
    if (data.subtitle) t.addText(data.subtitle, { x: 0.7, y: 3.6, w: 12, h: 0.6, fontSize: 18, color: accent, fontFace: 'Segoe UI' });
    for (const s of data.slides || []) {
      const sl = p.addSlide();
      sl.background = { color: bg };
      sl.addShape(p.ShapeType.rect, { x: 0.7, y: 0.55, w: 0.08, h: 0.7, fill: { color: accent } });
      sl.addText(s.title, { x: 0.95, y: 0.45, w: 11.5, h: 0.9, fontSize: 28, bold: true, color: ink, fontFace: 'Segoe UI' });
      sl.addText((s.bullets || []).map((b) => ({ text: b, options: { bullet: true, breakLine: true } })), { x: 0.95, y: 1.6, w: 11.4, h: 5, fontSize: 18, color: 'C9D3E3', fontFace: 'Segoe UI', valign: 'top', paraSpaceAfter: 10 });
      if (s.notes) sl.addNotes(s.notes);
    }
    return save(await p.write({ outputType: 'blob' }), name);
  }
  const md = data.sections
    ? `# ${data.title}\n\n` + data.sections.map((s) => `## ${s.heading}\n\n${(s.paragraphs || []).join('\n\n')}\n${(s.bullets || []).map((b) => `- ${b}`).join('\n')}`).join('\n\n')
    : `# ${data.title}\n\n| ${data.columns.join(' | ')} |\n| ${data.columns.map(() => '---').join(' | ')} |\n` + data.rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
  if (format === 'json') return save(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), name);
  if (format === 'html') {
    const e = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    const body = data.sections
      ? data.sections.map((s) => `<h2>${e(s.heading)}</h2>${(s.paragraphs || []).map((p) => `<p>${e(p)}</p>`).join('')}<ul>${(s.bullets || []).map((b) => `<li>${e(b)}</li>`).join('')}</ul>`).join('')
      : `<table><tr>${data.columns.map((c) => `<th>${e(c)}</th>`).join('')}</tr>${data.rows.map((r) => `<tr>${r.map((c) => `<td>${e(c)}</td>`).join('')}</tr>`).join('')}</table>`;
    return save(new Blob([`<!doctype html><meta charset="utf-8"><title>${e(data.title)}</title><style>body{font:16px/1.6 system-ui;max-width:760px;margin:40px auto;padding:0 16px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}</style><h1>${e(data.title)}</h1>${body}`], { type: 'text/html' }), name);
  }
  return save(new Blob([md], { type: format === 'markdown' ? 'text/markdown' : 'text/plain' }), name);
}
