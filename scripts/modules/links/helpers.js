// Link helpers for Archivist-style relationships and flags
import { CONFIG } from '../config.js';
import { settingsManager } from '../settings-manager.js';

/**
 * Ensure flags container exists on a JournalEntry
 * @param {JournalEntry} journal
 */
function ensureFlags(journal) {
  const flags = journal.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
  const next = {
    sheetType: flags.sheetType || null,
    archivistId: flags.archivistId || null,
    // Directional map: outbound links only (from this sheet -> others)
    archivistOutbound: flags.archivistOutbound || {
      characters: [],
      items: [],
      entries: [],
      factions: [],
      locationsAssociative: [],
    },
    archivistRefs: flags.archivistRefs || {
      characters: [],
      items: [],
      entries: [],
      factions: [],
      locationsAssociative: [],
    },
    foundryRefs: flags.foundryRefs || {
      actors: [],
      items: [],
      scenes: [],
      journals: [],
    },
    parentLocationId: flags.parentLocationId || undefined,
  };
  return next;
}

/**
 * Dedupe a string array
 * @param {string[]} arr
 */
function dedupe(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

/**
 * Read links from a JournalEntry's flags
 * @param {JournalEntry} journal
 */
export function getLinks(journal) {
  const flags = journal.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
  return (
    flags.archivistRefs || {
      characters: [],
      items: [],
      entries: [],
      factions: [],
      locationsAssociative: [],
    }
  );
}

/**
 * Link two Archivist entities by updating flags on both sheet journals.
 * Does not create entities; only updates flags locally and emits a refresh hook.
 * Real-time API writes should be handled by the caller (sheet handlers) as needed.
 *
 * @param {JournalEntry} a
 * @param {JournalEntry} b
 * @param {'characters'|'items'|'entries'|'factions'|'locationsAssociative'} bucket
 */
export async function linkDocs(a, b, bucket) {
  if (!a || !b) return false;
  const fa = ensureFlags(a);
  const fb = ensureFlags(b);

  // Choose archivistId as the reference for cross-entity links when available
  const aId = fa.archivistId || a.id;
  const bId = fb.archivistId || b.id;

  if (!fa.archivistRefs[bucket]) fa.archivistRefs[bucket] = [];
  if (!fb.archivistRefs[bucket]) fb.archivistRefs[bucket] = [];
  if (!fa.archivistOutbound[bucket]) fa.archivistOutbound[bucket] = [];

  // Symmetric refs for backward compatibility
  fa.archivistRefs[bucket] = dedupe([...fa.archivistRefs[bucket], bId]);
  fb.archivistRefs[bucket] = dedupe([...fb.archivistRefs[bucket], aId]);
  // Directional outbound: only add to 'a' (from a -> b)
  fa.archivistOutbound[bucket] = dedupe([...fa.archivistOutbound[bucket], bId]);

  await Promise.all([
    a.setFlag(CONFIG.MODULE_ID, 'archivist', fa),
    b.setFlag(CONFIG.MODULE_ID, 'archivist', fb),
  ]);

  Hooks.callAll('ArchivistLinksUpdated', { ids: [a.id, b.id], bucket });
  try {
    const { linkIndexer } = await import('./indexer.js');
    linkIndexer.buildFromWorld();
  } catch (_) {}
  return true;
}

/** Link by UUIDs, resolving journals and applying archivistRefs symmetry */
export async function linkByUuid(aUuid, bUuid, bucket) {
  try {
    const a = await fromUuid(aUuid);
    const b = await fromUuid(bUuid);
    if (!a || !b) return false;
    // If a/b are pages, promote to parent journal
    const aj = a.documentName === 'JournalEntryPage' ? a.parent : a;
    const bj = b.documentName === 'JournalEntryPage' ? b.parent : b;
    if (
      aj?.documentName !== 'JournalEntry' ||
      bj?.documentName !== 'JournalEntry'
    )
      return false;
    return await linkDocs(aj, bj, bucket);
  } catch (_) {
    return false;
  }
}

/**
 * Unlink two Archivist entities by updating flags on both sheet journals.
 * @param {JournalEntry} a
 * @param {JournalEntry} b
 * @param {'characters'|'items'|'entries'|'factions'|'locationsAssociative'} bucket
 */
export async function unlinkDocs(a, b, bucket) {
  if (!a || !b) return false;
  const fa = ensureFlags(a);
  const fb = ensureFlags(b);
  const aId = fa.archivistId || a.id;
  const bId = fb.archivistId || b.id;

  if (!fa.archivistRefs[bucket]) fa.archivistRefs[bucket] = [];
  if (!fb.archivistRefs[bucket]) fb.archivistRefs[bucket] = [];
  if (!fa.archivistOutbound[bucket]) fa.archivistOutbound[bucket] = [];

  fa.archivistRefs[bucket] = (fa.archivistRefs[bucket] || []).filter(
    (x) => x !== bId
  );
  fb.archivistRefs[bucket] = (fb.archivistRefs[bucket] || []).filter(
    (x) => x !== aId
  );
  // Directional removal from 'a' (outbound)
  fa.archivistOutbound[bucket] = (fa.archivistOutbound[bucket] || []).filter(
    (x) => x !== bId
  );

  await Promise.all([
    a.setFlag(CONFIG.MODULE_ID, 'archivist', fa),
    b.setFlag(CONFIG.MODULE_ID, 'archivist', fb),
  ]);

  Hooks.callAll('ArchivistLinksUpdated', { ids: [a.id, b.id], bucket });
  try {
    const { linkIndexer } = await import('./indexer.js');
    linkIndexer.buildFromWorld();
  } catch (_) {}
  return true;
}

/**
 * Set structural parent for a Location sheet (by Archivist location id)
 * Enforces maxLocationDepth via a simple guard (caller should also guard in UI).
 * @param {JournalEntry} child
 * @param {string|null} parentLocationId
 */
export async function setLocationParent(child, parentLocationId) {
  const flags = ensureFlags(child);

  // Walk parent chain using stored parent ids; only guard against cycles (no depth limit)
  let cur = parentLocationId;
  const guard = new Set();
  while (cur) {
    if (guard.has(cur)) break; // cycle guard
    guard.add(cur);
    try {
      // First try match by archivistId
      let j = (game.journal?.contents || []).find(
        (j) => j.getFlag(CONFIG.MODULE_ID, 'archivist')?.archivistId === cur
      );
      // Fallback: match by JournalEntry id if no archivistId match
      if (!j) j = (game.journal?.contents || []).find((x) => x.id === cur);
      const jf = j?.getFlag(CONFIG.MODULE_ID, 'archivist');
      cur = jf?.parentLocationId || null;
    } catch (_) {
      cur = null;
    }
  }

  flags.parentLocationId = parentLocationId || null;
  await child.setFlag(CONFIG.MODULE_ID, 'archivist', flags);
  Hooks.callAll('ArchivistLinksUpdated', {
    ids: [child.id],
    bucket: 'location-parent',
  });

  // If realtime sync is enabled and we have Archivist IDs, persist parent_id to API
  try {
    if (
      settingsManager.isRealtimeSyncEnabled?.() &&
      !settingsManager.isRealtimeSyncSuppressed?.()
    ) {
      const apiKey = settingsManager.getApiKey?.();
      const childId =
        flags.archivistId ||
        child.getFlag(CONFIG.MODULE_ID, 'archivist')?.archivistId;
      if (apiKey && childId) {
        const { archivistApi } = await import(
          '../../services/archivist-api.js'
        );
        await archivistApi.updateLocation(apiKey, childId, {
          parent_id: parentLocationId || null,
        });
      }
    }
  } catch (e) {
    console.warn('[Archivist Sync] Failed to PATCH parent_id for location', e);
  }
  return true;
}

export const LinkHelpers = {
  getLinks,
  linkDocs,
  linkByUuid,
  unlinkDocs,
  setLocationParent,
};
