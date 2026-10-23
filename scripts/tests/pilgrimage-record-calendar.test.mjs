import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { createInstance } from 'i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { jsx, jsxs } from 'react/jsx-runtime';
import ts from 'typescript';
import * as calendarHelpers from '../../src/lib/pilgrimage-record-filter.ts';

function loadSource(path, modules = {}, globals = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: false,
    },
  }).outputText;
  const context = vm.createContext({
    exports: {},
    ...globals,
    require(name) {
      assert.ok(name in modules, `unexpected import: ${name}`);
      return modules[name];
    },
  });
  vm.runInContext(compiled, context);
  return context.exports;
}

const translations = Object.fromEntries(
  ['en', 'zh', 'ja'].map((language) => [language, loadSource(`../../src/i18n/translations/${language}.ts`).default]),
);
const emptyRange = () => ({ startDate: '', endDate: '' });
const plainRange = (range) => ({ startDate: range.startDate, endDate: range.endDate });
const textOf = (value) =>
  Array.isArray(value)
    ? value.map(textOf).join('')
    : React.isValidElement(value)
      ? textOf(value.props.children)
      : typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : '';

// Render the actual calendar with its real local-date helpers. Native views and
// one component's React hook state are stubbed, so this covers JS interaction and
// accessibility feedback; native touch targets and sheet gestures need a device.
function createHarness(initialRange = emptyRange(), language = 'en') {
  const slots = [];
  const observed = [];
  const pendingEffects = [];
  const changes = [];
  let cursor = 0;
  let range = plainRange(initialRange);
  const sameDeps = (a, b) =>
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((value, index) => Object.is(value, b[index]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (next) => (slots[index] = typeof next === 'function' ? next(slots[index]) : next)];
    },
    useRef(initial) {
      const index = cursor++;
      return (slots[index] ??= { current: initial });
    },
    useEffect(run, deps) {
      const index = cursor++;
      if (!sameDeps(slots[index]?.deps, deps)) {
        pendingEffects.push(() => {
          slots[index]?.cleanup?.();
          slots[index] = { deps, cleanup: run() };
        });
      }
    },
  };
  const i18n = createInstance();
  void i18n.init({
    lng: language,
    resources: { [language]: { translation: translations[language] } },
    initImmediate: false,
  });
  const t = i18n.t.bind(i18n);
  const ui = (kind) => (props) => {
    observed.push({ kind, props });
    const children = typeof props.children === 'function' ? props.children({ pressed: false }) : props.children;
    return React.createElement('div', null, children);
  };
  const now = new Date(2026, 9, 23, 12).getTime();
  class CalendarDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }
    static now() {
      return now;
    }
  }
  const Calendar = loadSource(
    '../../src/components/pilgrimage-records/record-date-calendar.tsx',
    {
      react,
      'react/jsx-runtime': { jsx, jsxs, Fragment: React.Fragment },
      'react-i18next': { useTranslation: () => ({ t, i18n: { language, resolvedLanguage: language } }) },
      'react-native': {
        Pressable: ui('Pressable'),
        useWindowDimensions: () => ({ width: 360, height: 800, fontScale: 1 }),
      },
      tamagui: {
        Text: ui('Text'),
        View: ui('View'),
        XStack: ui('XStack'),
        YStack: ui('YStack'),
        useTheme: () => new Proxy({}, { get: () => ({ val: '#fb7299' }) }),
      },
      '@tamagui/lucide-icons-2': Object.fromEntries(
        ['ChevronDown', 'ChevronUp', 'ChevronLeft', 'ChevronRight', 'CalendarDays', 'ArrowRight', 'Check'].map(
          (name) => [name, ui(name)],
        ),
      ),
      '@/components/ui/strict-button': { StrictButton: ui('Button') },
      '@/lib/pilgrimage-record-filter': calendarHelpers,
    },
    { Date: CalendarDate },
  ).RecordDateCalendar;

  function render() {
    cursor = 0;
    observed.length = 0;
    renderToStaticMarkup(
      jsx(Calendar, {
        range,
        onChange(value) {
          range = plainRange(value);
          changes.push(range);
        },
      }),
    );
    while (pendingEffects.length) pendingEffects.shift()();
  }
  function label(key, options) {
    const value = t(key, options);
    const entry = observed.find((item) => item.props.accessibilityLabel === value);
    assert.ok(entry, `control exists: ${value}`);
    return entry;
  }
  function day(dateKey) {
    const entry = observed.find((item) => item.props.testID === `pilgrimage-calendar-day-${dateKey}`);
    assert.ok(entry, `visible calendar day exists: ${dateKey}`);
    return entry;
  }
  function choice(value) {
    const entry = observed.find((item) => item.kind === 'Button' && textOf(item.props.children) === String(value));
    assert.ok(entry, `calendar year or month choice exists: ${value}`);
    return entry;
  }
  function press(entry) {
    assert.notEqual(entry.props.disabled, true, 'the control is enabled');
    assert.equal(typeof entry.props.onPress, 'function', 'the control is interactive');
    entry.props.onPress();
    render();
  }
  render();
  return {
    render,
    day,
    label,
    choice,
    press,
    t,
    observed,
    changes,
    get range() {
      return range;
    },
  };
}

test('calendar taps complete ordered ranges, allow one day, and restart a completed selection', () => {
  const harness = createHarness();
  assert.equal(harness.day('2026-10-23').props.accessibilityRole, 'button');
  harness.press(harness.day('2026-10-23'));
  assert.deepEqual(harness.range, { startDate: '2026-10-23', endDate: '' });
  harness.press(harness.day('2026-10-20'));
  assert.deepEqual(harness.range, { startDate: '2026-10-20', endDate: '2026-10-23' });
  assert.equal(harness.day('2026-10-20').props.accessibilityState.selected, true);
  assert.equal(harness.day('2026-10-21').props.accessibilityState.selected, true);
  assert.equal(harness.day('2026-10-23').props.accessibilityState.selected, true);
  assert.equal(harness.day('2026-10-24').props.accessibilityState.selected, false);

  harness.press(harness.day('2026-10-28'));
  assert.deepEqual(harness.range, { startDate: '2026-10-28', endDate: '' });
  harness.press(harness.day('2026-10-28'));
  assert.deepEqual(harness.range, { startDate: '2026-10-28', endDate: '2026-10-28' });
  harness.press(harness.day('2026-10-26'));
  harness.press(harness.day('2026-10-29'));
  assert.deepEqual(harness.range, { startDate: '2026-10-26', endDate: '2026-10-29' });
});

test('selecting a neighboring-month day navigates that month and keeps range selection continuous', () => {
  const harness = createHarness();
  harness.press(harness.day('2026-09-30'));
  assert.deepEqual(harness.range, { startDate: '2026-09-30', endDate: '' });
  assert.ok(harness.day('2026-09-01'), 'calendar follows the selected previous-month day');
  harness.press(harness.day('2026-10-03'));
  assert.deepEqual(harness.range, { startDate: '2026-09-30', endDate: '2026-10-03' });
  assert.ok(harness.day('2026-10-31'), 'calendar follows the selected next-month day');
});

test('month arrows and year-to-month choices navigate without committing a date range', () => {
  const initial = { startDate: '2026-12-23', endDate: '2026-12-25' };
  const harness = createHarness(initial);
  harness.press(harness.label('pilgrimageRecordsFilterNextMonth'));
  assert.ok(harness.day('2027-01-15'));
  harness.press(harness.label('pilgrimageRecordsFilterPreviousMonth'));
  assert.ok(harness.day('2026-12-15'));

  harness.press(harness.label('pilgrimageRecordsFilterYear', { year: 2026 }));
  harness.press(harness.choice(2024));
  const february = new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(2026, 1, 1));
  harness.press(harness.choice(february));
  assert.ok(harness.day('2024-02-29'), 'year and month choices lead to leap-year dates');
  assert.deepEqual(harness.range, initial);
  assert.equal(harness.changes.length, 0, 'view navigation never calls the range change handler');
});

test('today navigation restores the current month without changing an incomplete range', () => {
  const initial = { startDate: '2024-02-29', endDate: '' };
  const harness = createHarness(initial);
  harness.press(harness.label('pilgrimageRecordsFilterYear', { year: 2024 }));
  harness.press(harness.label('pilgrimageRecordsFilterGoToToday'));
  assert.ok(harness.day('2026-10-23'));
  assert.deepEqual(harness.range, initial);
  assert.equal(harness.changes.length, 0);
});

test('calendar navigation respects the first and last schema years in all chooser modes', () => {
  const first = createHarness({ startDate: '0001-01-01', endDate: '' });
  assert.equal(first.label('pilgrimageRecordsFilterPreviousMonth').props.disabled, true);
  first.press(first.label('pilgrimageRecordsFilterSelectMonth'));
  assert.equal(first.label('pilgrimageRecordsFilterPreviousYear').props.disabled, true);
  first.press(first.label('pilgrimageRecordsFilterYear', { year: 1 }));
  assert.equal(first.label('pilgrimageRecordsFilterPreviousYears').props.disabled, true);
  first.press(first.label('pilgrimageRecordsFilterNextYears'));
  assert.ok(first.choice(13), 'year page advances by twelve years');
  first.press(first.label('pilgrimageRecordsFilterPreviousYears'));
  assert.ok(first.choice(1));

  const last = createHarness({ startDate: '9999-12-31', endDate: '' });
  assert.equal(last.label('pilgrimageRecordsFilterNextMonth').props.disabled, true);
  last.press(last.label('pilgrimageRecordsFilterSelectMonth'));
  assert.equal(last.label('pilgrimageRecordsFilterNextYear').props.disabled, true);
  last.press(last.label('pilgrimageRecordsFilterYear', { year: 9999 }));
  assert.equal(last.label('pilgrimageRecordsFilterNextYears').props.disabled, true);
  assert.ok(last.choice(9999));
  assert.equal(
    last.observed.some((entry) => textOf(entry.props.children) === '10000'),
    false,
  );
  assert.deepEqual(first.range, { startDate: '0001-01-01', endDate: '' });
  assert.deepEqual(last.range, { startDate: '9999-12-31', endDate: '' });
});

test('date accessibility labels localize date names and identify the range endpoints and today', () => {
  for (const language of ['en', 'zh', 'ja']) {
    const harness = createHarness({ startDate: '2026-10-22', endDate: '2026-10-23' }, language);
    const startLabel = harness.day('2026-10-22').props.accessibilityLabel;
    const endLabel = harness.day('2026-10-23').props.accessibilityLabel;
    assert.ok(startLabel.includes(harness.t('pilgrimageRecordsFilterRangeStart')), language);
    assert.ok(endLabel.includes(harness.t('pilgrimageRecordsFilterRangeEnd')), language);
    assert.ok(endLabel.includes(harness.t('today')), language);
    const formatted = new Intl.DateTimeFormat(language, { dateStyle: 'full' }).format(new Date(2026, 9, 23));
    assert.ok(endLabel.includes(formatted), `full localized date: ${language}`);
  }
});
