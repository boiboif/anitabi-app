import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { registerHooks } from 'node:module';
import test from 'node:test';
import {
  getPilgrimageCalendarDays,
  getPilgrimageCalendarMonth,
  getPilgrimageDateRangeDayCount,
  getPilgrimageLocalDateKey,
  getPilgrimagePresetRange,
  movePilgrimageCalendarMonth,
  selectPilgrimageDateRange,
} from '../../src/lib/pilgrimage-record-filter.ts';

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@/lib/pilgrimage-records')
      return { url: new URL('../../src/lib/pilgrimage-records.ts', import.meta.url).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { filterPilgrimageDays } = await import('../../src/lib/pilgrimage-record-query.ts');
hooks.deregister();

const range = (startDate = '', endDate = '') => ({ startDate, endDate });
const localDate = (year, month, day, hour = 12) => {
  const value = new Date(0);
  value.setHours(hour, 0, 0, 0);
  value.setFullYear(year, month - 1, day);
  return value;
};

test('presets include today and calculate natural calendar boundaries across years and leap days', () => {
  const reference = localDate(2026, 1, 3);
  assert.deepEqual(getPilgrimagePresetRange('all', reference), range());
  assert.deepEqual(getPilgrimagePresetRange('custom', reference), range());
  assert.deepEqual(getPilgrimagePresetRange('last7', reference), range('2025-12-28', '2026-01-03'));
  assert.deepEqual(getPilgrimagePresetRange('last30', reference), range('2025-12-05', '2026-01-03'));
  assert.deepEqual(getPilgrimagePresetRange('month', reference), range('2026-01-01', '2026-01-03'));
  assert.deepEqual(getPilgrimagePresetRange('year', reference), range('2026-01-01', '2026-01-03'));
  assert.deepEqual(getPilgrimagePresetRange('last7', localDate(2024, 3, 1)), range('2024-02-24', '2024-03-01'));
  assert.deepEqual(getPilgrimagePresetRange('last30', localDate(2024, 3, 1)), range('2024-02-01', '2024-03-01'));
  assert.deepEqual(getPilgrimagePresetRange('year', localDate(2026, 10, 23)), range('2026-01-01', '2026-10-23'));
  assert.deepEqual(getPilgrimagePresetRange('month', localDate(2026, 10, 23)), range('2026-10-01', '2026-10-23'));
  assert.equal(getPilgrimageLocalDateKey(reference), '2026-01-03', 'preset calculation leaves reference unchanged');
});

test('calendar always provides six Monday-first weeks including neighboring months', () => {
  const october = getPilgrimageCalendarDays(2026, 10);
  assert.equal(october.length, 42);
  assert.deepEqual(october[0], { dateKey: '2026-09-28', day: 28, isCurrentMonth: false });
  assert.deepEqual(october[3], { dateKey: '2026-10-01', day: 1, isCurrentMonth: true });
  assert.deepEqual(october.at(-1), { dateKey: '2026-11-08', day: 8, isCurrentMonth: false });
  assert.equal(october.filter((day) => day?.isCurrentMonth).length, 31);
  assert.equal(new Set(october.map((day) => day?.dateKey)).size, 42);
  assert.equal(getPilgrimageCalendarDays(2026, 6)[0].dateKey, '2026-06-01', 'Monday needs no previous week');
  assert.equal(getPilgrimageCalendarDays(2026, 2)[0].dateKey, '2026-01-26', 'Sunday is the seventh column');
});

test('calendar handles Gregorian leap centuries and supported schema year boundaries', () => {
  for (const [year, count] of [
    [1900, 28],
    [2000, 29],
    [2024, 29],
    [2100, 28],
  ]) {
    const days = getPilgrimageCalendarDays(year, 2);
    assert.equal(days.filter((day) => day?.isCurrentMonth).length, count);
  }
  assert.equal(getPilgrimageCalendarDays(1, 1)[0].dateKey, '0001-01-01');
  const last = getPilgrimageCalendarDays(9999, 12);
  assert.equal(last.filter((day) => day?.isCurrentMonth).length, 31);
  assert.equal(last.filter(Boolean).at(-1).dateKey, '9999-12-31');
  assert.equal(last.filter((day) => day === null).length, 9);
  assert.deepEqual(getPilgrimageCalendarMonth('0001-01-01'), { year: 1, month: 1 });
  assert.deepEqual(getPilgrimageCalendarMonth('0099-12-31'), { year: 99, month: 12 });
  assert.equal(getPilgrimageLocalDateKey(localDate(1, 1, 1)), '0001-01-01');
  assert.equal(getPilgrimageLocalDateKey(localDate(99, 12, 31)), '0099-12-31');
  assert.equal(getPilgrimageLocalDateKey(localDate(9999, 12, 31)), '9999-12-31');
  assert.deepEqual(getPilgrimagePresetRange('last7', localDate(1, 1, 3)), range('0001-01-01', '0001-01-03'));
  assert.deepEqual(getPilgrimagePresetRange('last30', localDate(1, 1, 1)), range('0001-01-01', '0001-01-01'));
});

test('month navigation crosses years, supports fast year jumps and clamps to supported years', () => {
  assert.deepEqual(movePilgrimageCalendarMonth(2026, 12, 1), { year: 2027, month: 1 });
  assert.deepEqual(movePilgrimageCalendarMonth(2026, 1, -1), { year: 2025, month: 12 });
  assert.deepEqual(movePilgrimageCalendarMonth(2026, 10, -120), { year: 2016, month: 10 });
  assert.deepEqual(movePilgrimageCalendarMonth(1, 1, -1), { year: 1, month: 1 });
  assert.deepEqual(movePilgrimageCalendarMonth(9999, 12, 1), { year: 9999, month: 12 });
  assert.deepEqual(movePilgrimageCalendarMonth(2026, 10, Number.MAX_SAFE_INTEGER), { year: 9999, month: 12 });
});

test('range selection starts, completes in either direction, permits one day and restarts after completion', () => {
  const start = selectPilgrimageDateRange(range(), '2026-10-23');
  assert.deepEqual(start, range('2026-10-23'));
  assert.deepEqual(selectPilgrimageDateRange(start, '2026-10-30'), range('2026-10-23', '2026-10-30'));
  assert.deepEqual(selectPilgrimageDateRange(start, '2026-09-30'), range('2026-09-30', '2026-10-23'));
  assert.deepEqual(selectPilgrimageDateRange(start, '2026-10-23'), range('2026-10-23', '2026-10-23'));
  const completed = range('2026-10-23', '2026-10-30');
  assert.deepEqual(selectPilgrimageDateRange(completed, '2025-12-31'), range('2025-12-31'));
  assert.deepEqual(selectPilgrimageDateRange(range('', '2026-10-23'), '2026-10-22'), range('2026-10-22'));
  assert.deepEqual(start, range('2026-10-23'), 'working ranges are not mutated');
  assert.deepEqual(completed, range('2026-10-23', '2026-10-30'));
});

test('selected ranges retain both endpoint visits when applied to existing date filtering', () => {
  const selected = selectPilgrimageDateRange(selectPilgrimageDateRange(range(), '2026-10-03'), '2026-10-01');
  const history = ['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].map((dateKey) => ({
    dateKey,
    firstRecordedAt: 1,
    photos: [],
  }));
  assert.deepEqual(
    filterPilgrimageDays(history, selected).map((day) => day.dateKey),
    ['2026-10-03', '2026-10-02', '2026-10-01'],
  );
});

test('range day counts include both boundaries and follow Gregorian leap and century rules', () => {
  for (const [start, end, count] of [
    ['2026-10-23', '2026-10-23', 1],
    ['2026-09-30', '2026-10-03', 4],
    ['2025-12-31', '2026-01-01', 2],
    ['1900-02-28', '1900-03-01', 2],
    ['2000-02-28', '2000-03-01', 3],
    ['2024-02-28', '2024-03-01', 3],
    ['2100-02-28', '2100-03-01', 2],
    ['0001-01-01', '0001-01-01', 1],
    ['0099-12-31', '0100-01-01', 2],
    ['9999-12-30', '9999-12-31', 2],
    ['0001-01-01', '9999-12-31', 3652059],
  ]) {
    assert.equal(getPilgrimageDateRangeDayCount(range(start, end)), count, `${start} through ${end}`);
  }
});

test('incomplete or reversed ranges have no day count and counting does not change the selection', () => {
  for (const value of [range(), range('2026-10-23'), range('', '2026-10-23'), range('2026-10-24', '2026-10-23')]) {
    assert.equal(getPilgrimageDateRangeDayCount(value), 0);
  }
  const selected = range('2026-10-01', '2026-10-23');
  assert.equal(getPilgrimageDateRangeDayCount(selected), 23);
  assert.deepEqual(selected, range('2026-10-01', '2026-10-23'));
});

test('rejects invalid dates and month navigation inputs instead of silently normalizing them', () => {
  for (const key of ['0000-01-01', '10000-01-01', '2026-02-29', '1900-02-29', '2026-04-31', '2026-1-1']) {
    assert.throws(() => getPilgrimageCalendarMonth(key), key);
    assert.throws(() => selectPilgrimageDateRange(range(), key), key);
    assert.throws(() => getPilgrimageDateRangeDayCount(range(key, '2026-03-01')), key);
    assert.throws(() => getPilgrimageDateRangeDayCount(range('2026-03-01', key)), key);
  }
  for (const [year, month] of [
    [0, 1],
    [10000, 1],
    [2026, 0],
    [2026, 13],
    [2026.5, 1],
    [2026, NaN],
  ]) {
    assert.throws(() => getPilgrimageCalendarDays(year, month));
    assert.throws(() => movePilgrimageCalendarMonth(year, month, 0));
  }
  for (const delta of [0.5, Infinity, NaN]) assert.throws(() => movePilgrimageCalendarMonth(2026, 10, delta));
  assert.throws(() => getPilgrimageLocalDateKey(new Date(NaN)));
  assert.throws(() => getPilgrimagePresetRange('last7', new Date(NaN)));
});

test('local dates and day ranges remain stable across UTC offsets, DST and a historically skipped local day', () => {
  const moduleUrl = new URL('../../src/lib/pilgrimage-record-filter.ts', import.meta.url).href;
  const childSource = `
    import assert from 'node:assert/strict';
    import { getPilgrimageLocalDateKey, getPilgrimagePresetRange, getPilgrimageCalendarDays, getPilgrimageDateRangeDayCount } from ${JSON.stringify(moduleUrl)};
    for (const hour of [0, 12, 23]) {
      assert.equal(getPilgrimageLocalDateKey(new Date(2026, 9, 23, hour, 30)), '2026-10-23');
    }
    for (const [year, month, day, hour, start, end] of [
      [2026, 2, 9, 0, '2026-03-03', '2026-03-09'],
      [2026, 10, 2, 23, '2026-10-27', '2026-11-02'],
      [2011, 11, 31, 12, '2011-12-25', '2011-12-31'],
    ]) {
      assert.deepEqual(getPilgrimagePresetRange('last7', new Date(year, month, day, hour, 30)), { startDate: start, endDate: end });
    }
    assert.equal(getPilgrimageCalendarDays(2011, 12).filter(day => day?.isCurrentMonth).length, 31);
    assert.equal(getPilgrimageCalendarDays(2026, 10)[0].dateKey, '2026-09-28');
    for (const [startDate, endDate, expected] of [
      ['2026-03-07', '2026-03-10', 4],
      ['2026-10-31', '2026-11-03', 4],
      ['2011-12-29', '2011-12-31', 3],
      ['0001-01-01', '9999-12-31', 3652059],
    ]) {
      assert.equal(getPilgrimageDateRangeDayCount({ startDate, endDate }), expected);
    }
  `;
  for (const timezone of ['UTC', 'Asia/Shanghai', 'America/New_York', 'Pacific/Kiritimati', 'Pacific/Apia']) {
    execFileSync(process.execPath, ['--input-type=module', '-e', childSource], {
      env: { ...process.env, TZ: timezone },
      stdio: 'pipe',
    });
  }
});
