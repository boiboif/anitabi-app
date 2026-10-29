import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import dayjs from 'dayjs';
import { createInstance } from 'i18next';
import ts from 'typescript';
import * as recordHelpers from '../../src/lib/pilgrimage-records.ts';

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@/lib/pilgrimage-records')
      return { url: new URL('../../src/lib/pilgrimage-records.ts', import.meta.url).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { queryPilgrimagePoints } = await import('../../src/lib/pilgrimage-record-query.ts');
hooks.deregister();

function loadSource(path, modules = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const context = vm.createContext({
    exports: {},
    require(name) {
      assert.ok(name in modules, `unexpected import: ${name}`);
      return modules[name];
    },
  });
  vm.runInContext(compiled, context);
  return context.exports;
}

function cardFor(point, language) {
  const i18n = createInstance();
  void i18n.init({
    lng: language,
    resources: { [language]: { translation: loadSource(`../../src/i18n/translations/${language}.ts`).default } },
    initImmediate: false,
  });
  const jsx = (type, props) => ({ type, props });
  const { RecordPointCard } = loadSource('../../src/components/pilgrimage-records/record-point-card.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-i18next': { useTranslation: () => ({ t: i18n.t.bind(i18n) }) },
    'react-native': { Pressable: 'Pressable' },
    tamagui: { Text: 'Text', View: 'View', XStack: 'XStack', YStack: 'YStack' },
    '@tamagui/lucide-icons-2': { CalendarDays: 'CalendarDays', ChevronRight: 'ChevronRight' },
    'expo-image': { Image: 'Image' },
    dayjs: { default: dayjs },
    '@/lib/pilgrimage-record-files': { getPilgrimagePhotoUri: (photo) => `file:///records/${photo.fileName}` },
    '@/lib/pilgrimage-records': recordHelpers,
    '@/services/handlers': { buildImageUrl: (path) => path },
  });
  return RecordPointCard({ point, onPress() {} });
}

function nodesOf(value) {
  if (Array.isArray(value)) return value.flatMap(nodesOf);
  return value && typeof value === 'object' ? [value, ...nodesOf(value.props?.children)] : [];
}

function textOf(value) {
  if (Array.isArray(value)) return value.map(textOf).join('');
  if (value && typeof value === 'object') return textOf(value.props?.children);
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function history() {
  const photo = (id) => ({ id, fileName: `${id}.jpg`, width: 800, height: 600 });
  return [
    {
      key: '1:a',
      bangumiId: 1,
      pointId: 'a',
      snapshot: { bangumiName: '作品', pointName: '地点' },
      days: [
        { dateKey: '2026-10-23', firstRecordedAt: 3, photos: [photo('a'), photo('b')] },
        { dateKey: '2026-10-22', firstRecordedAt: 2, photos: [] },
        { dateKey: '2026-10-21', firstRecordedAt: 1, photos: [photo('c')] },
      ],
    },
  ];
}

for (const [language, expected] of [
  ['zh', '2 天记录 · 2 张照片'],
  ['en', '2 recorded days · 2 photos'],
  ['ja', '2 日分の記録 · 写真 2 枚'],
]) {
  test(`card reports only the filtered record days and photos in ${language}, including days with no photos`, () => {
    const points = history();
    const original = structuredClone(points);
    const [filtered] = queryPilgrimagePoints(points, { startDate: '2026-10-22', endDate: '2026-10-23' });
    const text = textOf(cardFor(filtered, language));
    assert.ok(text.includes('2026-10-23'));
    assert.ok(text.includes(expected));
    assert.equal(text.includes('2026-10-21'), false);
    assert.deepEqual(points, original);
  });
}

test('an empty-photo day still shows its date and one recorded day with a calendar fallback', () => {
  const [filtered] = queryPilgrimagePoints(history(), { startDate: '2026-10-22', endDate: '2026-10-22' });
  const tree = cardFor(filtered, 'zh');
  const text = textOf(tree);
  assert.ok(text.includes('2026-10-22'));
  assert.ok(text.includes('1 天记录 · 0 张照片'));
  assert.equal(
    nodesOf(tree).some((node) => node.type === 'Image'),
    false,
  );
  assert.equal(
    nodesOf(tree).some((node) => node.type === 'CalendarDays'),
    true,
  );
});
