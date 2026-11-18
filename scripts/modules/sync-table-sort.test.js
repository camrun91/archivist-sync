import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applySort,
  cycleSortSpec,
  normalizeSortSpec,
  isColumnSortSpec,
} from './sync-table-sort.js';

describe('sync-table-sort', () => {
  it('normalizeSortSpec rejects half-specs', () => {
    assert.equal(normalizeSortSpec(null), null);
    assert.equal(normalizeSortSpec({ key: 'name' }), null);
    assert.equal(normalizeSortSpec({ dir: 'asc' }), null);
    assert.equal(normalizeSortSpec({ key: 'bogus', dir: 'asc' }), null);
    assert.deepEqual(normalizeSortSpec({ key: 'name', dir: 'asc' }), {
      key: 'name',
      dir: 'asc',
    });
    assert.ok(isColumnSortSpec({ key: 'type', dir: 'desc' }));
  });

  it('cycleSortSpec three-state and column switch', () => {
    assert.deepEqual(cycleSortSpec(null, 'name'), { key: 'name', dir: 'asc' });
    assert.deepEqual(cycleSortSpec({ key: 'name', dir: 'asc' }, 'name'), {
      key: 'name',
      dir: 'desc',
    });
    assert.equal(cycleSortSpec({ key: 'name', dir: 'desc' }, 'name'), null);
    assert.deepEqual(
      cycleSortSpec({ key: 'name', dir: 'desc' }, 'type'),
      { key: 'type', dir: 'asc' }
    );
  });

  it('applySort is pure, stable, and locale-aware', () => {
    const rows = [
      { type: 'Item', name: 'Item 10', id: 'a' },
      { type: 'Character', name: 'alice', id: 'b' },
      { type: 'item', name: 'Item 2', id: 'c' },
      { type: 'Character', name: 'Alice', id: 'd' },
    ];
    const input = rows.slice();

    const byName = applySort(rows, { key: 'name', dir: 'asc' });
    assert.notEqual(byName, rows);
    assert.deepEqual(rows, input);
    assert.deepEqual(
      byName.map((r) => r.id),
      ['b', 'd', 'c', 'a']
    );

    const byType = applySort(rows, { key: 'type', dir: 'asc' });
    assert.deepEqual(
      byType.map((r) => r.id),
      ['b', 'd', 'a', 'c']
    );

    const natural = applySort(rows, null);
    assert.notEqual(natural, rows);
    assert.deepEqual(natural, rows);
    assert.deepEqual(rows, input);
  });
});
