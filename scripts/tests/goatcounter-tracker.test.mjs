import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../../docs/.vitepress/theme/goatcounter.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { installGoatCounter } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);

function fakeBrowser(origin = 'https://boiboif.github.io', pathname = '/anitabi-app/') {
  const requests = [];
  const fakeWindow = { location: { origin, pathname } };
  fakeWindow.self = fakeWindow;
  fakeWindow.top = fakeWindow;
  globalThis.window = fakeWindow;
  globalThis.document = { visibilityState: 'visible' };
  globalThis.fetch = (url, options) => {
    requests.push({ url, options });
    return Promise.resolve();
  };
  return requests;
}

test('counts initial and SPA page paths once without query, hash, or referrer', async () => {
  const requests = fakeBrowser();
  let previousCalls = 0;
  const router = { onAfterRouteChange: () => { previousCalls += 1; } };
  installGoatCounter(router);
  await router.onAfterRouteChange('/anitabi-app/?private=1#top');
  await router.onAfterRouteChange('/anitabi-app/?other=2#section');
  await router.onAfterRouteChange('/anitabi-app/features?private=3#section');

  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map(({ url }) => url.searchParams.get('p')), ['/anitabi-app/', '/anitabi-app/features']);
  for (const { url, options } of requests) {
    assert.equal(url.origin + url.pathname, 'https://boiboif.goatcounter.com/count');
    assert.deepEqual([...url.searchParams.keys()].sort(), ['p', 'rnd']);
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.mode, 'no-cors');
    assert.equal(options.keepalive, true);
  }
  assert.equal(previousCalls, 3);
});

test('ignores other hosts and frames, and analytics failure does not interrupt navigation', async () => {
  const localRequests = fakeBrowser('http://localhost:5173', '/');
  const localRouter = {};
  installGoatCounter(localRouter);
  assert.equal(localRequests.length, 0);
  assert.equal(localRouter.onAfterRouteChange, undefined);

  const requests = fakeBrowser();
  const router = {};
  installGoatCounter(router);
  globalThis.fetch = () => Promise.reject(new Error('network unavailable'));
  await assert.doesNotReject(router.onAfterRouteChange('/anitabi-app/features'));
  assert.equal(requests.length, 0);

  fakeBrowser();
  window.top = {};
  const frameRouter = {};
  installGoatCounter(frameRouter);
  assert.equal(frameRouter.onAfterRouteChange, undefined);
});
