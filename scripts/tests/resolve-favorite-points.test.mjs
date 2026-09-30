import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveFavoritePoints } from '../../src/utils/resolve-favorite-points.ts';

test('resolves favorites in map data order and skips unrelated point collections', () => {
  const favorites = [
    { key: '2:second', bangumiId: 2, pointId: 'second' },
    { key: '2:first', bangumiId: 2, pointId: 'first' },
    { key: '3:missing', bangumiId: 3, pointId: 'missing' },
  ];
  const bangumis = [
    {
      id: 1,
      get points() {
        throw new Error('Unrelated point collection was scanned');
      },
    },
    { id: 2, points: [{ id: 'first' }, { id: 'second' }] },
  ];

  const resolved = resolveFavoritePoints(favorites, bangumis);
  assert.deepEqual(
    resolved.map((item) => item.favorite.key),
    ['2:first', '2:second', '3:missing'],
  );
  assert.deepEqual(
    resolved.map((item) => item.point?.id),
    ['first', 'second', undefined],
  );
});
