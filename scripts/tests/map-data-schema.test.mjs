import assert from 'node:assert/strict';
import test from 'node:test';
import { MapDataValidationError, parseMapDataIndex, parseMapDetailShard } from '../../src/services/map-data-schema.ts';

function work(id, metadata = 0) {
  return [id, '', 0, '', '', '', '', 0, '', 35, 139, 0, metadata, 0, 0, null, '', 0];
}

function detail(id, points = [], extra = {}) {
  return [id, extra.theme ?? 0, points, extra.modified ?? 10];
}

const metadata = (id) => [id, 35, 139, 0];

test('index parsing retains raw data and identifies the exact version, capacity and work order', () => {
  const works = [work(1, metadata('a')), work(2)];
  const raw = [works, 250, 123];
  const before = structuredClone(raw);
  const index = parseMapDataIndex(raw);
  assert.equal(index.bangumis, works);
  assert.equal(index.batchSize, 250);
  assert.equal(index.modified, 123);
  assert.equal(index.revision, JSON.stringify([123, 250, [1, 2]]));
  assert.notEqual(index.revision, parseMapDataIndex([[works[1], works[0]], 250, 123]).revision);
  assert.notEqual(index.revision, parseMapDataIndex([works, 100, 123]).revision);
  assert.notEqual(index.revision, parseMapDataIndex([works, 250, 124]).revision);
  assert.deepEqual(raw, before);
});

test('index permits empty works, absent optional metadata, sentinel metadata and legitimate zero coordinates', () => {
  assert.deepEqual(parseMapDataIndex([[], 250, 0]).bangumis, []);
  for (const points of [undefined, null, 0, []]) {
    const entry = work(1, points);
    entry[9] = 0;
    entry[10] = 0;
    assert.equal(parseMapDataIndex([[entry], 250, 1]).bangumis[0], entry);
  }
  const olderEntry = work(2).slice(0, 12);
  assert.equal(parseMapDataIndex([[olderEntry], 250, 1]).bangumis[0], olderEntry);
});

test('malformed index envelopes, identities and coordinates cannot be accepted as a current version', () => {
  for (const raw of [
    null,
    {},
    [[], 250],
    [{}, 250, 1],
    [[], 0, 1],
    [[], 1.5, 1],
    [[], '250', 1],
    [[], 250, -1],
    [[], 250, NaN],
    [[], 250, Infinity],
    [[], 250, '1'],
    [[work(0)], 250, 1],
    [[work(1), work(1)], 250, 1],
    [[{}], 250, 1],
  ]) {
    assert.throws(() => parseMapDataIndex(raw), MapDataValidationError);
  }
  for (const [offset, coordinate] of [
    [9, NaN],
    [9, 91],
    [10, Infinity],
    [10, -181],
    [10, '139'],
  ]) {
    const entry = work(1);
    entry[offset] = coordinate;
    assert.throws(() => parseMapDataIndex([[entry], 250, 1]), MapDataValidationError);
  }
});

test('malformed point metadata cannot hide missing or duplicate point details', () => {
  for (const points of [
    {},
    1,
    ['a', 35, 139],
    ['', 35, 139, 0],
    [1, 35, 139, 0],
    ['a', NaN, 139, 0],
    ['a', 35, 181, 0],
    ['a', 35, 139, Infinity],
    ['a', 35, 139, 0, 'a', 36, 140, 1],
  ]) {
    assert.throws(() => parseMapDataIndex([[work(1, points)], 250, 1]), MapDataValidationError);
  }
});

test('valid details can arrive out of order while retaining raw fields, empty themes and folder points', () => {
  const works = [work(1, metadata('a')), work(2)];
  const folder = ['folder', 100, '分组', 1];
  const raw = [detail(2), detail(1, [['a', 123, '中文', 0], folder])];
  const before = structuredClone(raw);
  assert.equal(parseMapDetailShard(raw, works), raw);
  assert.deepEqual(raw, before);
});

test('an empty points array is valid when the index does not require any points', () => {
  assert.deepEqual(parseMapDetailShard([], []), []);
  for (const points of [0, null, []]) {
    const raw = [detail(1, [], { theme: 0, modified: 0 })];
    assert.equal(parseMapDetailShard(raw, [work(1, points)]), raw);
  }
});

test('missing, duplicated or wrong work details reject successful but incomplete HTTP responses', () => {
  const works = [work(1), work(2)];
  for (const raw of [null, {}, [], [detail(1)], [detail(1), detail(1)], [detail(1), detail(3)]]) {
    assert.throws(() => parseMapDetailShard(raw, works), MapDataValidationError);
  }
});

test('point coverage requires every indexed point while allowing extra detail-only points', () => {
  const works = [work(1, [...metadata('a'), ...metadata('b')])];
  assert.throws(() => parseMapDetailShard([detail(1)], works), MapDataValidationError);
  assert.throws(() => parseMapDetailShard([detail(1, [['a']])], works), MapDataValidationError);
  const raw = [detail(1, [['b'], ['a'], ['folder', '', 0, 1]])];
  assert.equal(parseMapDetailShard(raw, works), raw);
});

test('invalid point identity, duplicates and malformed detail containers are rejected', () => {
  for (const raw of [
    [null],
    [[0, 0, [], 1]],
    [[1, 0, {}, 1]],
    [[1, 0, [], NaN]],
    [[1, 0, [], -1]],
    [detail(1, [null])],
    [detail(1, [{}])],
    [detail(1, [['']])],
    [detail(1, [[1]])],
    [detail(1, [['a'], ['a']])],
  ]) {
    assert.throws(() => parseMapDetailShard(raw, [work(1)]), MapDataValidationError);
  }
});

test('schema failures have a recognizable error class for bounded download retries', () => {
  try {
    parseMapDataIndex(null);
    assert.fail('invalid index must throw');
  } catch (error) {
    assert.ok(error instanceof MapDataValidationError);
    assert.equal(error.name, 'MapDataValidationError');
    assert.ok(error.message.length > 0);
  }
});
