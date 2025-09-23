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
    return s
        .replace(/\r\n/g, '\n')
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
        .replace(/\n{3,}/g, '\n\n')
        .trim();
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


