import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/hooks/use-map-place-color.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function createHarness() {
  const slots = [];
  const reads = [];
  let cursor = 0;
  let writes = 0;
  let cached = null;
  const modules = {
    react: {
      useState(initial) {
        const index = cursor++;
        const slot = slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
        return [slot.value, (next) => {
          writes++;
          slot.value = typeof next === 'function' ? next(slot.value) : next;
        }];
      },
    },
    '@/services/map-text-color': {
      getCachedMapTextColor(...args) { reads.push(args); return cached; },
      getMapTextColor() { assert.fail('rendering must not request or wait for a map style'); },
      prefetchMapStyle() { assert.fail('the card must not initiate prefetching'); },
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, require(name) {
    assert.ok(name in modules, `Unexpected import ${name}`);
    return modules[name];
  } });
  return {
    reads,
    cache(color) { cached = color; },
    render(styleURL, mapFeature, zoom) {
      // Emulate React's immediate retry for setState during render, before paint.
      let result;
      for (let attempt = 0; attempt < 10; attempt++) {
        cursor = 0;
        const previousWrites = writes;
        result = module.exports.useMapPlaceColor(styleURL, mapFeature, zoom);
        if (writes === previousWrites) return result;
      }
      assert.fail('render did not settle');
    },
  };
}

const place = (id) => ({
  layerId: 'poi-label',
  feature: { type: 'Feature', id, geometry: { type: 'Point', coordinates: [139, 35] }, properties: { class: 'education' } },
});

test('an unnamed map click has no style read or request', () => {
  const h = createHarness();
  assert.equal(h.render('streets', undefined, 16), null);
  assert.equal(h.reads.length, 0);
});

test('the first rendered frame already has the cached basemap color', () => {
  const h = createHarness();
  const feature = place(1);
  h.cache('#123456');
  assert.equal(h.render('streets', feature, 16), '#123456');
  assert.deepEqual(h.reads, [['streets', 'poi-label', feature.feature, 16]]);
});

for (const initial of [null, '#123456']) {
  test(`late cache changes do not replace the fixed ${initial ?? 'fallback'} snapshot on region/theme rerenders`, () => {
    const h = createHarness();
    const feature = place(1);
    h.cache(initial);
    assert.equal(h.render('streets', feature, 16), initial);
    h.cache('#ABCDEF');
    assert.equal(h.render('streets', feature, 16), initial);
    h.cache(null);
    assert.equal(h.render('streets', feature, 16), initial);
    assert.equal(h.reads.length, 1, 'the same map inputs never resample during incidental rerenders');
  });
}

for (const changed of ['style', 'feature', 'zoom']) {
  test(`changing ${changed} synchronously samples the new color without committing the old color`, () => {
    const h = createHarness();
    const first = place(1);
    const next = changed === 'feature' ? place(2) : first;
    const style = changed === 'style' ? 'dark' : 'streets';
    const zoom = changed === 'zoom' ? 17 : 16;
    h.cache('#123456');
    assert.equal(h.render('streets', first, 16), '#123456');
    h.cache('#ABCDEF');
    assert.equal(h.render(style, next, zoom), '#ABCDEF');
    assert.deepEqual(h.reads[1], [style, 'poi-label', next.feature, zoom]);
    assert.equal(h.reads.length, 2, 'the React render retry reuses the new snapshot');
  });
}

test('an explicit target change without a cached style immediately uses fallback instead of the old color', () => {
  const h = createHarness();
  const feature = place(1);
  h.cache('#123456');
  assert.equal(h.render('streets', feature, 16), '#123456');
  h.cache(null);
  assert.equal(h.render('dark', feature, 16), null);
  assert.equal(h.reads.length, 2);
});

test('clearing then reselecting a feature samples again, even when its identity is unchanged', () => {
  const h = createHarness();
  const feature = place(1);
  h.cache('#123456');
  assert.equal(h.render('streets', feature, 16), '#123456');
  assert.equal(h.render('streets', undefined, 16), null);
  h.cache('#ABCDEF');
  assert.equal(h.render('streets', feature, 16), '#ABCDEF');
  assert.equal(h.reads.length, 2);
});
