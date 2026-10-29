import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as fflate from 'fflate';
import ts from 'typescript';

const DEFAULT_BASE_URL = 'https://boiboif.github.io/anitabi-app/share/';

function loadSource(path, modules, globals = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const context = vm.createContext({
    exports: {},
    require(name) {
      assert.ok(name in modules, `unexpected import: ${name}`);
      return modules[name];
    },
    ...globals,
  });
  vm.runInContext(compiled, context);
  return context.exports;
}

function loadSharing(baseUrl = DEFAULT_BASE_URL, rejectCompression = false) {
  let compressionCalls = 0;
  const api = loadSource(
    '../../src/lib/plan-sharing.ts',
    {
      '@/i18n': { default: { t: (key, options) => options?.defaultValue ?? key } },
      fflate: {
        ...fflate,
        deflateSync(bytes, options) {
          compressionCalls++;
          assert.equal(rejectCompression, false, 'an ineligible plan must not be compressed');
          assert.equal(options.level, 9);
          return fflate.deflateSync(bytes, options);
        },
      },
    },
    { btoa, atob, process: { env: { EXPO_PUBLIC_PLAN_SHARE_BASE_URL: baseUrl } } },
  );
  return { api, compressionCalls: () => compressionCalls };
}

function planWithItems(count, variedIds = false) {
  return {
    id: 'plan',
    title: '  东京巡礼 🌸 Tokyo  ',
    items: Array.from({ length: count }, (_, index) => ({
      bangumiId: (index % 5) + 1,
      pointId: variedIds ? createHash('sha256').update(String(index)).digest('hex') : `point-${index}`,
    })),
  };
}

// Freeze the existing wire representation independently of the application's helpers.
function previousBundle(plan, baseUrl = DEFAULT_BASE_URL) {
  const data = { v: 1, t: plan.title.trim().slice(0, 60), i: plan.items.map((item) => [item.bangumiId, item.pointId]) };
  const packed = Buffer.from(fflate.deflateSync(fflate.strToU8(JSON.stringify(data)), { level: 9 })).toString(
    'base64url',
  );
  const url = `${baseUrl.trim().replace(/#.*$/u, '')}#${packed}`;
  const urlBytes = Buffer.byteLength(url, 'utf8');
  return { data, packed, url, urlBytes, qrEligible: data.i.length <= 200 && urlBytes <= 1200 };
}

test('QR decisions and encoded payloads match the existing format across plan sizes and Unicode titles', () => {
  const { api } = loadSharing();
  for (const count of [0, 1, 200, 201, 1000, 5000]) {
    for (const variedIds of [false, true]) {
      const plan = planWithItems(count, variedIds);
      if (variedIds) plan.title = `  ${'巡礼🌸'.repeat(20)}  `;
      const before = structuredClone(plan);
      const expected = previousBundle(plan);
      const actual = api.createPlanShareBundle(plan);
      assert.equal(JSON.stringify(actual), JSON.stringify(expected));
      assert.equal(api.canSharePlanAsQr(plan), expected.qrEligible);
      assert.deepEqual(plan, before);
    }
  }
  assert.equal(api.canSharePlanAsQr(planWithItems(0)), true, 'empty-plan alerts remain the callers responsibility');
  assert.equal(
    api.canSharePlanAsQr(planWithItems(200, true)),
    false,
    'the URL byte limit still applies below 201 items',
  );
});

test('plans over 200 items skip compression entirely, while eligible counts still encode once', () => {
  const rejected = loadSharing(DEFAULT_BASE_URL, true);
  for (const count of [201, 1000, 5000]) assert.equal(rejected.api.canSharePlanAsQr(planWithItems(count)), false);
  assert.equal(rejected.compressionCalls(), 0);

  const bounded = loadSharing();
  for (const count of [0, 1, 200]) bounded.api.canSharePlanAsQr(planWithItems(count));
  assert.equal(bounded.compressionCalls(), 3);
});

test('the 1200-byte boundary remains inclusive, including configured URLs with non-ASCII characters', () => {
  const plan = planWithItems(1);
  const { packed } = previousBundle(plan);
  const prefix = 'https://example.com/巡礼/';
  for (const targetBytes of [1199, 1200, 1201]) {
    const base = prefix + 'a'.repeat(targetBytes - Buffer.byteLength(prefix) - packed.length - 1);
    const configuredBase = `  ${base}#discard-this-fragment  `;
    const { api } = loadSharing(configuredBase);
    assert.equal(api.createPlanShareBundle(plan).urlBytes, targetBytes);
    assert.equal(api.canSharePlanAsQr(plan), targetBytes <= 1200);
    assert.equal(api.createPlanShareBundle(plan).url, previousBundle(plan, configuredBase).url);
  }
});

function shareScreenHarness(sharing) {
  let currentPlan;
  let displayOnly;
  let memoIndex = 0;
  const memos = [];
  const jsx = (type, props) => ({ type, props });
  const translate = (key, options) => options?.defaultValue ?? key;
  const Screen = loadSource('../../src/app/plans/[planId]/share.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    '@/components/plan/plan-share-card': { PlanShareCard: 'PlanShareCard' },
    '@/components/ui/strict-button': { StrictButton: 'Button' },
    '@/lib/plan-share-files': {},
    '@/lib/plan-sharing': sharing.api,
    '@/lib/ui-sizes': { BLOCK_BUTTON_ICON_SIZE: 18 },
    '@/store/use-map-data': { useMapData: (select) => select({ data: null }) },
    '@/store/use-plans': { usePlans: (select) => select({ plans: currentPlan ? [currentPlan] : [] }) },
    '@/tamagui.config': { PageHorizontalInset: 12 },
    '@/utils/bangumi-point-lookup': {},
    '@boiboif/react-native-toast': {},
    '@tamagui/lucide-icons-2': { FileJson: 'FileJson', Share2: 'Share2' },
    'expo-router': {
      Stack: { Screen: 'Stack.Screen' },
      useLocalSearchParams: () => ({ planId: 'plan', displayOnly }),
    },
    react: {
      useMemo(factory, dependencies) {
        const index = memoIndex++;
        const previous = memos[index];
        if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
          memos[index] = { dependencies, value: factory() };
        }
        return memos[index].value;
      },
      useRef: () => ({ current: null }),
      useState: (initial) => [initial, () => {}],
    },
    'react-i18next': { useTranslation: () => ({ t: translate }) },
    'react-native': { View: 'NativeView', ScrollView: 'ScrollView', useWindowDimensions: () => ({ width: 400 }) },
    'react-native-view-shot': {},
    tamagui: {
      Spinner: 'Spinner',
      Text: 'Text',
      View: 'View',
      YStack: 'YStack',
      useTheme: () => ({ pageBackground: { val: 'white' } }),
    },
  }).default;
  return (plan, mode) => {
    currentPlan = plan;
    displayOnly = mode;
    memoIndex = 0;
    return Screen();
  };
}

function findNode(tree, type) {
  if (!tree || typeof tree !== 'object') return undefined;
  if (Array.isArray(tree)) return tree.map((child) => findNode(child, type)).find(Boolean);
  return tree.type === type ? tree : findNode(tree.props?.children, type);
}

test('display-only posters retain their card and download-QR mode without encoding the plan', () => {
  const sharing = loadSharing(DEFAULT_BASE_URL, true);
  const render = shareScreenHarness(sharing);
  const card = findNode(render(planWithItems(5000), '1'), 'PlanShareCard');
  assert.ok(card);
  assert.equal(card.props.totalCount, 5000);
  assert.equal(card.props.displayOnly, true);
  assert.equal(card.props.shareUrl, undefined);
  assert.equal(sharing.compressionCalls(), 0);
});

test('switching the same plan between display and import modes updates the memoized bundle', () => {
  const sharing = loadSharing();
  const render = shareScreenHarness(sharing);
  const plan = planWithItems(1);
  assert.equal(findNode(render(plan, '1'), 'PlanShareCard').props.shareUrl, undefined);
  const card = findNode(render(plan), 'PlanShareCard');
  assert.equal(card.props.displayOnly, false);
  assert.equal(card.props.shareUrl, previousBundle(plan).url);
  assert.equal(sharing.compressionCalls(), 1);
  render(plan);
  assert.equal(sharing.compressionCalls(), 1, 'an unchanged plan and mode reuse the existing bundle');
  assert.equal(findNode(render(plan, '1'), 'PlanShareCard').props.shareUrl, undefined);
  assert.equal(sharing.compressionCalls(), 1);
  assert.equal(findNode(render(plan), 'PlanShareCard').props.shareUrl, previousBundle(plan).url);
  assert.equal(sharing.compressionCalls(), 2);
});

test('missing plans still show the fallback in both share modes without encoding', () => {
  const sharing = loadSharing(DEFAULT_BASE_URL, true);
  const render = shareScreenHarness(sharing);
  for (const mode of [undefined, '1']) {
    const tree = render(undefined, mode);
    assert.equal(findNode(tree, 'PlanShareCard'), undefined);
    assert.equal(findNode(tree, 'Text').props.children, '计划不存在或已被删除');
  }
  assert.equal(sharing.compressionCalls(), 0);
});
