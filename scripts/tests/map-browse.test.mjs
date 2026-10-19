import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/store/use-map-browse.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const require = createRequire(import.meta.url);

// Exercise production actions with Zustand's real state and subscriptions, without rendering its React hook.
function createStore() {
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, require });
  return module.exports.useMapBrowse;
}

const workA = 10;
const workB = 20;
const pointA = { bangumiId: workA, pointId: 'point-a' };
const pointB = { bangumiId: workB, pointId: 'point-b' };

function openAtLowDetent(store, bangumiId = workA) {
  store.getState().openBangumiDetails(bangumiId);
  store.getState().activateBangumiDetailsMap(bangumiId);
}

test('opening details leaves the map unfiltered and does not request a camera move', () => {
  const store = createStore();
  store.getState().focusPointFromList(pointB);
  store.getState().openBangumiDetails(workA);

  const state = store.getState();
  assert.equal(state.openedBangumiDetailsId, workA);
  assert.equal(state.filteredBangumiId, null);
  assert.equal(state.selectedMapPoint, null);
  assert.equal(state.mapCameraRequest, null);
  assert.equal(state.lastPopupMapPoint, pointB);
});

test('the first low detent applies the filter and requests exactly one overview', () => {
  const store = createStore();
  store.getState().openBangumiDetails(workA);
  const changes = [];
  store.subscribe((state) => changes.push(state));

  store.getState().activateBangumiDetailsMap(workA);
  const activated = store.getState();
  assert.equal(changes.length, 1);
  assert.equal(activated.filteredBangumiId, workA);
  assert.equal(activated.mapCameraRequest.kind, 'bangumi-overview');
  assert.equal(activated.mapCameraRequest.bangumiId, workA);
  assert.equal(activated.selectedMapPoint, null);

  store.getState().activateBangumiDetailsMap(workA);
  assert.equal(store.getState(), activated);
  assert.equal(changes.length, 1);

  store.getState().completeMapCameraRequest(activated.mapCameraRequest.id);
  const consumed = store.getState();
  store.getState().activateBangumiDetailsMap(workA);
  assert.equal(store.getState(), consumed);
  assert.equal(store.getState().mapCameraRequest, null);
});

test('opening the same activated work preserves its filter without another overview', () => {
  const store = createStore();
  openAtLowDetent(store);
  store.getState().completeMapCameraRequest(store.getState().mapCameraRequest.id);

  store.getState().openBangumiDetails(workA);
  assert.equal(store.getState().filteredBangumiId, workA);
  assert.equal(store.getState().mapCameraRequest, null);
  const reopened = store.getState();
  store.getState().activateBangumiDetailsMap(workA);
  assert.equal(store.getState(), reopened);
});

test('opening another work removes the previous filter and pending overview', () => {
  const store = createStore();
  openAtLowDetent(store);
  store.getState().openBangumiDetails(workB);

  assert.equal(store.getState().openedBangumiDetailsId, workB);
  assert.equal(store.getState().filteredBangumiId, null);
  assert.equal(store.getState().mapCameraRequest, null);
});

test('a detail point press applies its filter and point request in one update', () => {
  const store = createStore();
  store.getState().openBangumiDetails(workA);
  const changes = [];
  store.subscribe((state) => changes.push(state));

  store.getState().focusPointFromBangumiDetails(pointA);
  const focused = store.getState();
  assert.equal(changes.length, 1);
  assert.equal(focused.openedBangumiDetailsId, workA);
  assert.equal(focused.filteredBangumiId, workA);
  assert.equal(focused.selectedMapPoint, pointA);
  assert.equal(focused.lastPopupMapPoint, pointA);
  assert.deepEqual(
    { ...focused.mapCameraRequest },
    { ...pointA, id: focused.mapCameraRequest.id, kind: 'point', source: 'bangumi-detail-sheet' },
  );

  // The native resize to 25% must not replace the requested point with a work overview.
  store.getState().activateBangumiDetailsMap(workA);
  assert.equal(store.getState(), focused);
  assert.equal(changes.length, 1);

  store.getState().completeMapCameraRequest(focused.mapCameraRequest.id);
  const consumed = store.getState();
  store.getState().activateBangumiDetailsMap(workA);
  assert.equal(store.getState(), consumed);
  assert.equal(store.getState().mapCameraRequest, null);
});

test('a point press replaces an unconsumed overview and later low-detent events remain idle', () => {
  const store = createStore();
  openAtLowDetent(store);
  const overview = store.getState().mapCameraRequest;
  store.getState().focusPointFromBangumiDetails(pointA);
  const focused = store.getState();

  assert.equal(focused.mapCameraRequest.kind, 'point');
  assert.notEqual(focused.mapCameraRequest.id, overview.id);
  store.getState().completeMapCameraRequest(overview.id);
  store.getState().activateBangumiDetailsMap(workA);
  assert.equal(store.getState(), focused);
});

test('closing details clears the filter and cancels its pending overview', () => {
  const store = createStore();
  store.getState().selectMapPoint(pointB);
  openAtLowDetent(store);
  store.getState().closeBangumiDetails();

  assert.equal(store.getState().openedBangumiDetailsId, null);
  assert.equal(store.getState().filteredBangumiId, null);
  assert.equal(store.getState().mapCameraRequest, null);
  assert.equal(store.getState().lastPopupMapPoint, pointB);
});

test('closing details preserves its selected popup and pending point request', () => {
  const store = createStore();
  store.getState().openBangumiDetails(workA);
  store.getState().focusPointFromBangumiDetails(pointA);
  const pointRequest = store.getState().mapCameraRequest;
  store.getState().closeBangumiDetails();

  assert.equal(store.getState().openedBangumiDetailsId, null);
  assert.equal(store.getState().filteredBangumiId, null);
  assert.equal(store.getState().selectedMapPoint, pointA);
  assert.equal(store.getState().lastPopupMapPoint, pointA);
  assert.equal(store.getState().mapCameraRequest, pointRequest);
});

test('callbacks for a replaced or closed work cannot filter the map or select its points', () => {
  const store = createStore();
  store.getState().openBangumiDetails(workA);
  store.getState().openBangumiDetails(workB);
  const replaced = store.getState();
  store.getState().activateBangumiDetailsMap(workA);
  store.getState().focusPointFromBangumiDetails(pointA);
  assert.equal(store.getState(), replaced);

  store.getState().closeBangumiDetails();
  const closed = store.getState();
  store.getState().activateBangumiDetailsMap(workB);
  store.getState().focusPointFromBangumiDetails(pointB);
  assert.equal(store.getState(), closed);
});

test('completing an old point request cannot clear a newer overview request', () => {
  const store = createStore();
  store.getState().focusPointFromList(pointA);
  const oldRequest = store.getState().mapCameraRequest;
  openAtLowDetent(store, workB);
  const pending = store.getState();

  store.getState().completeMapCameraRequest(oldRequest.id);
  assert.equal(store.getState(), pending);
  store.getState().completeMapCameraRequest(pending.mapCameraRequest.id);
  assert.equal(store.getState().mapCameraRequest, null);
});

for (const [action, source] of [
  ['focusPointFromList', 'external-list'],
  ['focusPointFromMapControl', 'map-control'],
]) {
  test(`${action} closes details and removes its filter while requesting the new point`, () => {
    const store = createStore();
    openAtLowDetent(store);
    store.getState()[action](pointB);
    const state = store.getState();

    assert.equal(state.openedBangumiDetailsId, null);
    assert.equal(state.filteredBangumiId, null);
    assert.equal(state.selectedMapPoint, pointB);
    assert.equal(state.lastPopupMapPoint, pointB);
    assert.deepEqual(
      { ...state.mapCameraRequest },
      { ...pointB, id: state.mapCameraRequest.id, kind: 'point', source },
    );
  });
}
