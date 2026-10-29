import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  migratePilgrimageRecordData,
  pilgrimageRecordStorageSchema,
  validateStoredPilgrimageRecordsV1,
  validateStoredPilgrimageRecordsV2,
} from '../../src/lib/pilgrimage-record-schema.ts';
import {
  createPilgrimageRecordStorage,
  PILGRIMAGE_RECORD_VERSION_KEY,
  PilgrimageRecordsRollbackError,
} from '../../src/lib/pilgrimage-record-storage-core.ts';

beforeEach((context) => context.mock.method(console, 'warn', () => {}));

// Literal historical persisted values, independent of current model constructors.
function historicalRecords() {
  return [
    {
      key: '2:shrine/入口',
      bangumiId: 2,
      pointId: 'shrine/入口',
      snapshot: {
        bangumiName: '历史作品',
        pointName: '神社入口',
        bangumiCover: 'https://example.test/cover.jpg',
        bangumiColor: '#123456',
        pointImage: 'https://example.test/point.jpg',
        pointMark: 'EP01 12:34',
        geo: [35.7, 139.7],
      },
      days: [
        {
          dateKey: '2026-10-22',
          firstRecordedAt: 1792636800000,
          photos: [
            { id: 'photo-one', fileName: 'local-one.jpg', width: 800, height: 600 },
            { id: 'photo-two', fileName: 'local-two.webp', width: 600, height: 800 },
          ],
        },
        { dateKey: '2026-10-20', firstRecordedAt: 1792464000000, photos: [] },
      ],
    },
    {
      key: '1:station',
      bangumiId: 1,
      pointId: 'station',
      snapshot: { bangumiName: '另一部作品', pointName: '车站' },
      days: [{ dateKey: '2026-10-23', firstRecordedAt: 1792723200000, photos: [] }],
    },
  ];
}

const storageKey = (version, key) => `point-v${version}:${encodeURIComponent(key)}`;

function memoryStorage(entries = []) {
  const values = new Map(entries);
  const mutations = [];
  const result = {
    values,
    mutations,
    fault: null,
    getAllKeys: () => [...values.keys()],
    contains: (key) => values.has(key),
    // MMKV may contain another value type; an existing non-string is not absent.
    getString: (key) => (typeof values.get(key) === 'string' ? values.get(key) : undefined),
    set: (key, value) => mutate('set', key, value),
    remove: (key) => mutate('remove', key),
  };
  function mutate(method, key, value) {
    mutations.push({ method, key, value });
    result.fault?.({ phase: 'before', method, key, value });
    if (method === 'set') values.set(key, value);
    else values.delete(key);
    result.fault?.({ phase: 'after', method, key, value });
  }
  return result;
}

function legacyStorage(marker) {
  const storage = memoryStorage(
    historicalRecords().map((point) => [storageKey(1, point.key), ` \n${JSON.stringify(point, null, 2)}\n`]),
  );
  if (marker !== undefined) storage.values.set(PILGRIMAGE_RECORD_VERSION_KEY, marker);
  return storage;
}

const snapshot = (storage) => new Map(storage.values);
const namespaceSnapshot = (storage, version) =>
  new Map([...storage.values].filter(([key]) => key.startsWith(`point-v${version}:`)));

// Keep original-version storage guarantees independent of the production schema.
const historicalSchemaV1 = {
  version: 1,
  migrate: (data, sourceVersion) => migratePilgrimageRecordData(data, sourceVersion, 1, {}),
  decode: validateStoredPilgrimageRecordsV1,
  encode: validateStoredPilgrimageRecordsV1,
};

function validateV2(data) {
  return validateStoredPilgrimageRecordsV1(data).map((point, index) => {
    if (typeof data[index].annotation !== 'string') throw new Error('Missing V2 annotation');
    return { ...point, annotation: data[index].annotation };
  });
}

const migrationsToV2 = {
  1: (data) =>
    validateStoredPilgrimageRecordsV1(data).map((point) => ({ ...point, annotation: `migrated:${point.key}` })),
};

const schemaV2 = {
  version: 2,
  migrate: (data, sourceVersion) => migratePilgrimageRecordData(data, sourceVersion, 2, migrationsToV2),
  decode: validateV2,
  encode: validateV2,
};

const expectedV2 = () => migrationsToV2[1](historicalRecords());

test('historical unmarked V1 retains snapshots, photo identity, empty days and point order without writing', () => {
  const storage = legacyStorage();
  const original = snapshot(storage);
  const records = createPilgrimageRecordStorage(storage, historicalSchemaV1);
  const points = records.getRecords();
  assert.deepEqual(points, historicalRecords());
  assert.deepEqual(records.getRecords(), historicalRecords());
  assert.equal(records.getLoadError(), null);
  records.setRecords(points, points);
  records.setRecords([...points], points);
  assert.deepEqual(storage.mutations, []);
  assert.deepEqual(snapshot(storage), original);
  assert.equal(storage.values.has(PILGRIMAGE_RECORD_VERSION_KEY), false);
});

test('V1 codec copies owned fields without changing the original historical object', () => {
  const input = historicalRecords();
  input[0].planId = 'unowned-plan';
  input[0].snapshot.extra = 'unowned snapshot field';
  input[0].days[0].extra = true;
  input[0].days[0].photos[0].extra = true;
  const original = structuredClone(input);
  const decoded = historicalSchemaV1.decode(input);
  assert.deepEqual(decoded, historicalRecords());
  assert.deepEqual(historicalSchemaV1.encode(input), historicalRecords());
  decoded[0].snapshot.geo[0] = 0;
  decoded[0].days[0].photos[0].fileName = 'changed.jpg';
  assert.deepEqual(input, original);
});

test('first real legacy write adds the version marker and only rewrites the changed point', () => {
  const storage = legacyStorage();
  const untouched = storage.values.get(storageKey(1, historicalRecords()[1].key));
  const records = createPilgrimageRecordStorage(storage, historicalSchemaV1);
  const points = records.getRecords();
  const updated = [{ ...points[0], snapshot: { ...points[0].snapshot, pointName: '更新后的地点' } }, points[1]];
  records.setRecords(updated, points);
  assert.deepEqual(
    storage.mutations.map(({ method, key }) => ({ method, key })),
    [
      { method: 'set', key: storageKey(1, points[0].key) },
      { method: 'set', key: PILGRIMAGE_RECORD_VERSION_KEY },
    ],
  );
  assert.equal(storage.values.get(PILGRIMAGE_RECORD_VERSION_KEY), '1');
  assert.equal(storage.values.get(storageKey(1, points[1].key)), untouched);
  assert.deepEqual(records.getRecords(), updated);
  storage.mutations.length = 0;
  records.setRecords([updated[0]], updated);
  assert.deepEqual(
    storage.mutations.map(({ key }) => key),
    [storageKey(1, points[1].key)],
  );
});

test('deleting the last legacy points keeps an explicit current version for the empty collection', () => {
  const storage = legacyStorage();
  const records = createPilgrimageRecordStorage(storage, historicalSchemaV1);
  records.setRecords([], records.getRecords());
  assert.deepEqual([...storage.values], [[PILGRIMAGE_RECORD_VERSION_KEY, '1']]);
  assert.deepEqual(records.getRecords(), []);
  assert.equal(records.getLoadError(), null);
});

for (const marker of ['', '0', '-1', '01', '1.0', '1x', ' 1', 'NaN', '9007199254740992', '2', 1, true, null]) {
  test(`invalid or future stored marker ${JSON.stringify(marker)} blocks ordinary and overwrite writes`, () => {
    const storage = legacyStorage(marker);
    const original = snapshot(storage);
    const records = createPilgrimageRecordStorage(storage, historicalSchemaV1);
    assert.deepEqual(records.getRecords(), []);
    assert.ok(records.getLoadError());
    assert.throws(() => records.setRecords(historicalRecords(), []));
    assert.throws(() => records.createRestoreWrite([]));
    assert.deepEqual(snapshot(storage), original);
    assert.deepEqual(storage.mutations, []);
  });
}

test('an empty collection still protects a future version marker', () => {
  const storage = memoryStorage([[PILGRIMAGE_RECORD_VERSION_KEY, '2']]);
  const records = createPilgrimageRecordStorage(storage, historicalSchemaV1);
  assert.deepEqual(records.getRecords(), []);
  assert.ok(records.getLoadError());
  assert.throws(() => records.createRestoreWrite([]));
  assert.deepEqual(storage.mutations, []);
});

for (const key of ['point-v2:staged', 'point-v01:staged', 'point-v0:staged', 'point-vbogus:staged']) {
  test(`unrecognized namespace ${key} protects every raw value even with a legacy marker`, () => {
    for (const marker of [undefined, '1']) {
      const storage = legacyStorage(marker);
      storage.values.set(key, 'unrecognized raw bytes');
      const original = snapshot(storage);
      const records = createPilgrimageRecordStorage(storage, historicalSchemaV1);
      assert.deepEqual(records.getRecords(), []);
      assert.ok(records.getLoadError());
      assert.throws(() => records.setRecords([], historicalRecords()));
      assert.throws(() => records.createRestoreWrite([]));
      assert.deepEqual(snapshot(storage), original);
      assert.deepEqual(storage.mutations, []);
    }
  });
}

for (const marker of [undefined, '1']) {
  test(`explicit overwrite can repair a mismatched storage key and restore original marker ${marker ?? '(absent)'}`, () => {
    const storage = legacyStorage(marker);
    const originalKey = storageKey(1, historicalRecords()[0].key);
    storage.values.set('point-v1:mismatched-key', storage.values.get(originalKey));
    storage.values.delete(originalKey);
    const original = snapshot(storage);
    const records = createPilgrimageRecordStorage(storage, historicalSchemaV1);
    assert.deepEqual(records.getRecords(), []);
    const originalError = records.getLoadError();
    assert.ok(originalError);
    assert.throws(() => records.setRecords([], []));
    const restore = records.createRestoreWrite([historicalRecords()[1]]);
    restore.write();
    assert.deepEqual(records.getRecords(), [historicalRecords()[1]]);
    assert.equal(records.getLoadError(), null);
    assert.equal(storage.values.get(PILGRIMAGE_RECORD_VERSION_KEY), '1');
    assert.equal(storage.values.has('point-v1:mismatched-key'), false);
    restore.rollback();
    assert.deepEqual(snapshot(storage), original);
    assert.equal(records.getLoadError(), originalError);
  });
}

test('explicit overwrite and rollback preserve malformed current JSON byte for byte', () => {
  const storage = memoryStorage([
    [PILGRIMAGE_RECORD_VERSION_KEY, '1'],
    ['point-v1:corrupt', '  { invalid JSON\n'],
  ]);
  const original = snapshot(storage);
  const records = createPilgrimageRecordStorage(storage, historicalSchemaV1);
  assert.deepEqual(records.getRecords(), []);
  const restore = records.createRestoreWrite([]);
  restore.write();
  assert.equal(records.getLoadError(), null);
  assert.deepEqual(records.getRecords(), []);
  restore.rollback();
  assert.deepEqual(snapshot(storage), original);
  assert.ok(records.getLoadError());
});

for (const future of ['marker', 'namespace']) {
  test(`restore rechecks a future ${future} introduced after preparation without rolling it back`, () => {
    const storage = legacyStorage();
    const records = createPilgrimageRecordStorage(storage, historicalSchemaV1);
    records.getRecords();
    const restore = records.createRestoreWrite([]);
    if (future === 'marker') storage.values.set(PILGRIMAGE_RECORD_VERSION_KEY, '2');
    else storage.values.set('point-v2:future', 'future data');
    const original = snapshot(storage);
    assert.throws(() => restore.write());
    restore.rollback();
    assert.throws(() => records.setRecords([], historicalRecords()));
    assert.deepEqual(snapshot(storage), original);
    assert.deepEqual(storage.mutations, []);
  });
}

for (const phase of ['before', 'after']) {
  test(`ordinary write rolls back point bytes and absent marker when marker throws ${phase} mutation`, () => {
    const storage = legacyStorage();
    const original = snapshot(storage);
    const records = createPilgrimageRecordStorage(storage, historicalSchemaV1);
    const points = records.getRecords();
    let failed = false;
    storage.fault = (event) => {
      if (!failed && event.phase === phase && event.method === 'set' && event.key === PILGRIMAGE_RECORD_VERSION_KEY) {
        failed = true;
        throw new Error('version write interrupted');
      }
    };
    assert.throws(() => records.setRecords([{ ...points[0] }, points[1]], points), /version write interrupted/);
    assert.equal(failed, true);
    assert.deepEqual(snapshot(storage), original);
    assert.equal(records.getLoadError(), null);
  });
}

test('ordinary rollback failure closes subsequent writes even after the disk recovers', () => {
  const storage = legacyStorage();
  const records = createPilgrimageRecordStorage(storage, historicalSchemaV1);
  const points = records.getRecords();
  const updated = [{ ...points[0], snapshot: { ...points[0].snapshot, pointName: 'Changed' } }, points[1]];
  storage.fault = ({ phase, method }) => {
    if (phase === 'after' && method === 'set') throw new Error('write or rollback interrupted');
  };
  assert.throws(
    () => records.setRecords(updated, points),
    (error) => error instanceof PilgrimageRecordsRollbackError && error.errors.length === 2,
  );
  assert.ok(records.getLoadError());
  storage.fault = null;
  const original = snapshot(storage);
  assert.throws(() => records.setRecords(updated, points));
  assert.deepEqual(snapshot(storage), original);
});

test('restore rollback failure closes ordinary writes', () => {
  const storage = legacyStorage();
  const records = createPilgrimageRecordStorage(storage, historicalSchemaV1);
  const points = records.getRecords();
  const restore = records.createRestoreWrite([]);
  restore.write();
  storage.fault = ({ phase, method }) => {
    if (phase === 'before' && method === 'set') throw new Error('restore rollback interrupted');
  };
  assert.throws(() => restore.rollback(), /restore rollback interrupted/);
  assert.ok(records.getLoadError());
  storage.fault = null;
  assert.throws(() => records.setRecords(points, []));
});

test('migrations check the complete path before executing any step', () => {
  const source = historicalRecords();
  const original = structuredClone(source);
  let calls = 0;
  assert.throws(
    () => migratePilgrimageRecordData(source, 1, 3, { 1: (data) => (calls++, data) }),
    /Missing pilgrimage record storage migration/,
  );
  assert.equal(calls, 0);
  assert.deepEqual(source, original);
});

test('multi-step migrations validate historical inputs and isolate the entire source tree', () => {
  const source = historicalRecords();
  const original = structuredClone(source);
  const calls = [];
  const result = migratePilgrimageRecordData(source, 1, 3, {
    1: (data) => {
      calls.push(1);
      const validated = validateStoredPilgrimageRecordsV1(data);
      validated[0].snapshot.geo[0] = 0;
      return validated.map((point) => ({ ...point, annotation: 'V2 field' }));
    },
    2: (data) => {
      calls.push(2);
      return validateV2(data).map(({ annotation, ...point }) => ({ ...point, notes: [annotation] }));
    },
  });
  assert.deepEqual(calls, [1, 2]);
  assert.equal(result[0].snapshot.geo[0], 0);
  assert.deepEqual(
    result.map((point) => point.notes),
    [['V2 field'], ['V2 field']],
  );
  assert.equal('annotation' in result[0], false);
  assert.deepEqual(source, original);
});

test('failed mutating migrations and invalid step results never change their source', () => {
  const source = historicalRecords();
  const original = structuredClone(source);
  assert.throws(
    () =>
      migratePilgrimageRecordData(source, 1, 2, {
        1: (data) => {
          data[0].snapshot.geo[0] = 0;
          data[0].days[0].photos[0].fileName = 'mutated.jpg';
          throw new Error('migration failed');
        },
      }),
    /migration failed/,
  );
  assert.throws(() => migratePilgrimageRecordData(source, 1, 2, { 1: () => ({}) }), /migration result/);
  assert.deepEqual(source, original);
});

test('migration rejects invalid versions, downgrades and non-array historical input', () => {
  for (const [source, target] of [
    [0, 1],
    [1, 0],
    [1.5, 2],
    [1, NaN],
    [2, 1],
  ]) {
    assert.throws(() => migratePilgrimageRecordData([], source, target, {}));
  }
  assert.throws(() => migratePilgrimageRecordData({}, 1, 2, { 1: (data) => data }));
  const source = historicalRecords();
  const copy = migratePilgrimageRecordData(source, 1, 1, {});
  assert.deepEqual(copy, source);
  assert.notEqual(copy[0].snapshot, source[0].snapshot);
});

test('invalid historical input and invalid final schema prevent migration persistence', () => {
  for (const invalid of ['historical', 'result']) {
    const storage = legacyStorage();
    let schema = schemaV2;
    if (invalid === 'historical') {
      const point = historicalRecords()[0];
      point.days[0].photos[0].width = 0;
      storage.values.set(storageKey(1, point.key), JSON.stringify(point));
    } else {
      schema = { ...schemaV2, migrate: (data) => data };
    }
    const original = snapshot(storage);
    const records = createPilgrimageRecordStorage(storage, schema);
    assert.deepEqual(records.getRecords(), []);
    assert.ok(records.getLoadError());
    assert.deepEqual(snapshot(storage), original);
    assert.deepEqual(storage.mutations, []);
  }
});

const migrationInterruptions = [
  { name: 'first target point written', phase: 'after', method: 'set', key: storageKey(2, historicalRecords()[0].key) },
  {
    name: 'second target point written',
    phase: 'after',
    method: 'set',
    key: storageKey(2, historicalRecords()[1].key),
  },
  { name: 'stale staged point deleted', phase: 'after', method: 'remove', key: 'point-v2:stale' },
  { name: 'pointer about to change', phase: 'before', method: 'set', key: PILGRIMAGE_RECORD_VERSION_KEY },
  { name: 'pointer changed then throws', phase: 'after', method: 'set', key: PILGRIMAGE_RECORD_VERSION_KEY },
];

for (const marker of [undefined, '1']) {
  for (const interruption of migrationInterruptions) {
    test(`COW restart after ${interruption.name}, original marker ${marker ?? '(absent)'}`, () => {
      const storage = legacyStorage(marker);
      // A failed older attempt must not leak a point absent from the fresh source.
      storage.values.set('point-v2:stale', 'stale staged bytes');
      const source = namespaceSnapshot(storage, 1);
      let interrupted = false;
      storage.fault = (event) => {
        if (
          !interrupted &&
          event.phase === interruption.phase &&
          event.method === interruption.method &&
          event.key === interruption.key
        ) {
          interrupted = true;
          throw new Error('simulated process interruption');
        }
      };
      const first = createPilgrimageRecordStorage(storage, schemaV2);
      assert.deepEqual(first.getRecords(), []);
      assert.equal(interrupted, true);
      assert.ok(first.getLoadError());
      assert.deepEqual(namespaceSnapshot(storage, 1), source);
      const committed = interruption.name === 'pointer changed then throws';
      assert.equal(storage.values.get(PILGRIMAGE_RECORD_VERSION_KEY), committed ? '2' : marker);
      const activeVersion = committed ? 2 : 1;
      const activeData = [...namespaceSnapshot(storage, activeVersion).values()].map((raw) => JSON.parse(raw));
      assert.deepEqual(activeData, committed ? expectedV2() : historicalRecords());

      storage.fault = null;
      const beforeOldVersion = snapshot(storage);
      const oldVersion = createPilgrimageRecordStorage(storage, historicalSchemaV1);
      assert.deepEqual(oldVersion.getRecords(), []);
      assert.ok(oldVersion.getLoadError());
      assert.throws(() => oldVersion.setRecords([], historicalRecords()));
      assert.throws(() => oldVersion.createRestoreWrite([]));
      assert.deepEqual(snapshot(storage), beforeOldVersion);

      const restarted = createPilgrimageRecordStorage(storage, schemaV2);
      assert.deepEqual(restarted.getRecords(), expectedV2());
      assert.equal(restarted.getLoadError(), null);
      assert.equal(storage.values.get(PILGRIMAGE_RECORD_VERSION_KEY), '2');
      assert.equal(storage.values.has('point-v2:stale'), false);
      assert.deepEqual(namespaceSnapshot(storage, 1), source);
      storage.mutations.length = 0;
      assert.deepEqual(restarted.getRecords(), expectedV2());
      assert.deepEqual(storage.mutations, []);
    });
  }
}

test('current V2 writes, overwrite and rollback leave original V1 namespace bytes untouched', () => {
  const storage = legacyStorage();
  const source = namespaceSnapshot(storage, 1);
  const records = createPilgrimageRecordStorage(storage, schemaV2);
  const points = records.getRecords();
  records.setRecords([points[1]], points);
  assert.deepEqual(records.getRecords(), [points[1]]);
  assert.deepEqual(namespaceSnapshot(storage, 1), source);
  const beforeRestore = snapshot(storage);
  const restore = records.createRestoreWrite([]);
  restore.write();
  assert.deepEqual(records.getRecords(), []);
  assert.deepEqual(namespaceSnapshot(storage, 1), source);
  assert.equal(storage.values.get(PILGRIMAGE_RECORD_VERSION_KEY), '2');
  restore.rollback();
  assert.deepEqual(snapshot(storage), beforeRestore);
  assert.deepEqual(records.getRecords(), [points[1]]);
});

test('storage unavailable and invalid configured schema cannot expose writable records', () => {
  const records = createPilgrimageRecordStorage(null, historicalSchemaV1);
  assert.deepEqual(records.getRecords(), []);
  assert.ok(records.getLoadError());
  assert.throws(() => records.setRecords([], []));
  assert.throws(() => records.createRestoreWrite([]));
  for (const version of [0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createPilgrimageRecordStorage(memoryStorage(), { ...schemaV2, version }));
  }
});

for (const marker of [undefined, '1']) {
  test(`production V2 migrates V1 marker ${marker ?? '(absent)'} without inventing activity times`, () => {
    assert.equal(pilgrimageRecordStorageSchema.version, 2);
    const storage = legacyStorage(marker);
    const source = namespaceSnapshot(storage, 1);
    const records = createPilgrimageRecordStorage(storage, pilgrimageRecordStorageSchema);
    const points = records.getRecords();
    assert.deepEqual(points, historicalRecords());
    assert.equal(records.getLoadError(), null);
    assert.equal(storage.values.get(PILGRIMAGE_RECORD_VERSION_KEY), '2');
    assert.deepEqual(namespaceSnapshot(storage, 1), source);
    assert.deepEqual(
      [...namespaceSnapshot(storage, 2).values()].map((raw) => JSON.parse(raw)),
      historicalRecords(),
    );
    assert.equal(
      points.some((point) => point.days.some((day) => Object.hasOwn(day, 'lastRecordedAt'))),
      false,
    );
    storage.mutations.length = 0;
    assert.deepEqual(records.getRecords(), historicalRecords());
    records.setRecords(points, points);
    assert.deepEqual(storage.mutations, []);
  });
}

test('production V2 preserves known activity times through writes and a fresh storage instance', () => {
  const storage = legacyStorage();
  const source = namespaceSnapshot(storage, 1);
  const records = createPilgrimageRecordStorage(storage, pilgrimageRecordStorageSchema);
  const points = records.getRecords();
  const expected = structuredClone(points);
  expected[0].days[0].lastRecordedAt = expected[0].days[0].firstRecordedAt + 60000;
  expected[1].days[0].lastRecordedAt = expected[1].days[0].firstRecordedAt;
  records.setRecords(expected, points);
  assert.equal(
    JSON.parse(storage.values.get(storageKey(2, expected[0].key))).days[0].lastRecordedAt,
    expected[0].days[0].lastRecordedAt,
  );
  assert.deepEqual(createPilgrimageRecordStorage(storage, pilgrimageRecordStorageSchema).getRecords(), expected);
  assert.deepEqual(namespaceSnapshot(storage, 1), source);
});

test('V2 codecs copy optional activity times and discard unknown fields without mutating the source', () => {
  const expected = historicalRecords();
  expected[0].days[0].lastRecordedAt = expected[0].days[0].firstRecordedAt + 60000;
  const input = structuredClone(expected);
  input[0].internalId = 'point';
  input[0].snapshot.sourceCache = 'snapshot';
  input[0].days[0].internalId = 'day';
  input[0].days[0].photos[0].recordedAt = expected[0].days[0].lastRecordedAt;
  input[0].days[0].photos[0].localUri = '/private/photo.jpg';
  const original = structuredClone(input);
  for (const convert of [
    validateStoredPilgrimageRecordsV2,
    pilgrimageRecordStorageSchema.decode,
    pilgrimageRecordStorageSchema.encode,
  ]) {
    const result = convert(input);
    assert.deepEqual(result, expected);
    result[0].days[0].lastRecordedAt += 1;
    result[0].days[0].photos[0].width = 1;
    result[0].snapshot.geo[0] = 0;
    assert.deepEqual(input, original);
  }
  assert.deepEqual(validateStoredPilgrimageRecordsV1(input), historicalRecords(), 'V1 still ignores future fields');
  assert.deepEqual(pilgrimageRecordStorageSchema.migrate(input, 1), historicalRecords());
});

test('V2 rejects invalid activity times and activity preceding the first record', () => {
  const first = historicalRecords()[0].days[0].firstRecordedAt;
  for (const lastRecordedAt of [first - 1, -1, first + 0.5, NaN, Infinity, 8.64e15 + 1, null, String(first)]) {
    const input = historicalRecords();
    input[0].days[0].lastRecordedAt = lastRecordedAt;
    assert.throws(() => pilgrimageRecordStorageSchema.decode(input), /latest time/);
    assert.throws(() => pilgrimageRecordStorageSchema.encode(input), /latest time/);
  }
});

for (const interruption of migrationInterruptions) {
  test(`production V2 migration safely retries after ${interruption.name}`, () => {
    const storage = legacyStorage();
    storage.values.set('point-v2:stale', 'stale staged bytes');
    const source = namespaceSnapshot(storage, 1);
    let interrupted = false;
    storage.fault = (event) => {
      if (
        !interrupted &&
        event.phase === interruption.phase &&
        event.method === interruption.method &&
        event.key === interruption.key
      ) {
        interrupted = true;
        throw new Error('simulated production migration interruption');
      }
    };
    const records = createPilgrimageRecordStorage(storage, pilgrimageRecordStorageSchema);
    assert.deepEqual(records.getRecords(), []);
    assert.equal(interrupted, true);
    assert.ok(records.getLoadError());
    assert.deepEqual(namespaceSnapshot(storage, 1), source);
    storage.fault = null;
    const restarted = createPilgrimageRecordStorage(storage, pilgrimageRecordStorageSchema);
    assert.deepEqual(restarted.getRecords(), historicalRecords());
    assert.equal(restarted.getLoadError(), null);
    assert.equal(storage.values.get(PILGRIMAGE_RECORD_VERSION_KEY), '2');
    assert.equal(storage.values.has('point-v2:stale'), false);
    assert.deepEqual(namespaceSnapshot(storage, 1), source);
  });
}

test('production V2 protects future version markers and namespaces', () => {
  for (const storage of [
    memoryStorage([[PILGRIMAGE_RECORD_VERSION_KEY, '3']]),
    memoryStorage([['point-v3:future', 'future raw bytes']]),
  ]) {
    const original = snapshot(storage);
    const records = createPilgrimageRecordStorage(storage, pilgrimageRecordStorageSchema);
    assert.deepEqual(records.getRecords(), []);
    assert.ok(records.getLoadError());
    assert.throws(() => records.setRecords([], []));
    assert.throws(() => records.createRestoreWrite([]));
    assert.deepEqual(snapshot(storage), original);
    assert.deepEqual(storage.mutations, []);
  }
});
