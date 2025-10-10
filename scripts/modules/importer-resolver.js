/**
 * Second pass resolver for crosslinks (placeholder)
 */

/**
 * Replace UUID links in markdown with Archivist wikilinks when mapping is known.
 * @param {string} markdown
 * @param {(uuid:string)=>{id?:string,type?:string}|undefined} uuidToArchivist
 */
export function resolveCrosslinks(markdown, uuidToArchivist) {
  if (!uuidToArchivist) return markdown;
  return String(markdown || '').replace(/@UUID\[([^\]]+)\]/g, (m, uuid) => {
    const t = uuidToArchivist(uuid) || {};
    if (t?.id) return `[[${t.id}]]`;
    return m;
  });
}
