// Merge helper: inject Archivist HTML into an existing HTML field non-destructively

const WRAP_START = '<section class="archivist-desc" data-archivist="true">';
const WRAP_END = '</section>';

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
    const re = /<section[^>]*data-archivist=["']true["'][^>]*>[\s\S]*?<\/section>/i;
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


