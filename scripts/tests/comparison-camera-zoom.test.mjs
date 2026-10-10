import assert from 'node:assert/strict';
import test from 'node:test';
import { restoreCameraZoom } from '../../src/lib/comparison-camera-zoom.ts';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function camera(setZoom = async () => {}, minZoom = 0.5, maxZoom = 10) {
  return { setZoom, minZoom, maxZoom };
}

function savedZoom(value = 1) {
  return { value, revision: 0 };
}

test('fractional pinch zoom survives repeated pause and retake cycles', async () => {
  const state = savedZoom(3.7);
  const calls = [];
  for (let cycle = 0; cycle < 3; cycle += 1) {
    state.revision += 1;
    assert.equal(
      await restoreCameraZoom(
        state,
        camera(async (value) => calls.push(value)),
        () => true,
      ),
      3.7,
    );
  }
  assert.deepEqual(calls, [3.7, 3.7, 3.7]);
  assert.equal(state.value, 3.7);
});

test('restoration completes only after native zoom is applied and clamps to the current device range', async () => {
  const state = savedZoom(5);
  const request = deferred();
  const calls = [];
  const restore = restoreCameraZoom(
    state,
    camera(
      (value) => {
        calls.push(value);
        return request.promise;
      },
      1,
      3,
    ),
    () => true,
  );
  assert.deepEqual(calls, [3]);
  assert.equal(state.value, 5);
  request.resolve();
  assert.equal(await restore, 3);
  assert.equal(state.value, 3);
  state.value = 0.5;
  assert.equal(await restoreCameraZoom(state, camera(undefined, 1, 3), () => true), 1);
});

test('pausing during restoration ignores a late success and preserves the saved zoom', async () => {
  const state = savedZoom(2);
  const request = deferred();
  const restore = restoreCameraZoom(
    state,
    camera(() => request.promise),
    () => true,
  );
  state.revision += 1;
  request.resolve();
  assert.equal(await restore, undefined);
  assert.equal(state.value, 2);
});

test('photo-output reconfiguration ignores cancellation even while isActive and the controller stay unchanged', async () => {
  const state = savedZoom(3.7);
  const request = deferred();
  const controller = camera(() => request.promise);
  const restore = restoreCameraZoom(state, controller, () => true);
  state.revision += 1;
  request.reject(new Error('CameraControl$OperationCanceledException: Camera is not active.'));
  assert.equal(await restore, undefined);
  assert.equal(state.value, 3.7);
  assert.equal(await restoreCameraZoom(state, camera(), () => true), 3.7);
});

test('an old restoration cannot overwrite a newer device or assist-mode reset', async () => {
  const state = savedZoom(5);
  const request = deferred();
  const previous = restoreCameraZoom(
    state,
    camera(() => request.promise),
    () => true,
  );
  state.revision += 1;
  state.value = 1;
  assert.equal(await restoreCameraZoom(state, camera(), () => true), 1);
  request.resolve();
  assert.equal(await previous, undefined);
  assert.equal(state.value, 1);
});

test('a late old cancellation leaves the newer request valid', async () => {
  const state = savedZoom(2);
  const oldRequest = deferred();
  const oldRestore = restoreCameraZoom(
    state,
    camera(() => oldRequest.promise),
    () => true,
  );
  state.revision += 1;
  const newRequest = deferred();
  const newRestore = restoreCameraZoom(
    state,
    camera(() => newRequest.promise),
    () => true,
  );
  const currentRevision = state.revision;
  oldRequest.reject(new Error('Camera is not active.'));
  assert.equal(await oldRestore, undefined);
  assert.equal(state.revision, currentRevision);
  newRequest.resolve();
  assert.equal(await newRestore, 2);
});

test('a newer restoration supersedes an earlier request without requiring a camera stop', async () => {
  const state = savedZoom(2);
  const request = deferred();
  const previous = restoreCameraZoom(
    state,
    camera(() => request.promise),
    () => true,
  );
  state.value = 5;
  assert.equal(await restoreCameraZoom(state, camera(), () => true), 5);
  request.reject(new Error('Cancelled due to another zoom value being set.'));
  assert.equal(await previous, undefined);
  assert.equal(state.value, 5);
});

test('an inactive controller receives no request and does not invalidate another request', async () => {
  const state = savedZoom(2);
  assert.equal(
    await restoreCameraZoom(
      state,
      camera(async () => assert.fail('inactive camera must not receive a zoom request')),
      () => false,
    ),
    undefined,
  );
  assert.equal(state.revision, 0);
});

test('replacing the controller ignores both late success and late failure', async () => {
  for (const fails of [false, true]) {
    const state = savedZoom(2);
    let current = true;
    const request = deferred();
    const restore = restoreCameraZoom(
      state,
      camera(() => request.promise),
      () => current,
    );
    current = false;
    if (fails) request.reject(new Error('old controller stopped'));
    else request.resolve();
    assert.equal(await restore, undefined);
    assert.equal(state.value, 2);
  }
});

test('a genuine failure preserves the desired zoom and allows an explicit retry', async () => {
  const state = savedZoom(2);
  await assert.rejects(
    restoreCameraZoom(
      state,
      camera(async () => {
        throw new Error('native zoom failed');
      }),
      () => true,
    ),
    /native zoom failed/,
  );
  assert.equal(state.value, 2);
  assert.equal(await restoreCameraZoom(state, camera(), () => true), 2);
});
