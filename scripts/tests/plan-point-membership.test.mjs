import assert from 'node:assert/strict';
import test from 'node:test';
import { getPlanPointMembership } from '../../src/utils/plan-point-membership.ts';

test('reordering and completion do not change membership or mutate saved plan items', () => {
  const items = [
    { bangumiId: 10, pointId: 'b', completed: false },
    { bangumiId: 2, pointId: 'same', completed: true },
    { bangumiId: 10, pointId: 'a', completed: false },
  ];
  const original = structuredClone(items);
  const changedDisplay = items.toReversed().map((item) => ({ ...item, completed: !item.completed }));
  assert.equal(getPlanPointMembership(items), getPlanPointMembership(changedDisplay));
  assert.deepEqual(items, original);
});

test('adding, removing, and changing a point or its work changes membership', () => {
  const items = [{ bangumiId: 1, pointId: 'same' }];
  const key = getPlanPointMembership(items);
  assert.notEqual(key, getPlanPointMembership([]));
  assert.notEqual(key, getPlanPointMembership([...items, { bangumiId: 2, pointId: 'same' }]));
  assert.notEqual(key, getPlanPointMembership([{ bangumiId: 1, pointId: 'other' }]));
  assert.notEqual(key, getPlanPointMembership([{ bangumiId: 2, pointId: 'same' }]));
});

test('5000 identifiers retain a deterministic membership regardless of plan order', () => {
  const ids = ['a', 'A', 'é', 'e\u0301', '点位', 'p_10', 'p-2', 'p:3'];
  const items = Array.from({ length: 5000 }, (_, index) => ({
    bangumiId: (index % 5) + 1,
    pointId: `${ids[index % ids.length]}-${index}`,
  }));
  const key = getPlanPointMembership(items);
  assert.equal(key, getPlanPointMembership(items.toReversed()));
  assert.deepEqual(
    new Set(JSON.parse(key).map(([bangumiId, pointId]) => JSON.stringify([bangumiId, pointId]))),
    new Set(items.map(({ bangumiId, pointId }) => JSON.stringify([bangumiId, pointId]))),
  );
});
