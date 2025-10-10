/**
 * Discover faction-like journals from selected folders and optional keyword match.
 */

function getTextFromJournal(j) {
  const pages = j.pages?.contents ?? j.pages ?? [];
  const texts = [];
  for (const p of pages) {
    const t = p?.text?.content || p?.text || '';
    if (t) texts.push(String(t));
  }
  return texts.join('\n\n');
}

function getFirstImageFromJournal(j) {
  const pages = j.pages?.contents ?? j.pages ?? [];
  for (const p of pages) {
    const img = p?.src || p?.image || p?.image?.src;
    if (img) return img;
  }
  return undefined;
}

export function discoverFactions(config) {
  const journals = game.journal?.contents ?? game.journal ?? [];
  const folders = new Set(config?.includeRules?.filters?.factions?.journalFolders || []);
  const pattern =
    /\b(order|cult|guild|clan|house|syndicate|company|faction|cabal|circle|organization|society)\b/i;
  const results = [];
  for (const j of journals) {
    const fname = j?.folder?.name;
    if (folders.size && !folders.has(fname)) continue;
    const title = j?.name || '';
    const text = getTextFromJournal(j);
    const image = getFirstImageFromJournal(j);
    const score = (pattern.test(title) ? 1 : 0) + (pattern.test(text) ? 1 : 0) + (image ? 0.5 : 0);
    results.push({ doc: j, title, preview: text.slice(0, 200), image, score });
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}
