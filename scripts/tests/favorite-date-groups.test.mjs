import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { groupFavoriteItemsByDate } from '../../src/utils/favorite-date-groups.ts';

const options = (now, language = 'zh-CN') => ({ language, todayLabel: '今天', yesterdayLabel: '昨天', now });
const timestamp = (item) => item.addedAt;
const plain = (value) => JSON.parse(JSON.stringify(value));

function trackFormatters(run) {
  const original = Intl.DateTimeFormat;
  const calls = { constructors: 0, formats: 0 };
  Intl.DateTimeFormat = new Proxy(original, {
    construct(target, args) {
      calls.constructors++;
      const formatter = Reflect.construct(target, args);
      return {
        format(date) {
          calls.formats++;
          return formatter.format(date);
        },
      };
    },
  });
  try {
    run(calls);
  } finally {
    Intl.DateTimeFormat = original;
  }
}

function inTimeZone(zone, run) {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

// Both pages share these baseline semantics: local dates, rounding and localized labels.
function legacyGroups(items, getTimestamp, { now, language, todayLabel, yesterdayLabel }) {
  const groups = new Map();
  for (const item of items) {
    const target = new Date(getTimestamp(item));
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const targetStart = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
    const days = Math.round((todayStart - targetStart) / 86_400_000);
    const label =
      days === 0
        ? todayLabel
        : days === 1
          ? yesterdayLabel
          : new Intl.DateTimeFormat(language, { year: 'numeric', month: 'long', day: 'numeric' }).format(target);
    const group = groups.get(label) ?? [];
    group.push(item);
    groups.set(label, group);
  }
  return Array.from(groups.entries());
}

test('empty, today and yesterday groups do not construct an Intl formatter', () => {
  const now = new Date(2026, 9, 20, 12);
  const items = [
    { id: 'today', addedAt: new Date(2026, 9, 20, 0).getTime() },
    { id: 'yesterday', addedAt: new Date(2026, 9, 19, 23, 59, 59).getTime() },
  ];
  trackFormatters((calls) => {
    assert.deepEqual(groupFavoriteItemsByDate([], timestamp, options(now)), []);
    assert.deepEqual(groupFavoriteItemsByDate(items, timestamp, options(now)), [
      ['今天', [items[0]]],
      ['昨天', [items[1]]],
    ]);
    assert.deepEqual(calls, { constructors: 0, formats: 0 });
  });
});

test('4998 historical favorites on the same local day construct and format once without mutating input', () => {
  const items = Object.freeze(
    Array.from({ length: 4998 }, (_, id) => Object.freeze({ id, addedAt: new Date(2026, 0, 1, 0, 0, id).getTime() })),
  );
  const before = structuredClone(items);
  trackFormatters((calls) => {
    const grouped = groupFavoriteItemsByDate(items, timestamp, options(new Date(2026, 9, 20)));
    assert.equal(grouped.length, 1);
    assert.deepEqual(grouped[0][1], items);
    assert.equal(grouped[0][1][1000], items[1000]);
    assert.deepEqual(calls, { constructors: 1, formats: 1 });
  });
  assert.deepEqual(items, before);
});

test('distinct local dates share one formatter and preserve encounter order within and between groups', () => {
  const items = [
    { id: 'old-first', addedAt: new Date(2025, 11, 31, 22).getTime() },
    { id: 'future', addedAt: new Date(2026, 1, 2, 1).getTime() },
    { id: 'old-second', addedAt: new Date(2025, 11, 31, 0).getTime() },
    { id: 'month', addedAt: new Date(2026, 0, 1, 23).getTime() },
  ];
  const config = options(new Date(2026, 0, 20));
  const expected = legacyGroups(items, timestamp, config);
  trackFormatters((calls) => {
    assert.deepEqual(groupFavoriteItemsByDate(items, timestamp, config), expected);
    assert.deepEqual(calls, { constructors: 1, formats: 3 });
  });
  assert.deepEqual(
    expected.map(([, entries]) => entries.map(({ id }) => id)),
    [['old-first', 'old-second'], ['future'], ['month']],
  );
});

test('identical labels still merge across different local dates', () => {
  const now = new Date(2026, 9, 20, 12);
  const historical = new Date(2026, 9, 17, 12);
  const label = new Intl.DateTimeFormat('en', { year: 'numeric', month: 'long', day: 'numeric' }).format(historical);
  const items = [now, historical, new Date(2026, 9, 19, 12)].map((date, id) => ({ id, addedAt: date.getTime() }));
  const grouped = groupFavoriteItemsByDate(items, timestamp, {
    now,
    language: 'en',
    todayLabel: label,
    yesterdayLabel: label,
  });
  assert.deepEqual(grouped, [[label, items]]);
});

test('Chinese, Japanese and English retain the old output across days, months, years and future dates', () => {
  const now = new Date(2026, 0, 2, 12);
  const items = [
    new Date(2026, 0, 2, 0),
    new Date(2026, 0, 1, 23, 59, 59),
    new Date(2025, 11, 31, 23, 59, 59),
    new Date(2025, 11, 1),
    new Date(2024, 1, 29),
    new Date(1970, 0, 1),
    new Date(2026, 0, 3),
    new Date(2027, 0, 1),
  ].map((date, id) => ({ id, addedAt: date.getTime() }));
  const labels = [];
  for (const language of ['zh-CN', 'ja', 'en']) {
    const config = options(now, language);
    const actual = groupFavoriteItemsByDate(items, timestamp, config);
    assert.deepEqual(actual, legacyGroups(items, timestamp, config));
    labels.push(actual[2][0]);
  }
  assert.notEqual(labels[0], labels[2], 'English follows the new language instead of a previously cached formatter');
});

test('local midnight and both DST transitions match the old grouping instead of UTC dates or 24-hour gaps', () => {
  inTimeZone('Asia/Tokyo', () => {
    const now = new Date('2026-10-20T00:30:00+09:00');
    assert.equal(now.getHours(), 0, 'the test runs in the requested local timezone');
    const items = ['2026-10-19T14:59:59Z', '2026-10-19T15:00:00Z'].map((value) => ({
      addedAt: new Date(value).getTime(),
    }));
    const config = options(now);
    const actual = groupFavoriteItemsByDate(items, timestamp, config);
    assert.deepEqual(
      actual.map(([label]) => label),
      ['昨天', '今天'],
    );
    assert.deepEqual(actual, legacyGroups(items, timestamp, config));
  });

  inTimeZone('America/New_York', () => {
    for (const [nowValue, previousValue] of [
      ['2026-03-09T12:00:00-04:00', '2026-03-08T12:00:00-04:00'],
      ['2026-11-02T12:00:00-05:00', '2026-11-01T12:00:00-05:00'],
    ]) {
      const now = new Date(nowValue);
      assert.equal(now.getHours(), 12);
      const items = [{ addedAt: new Date(previousValue).getTime() }];
      const config = options(now, 'en');
      assert.deepEqual(groupFavoriteItemsByDate(items, timestamp, config), [['昨天', items]]);
      assert.deepEqual(groupFavoriteItemsByDate(items, timestamp, config), legacyGroups(items, timestamp, config));
    }
    const repeatedHour = ['2026-11-01T01:30:00-04:00', '2026-11-01T01:30:00-05:00'].map((value) => ({
      addedAt: new Date(value).getTime(),
    }));
    trackFormatters((calls) => {
      const grouped = groupFavoriteItemsByDate(repeatedHour, timestamp, options(new Date(2026, 10, 4)));
      assert.equal(grouped.length, 1);
      assert.deepEqual(calls, { constructors: 1, formats: 1 });
    });
  });
});

function pageGroupingHarness(path, componentName, groupName, initialContext) {
  const content = readFileSync(new URL(path, import.meta.url), 'utf8');
  const parsed = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = parsed.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === componentName,
  );
  const dateGroupHelper = parsed.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'getDateGroup',
  );
  const declarations = component.body.statements
    .filter(ts.isVariableStatement)
    .flatMap((node) => [...node.declarationList.declarations]);
  const names = [groupName, 'listItems', 'stickyHeaderIndices'];
  const extracted = names.map((name) => {
    const declaration = declarations.find((node) => node.name.getText(parsed) === name);
    assert.ok(declaration, `the page defines ${name}`);
    return `const ${name} = ${declaration.initializer.getText(parsed)};`;
  });
  const compiled = ts.transpileModule(
    `${dateGroupHelper?.getText(parsed) ?? ''}
    exports.render = () => { ${extracted.join('\n')} return { groups: ${groupName}, listItems, stickyHeaderIndices }; };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
  ).outputText;
  const slots = [];
  let cursor = 0;
  let groupCalls = 0;
  const context = vm.createContext({
    exports: {},
    ...initialContext,
    i18n: { language: 'zh-CN', resolvedLanguage: 'zh-CN' },
    t: (_key, { defaultValue }) => defaultValue,
    groupFavoriteItemsByDate: (items, getTimestamp, config) => {
      groupCalls++;
      return groupFavoriteItemsByDate(items, getTimestamp, { ...config, now: new Date(2026, 9, 20, 12) });
    },
    useMemo(factory, dependencies) {
      const previous = slots[cursor];
      const slot = cursor++;
      if (!previous || dependencies.some((value, index) => !Object.is(value, previous.dependencies[index]))) {
        slots[slot] = { dependencies, value: factory() };
      }
      return slots[slot].value;
    },
  });
  vm.runInContext(compiled, context);
  return {
    context,
    get groupCalls() {
      return groupCalls;
    },
    render() {
      cursor = 0;
      return plain(context.exports.render());
    },
  };
}

test('FavoritesScreen preserves date grouping in both views and localized history rows and sticky headers', () => {
  const entries = [
    { favorite: { key: 'a', addedAt: new Date(2020, 0, 17, 12).getTime() } },
    { favorite: { key: 'b', addedAt: new Date(2020, 0, 17, 0).getTime() } },
    { favorite: { key: 'c', addedAt: new Date(2020, 0, 16, 10).getTime() } },
  ];
  const bangumiGroups = [{ id: 1, items: entries }];
  const harness = pageGroupingHarness('../../src/app/(tabs)/favorites.tsx', 'FavoritesScreen', 'historyGroups', {
    view: 'bangumi',
    resolvedFavorites: entries,
    bangumiGroups,
  });

  const initial = harness.render();
  assert.equal(initial.groups.length, 2, 'the work view still computes its history groups');
  assert.deepEqual(initial.groups[0][1], entries.slice(0, 2));
  assert.deepEqual(initial.listItems, [{ type: 'bangumi', id: 'bangumi-1', group: bangumiGroups[0] }]);
  assert.deepEqual(initial.stickyHeaderIndices, []);
  assert.equal(harness.groupCalls, 0, 'the page keeps using its own date helper');

  harness.context.view = 'history';
  const history = harness.render();
  assert.deepEqual(history.groups, initial.groups);
  assert.deepEqual(
    history.listItems.filter(({ type }) => type === 'date').map(({ label }) => label),
    history.groups.map(([label]) => label),
  );
  assert.deepEqual(
    history.listItems.filter(({ type }) => type === 'favorite').map(({ item }) => item),
    entries,
  );
  assert.deepEqual(history.stickyHeaderIndices, [0, 3]);
  assert.deepEqual(harness.render(), history);

  harness.context.view = 'bangumi';
  assert.deepEqual(harness.render(), initial);
  harness.context.i18n.resolvedLanguage = 'en';
  const localizedWork = harness.render();
  assert.notEqual(localizedWork.groups[0][0], initial.groups[0][0]);
  assert.deepEqual(localizedWork.listItems, initial.listItems);
  assert.deepEqual(localizedWork.stickyHeaderIndices, []);

  harness.context.view = 'history';
  const returned = harness.render();
  assert.deepEqual(returned.groups, localizedWork.groups);
  assert.deepEqual(
    returned.groups.map(([, items]) => items),
    history.groups.map(([, items]) => items),
  );
  assert.deepEqual(
    returned.listItems.filter(({ type }) => type === 'date').map(({ label }) => label),
    returned.groups.map(([label]) => label),
  );
  assert.deepEqual(returned.stickyHeaderIndices, [0, 3]);
});

for (const page of [
  {
    path: '../../src/app/plans/[planId]/add.tsx',
    component: 'AddPlanPointsScreen',
    group: 'groupedAvailable',
    selector: 'source',
    active: 'favorites',
    inactive: 'work',
    items: 'available',
  },
]) {
  test(`${page.component} skips inactive date grouping and restores localized groups and sticky headers on return`, () => {
    const entries = [
      { favorite: { key: 'a', addedAt: new Date(2026, 9, 17, 12).getTime() } },
      { favorite: { key: 'b', addedAt: new Date(2026, 9, 17, 0).getTime() } },
      { favorite: { key: 'c', addedAt: new Date(2026, 9, 20, 10).getTime() } },
    ];
    const harness = pageGroupingHarness(page.path, page.component, page.group, {
      [page.selector]: page.inactive,
      [page.items]: entries,
      bangumiGroups: [],
    });
    assert.deepEqual(harness.render().groups, []);
    assert.equal(harness.groupCalls, 0);

    harness.context[page.selector] = page.active;
    const first = harness.render();
    assert.equal(harness.groupCalls, 1);
    assert.equal(first.groups.length, 2);
    assert.deepEqual(first.groups[0][1], entries.slice(0, 2));
    assert.deepEqual(first.stickyHeaderIndices, [0, 3]);
    assert.deepEqual(harness.render(), first);
    assert.equal(harness.groupCalls, 1, 'unchanged dependencies keep the existing grouping');

    harness.context[page.selector] = page.inactive;
    assert.deepEqual(harness.render().groups, []);
    assert.equal(harness.groupCalls, 1);
    harness.context.i18n.resolvedLanguage = 'en';
    harness.render();
    assert.equal(harness.groupCalls, 1, 'changing language while inactive still skips date grouping');

    harness.context[page.selector] = page.active;
    const returned = harness.render();
    assert.equal(harness.groupCalls, 2);
    assert.notEqual(returned.groups[0][0], first.groups[0][0]);
    assert.deepEqual(
      returned.groups.map(([, items]) => items),
      first.groups.map(([, items]) => items),
    );
    assert.deepEqual(returned.stickyHeaderIndices, [0, 3]);
  });
}
