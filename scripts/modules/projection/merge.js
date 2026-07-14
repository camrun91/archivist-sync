// Merge helper: inject Archivist content into an existing field non-destructively

const WRAP_START = '<section class="archivist-desc" data-archivist="true">';
const WRAP_END = '</section>';
const TEXT_WRAP_START = '[Archivist]';
const TEXT_WRAP_END = '[/Archivist]';

/**
 * Create a wrapped block containing Archivist HTML content.
 * @param {string} html
 */
export function toArchivistBlock(html) {
  const safe = String(html ?? '');
  return `${WRAP_START}${safe}${WRAP_END}`;
}

/**
 * Replace existing Archivist block or append one at the end.
 * @param {string} existingHtml
 * @param {string} archivistHtml
 */
export function mergeArchivistSection(existingHtml, archivistHtml) {
  const current = String(existingHtml ?? '');
  const block = toArchivistBlock(archivistHtml);
  const re =
    /<section[^>]*data-archivist=["']true["'][^>]*>[\s\S]*?<\/section>/i;
  if (!current) return block;
  if (re.test(current)) return current.replace(re, block);
  return `${current}\n<hr/>\n${block}`;
}

/**
 * Strip HTML down to plain text via Foundry's TextEditor if available.
 * @param {string} html
 */
export function stripHtml(html) {
  try {
    const s = String(html ?? '');
    const te = foundry?.utils?.TextEditor;
    if (te?.stripHTML) return te.stripHTML(s);
    const tmp = document.createElement('div');
    tmp.innerHTML = s;
    return (tmp.textContent || '').trim();
  } catch (_) {
    return String(html || '');
  }
}

/**
 * Create a wrapped block containing Archivist plain text content, marked so a
 * later sync can find and replace just this block (mirrors toArchivistBlock's
 * behavior for the HTML case).
 * @param {string} text
 */
export function toArchivistPlainBlock(text) {
  const safe = String(text ?? '');
  return `${TEXT_WRAP_START}\n${safe}\n${TEXT_WRAP_END}`;
}

/**
 * Non-destructively merge Archivist content into a plain-text (non-HTML)
 * field: appends a marked block (or replaces its own previously-injected
 * block on re-sync) instead of overwriting the field's existing content.
 * @param {string} existingText
 * @param {string} archivistHtml - raw Archivist HTML/markdown; stripped to plain text before merging
 */
export function mergeArchivistPlainSection(existingText, archivistHtml) {
  const current = String(existingText ?? '');
  const block = toArchivistPlainBlock(stripHtml(archivistHtml));
  const re = /\[Archivist\][\s\S]*?\[\/Archivist\]/;
  if (!current) return block;
  if (re.test(current)) return current.replace(re, block);
  return `${current}\n\n${block}`;
}
