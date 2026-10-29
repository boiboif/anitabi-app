import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { createBackupStorageWrite } from '../../src/lib/backup-storage-write.ts';
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@/'))
      return { url: new URL(`../../src/${specifier.slice(2)}.ts`, import.meta.url).href, shortCircuit: true };
    return next(specifier, context);
  },
});
const {
  BackupError,
  createDataBackupContent,
  getBackupFileName,
  getBackupSummary,
  MAX_BACKUP_FILE_BYTES,
  migrateBackupData,
  parseDataBackup,
  prepareBackupRestore,
  runBackupWrites,
  selectBackupData,
} = await import('../../src/lib/data-backup.ts');

function favorite(pointId, overrides = {}) {
  return {
    key: `1:${pointId}`,
    bangumiId: 1,
    pointId,
    addedAt: 100,
    snapshot: { bangumiName: '作品', pointName: `地点 ${pointId}`, pointImage: '/image.jpg', pointMark: '备注' },
    ...overrides,
  };
}

function item(pointId, completed = false) {
  return { ...favorite(pointId), completed, snapshot: { ...favorite(pointId).snapshot, geo: [35.7, 139.7] } };
}

function plan(id, items = [], overrides = {}) {
  return { id, title: '同名计划', description: '行程备注', createdAt: 200, updatedAt: 300, items, ...overrides };
}

function data(overrides = {}) {
  return {
    favoritePoints: [favorite('a')],
    plans: [plan('p1', [item('b', true), item('a')]), plan('empty')],
    planListSortOrder: 'asc',
    pilgrimageRecords: [],
    ...overrides,
  };
}

function file(overrides = {}) {
  return {
    type: 'anitabi-backup',
    version: 4,
    appVersion: '0.5.0',
    exportedAt: '2026-10-08T07:30:00.000Z',
    data: data(),
    ...overrides,
  };
}

function expectError(value, code) {
  assert.throws(
    () => parseDataBackup(typeof value === 'string' ? value : JSON.stringify(value)),
    (error) => error instanceof BackupError && error.code === code,
  );
}

test('full JSON round trip preserves favorites, empty plans, snapshots, timestamps, completion, point order and sorting', () => {
  const original = data();
  const content = createDataBackupContent(original, '0.5.0', new Date(file().exportedAt));
  assert.deepEqual(parseDataBackup(content), file());
  assert.deepEqual(parseDataBackup(`\uFEFF${content}`).data, original);
  assert.deepEqual(getBackupSummary(original), {
    favoriteCount: 1,
    planCount: 2,
    pointCount: 2,
    completedCount: 1,
    recordPointCount: 0,
    recordDayCount: 0,
    photoCount: 0,
  });
  const date = new Date(2026, 9, 8, 15, 30, 5, 7);
  assert.equal(getBackupFileName(date), 'anitabi-backup-2026-10-08-153005-7.json');
});

test('selects only requested backup categories and rejects selecting neither category', () => {
  const current = data();
  const before = structuredClone(current);
  assert.deepEqual(selectBackupData(current, { favoritePoints: true, plans: true, pilgrimageRecords: true }), current);
  assert.deepEqual(selectBackupData(current, { favoritePoints: true, plans: false }), {
    favoritePoints: current.favoritePoints,
  });
  assert.deepEqual(selectBackupData(current, { favoritePoints: false, plans: true }), {
    plans: current.plans,
    planListSortOrder: current.planListSortOrder,
  });
  assert.throws(
    () => selectBackupData(current, { favoritePoints: false, plans: false }),
    (error) => error instanceof BackupError && error.code === 'invalid',
  );
  assert.deepEqual(current, before);
});

test('single-category JSON backups omit unselected data and summarize only included contents', () => {
  const current = data();
  for (const selection of [
    { favoritePoints: true, plans: false },
    { favoritePoints: false, plans: true },
  ]) {
    const selected = selectBackupData(current, selection);
    const content = createDataBackupContent(selected, '0.5.0');
    const exported = JSON.parse(content);
    assert.equal(exported.version, 4);
    assert.deepEqual(exported.data, selected);
    assert.deepEqual(parseDataBackup(content).data, selected);
    assert.deepEqual(Object.keys(exported.data).sort(), Object.keys(selected).sort());
    assert.deepEqual(
      getBackupSummary(selected),
      selection.favoritePoints
        ? {
            favoriteCount: 1,
            planCount: 0,
            pointCount: 0,
            completedCount: 0,
            recordPointCount: 0,
            recordDayCount: 0,
            photoCount: 0,
          }
        : {
            favoriteCount: 0,
            planCount: 2,
            pointCount: 2,
            completedCount: 1,
            recordPointCount: 0,
            recordDayCount: 0,
            photoCount: 0,
          },
    );
  }
});

test('selected empty categories stay distinct from omitted categories and clear only their own data on overwrite', () => {
  const current = data();
  for (const selected of [{ favoritePoints: [] }, { plans: [], planListSortOrder: 'desc' }]) {
    const parsed = parseDataBackup(createDataBackupContent(selected, '0.5.0')).data;
    assert.deepEqual(parsed, selected);
    assert.deepEqual(
      prepareBackupRestore(current, parsed, 'overwrite'),
      'favoritePoints' in selected
        ? { ...current, favoritePoints: [] }
        : { ...current, plans: [], planListSortOrder: 'desc' },
    );
    assert.deepEqual(prepareBackupRestore(current, parsed, 'merge'), current);
  }
});

test('partial overwrite and merge preserve the omitted category and keep merge sorting local', () => {
  const current = data();
  const incomingFavorite = favorite('new');
  const incomingPlan = plan('new', [item('new', true)]);
  const favoritesOnly = { favoritePoints: [incomingFavorite] };
  const plansOnly = { plans: [incomingPlan], planListSortOrder: 'desc' };
  assert.deepEqual(prepareBackupRestore(current, favoritesOnly, 'overwrite'), {
    ...current,
    favoritePoints: [incomingFavorite],
  });
  assert.deepEqual(prepareBackupRestore(current, plansOnly, 'overwrite'), {
    ...current,
    plans: [incomingPlan],
    planListSortOrder: 'desc',
  });
  assert.deepEqual(prepareBackupRestore(current, favoritesOnly, 'merge'), {
    ...current,
    favoritePoints: [...current.favoritePoints, incomingFavorite],
  });
  assert.deepEqual(prepareBackupRestore(current, plansOnly, 'merge'), {
    ...current,
    plans: [...current.plans, incomingPlan],
  });
});

test('rejects empty contents, invalid selected data and unpaired plans or sort preferences', () => {
  for (const invalid of [
    {},
    { favoritePoints: null },
    { favoritePoints: [favorite('a', { key: 'wrong' })] },
    { plans: [] },
    { planListSortOrder: 'asc' },
    { favoritePoints: [], plans: [] },
    { favoritePoints: [], planListSortOrder: 'asc' },
    { plans: [], planListSortOrder: 'invalid' },
    { plans: [plan('bad', [], { title: '' })], planListSortOrder: 'asc' },
  ]) {
    expectError(file({ data: invalid }), 'invalid');
    assert.throws(
      () => createDataBackupContent(invalid, '0.5.0'),
      (error) => error instanceof BackupError && error.code === 'invalid',
    );
  }
});

test('overwrite exactly restores incoming data, including empty collections and both true and false completion', () => {
  const current = data();
  const incoming = data({
    favoritePoints: [],
    plans: [plan('p1', [item('a', true), item('b', false)])],
    planListSortOrder: 'desc',
  });
  assert.deepEqual(prepareBackupRestore(current, incoming, 'overwrite'), incoming);
  const empty = data({ favoritePoints: [], plans: [], planListSortOrder: 'desc' });
  assert.deepEqual(prepareBackupRestore(current, empty, 'overwrite'), empty);
  assert.deepEqual(parseDataBackup(createDataBackupContent(empty, '0.5.0')).data, empty);
});

test('merge uses IDs, keeps local metadata and progress in both directions, appends new points, and is idempotent', () => {
  const current = data({
    plans: [plan('p1', [item('b', true), item('a', false)], { title: '本地名称', updatedAt: 500 }), plan('local')],
  });
  const incoming = data({
    favoritePoints: [favorite('a', { addedAt: 999 }), favorite('new')],
    plans: [plan('p1', [item('a', true), item('b', false), item('new', true)]), plan('other-id', [item('a', true)])],
    planListSortOrder: 'desc',
  });
  const previousCurrent = structuredClone(current);
  const previousIncoming = structuredClone(incoming);
  const merged = prepareBackupRestore(current, incoming, 'merge');
  assert.deepEqual(
    merged.favoritePoints.map((entry) => [entry.key, entry.addedAt]),
    [
      ['1:a', 100],
      ['1:new', 100],
    ],
  );
  assert.deepEqual(
    merged.plans.map((entry) => entry.id),
    ['p1', 'local', 'other-id'],
  );
  assert.deepEqual(
    merged.plans[0].items.map((entry) => [entry.key, entry.completed]),
    [
      ['1:b', true],
      ['1:a', false],
      ['1:new', true],
    ],
  );
  assert.equal(merged.plans[0].title, '本地名称');
  assert.equal(merged.plans[0].description, current.plans[0].description);
  assert.equal(merged.plans[0].createdAt, 200);
  assert.equal(merged.plans[0].updatedAt, 500);
  assert.equal(merged.planListSortOrder, 'asc');
  assert.deepEqual(merged.plans[2], incoming.plans[1]);
  assert.deepEqual(prepareBackupRestore(merged, incoming, 'merge'), merged);
  assert.deepEqual(current, previousCurrent);
  assert.deepEqual(incoming, previousIncoming);
  assert.deepEqual(prepareBackupRestore(current, data({ favoritePoints: [], plans: [] }), 'merge'), current);
});

test('rejects unrelated sharing files, unsupported versions, malformed JSON and incomplete envelopes', () => {
  expectError({ type: 'anitabi-plan', v: 1, t: '分享', i: [[1, 'a']] }, 'wrongType');
  expectError(file({ version: 5 }), 'unsupportedVersion');
  for (const value of [
    '{broken',
    'null',
    '[]',
    '{}',
    file({ data: {} }),
    file({ exportedAt: 'invalid' }),
    file({ appVersion: null }),
  ]) {
    expectError(value, ['{}'].includes(value) ? 'wrongType' : 'invalid');
  }
});

test('rejects every malformed nested record and duplicate without silently dropping user data', () => {
  const badFavorites = [
    favorite('a', { key: 'different' }),
    favorite('a', { bangumiId: 1.5 }),
    favorite('a', { addedAt: -1 }),
    favorite('a', { snapshot: null }),
    favorite('a', { snapshot: { pointName: 'missing work name' } }),
    favorite('a', { snapshot: { ...favorite('a').snapshot, pointImage: 3 } }),
    favorite(''),
  ];
  for (const bad of badFavorites) expectError(file({ data: data({ favoritePoints: [bad] }) }), 'invalid');
  const badPlans = [
    plan('', []),
    plan('p1', [], { title: '  ' }),
    plan('p1', [], { createdAt: null }),
    plan('p1', [], { description: false }),
    plan('p1', [], { items: {} }),
    plan('p1', [{ ...item('a'), completed: undefined }]),
    plan('p1', [{ ...item('a'), completed: 1 }]),
    plan('p1', [{ ...item('a'), snapshot: { ...item('a').snapshot, geo: [100, 139] } }]),
    plan('p1', [{ ...item('a'), snapshot: { ...item('a').snapshot, geo: [35, '139'] } }]),
    plan('p1', [item('a'), item('a')]),
  ];
  for (const bad of badPlans) expectError(file({ data: data({ plans: [bad] }) }), 'invalid');
  expectError(file({ data: data({ plans: [plan('p1'), plan('p1')] }) }), 'invalid');
  expectError(file({ data: data({ favoritePoints: [favorite('a'), favorite('a')] }) }), 'invalid');
  expectError(file({ data: data({ planListSortOrder: 'invalid' }) }), 'invalid');
});

test('enforces the 20 MB limit in UTF-8 bytes for imports and exports', () => {
  expectError(' '.repeat(MAX_BACKUP_FILE_BYTES + 1), 'tooLarge');
  const large = file({
    data: data({ plans: [plan('p1', [], { description: '巡'.repeat(Math.ceil(MAX_BACKUP_FILE_BYTES / 3)) })] }),
  });
  expectError(large, 'tooLarge');
  assert.throws(
    () => createDataBackupContent(large.data, '0.5.0'),
    (error) => error.code === 'tooLarge',
  );
});

test('uses an independent schema version and rejects missing, nonnumeric and invalid file versions', () => {
  for (const appVersion of ['0.5.0', '99.0.0']) {
    const backup = parseDataBackup(createDataBackupContent(data(), appVersion));
    assert.equal(backup.version, 4);
    assert.equal(backup.appVersion, appVersion);
  }
  for (const version of [undefined, null, '1', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    expectError(file({ version }), 'invalid');
  }
});

test('current-version data bypasses migrations without modifying completion or metadata', () => {
  const original = data();
  const migrations = {
    2: () => {
      throw new Error('Current version must not migrate');
    },
  };
  assert.strictEqual(migrateBackupData(original, 2, 2, migrations), original);
  assert.deepEqual(parseDataBackup(JSON.stringify(file())), file());
});

test('migrates a legacy V1 file without losing metadata or full-backup merge and overwrite behavior', () => {
  const content = `{
    "type": "anitabi-backup",
    "version": 1,
    "appVersion": "0.5.0",
    "exportedAt": "2026-10-08T07:30:00.000Z",
    "data": {
      "favoritePoints": [{
        "key": "1:a", "bangumiId": 1, "pointId": "a", "addedAt": 100,
        "snapshot": { "bangumiName": "作品", "pointName": "地点 a", "pointImage": "/image.jpg", "pointMark": "备注" }
      }],
      "plans": [{
        "id": "p1", "title": "巡礼计划", "description": "行程备注", "createdAt": 200, "updatedAt": 300,
        "items": [{
          "key": "1:b", "bangumiId": 1, "pointId": "b", "addedAt": 101, "completed": true,
          "snapshot": { "bangumiName": "作品", "pointName": "地点 b", "geo": [35.7, 139.7] }
        }, {
          "key": "1:a", "bangumiId": 1, "pointId": "a", "addedAt": 100, "completed": false,
          "snapshot": { "bangumiName": "作品", "pointName": "地点 a", "pointMark": "备注" }
        }]
      }, {
        "id": "empty", "title": "空计划", "createdAt": 200, "updatedAt": 300, "items": []
      }],
      "planListSortOrder": "asc"
    }
  }`;
  const legacy = JSON.parse(content);
  const imported = parseDataBackup(content);
  assert.deepEqual(imported, { ...legacy, version: 4 });
  const current = data({
    favoritePoints: [favorite('local')],
    plans: [plan('p1', [item('local', true)], { title: '本地名称', updatedAt: 500 }), plan('local')],
    planListSortOrder: 'desc',
  });
  assert.deepEqual(prepareBackupRestore(current, imported.data, 'overwrite'), {
    ...legacy.data,
    pilgrimageRecords: [],
  });
  const merged = prepareBackupRestore(current, imported.data, 'merge');
  assert.deepEqual(merged.favoritePoints, [...current.favoritePoints, ...legacy.data.favoritePoints]);
  assert.deepEqual(merged.plans, [
    { ...current.plans[0], items: [...current.plans[0].items, ...legacy.data.plans[0].items] },
    current.plans[1],
    legacy.data.plans[1],
  ]);
  assert.equal(merged.planListSortOrder, 'desc');
  const reexported = parseDataBackup(createDataBackupContent(imported.data, '1.0.0'));
  assert.equal(reexported.version, 4);
  assert.deepEqual(reexported.data, legacy.data);
  assert.equal(imported.appVersion, legacy.appVersion);
  assert.equal(imported.exportedAt, legacy.exportedAt);
  assert.deepEqual(JSON.parse(content), legacy);
});

test('keeps rejecting incomplete or malformed V1 data instead of treating it as a partial backup', () => {
  for (const invalid of [
    {},
    { favoritePoints: [] },
    { plans: [], planListSortOrder: 'asc' },
    data({ favoritePoints: null }),
    data({ plans: [plan('bad', [], { title: '' })] }),
    data({ planListSortOrder: 'invalid' }),
  ]) {
    expectError(file({ version: 1, data: invalid }), 'invalid');
  }
});

function record(photoIds = ['photo-a'], dateKey = '2026-10-22', firstRecordedAt = 1792630800000) {
  return {
    key: '1:a',
    bangumiId: 1,
    pointId: 'a',
    snapshot: { bangumiName: '作品', pointName: '地点' },
    days: [
      {
        dateKey,
        firstRecordedAt,
        photos: photoIds.map((id) => ({ id, fileName: `${id}.jpg`, width: 200, height: 300 })),
      },
    ],
  };
}

test('V4 selects records independently, validates safe references, and summarizes visits without photos', () => {
  const pilgrimageRecords = [record([])];
  const selected = selectBackupData(data({ pilgrimageRecords }), {
    favoritePoints: false,
    plans: false,
    pilgrimageRecords: true,
  });
  assert.deepEqual(selected, { pilgrimageRecords });
  assert.deepEqual(parseDataBackup(createDataBackupContent(selected, '0.8.0')).data, selected);
  assert.deepEqual(getBackupSummary(selected), {
    favoriteCount: 0,
    planCount: 0,
    pointCount: 0,
    completedCount: 0,
    recordPointCount: 1,
    recordDayCount: 1,
    photoCount: 0,
  });
  for (const fileName of ['../photo.jpg', '/photo.jpg', 'nested/photo.jpg', 'photo.txt', 'photo.jpg%00']) {
    const bad = record();
    bad.days[0].photos[0].fileName = fileName;
    expectError(file({ data: { pilgrimageRecords: [bad] } }), 'invalid');
  }
});

test('public export and import normalize V4 fields without leaking app-only properties', () => {
  const original = data({ pilgrimageRecords: [record()] });
  const expected = structuredClone(original);
  original.internalRevision = 1;
  original.favoritePoints[0].internalId = 'favorite';
  original.plans[0].items[0].snapshot.cachedSource = '/private/cache';
  original.pilgrimageRecords[0].days[0].photos[0].localUri = '/private/photo.jpg';
  const selected = selectBackupData(original, { favoritePoints: true, plans: true, pilgrimageRecords: true });
  assert.deepEqual(selected, expected);
  const serialized = createDataBackupContent(original, '0.8.0');
  assert.deepEqual(JSON.parse(serialized).data, expected);
  assert.deepEqual(parseDataBackup(JSON.stringify(file({ data: original }))).data, expected);
  assert.equal(JSON.parse(serialized).version, 4);
});

test('records merge by point/date and stable photo ID; overwrite affects only selected category', () => {
  const current = data({ pilgrimageRecords: [record()] });
  const incoming = { pilgrimageRecords: [record(['photo-a', 'photo-b'], '2026-10-22', 1792630000000)] };
  const merged = prepareBackupRestore(current, incoming, 'merge');
  assert.deepEqual(
    merged.pilgrimageRecords[0].days[0].photos.map((photo) => photo.id),
    ['photo-a', 'photo-b'],
  );
  assert.equal(merged.pilgrimageRecords[0].days[0].firstRecordedAt, 1792630000000);
  assert.deepEqual(prepareBackupRestore(merged, incoming, 'merge'), merged);
  assert.deepEqual(prepareBackupRestore(current, { pilgrimageRecords: [] }, 'overwrite'), {
    ...current,
    pilgrimageRecords: [],
  });
  assert.deepEqual(
    prepareBackupRestore(current, { favoritePoints: [] }, 'overwrite').pilgrimageRecords,
    current.pilgrimageRecords,
  );
});

test('legacy V2 omitted records stay omitted and never clear local records', () => {
  const legacy = file({ version: 2, data: { favoritePoints: [], plans: [], planListSortOrder: 'desc' } });
  const parsed = parseDataBackup(JSON.stringify(legacy));
  assert.equal(parsed.version, 4);
  assert.equal(Object.hasOwn(parsed.data, 'pilgrimageRecords'), false);
  const current = data({ pilgrimageRecords: [record()] });
  for (const mode of ['overwrite', 'merge']) {
    assert.deepEqual(prepareBackupRestore(current, parsed.data, mode).pilgrimageRecords, current.pilgrimageRecords);
  }
  expectError({ ...legacy, data: { pilgrimageRecords: [] } }, 'migrationFailed');
});

test('V4 round trips latest photo-event times through selection, merge and overwrite', () => {
  const localRecord = record(['photo-a']);
  const incomingRecord = record(['photo-b']);
  const first = localRecord.days[0].firstRecordedAt;
  localRecord.days[0].lastRecordedAt = first + 3600000;
  incomingRecord.days[0].lastRecordedAt = first + 7200000;
  const current = data({ pilgrimageRecords: [localRecord] });
  const selected = selectBackupData(data({ pilgrimageRecords: [incomingRecord] }), {
    favoritePoints: false,
    plans: false,
    pilgrimageRecords: true,
  });
  const parsed = parseDataBackup(createDataBackupContent(selected, '0.8.0'));
  assert.equal(parsed.version, 4);
  assert.deepEqual(parsed.data, selected);
  const merged = prepareBackupRestore(current, parsed.data, 'merge');
  const day = merged.pilgrimageRecords[0].days[0];
  assert.equal(day.firstRecordedAt, first);
  assert.equal(day.lastRecordedAt, first + 7200000);
  assert.deepEqual(
    day.photos.map((photo) => photo.id),
    ['photo-a', 'photo-b'],
  );
  assert.deepEqual(prepareBackupRestore(merged, parsed.data, 'merge'), merged);
  assert.deepEqual(prepareBackupRestore(current, parsed.data, 'overwrite').pilgrimageRecords, [incomingRecord]);
  assert.equal(current.pilgrimageRecords[0].days[0].lastRecordedAt, first + 3600000);
});

test('V3 migration preserves original records without guessing their last photo time', () => {
  const original = record();
  const source = file({ version: 3, data: { pilgrimageRecords: [original] } });
  source.data.pilgrimageRecords[0].days[0].lastRecordedAt = 'unknown V3 field';
  const parsed = parseDataBackup(JSON.stringify(source));
  assert.equal(parsed.version, 4);
  assert.equal(parsed.appVersion, source.appVersion);
  assert.equal(parsed.exportedAt, source.exportedAt);
  assert.equal(Object.hasOwn(parsed.data.pilgrimageRecords[0].days[0], 'lastRecordedAt'), false);
  const expected = record();
  assert.deepEqual(parsed.data, { pilgrimageRecords: [expected] });
  assert.equal(source.data.pilgrimageRecords[0].days[0].lastRecordedAt, 'unknown V3 field');
  const currentRecord = record();
  currentRecord.days[0].lastRecordedAt = currentRecord.days[0].firstRecordedAt + 3600000;
  const current = data({ pilgrimageRecords: [currentRecord] });
  assert.deepEqual(prepareBackupRestore(current, parsed.data, 'merge').pilgrimageRecords, [currentRecord]);
  assert.deepEqual(prepareBackupRestore(current, parsed.data, 'overwrite').pilgrimageRecords, [expected]);
  assert.deepEqual(parseDataBackup(createDataBackupContent(parsed.data, '0.8.0')).data, parsed.data);
});

test('chains simulated schema changes in order, preserving all other fields and the original source', () => {
  const original = data();
  const before = structuredClone(original);
  const visited = [];
  const migrations = {
    1: (value) => {
      visited.push('1->2');
      return {
        ...value,
        plans: value.plans.map((entry) => ({
          ...entry,
          items: entry.items.map(({ completed, ...rest }) => ({ ...rest, status: completed ? 'done' : 'pending' })),
        })),
      };
    },
    2: (value) => {
      visited.push('2->3');
      assert.equal(value.plans[0].items[0].status, 'done');
      assert.equal(value.plans[0].items[1].status, 'pending');
      return { ...value, preferences: { planListSortOrder: value.planListSortOrder } };
    },
  };
  const migrated = migrateBackupData(original, 1, 3, migrations);
  assert.deepEqual(visited, ['1->2', '2->3']);
  assert.deepEqual(migrated.favoritePoints, before.favoritePoints);
  assert.equal(migrated.plans[0].id, before.plans[0].id);
  assert.equal(migrated.plans[0].description, before.plans[0].description);
  assert.equal(migrated.plans[0].createdAt, before.plans[0].createdAt);
  assert.equal(migrated.plans[0].updatedAt, before.plans[0].updatedAt);
  assert.deepEqual(
    migrated.plans[0].items.map((entry) => entry.key),
    before.plans[0].items.map((entry) => entry.key),
  );
  for (let index = 0; index < migrated.plans[0].items.length; index++) {
    assert.deepEqual(migrated.plans[0].items[index].snapshot, before.plans[0].items[index].snapshot);
    assert.equal(migrated.plans[0].items[index].addedAt, before.plans[0].items[index].addedAt);
  }
  assert.deepEqual(migrated.plans[1], before.plans[1]);
  assert.deepEqual(migrated.preferences, { planListSortOrder: 'asc' });
  assert.deepEqual(original, before);
  assert.notStrictEqual(migrated.favoritePoints, original.favoritePoints);
});

test('checks the complete migration path before running any step', () => {
  let ran = false;
  assert.throws(
    () =>
      migrateBackupData(data(), 1, 3, {
        1: (value) => {
          ran = true;
          return value;
        },
      }),
    (error) => error.code === 'unsupportedVersion',
  );
  assert.equal(ran, false);
});

test('rejects newer schemas without attempting a downgrade', () => {
  let ran = false;
  assert.throws(
    () =>
      migrateBackupData(data(), 3, 2, {
        3: () => {
          ran = true;
          return data();
        },
      }),
    (error) => error.code === 'unsupportedVersion',
  );
  assert.equal(ran, false);
});

test('migration failure leaves the input unchanged even when an earlier step mutated its working copy', () => {
  const original = data();
  const before = structuredClone(original);
  let finalStepRan = false;
  assert.throws(
    () =>
      migrateBackupData(original, 1, 4, {
        1: (value) => {
          value.plans[0].items[0].completed = false;
          return value;
        },
        2: () => {
          throw new Error('Cannot migrate old data');
        },
        3: (value) => {
          finalStepRan = true;
          return value;
        },
      }),
    (error) => error instanceof BackupError && error.code === 'migrationFailed',
  );
  assert.equal(finalStepRan, false);
  assert.deepEqual(original, before);
});

test('rejects invalid migration results and invalid source or target versions', () => {
  for (const result of [undefined, null, [], 3, 'invalid']) {
    assert.throws(
      () => migrateBackupData(data(), 1, 2, { 1: () => result }),
      (error) => error.code === 'migrationFailed',
    );
  }
  for (const [sourceVersion, targetVersion] of [
    [0, 1],
    [1, 0],
    [1.5, 2],
    [1, NaN],
  ]) {
    assert.throws(
      () => migrateBackupData(data(), sourceVersion, targetVersion, {}),
      (error) => error.code === 'invalid',
    );
  }
});

function memoryStorage(entries = []) {
  const values = new Map(entries);
  return {
    values,
    getString: (key) => values.get(key),
    set: (key, value) => {
      values.set(key, value);
    },
    remove: (key) => {
      values.delete(key);
    },
  };
}

test('successful restore writes favorites, plans and sort preference together', () => {
  const storage = memoryStorage([
    ['favorites', 'old'],
    ['plans', 'old'],
    ['sort', 'desc'],
  ]);
  const steps = ['favorites', 'plans', 'sort'].map((key) => createBackupStorageWrite(storage, key, `new-${key}`));
  runBackupWrites(steps);
  assert.deepEqual(
    [...storage.values],
    [
      ['favorites', 'new-favorites'],
      ['plans', 'new-plans'],
      ['sort', 'new-sort'],
    ],
  );
});

test('a write throwing after mutation restores all raw values and absent keys, including the failing step', () => {
  const storage = memoryStorage([['favorites', 'original raw favorites']]);
  const original = new Map(storage.values);
  const steps = ['favorites', 'plans', 'sort'].map((key) => createBackupStorageWrite(storage, key, `new-${key}`));
  const originalWrite = steps[2].write;
  steps[2].write = () => {
    originalWrite();
    throw new Error('Disk write failed after mutation');
  };
  assert.throws(
    () => runBackupWrites(steps),
    (error) => error.code === 'writeFailed',
  );
  assert.deepEqual(storage.values, original);
});

test('detects silent writes, checks availability before mutations, and continues rollback after a rollback failure', () => {
  const storage = memoryStorage([['favorites', 'old']]);
  const silentStorage = { ...storage, set: () => {} };
  assert.throws(
    () => runBackupWrites([createBackupStorageWrite(silentStorage, 'favorites', 'new')]),
    (error) => error.code === 'writeFailed',
  );
  const step = createBackupStorageWrite(storage, 'favorites', 'new');
  assert.throws(() => createBackupStorageWrite(null, 'plans', 'new'), /unavailable/);
  assert.equal(storage.getString('favorites'), 'old');
  let lastRollbackRan = false;
  assert.throws(
    () =>
      runBackupWrites([
        {
          write: () => {},
          rollback: () => {
            lastRollbackRan = true;
          },
        },
        step,
        {
          write: () => {
            throw new Error('write');
          },
          rollback: () => {
            throw new Error('rollback');
          },
        },
      ]),
    (error) => error.code === 'rollbackFailed',
  );
  assert.equal(lastRollbackRan, true);
  assert.equal(storage.getString('favorites'), 'old');
});
