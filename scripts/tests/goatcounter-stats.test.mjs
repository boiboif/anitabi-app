import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchGoatCounterStats } from '../../docs/.vitepress/theme/components/goatcounter-stats.mjs';

const totalUrl = 'https://boiboif.goatcounter.com/counter/TOTAL.json';

function ok(count) {
  return { ok: true, json: async () => ({ count }) };
}

test('reads the public total and the rolling month, including formatted numbers and zero', async () => {
  const requests = [];
  const result = await fetchGoatCounterStats({
    fetchImpl: async (url) => {
      requests.push(url);
      return ok(url === totalUrl ? '1\u202f098\u202f097' : '0');
    },
  });
  assert.deepEqual(requests, [totalUrl, `${totalUrl}?start=month`]);
  assert.deepEqual(result, { total: 1098097, recent: 0 });
});

test('keeps a valid count when the other endpoint fails', async () => {
  const result = await fetchGoatCounterStats({
    fetchImpl: async (url) => url === totalUrl ? { ok: false, status: 403 } : ok('2,345'),
  });
  assert.deepEqual(result, { total: null, recent: 2345 });
});

test('rejects malformed, negative, unsafe and non-string counts instead of showing false numbers', async () => {
  for (const invalid of ['', '1e6', '-2', '12,34', '9,007,199,254,740,992', 123, null]) {
    const result = await fetchGoatCounterStats({ fetchImpl: async () => ok(invalid) });
    assert.equal(result, null, `expected ${String(invalid)} to be unavailable`);
  }
  const failedJson = await fetchGoatCounterStats({ fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError('bad json'); } }) });
  assert.equal(failedJson, null);
});

test('cancels outstanding requests and treats a timeout as unavailable', async () => {
  const controller = new AbortController();
  let started = 0;
  const fetchImpl = async (_url, { signal }) => {
    started += 1;
    return new Promise((_resolve, reject) => {
      if (signal.aborted) reject(new Error('aborted'));
      else signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
  };
  const cancelled = fetchGoatCounterStats({ signal: controller.signal, fetchImpl });
  controller.abort();
  assert.equal(await cancelled, null);
  assert.equal(started, 2);
  assert.equal(await fetchGoatCounterStats({ fetchImpl, timeoutMs: 1 }), null);
});
