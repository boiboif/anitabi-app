import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { after, beforeEach, test } from 'node:test';

// Keep the real API, handler factory and response/error interceptors. This tiny
// Axios transport runs the registered interceptor callbacks without any network.
const harness = {
  requests: [],
  toasts: [],
  response: null,
  failure: null,
  createAxios(defaults) {
    const requestInterceptors = [];
    const responseInterceptors = [];
    return {
      interceptors: {
        request: { use: (...callbacks) => requestInterceptors.push(callbacks) },
        response: { use: (...callbacks) => responseInterceptors.push(callbacks) },
      },
      request: (config) => {
        const defined = Object.fromEntries(Object.entries(config).filter(([, value]) => value !== undefined));
        let result = Promise.resolve({ ...defaults, ...defined });
        for (const callbacks of requestInterceptors) result = result.then(...callbacks);
        result = result.then((request) => {
          this.requests.push(request);
          if (this.failure) {
            this.failure.config = request;
            throw this.failure;
          }
          return { status: 200, config: request, data: this.response };
        });
        for (const callbacks of responseInterceptors) result = result.then(...callbacks);
        return result;
      },
    };
  },
};
globalThis.__mapDataRequestHarness = harness;

const sourceRoot = new URL('../../src/', import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'axios') return { url: 'map-request-test:axios', shortCircuit: true };
    if (specifier === '@boiboif/react-native-toast') return { url: 'map-request-test:toast', shortCircuit: true };
    if (specifier === '@/i18n') return { url: 'map-request-test:i18n', shortCircuit: true };
    if (specifier.startsWith('@/'))
      return { url: new URL(`../../src/${specifier.slice(2)}.ts`, import.meta.url).href, shortCircuit: true };
    if (specifier.startsWith('.') && context.parentURL?.startsWith(sourceRoot)) {
      const url = new URL(specifier, context.parentURL);
      if (!/\.[^/]+$/.test(url.pathname)) url.pathname += '.ts';
      return { url: url.href, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    const common = 'const harness = globalThis.__mapDataRequestHarness;';
    if (url === 'map-request-test:axios')
      return {
        format: 'module',
        shortCircuit: true,
        source: `${common} export default {create: (options) => harness.createAxios(options)};`,
      };
    if (url === 'map-request-test:toast')
      return {
        format: 'module',
        shortCircuit: true,
        source: `${common} export const Toast = {error: (message) => harness.toasts.push(message)};`,
      };
    if (url === 'map-request-test:i18n')
      return {
        format: 'module',
        shortCircuit: true,
        source: 'export default {t: (key, options) => options?.defaultValue ?? key};',
      };
    return next(url, context);
  },
});

const { getGJSON, getGDetailJSON } = await import('../../src/services/api.ts');
const { anitabiApiHandler } = await import('../../src/services/handlers.ts');

function requestUrl(request) {
  return new URL(request.url, request.baseURL);
}

beforeEach(() => {
  harness.requests = [];
  harness.toasts = [];
  harness.response = { payload: 'transport response' };
  harness.failure = null;
});

after(() => {
  hooks.deregister();
  delete globalThis.__mapDataRequestHarness;
});

test('map request options reach Axios and the revision is encoded in the shard URL', async () => {
  const controller = new AbortController();
  const options = { timeout: 30_000, suppressErrorToast: true, signal: controller.signal };
  assert.strictEqual(await getGJSON({ ...options, bypassCache: true }), harness.response);
  assert.strictEqual(await getGDetailJSON(2, { ...options, revision: 321 }), harness.response);
  assert.equal(harness.requests.length, 2);
  for (const request of harness.requests) {
    assert.equal(request.method, 'GET');
    assert.equal(request.timeout, options.timeout);
    assert.equal(request.suppressErrorToast, true);
    assert.strictEqual(request.signal, controller.signal);
  }
  assert.equal(requestUrl(harness.requests[0]).pathname, '/d/g.json');
  assert.equal(requestUrl(harness.requests[1]).pathname, '/d/g2.json');
  assert.equal(requestUrl(harness.requests[1]).searchParams.get('v'), '321');
  controller.abort();
  assert.equal(harness.requests[1].signal.aborted, true);
  assert.deepEqual(harness.toasts, []);
});

test('index URLs use the current rotation value and bypass tokens are unique even within one millisecond', async (t) => {
  let now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  await getGJSON();
  const first = requestUrl(harness.requests.at(-1));
  now += 24 * 60 * 1_000;
  await getGJSON();
  const later = requestUrl(harness.requests.at(-1));
  assert.notEqual(first.searchParams.get('d'), later.searchParams.get('d'));
  assert.equal(first.searchParams.has('check'), false);
  assert.equal(later.searchParams.has('check'), false);

  await getGJSON({ bypassCache: true });
  await getGJSON({ bypassCache: true });
  const checks = harness.requests.slice(-2).map((request) => requestUrl(request).searchParams.get('check'));
  assert.ok(checks.every(Boolean));
  assert.equal(new Set(checks).size, 2);
});

test('quiet map requests reject network and HTTP errors without displaying intermediate toasts', async () => {
  for (const extra of [{ code: 'ERR_NETWORK' }, { response: { status: 503 } }]) {
    harness.failure = Object.assign(new Error('simulated transport error'), extra);
    await assert.rejects(getGDetailJSON(0, { suppressErrorToast: true }), (error) => error === harness.failure);
  }
  assert.equal(harness.requests.length, 2);
  assert.deepEqual(harness.toasts, []);
});

test('unmarked requests retain the existing network and HTTP error toast feedback', async () => {
  harness.failure = Object.assign(new Error('offline'), { code: 'ERR_NETWORK' });
  await assert.rejects(anitabiApiHandler.get('/legacy')(), (error) => error === harness.failure);
  assert.deepEqual(harness.toasts, ['网络异常']);

  harness.failure = Object.assign(new Error('unavailable'), { response: { status: 503 } });
  await assert.rejects(anitabiApiHandler.get('/legacy')(), (error) => error === harness.failure);
  assert.deepEqual(harness.toasts, ['网络异常', '服务不可用，服务器暂时过载或维护。']);
  assert.ok(harness.requests.every((request) => request.suppressErrorToast === undefined));
});
