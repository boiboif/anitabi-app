import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { decodeBackupContentsV3, encodeBackupContentsV3, isBackupContentsV3 } from '../../src/lib/data-backup-codec.ts';

function wireData() {
  const snapshot = {
    bangumiName: '作品',
    bangumiCover: '/cover.jpg',
    bangumiColor: '#ffffff',
    pointName: '点位',
    pointImage: '/point.jpg',
    pointMark: '备注',
  };
  return {
    favoritePoints: [{ key: '1:a', bangumiId: 1, pointId: 'a', addedAt: 100, snapshot: { ...snapshot } }],
    plans: [
      {
        id: 'plan-a',
        title: '行程',
        description: '描述',
        createdAt: 100,
        updatedAt: 200,
        items: [
          {
            key: '1:a',
            bangumiId: 1,
            pointId: 'a',
            addedAt: 100,
            completed: true,
            snapshot: { ...snapshot, geo: [35.7, 139.7] },
          },
        ],
      },
    ],
    planListSortOrder: 'asc',
    pilgrimageRecords: [
      {
        key: '1:a',
        bangumiId: 1,
        pointId: 'a',
        snapshot: { ...snapshot, geo: [35.7, 139.7] },
        days: [
          {
            dateKey: '2026-10-22',
            firstRecordedAt: 1792630800000,
            photos: [{ id: 'photo-a', fileName: 'photo-a.jpg', width: 800, height: 600 }],
          },
        ],
      },
    ],
  };
}

function addInternalFields(data) {
  data.internalRevision = 2;
  data.favoritePoints[0].internalId = 'favorite';
  data.favoritePoints[0].snapshot.sourceCache = 'favorite-cache';
  data.plans[0].syncState = 'pending';
  data.plans[0].items[0].internalId = 'item';
  data.plans[0].items[0].snapshot.sourceCache = 'plan-cache';
  data.pilgrimageRecords[0].schemaVersion = 999;
  data.pilgrimageRecords[0].snapshot.sourceCache = 'record-cache';
  data.pilgrimageRecords[0].days[0].internalId = 'day';
  data.pilgrimageRecords[0].days[0].photos[0].localUri = '/private/photo-a.jpg';
  return data;
}

test('app/wire adapters whitelist every category and never share nested mutable data', () => {
  const app = addInternalFields(wireData());
  const expected = wireData();
  const encoded = encodeBackupContentsV3(app);
  assert.deepEqual(encoded, expected);
  assert.deepEqual(app, addInternalFields(wireData()));

  const decoded = decodeBackupContentsV3(addInternalFields(wireData()));
  assert.deepEqual(decoded, expected);
  const roundTrip = decodeBackupContentsV3(encoded);
  assert.deepEqual(roundTrip, expected);
  app.favoritePoints[0].snapshot.pointName = 'changed app';
  app.plans[0].items[0].snapshot.geo[0] = 0;
  app.pilgrimageRecords[0].days[0].photos[0].width = 1;
  assert.deepEqual(encoded, expected);

  roundTrip.favoritePoints[0].snapshot.pointName = 'changed decoded';
  roundTrip.plans[0].items[0].snapshot.geo[0] = 0;
  roundTrip.pilgrimageRecords[0].snapshot.geo[1] = 0;
  roundTrip.pilgrimageRecords[0].days[0].photos[0].width = 1;
  roundTrip.pilgrimageRecords[0].days.push({ dateKey: '2026-10-23', firstRecordedAt: 1, photos: [] });
  assert.deepEqual(encoded, expected);
});

test('adapters preserve omitted versus included-empty categories without inventing record data', () => {
  for (const convert of [encodeBackupContentsV3, decodeBackupContentsV3]) {
    assert.deepEqual(convert({ favoritePoints: [] }), { favoritePoints: [] });
    assert.deepEqual(convert({ plans: [], planListSortOrder: 'desc' }), { plans: [], planListSortOrder: 'desc' });
    assert.deepEqual(convert({ pilgrimageRecords: [] }), { pilgrimageRecords: [] });
    assert.equal(Object.hasOwn(convert({ favoritePoints: [] }), 'pilgrimageRecords'), false);
  }
});

test('frozen V3 record validation enforces identity, calendar, ownership, and photo invariants', () => {
  assert.equal(isBackupContentsV3(wireData()), true);
  assert.equal(isBackupContentsV3({ pilgrimageRecords: [] }), true);
  const invalidChanges = [
    (data) => (data.pilgrimageRecords[0].key = '2:a'),
    (data) => (data.pilgrimageRecords[0].pointId = ' '),
    (data) => (data.pilgrimageRecords[0].snapshot.geo = [91, 0]),
    (data) => (data.pilgrimageRecords[0].days = []),
    (data) => (data.pilgrimageRecords[0].days[0].dateKey = '2026-02-30'),
    (data) => (data.pilgrimageRecords[0].days[0].firstRecordedAt = 0.5),
    (data) => (data.pilgrimageRecords[0].days[0].photos[0].width = 0),
    (data) => (data.pilgrimageRecords[0].days[0].photos[0].height = NaN),
    (data) => (data.pilgrimageRecords[0].days[0].photos[0].id = '../photo'),
    (data) => (data.pilgrimageRecords[0].days[0].photos[0].fileName = '../photo.jpg'),
    (data) => data.pilgrimageRecords.push(structuredClone(data.pilgrimageRecords[0])),
    (data) => data.pilgrimageRecords[0].days.push(structuredClone(data.pilgrimageRecords[0].days[0])),
    (data) => {
      const photo = { ...data.pilgrimageRecords[0].days[0].photos[0], fileName: 'another.jpg' };
      data.pilgrimageRecords[0].days.push({ dateKey: '2026-10-23', firstRecordedAt: 1, photos: [photo] });
    },
    (data) => {
      const photo = { ...data.pilgrimageRecords[0].days[0].photos[0], id: 'another' };
      data.pilgrimageRecords[0].days[0].photos.push(photo);
    },
  ];
  for (const change of invalidChanges) {
    const data = wireData();
    change(data);
    assert.equal(isBackupContentsV3(data), false, change.toString());
  }
});

test('historical V3 parsing and export do not run current app-model validation', () => {
  const moduleUrl = new URL('../../src/lib/data-backup.ts', import.meta.url).href;
  const sourceRoot = new URL('../../src/', import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    import { registerHooks } from 'node:module';
    registerHooks({
      resolve(specifier, context, next) {
        if (specifier === '@/lib/pilgrimage-records') return {url:'test:future-app-model',shortCircuit:true};
        if (specifier.startsWith('@/')) return {url:new URL(specifier.slice(2)+'.ts', ${JSON.stringify(sourceRoot)}).href,shortCircuit:true};
        return next(specifier, context);
      },
      load(url, context, next) {
        if (url === 'test:future-app-model') return {
          format:'module',shortCircuit:true,
          source:'export function mergePilgrimageRecords(){throw new Error("App merge must not run during parsing")} export function validatePilgrimageRecords(){throw new Error("Future model rejects historical wire")} '
        };
        return next(url, context);
      }
    });
    const {parseDataBackup,createDataBackupContent,selectBackupData} = await import(${JSON.stringify(moduleUrl)});
    const original = ${JSON.stringify(wireData())};
    const selected = selectBackupData(original,{favoritePoints:true,plans:true,pilgrimageRecords:true});
    const parsed = parseDataBackup(createDataBackupContent(selected,'future-app'));
    assert.equal(parsed.version,3);
    assert.deepEqual(parsed.data,original);
  `;
  execFileSync(process.execPath, ['--input-type=module', '-e', script], { stdio: 'pipe' });
});
