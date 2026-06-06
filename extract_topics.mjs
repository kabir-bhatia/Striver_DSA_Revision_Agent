// Extract topics from Striver A2Z sheet - lightweight version
import { writeFileSync } from 'node:fs';

const url = 'https://takeuforward.org/dsa/strivers-a2z-sheet-learn-dsa-a-to-z';

async function main() {
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) StriverRevisionAgent/0.1' }
  });
  const html = await res.text();

  // Extract Next.js flight data
  const pieces = [];
  const pushRegex = /self\.__next_f\.push\(\[1,("(?:(?:\\.|[^"\\])*)")\]\)/g;
  let match;
  while ((match = pushRegex.exec(html))) {
    try { pieces.push(JSON.parse(match[1])); } catch { pieces.push(match[1]); }
  }
  let flight = pieces.join('');

  const candidates = [flight, unesc(flight), html, unesc(html)];

  for (const candidate of candidates) {
    const payload = tryExtract(candidate);
    if (payload) {
      // Only extract minimal data: names only
      const result = payload.sections.map(s => ({
        n: s.category_name,
        subs: s.subcategories.map(sub => ({
          n: sub.subcategory_name,
          p: sub.problems.map(p => p.problem_name)
        }))
      }));
      writeFileSync('./extracted_data.json', JSON.stringify(result));
      console.log('Done: ' + result.length + ' sections');
      // Free memory
      flight = null;
      return;
    }
  }
  console.error('Failed to extract');
}

function unesc(val) {
  return val.replaceAll('\\u0026', '&').replaceAll('\\"', '"').replaceAll('\\/', '/');
}

function tryExtract(text) {
  const marker = text.indexOf('"sections":') >= 0 ? '"sections":' : '\\"sections\\":';
  const idx = text.indexOf(marker);
  if (idx < 0) return undefined;
  const start = text.lastIndexOf('{', idx);
  if (start < 0) return undefined;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    if (c === '}') { depth--; if (depth === 0) {
      try {
        const parsed = JSON.parse(text.slice(start, i + 1));
        if (Array.isArray(parsed.sections)) return parsed;
      } catch { return undefined; }
    }}
  }
  return undefined;
}

main().catch(e => console.error(e));
