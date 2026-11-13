import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/utils/map-popup-visibility.ts', import.meta.url), 'utf8');
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, { module, exports: module.exports });
const { getPopupAdjustment } = module.exports;

const map = { width: 400, height: 600 };
const popup = { width: 220, height: 200 };
const adjust = (anchor, obstacles = [], mapSize = map) =>
  ({ ...getPopupAdjustment(anchor, popup, mapSize, obstacles) });

test('a visible popup stays in place even when it touches a map edge or obstacle', () => {
  assert.deepEqual(adjust({ x: 110, y: 600 }), { x: 0, y: 0 });
  assert.deepEqual(adjust({ x: 200, y: 480 }, [{ x: 0, y: 480, width: 300, height: 54 }]), { x: 0, y: 0 });
});

for (const [name, anchor, expected] of [
  ['left', { x: 90, y: 300 }, { x: 36, y: 0 }],
  ['right', { x: 310, y: 300 }, { x: -36, y: 0 }],
  ['top', { x: 200, y: 190 }, { x: 0, y: 26 }],
  ['bottom', { x: 200, y: 610 }, { x: 0, y: -26 }],
]) {
  test(`moving from the ${name} edge adds 16 points of clearance`, () => {
    assert.deepEqual(adjust(anchor), expected);
  });
}

test('moving a popup away from the search box leaves 16 points of clearance', () => {
  assert.deepEqual(adjust({ x: 200, y: 250 }, [{ x: 20, y: 20, width: 360, height: 80 }]), { x: 0, y: 66 });
});

test('moving a popup away from the photo list leaves 16 points of clearance', () => {
  assert.deepEqual(adjust({ x: 200, y: 520 }, [{ x: 0, y: 480, width: 300, height: 54 }]), { x: 0, y: -56 });
});

test('a narrow map prioritizes full visibility when 16-point clearance cannot fit', () => {
  assert.deepEqual(adjust({ x: 80, y: 200 }, [], { width: 220, height: 400 }), { x: 30, y: 0 });
});

test('a restrictive obstacle falls back to full visibility even when clearance cannot fit', () => {
  const obstacle = { x: 0, y: 200, width: 400, height: 10 };
  assert.deepEqual(adjust({ x: 200, y: 210 }, [obstacle], { width: 400, height: 400 }), { x: 0, y: -10 });
});
