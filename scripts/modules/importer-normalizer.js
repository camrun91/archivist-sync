/**
 * Normalizers for text and media
 */

function stripFoundryBoilerplate(html) {
  const s = String(html || '');
  // Remove inline roll tokens and excessive attributes; keep readable text
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/@UUID\[[^\]]+\]/g, '')
    .replace(/\sdata-[a-zA-Z-]+="[^"]*"/g, '')
    .trim();
}

export function htmlToMarkdown(html) {
  const s = stripFoundryBoilerplate(html);
  // Minimal HTML→Markdown for paragraphs, bold, italics, lists
  return (
    s
      .replace(/\r\n/g, '\n')
      // Headings
      .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, t) => `\n# ${t}\n\n`)
      .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, t) => `\n## ${t}\n\n`)
      .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, t) => `\n### ${t}\n\n`)
      .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, t) => `\n#### ${t}\n\n`)
      .replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_, t) => `\n##### ${t}\n\n`)
      .replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, (_, t) => `\n###### ${t}\n\n`)
      // Horizontal rules
      .replace(/<hr\s*\/?>/gi, '\n\n---\n\n')
      // Links
      .replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
      .replace(/<\/?strong>/g, '**')
      .replace(/<\/?b>/g, '**')
      .replace(/<\/?em>/g, '_')
      .replace(/<\/?i>/g, '_')
      .replace(/<p[^>]*>/g, '')
      .replace(/<\/p>/g, '\n\n')
      .replace(/<li[^>]*>/g, '- ')
      .replace(/<\/li>/g, '\n')
      .replace(/<ul[^>]*>/g, '')
      .replace(/<\/ul>/g, '\n')
      .replace(/<br\s*\/?>(?=\n?)/g, '\n')
      .replace(/<[^>]+>/g, '')
      // Basic entity decoding
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

export function synthesizeDescription(primary, fallbacks = []) {
  const first = String(primary || '').trim();
  if (first) return htmlToMarkdown(first);
  for (const f of fallbacks) {
    const t = String(f || '').trim();
    if (t) return htmlToMarkdown(t);
  }
  return '';
}

/**
 * Attempt to unwrap a value to a plain string.
 * - null/undefined → ''
 * - string → trimmed string
 * - arrays → join recursively with newlines
 * - objects → try common fields like value/public/content/html; otherwise ''
 */
export function unwrapToPlainText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value
      .map(v => unwrapToPlainText(v))
      .filter(Boolean)
      .join('\n');
  }
  if (typeof value === 'object') {
    const candidates = [value.value, value.public, value.content, value.html, value.text];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) return c.trim();
    }
    return '';
  }
  try {
    return String(value).trim();
  } catch (_) {
    return '';
  }
}

/**
 * Convert a possibly-HTML string to markdown if it looks like HTML; otherwise return as-is.
 */
export function toMarkdownIfHtml(text) {
  const s = unwrapToPlainText(text);
  if (!s) return '';
  // Heuristic: treat as HTML if it contains tags
  if (/[<][a-zA-Z][\s\S]*[>]/.test(s)) return htmlToMarkdown(s);
  return s;
}
