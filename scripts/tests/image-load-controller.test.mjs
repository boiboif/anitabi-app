import assert from 'node:assert/strict';
import test from 'node:test';
import { createImageLoadController } from '../../src/utils/image-load-controller.ts';

function harness(reload = () => {}) {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  const delays = [];
  const reloads = [];
  const controller = createImageLoadController({
    reload() {
      reloads.push(now);
      return reload();
    },
    schedule(callback, delay) {
      const id = ++nextId;
      delays.push(delay);
      timers.set(id, { at: now + delay, callback });
      return id;
    },
    cancel: (id) => timers.delete(id),
  });
  return {
    controller,
    reloads,
    delays,
    get pending() {
      return timers.size;
    },
    tick(ms) {
      const end = now + ms;
      while (true) {
        const next = [...timers].sort(([, a], [, b]) => a.at - b.at)[0];
        if (!next || next[1].at > end) break;
        const [id, task] = next;
        timers.delete(id);
        now = task.at;
        task.callback();
      }
      now = end;
    },
  };
}

function exhaustAutomatic(h) {
  h.controller.onError();
  h.tick(500);
  h.controller.onError();
  h.tick(1500);
  h.controller.onError();
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('automatic retries wait 500/1500ms, stop after two attempts, and cache unchanged snapshots', () => {
  const h = harness();
  const original = h.controller.getSnapshot();
  const phases = [];
  const unsubscribe = h.controller.subscribe(() => phases.push(h.controller.getSnapshot().phase));
  h.controller.onLoadStart();
  assert.equal(h.controller.getSnapshot(), original);
  h.controller.onError();
  const retrying = h.controller.getSnapshot();
  h.controller.onError();
  assert.equal(h.controller.getSnapshot(), retrying);
  assert.equal(h.pending, 1, 'duplicate errors must not queue multiple retries');
  h.tick(499);
  assert.deepEqual(h.reloads, []);
  h.tick(1);
  h.controller.onError();
  h.tick(1499);
  assert.deepEqual(h.reloads, [500]);
  h.tick(1);
  h.controller.onError();
  h.controller.onError();
  h.tick(10_000);
  assert.deepEqual(h.reloads, [500, 2000]);
  assert.deepEqual(h.delays, [500, 1500]);
  assert.deepEqual(phases, ['retrying', 'loading', 'retrying', 'loading', 'error']);
  assert.deepEqual(h.controller.getSnapshot(), { phase: 'error', hasContent: false });
  unsubscribe();
  h.controller.retry();
  assert.equal(phases.length, 5, 'unsubscribed views must receive no further notifications');
});

test('successful content cancels scheduled retries and survives later load starts and failures', () => {
  const h = harness();
  h.controller.onError();
  assert.equal(h.pending, 1);
  h.controller.onLoad();
  const loaded = h.controller.getSnapshot();
  assert.deepEqual(loaded, { phase: 'loaded', hasContent: true });
  assert.equal(h.pending, 0);
  h.tick(5000);
  h.controller.onLoadStart();
  h.controller.onError();
  h.controller.retry();
  h.controller.beginRecovery({});
  assert.equal(h.controller.getSnapshot(), loaded);
  assert.deepEqual(h.reloads, []);
});

test('a new native load cancels an old pending retry without spending another attempt', () => {
  const h = harness();
  h.controller.onError();
  h.controller.onLoadStart();
  assert.equal(h.pending, 0);
  h.tick(500);
  assert.deepEqual(h.reloads, []);
  assert.deepEqual(h.controller.getSnapshot(), { phase: 'loading', hasContent: false });
});

test('manual retry starts a new bounded cycle and repeated presses cannot interrupt its active request', () => {
  const h = harness();
  h.controller.retry();
  assert.deepEqual(h.reloads, [], 'retry is inactive while the initial request is loading');
  exhaustAutomatic(h);
  h.controller.retry();
  h.controller.retry();
  assert.equal(h.reloads.length, 3);
  exhaustAutomatic(h);
  assert.equal(h.reloads.length, 5, 'manual action gets its own two automatic attempts');
  assert.deepEqual(h.delays, [500, 1500, 500, 1500]);
  assert.equal(h.controller.getSnapshot().phase, 'error');
});

test('preview success is an extra opportunity after automatic retries and never interrupts active work', () => {
  for (const confirmedBeforeFailure of [false, true]) {
    const h = harness();
    const preview = {};
    h.controller.beginRecovery(preview);
    if (confirmedBeforeFailure) h.controller.confirmRecovery(preview);
    assert.deepEqual(h.reloads, []);
    h.controller.onError();
    h.controller.confirmRecovery(preview);
    assert.equal(h.pending, 1, 'preview success must leave the scheduled automatic retry alone');
    h.tick(500);
    h.controller.confirmRecovery(preview);
    assert.equal(h.reloads.length, 1, 'preview success must leave a running request alone');
    h.controller.onError();
    h.tick(1500);
    h.controller.onError();
    assert.equal(h.reloads.length, 3, 'the confirmed preview supplies one extra recovery');
    assert.deepEqual(h.delays, [500, 1500]);
    h.controller.onError();
    h.controller.confirmRecovery(preview);
    assert.equal(h.reloads.length, 3);
    assert.equal(h.controller.getSnapshot().phase, 'error');
  }
});

test('a preview confirmed after terminal error recovers once and old preview tokens are ignored', () => {
  const h = harness();
  const oldPreview = {};
  const currentPreview = {};
  h.controller.beginRecovery(oldPreview);
  exhaustAutomatic(h);
  h.controller.beginRecovery(currentPreview);
  h.controller.confirmRecovery(oldPreview);
  assert.equal(h.reloads.length, 2);
  h.controller.confirmRecovery(currentPreview);
  assert.equal(h.reloads.length, 3);
  h.controller.confirmRecovery(currentPreview);
  h.controller.onError();
  assert.equal(h.reloads.length, 3);
  const nextPreview = {};
  h.controller.beginRecovery(nextPreview);
  h.controller.confirmRecovery(nextPreview);
  assert.equal(h.reloads.length, 4, 'a new confirmed preview has a separate recovery budget');
});

test('manual retry consumes old preview evidence instead of reusing it after the new cycle fails', () => {
  const h = harness();
  const preview = {};
  h.controller.beginRecovery(preview);
  h.controller.confirmRecovery(preview);
  exhaustAutomatic(h);
  assert.equal(h.reloads.length, 3);
  h.controller.onError();
  h.controller.retry();
  exhaustAutomatic(h);
  h.controller.confirmRecovery(preview);
  assert.equal(h.reloads.length, 6);
  assert.equal(h.controller.getSnapshot().phase, 'error');
});

test('dispose cancels timers and notifications, while activate restores the Strict Mode pending retry', () => {
  const h = harness();
  let notifications = 0;
  h.controller.subscribe(() => notifications++);
  h.controller.onError();
  const beforeDispose = h.controller.getSnapshot();
  h.controller.dispose();
  h.controller.onLoad();
  h.controller.onError();
  h.controller.retry();
  h.tick(5000);
  assert.equal(h.controller.getSnapshot(), beforeDispose);
  assert.equal(notifications, 1);
  assert.deepEqual(h.reloads, []);
  assert.equal(h.pending, 0);
  h.controller.activate();
  assert.equal(h.pending, 1);
  h.tick(499);
  assert.deepEqual(h.reloads, []);
  h.tick(1);
  assert.equal(h.reloads.length, 1);
});

test('command rejections from earlier attempts or disposed views cannot change newer state', async () => {
  const rejectors = [];
  const h = harness(() => new Promise((_, reject) => rejectors.push(reject)));
  h.controller.onError();
  h.tick(500);
  h.controller.onError();
  h.tick(1500);
  const current = h.controller.getSnapshot();
  rejectors[0](new Error('old command rejected'));
  await flush();
  assert.equal(h.controller.getSnapshot(), current);
  assert.equal(h.pending, 0);
  h.controller.dispose();
  rejectors[1](new Error('view unmounted'));
  await flush();
  assert.equal(h.controller.getSnapshot(), current);
  assert.equal(h.pending, 0);
});

test('native command completion is not image success and thrown or rejected commands obey retry limits', async () => {
  const accepted = harness(() => Promise.resolve());
  accepted.controller.onError();
  accepted.tick(500);
  await flush();
  assert.deepEqual(accepted.controller.getSnapshot(), { phase: 'loading', hasContent: false });
  for (const synchronous of [false, true]) {
    const h = harness(() => {
      if (synchronous) throw new Error('native command failed');
      return Promise.reject(new Error('native command failed'));
    });
    h.controller.onError();
    h.tick(500);
    await flush();
    h.tick(1500);
    await flush();
    assert.equal(h.reloads.length, 2);
    assert.equal(h.pending, 0);
    assert.deepEqual(h.controller.getSnapshot(), { phase: 'error', hasContent: false });
  }
});
