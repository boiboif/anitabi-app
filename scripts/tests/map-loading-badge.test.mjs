import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Validate the real component's layout constraints and rendered values. This
// harness does not simulate Yoga, native painting, touch targets or animations.
const source = readFileSync(new URL('../../src/components/map/loading-badge.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const jsx = (type, props) => ({ type, props });
const modules = {
  '@/components/ui/strict-button': { StrictButton: 'Button' },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-i18next': { useTranslation: () => ({ t: (key, options) => options?.defaultValue ?? key }) },
  tamagui: { Text: 'Text', View: 'View', YStack: 'YStack' },
};
const context = vm.createContext({
  exports: {},
  require: (name) => {
    assert.ok(name in modules, `Unexpected import ${name}`);
    return modules[name];
  },
});
vm.runInContext(compiled, context);
const LoadingBadge = context.exports.default;
const insets = { top: 24, right: 0, bottom: 0, left: 0 };

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

function render(progress, onRetry) {
  const tree = LoadingBadge({ progress: { message: 'Loading locations', ...progress }, insets, onRetry });
  const track = nodes(tree).find((node) => node.props.accessibilityRole === 'progressbar');
  const fill = track?.props.children;
  return { tree, track, fill };
}

test('the compact track has a definite containing width and visible fill before any native layout event', () => {
  const { tree, track, fill } = render({ phase: 'downloading', batch: 3, total: 7 });
  const badge = nodes(tree).find((node) => node.type === 'YStack');
  assert.equal(badge.props.width, 220);
  assert.equal(badge.props.maxW, '85%', 'narrow screens still constrain the badge');
  assert.equal(track.props.width, '100%');
  assert.ok(Number.isFinite(track.props.height) && track.props.height > 0, 'the track has a definite visible height');
  assert.equal(track.props.overflow, 'hidden');
  assert.equal(track.props.accessible, true);
  assert.equal(track.props.accessibilityLabel, 'Loading locations');
  assert.equal(fill.props.height, '100%');
  assert.equal(fill.props.width, '41%');
  assert.ok(nodes(tree).every((node) => !node.props.onLayout && !node.props.transform && node.props.x === undefined));
  assert.equal(tree.props.t, 84);
  assert.equal(tree.props.pointerEvents, 'box-none');
});

test('fill and accessibility progress follow completed counts for the actual shard total', () => {
  for (const [batch, total, expected] of [
    [0, 7, 5],
    [1, 7, 17],
    [3, 7, 41],
    [7, 7, 90],
    [3, 6, 48],
    [6, 13, 44],
  ]) {
    const { track, fill } = render({ phase: 'downloading', batch, total });
    assert.equal(fill.props.width, `${expected}%`);
    assert.equal(track.props.accessibilityValue.now, expected);
    assert.equal(track.props.accessibilityValue.min, 0);
    assert.equal(track.props.accessibilityValue.max, 100);
  }
});

test('invalid or out-of-range counts cannot produce NaN, a negative fill or overflow', () => {
  for (const [batch, total, expected] of [
    [1, 0, 5],
    [1, undefined, 5],
    [1, NaN, 5],
    [1, Infinity, 5],
    [NaN, 7, 5],
    [Infinity, 7, 5],
    [-1, 7, 5],
    [100, 7, 90],
  ]) {
    const { track, fill } = render({ phase: 'downloading', batch, total });
    assert.equal(fill.props.width, `${expected}%`);
    assert.ok(Number.isFinite(track.props.accessibilityValue.now));
  }
});

test('out-of-order shard completions advance the same seven-shard track by the completed count', () => {
  const order = [6, 0, 4, 2, 1, 5, 3];
  const expected = [17, 29, 41, 54, 66, 78, 90];
  let completed = 0;
  let previous = render({ phase: 'downloading', batch: 0, total: order.length }).track.props.accessibilityValue.now;
  for (const shard of order) {
    completed++;
    const { track, fill } = render({
      phase: 'downloading',
      batch: completed,
      total: order.length,
      message: `Completed shard ${shard}`,
    });
    const now = track.props.accessibilityValue.now;
    assert.equal(now, expected[completed - 1]);
    assert.ok(now > previous);
    assert.equal(fill.props.width, `${now}%`);
    previous = now;
  }
});

test('checking and assembly occupy their own stages and completion removes the badge', () => {
  assert.equal(render({ phase: 'checking' }).fill.props.width, '5%');
  assert.equal(render({ phase: 'checking', message: undefined }).track.props.accessibilityLabel, '加载番剧列表…');
  assert.equal(render({ phase: 'assembling' }).fill.props.width, '95%');
  assert.equal(render({ phase: 'done' }).tree, null);
});

test('an error removes the track and keeps the localized retry action', () => {
  let retries = 0;
  const { tree, track } = render({ phase: 'error', message: 'Could not load locations' }, () => retries++);
  assert.equal(track, undefined);
  assert.ok(nodes(tree).some((node) => node.type === 'Text' && node.props.children === 'Could not load locations'));
  const button = nodes(tree).find((node) => node.type === 'Button');
  assert.ok(button);
  assert.equal(button.props.children.props.children, '重试');
  button.props.onPress();
  assert.equal(retries, 1);
  assert.equal(
    nodes(render({ phase: 'error' }).tree).some((node) => node.type === 'Button'),
    false,
  );
});
