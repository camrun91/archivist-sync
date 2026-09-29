/** @typedef {'type' | 'name'} SortKey */

/** @typedef {'asc' | 'desc'} SortDir */

/**
 * @typedef {null | { key: SortKey, dir: SortDir }} SortSpec
 */

/** @typedef {'diffs' | 'imports'} SyncTableId */

/**
 * @typedef {{ diffs: SortSpec, imports: SortSpec }} SyncSortSpecs
 */

/** @typedef {{ type: string, name: string, id: string }} SortableRow */

/** @type {ReadonlySet<SortKey>} */
export const SORT_KEYS = Object.freeze(new Set(['type', 'name']));

/** @type {Readonly<Record<SyncTableId, ReadonlyArray<{ key: SortKey, label: string, headerClass?: string }>>>} */
export const SYNC_SORT_HEADERS = Object.freeze({
  diffs: Object.freeze([
    { key: 'type', label: 'Type', headerClass: 'col-type' },
    { key: 'name', label: 'Name' },
  ]),
  imports: Object.freeze([
    { key: 'type', label: 'Type', headerClass: 'col-type' },
    { key: 'name', label: 'Name' },
  ]),
});

export function createDefaultSortSpecs() {
  return { diffs: null, imports: null };
}

/**
 * @param {unknown} value
 * @returns {value is Exclude<SortSpec, null>}
 */
export function isColumnSortSpec(value) {
  return (
    !!value &&
    typeof value === 'object' &&
    SORT_KEYS.has(/** @type {any} */ (value).key) &&
    (value.dir === 'asc' || value.dir === 'desc')
  );
}

export function normalizeSortSpec(raw) {
  return isColumnSortSpec(raw) ? { key: raw.key, dir: raw.dir } : null;
}

export function cycleSortSpec(current, clickedKey) {
  if (!SORT_KEYS.has(clickedKey)) return normalizeSortSpec(current);
  const spec = normalizeSortSpec(current);
  if (!spec || spec.key !== clickedKey) return { key: clickedKey, dir: 'asc' };
  if (spec.dir === 'asc') return { key: clickedKey, dir: 'desc' };
  return null;
}

/**
 * @template {SortableRow} T
 * @param {readonly T[]} rows
 * @param {SortSpec} spec
 * @returns {T[]}
 */
export function applySort(rows, spec) {
  const legal = normalizeSortSpec(spec);
  if (!legal) return rows.slice();

  const dir = legal.dir === 'asc' ? 1 : -1;
  const cmp = legal.key === 'type' ? compareType : compareName;

  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const primary = cmp(a.row, b.row) * dir;
      return primary !== 0 ? primary : a.index - b.index;
    })
    .map(({ row }) => row);
}

export function ariaSortValue(spec, key) {
  const legal = normalizeSortSpec(spec);
  if (!legal || legal.key !== key) return 'none';
  return legal.dir === 'asc' ? 'ascending' : 'descending';
}

export function headerPresentation(spec, key, label) {
  const ariaSort = ariaSortValue(spec, key);
  return {
    key,
    label,
    ariaSort,
    active: ariaSort !== 'none',
    iconClass:
      ariaSort === 'ascending'
        ? 'sort-asc'
        : ariaSort === 'descending'
          ? 'sort-desc'
          : 'sort-none',
  };
}

export function buildSortHeadersForTable(tableId, spec) {
  const defs = SYNC_SORT_HEADERS[tableId] ?? [];
  return defs.map((def) => ({
    ...headerPresentation(spec, def.key, def.label),
    headerClass: def.headerClass ?? '',
  }));
}

export function buildSortHeaders(specs) {
  return {
    diffs: buildSortHeadersForTable('diffs', specs.diffs),
    imports: buildSortHeadersForTable('imports', specs.imports),
  };
}

function compareType(a, b) {
  return String(a.type ?? '').localeCompare(String(b.type ?? ''), undefined, {
    sensitivity: 'base',
  });
}

function compareName(a, b) {
  return String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, {
    sensitivity: 'base',
    numeric: true,
  });
}
