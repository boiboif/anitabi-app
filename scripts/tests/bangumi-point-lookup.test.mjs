import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/utils/bangumi-point-lookup.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { createBangumiPointLookup } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);

const point = (id, name = id) => ({ id, name, priority: 0, geo: [35, 139] });
const bangumi = (id, points) => ({ id, points });
const item = (bangumiId, pointId, completed = false) => ({ bangumiId, pointId, completed });

function resolveWithFind(bangumis, items) {
  const bangumiById = new Map(bangumis.map((work) => [work.id, work]));
  return items.flatMap((entry, planIndex) => {
    const work = bangumiById.get(entry.bangumiId);
    const matchedPoint = work?.points.find((candidate) => candidate.id === entry.pointId);
    return work && matchedPoint ? [{ item: entry, planIndex, bangumi: work, point: matchedPoint }] : [];
  });
}

function resolveWithLookup(bangumis, items) {
  const getBangumiPoints = createBangumiPointLookup(bangumis);
  return items.flatMap((entry, planIndex) => {
    const indexed = getBangumiPoints(entry.bangumiId);
    const matchedPoint = indexed?.pointsById.get(entry.pointId);
    return indexed && matchedPoint ? [{ item: entry, planIndex, bangumi: indexed.bangumi, point: matchedPoint }] : [];
  });
}

function assertSameResolution(bangumis, items) {
  const expected = resolveWithFind(bangumis, items);
  const actual = resolveWithLookup(bangumis, items);
  assert.deepEqual(actual, expected);
  for (let index = 0; index < actual.length; index += 1) {
    assert.equal(actual[index].item, expected[index].item);
    assert.equal(actual[index].bangumi, expected[index].bangumi);
    assert.equal(actual[index].point, expected[index].point);
  }
}

test('empty input, missing works and missing points retain their existing results', () => {
  assert.equal(createBangumiPointLookup([])(1), undefined);
  const emptyWork = bangumi(1, []);
  const getBangumiPoints = createBangumiPointLookup([emptyWork]);
  assert.equal(getBangumiPoints(2), undefined);
  assert.equal(getBangumiPoints(1).bangumi, emptyWork);
  assert.equal(getBangumiPoints(1).pointsById.size, 0);
  assert.equal(getBangumiPoints(1).pointsById.get('missing'), undefined);
  assertSameResolution([emptyWork], [item(1, ''), item(2, 'missing')]);
});

test('duplicate work IDs use the last work and duplicate point IDs use its first point', () => {
  const firstPoint = point('same', 'first');
  const lastPoint = point('same', 'last');
  const earlierWork = bangumi(1, [point('earlier-only'), point('same', 'earlier work')]);
  const winningWork = bangumi(1, [firstPoint, lastPoint]);
  const otherWork = bangumi(2, [point('same', 'other work')]);
  const getBangumiPoints = createBangumiPointLookup([earlierWork, otherWork, winningWork]);
  assert.equal(getBangumiPoints(1).bangumi, winningWork);
  assert.equal(getBangumiPoints(1).pointsById.get('same'), firstPoint);
  assert.equal(getBangumiPoints(1).pointsById.get('earlier-only'), undefined);
  assert.equal(getBangumiPoints(2).pointsById.get('same'), otherWork.points[0]);
  assertSameResolution(
    [earlierWork, otherWork, winningWork],
    [item(2, 'same'), item(1, 'same'), item(1, 'earlier-only'), item(1, 'same', true)],
  );
});

test('string IDs keep exact matching, including empty strings, Unicode and object property names', () => {
  const ids = ['', ' ', '0', '01', 'same:point', '点位', 'é', 'e\u0301', '__proto__', 'constructor'];
  const works = [
    bangumi(
      0,
      ids.map((id) => point(id)),
    ),
    bangumi(1, [point('')]),
  ];
  const getBangumiPoints = createBangumiPointLookup(works);
  for (const matchedPoint of works[0].points) {
    assert.equal(getBangumiPoints(0).pointsById.get(matchedPoint.id), matchedPoint);
  }
  assertSameResolution(works, [...ids.toReversed().map((id) => item(0, id)), item(1, ''), item(0, 'absent')]);
});

test('works keep the existing Map semantics for NaN and signed zero IDs', () => {
  const nanWork = bangumi(Number.NaN, [point('nan-work')]);
  const minusZero = bangumi(-0, [point('minus-zero')]);
  const plusZero = bangumi(0, [point('plus-zero')]);
  assertSameResolution(
    [nanWork, minusZero, plusZero],
    [item(Number.NaN, 'nan-work'), item(-0, 'plus-zero'), item(0, 'minus-zero')],
  );
});

test('resolving reordered and repeated plan entries preserves input objects and arrays', () => {
  const first = Object.freeze(point('first'));
  const second = Object.freeze(point('second'));
  const work = Object.freeze(bangumi(1, Object.freeze([first, second])));
  const works = Object.freeze([work]);
  const repeated = Object.freeze(item(1, 'second', true));
  const items = Object.freeze([repeated, Object.freeze(item(1, 'missing')), Object.freeze(item(1, 'first')), repeated]);
  const original = structuredClone({ works, items });
  assertSameResolution(works, items);
  assert.deepEqual({ works, items }, original);
});

test('only queried works are indexed and repeated queries reuse the same entry without scanning points again', () => {
  let firstReads = 0;
  let secondReads = 0;
  let pointIdReads = 0;
  const countedPoint = {
    get id() {
      pointIdReads += 1;
      return 'counted';
    },
  };
  const first = {
    id: 1,
    get points() {
      firstReads += 1;
      return [countedPoint];
    },
  };
  const second = {
    id: 2,
    get points() {
      secondReads += 1;
      return [point('other')];
    },
  };
  const getBangumiPoints = createBangumiPointLookup([first, second]);
  assert.equal(firstReads, 0);
  assert.equal(secondReads, 0);
  assert.equal(getBangumiPoints(99), undefined);
  assert.equal(firstReads, 0);
  const indexed = getBangumiPoints(1);
  assert.equal(indexed.bangumi, first);
  assert.equal(indexed.pointsById.get('counted'), countedPoint);
  assert.equal(firstReads, 1);
  const readsAfterIndexing = pointIdReads;
  assert.equal(getBangumiPoints(1), indexed);
  assert.equal(firstReads, 1);
  assert.equal(pointIdReads, readsAfterIndexing);
  assert.equal(secondReads, 0);
  assert.equal(getBangumiPoints(2).bangumi, second);
  assert.equal(secondReads, 1);
});

test('separate lookups do not share cached entries across versions of the input data', () => {
  const originalPoint = point('same', 'original');
  const replacementPoint = point('same', 'replacement');
  const originalWork = bangumi(1, [originalPoint]);
  const replacementWork = bangumi(1, [replacementPoint]);
  const originalLookup = createBangumiPointLookup([originalWork]);
  const originalEntry = originalLookup(1);
  const replacementEntry = createBangumiPointLookup([replacementWork])(1);
  assert.equal(originalLookup(1), originalEntry);
  assert.equal(originalEntry.pointsById.get('same'), originalPoint);
  assert.equal(replacementEntry.bangumi, replacementWork);
  assert.equal(replacementEntry.pointsById.get('same'), replacementPoint);
  assert.notEqual(replacementEntry, originalEntry);
  assert.notEqual(createBangumiPointLookup([originalWork])(1), originalEntry);
});

for (const count of [300, 500, 1000, 5000]) {
  test(`${count} generated points match find for shuffled, repeated and missing plan entries`, () => {
    const points = Array.from({ length: count }, (_, index) => point(`point:${index}`));
    const work = bangumi(1, points);
    const works = [bangumi(2, [point('point:0')]), work, bangumi(3, [])];
    const reversed = points.toReversed();
    const offset = Math.floor(count / 3);
    const reordered = [...reversed.slice(offset), ...reversed.slice(0, offset)];
    const items = reordered.flatMap((matchedPoint, index) => [
      item(1, matchedPoint.id, index % 2 === 0),
      ...(index % 41 === 0 ? [item(1, matchedPoint.id)] : []),
      ...(index % 79 === 0 ? [item(1, `missing:${index}`)] : []),
      ...(index % 113 === 0 ? [item(99, matchedPoint.id), item(2, 'point:0')] : []),
    ]);
    const originalItems = structuredClone(items);
    const originalPointOrder = [...points];
    assertSameResolution(works, items);
    assert.deepEqual(items, originalItems);
    assert.deepEqual(points, originalPointOrder);
  });
}
