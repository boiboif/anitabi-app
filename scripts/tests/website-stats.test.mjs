import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

test('website statistics preserve cumulative checkpoints and fail safely', async () => {
  const root = await mkdtemp(join(tmpdir(), 'website-stats-'));
  try {
    const scripts = join(root, 'scripts');
    const dist = join(root, 'docs', '.vitepress', 'dist');
    const output = join(dist, 'website-stats.json');
    const inputCheckpoint = join(root, 'in.json');
    const outputCheckpoint = join(root, 'out.json');
    const mock = join(root, 'mock.mjs');
    await mkdir(scripts, { recursive: true });
    await mkdir(dist, { recursive: true });
    await copyFile(new URL('../fetch-website-stats.mjs', import.meta.url), join(scripts, 'fetch-website-stats.mjs'));
    await writeFile(mock, `
      import assert from 'node:assert/strict';
      globalThis.fetch = async (url, options) => {
        assert.equal(url.origin, 'https://api.umami.is');
        assert.equal(options.headers.Authorization, 'Bearer test-secret');
        if (url.pathname.endsWith('/daterange')) {
          if (process.env.MOCK_RESPONSE === 'range-failed') return { ok: false, status: 503 };
          return { ok: true, json: async () => ({ startDate: '2026-01-01T00:00:00.000Z', endDate: '2026-01-02T00:00:00.000Z' }) };
        }
        const start = Number(url.searchParams.get('startAt'));
        const duration = Number(url.searchParams.get('endAt')) - start;
        const kind = duration === 30 * 86400000 ? 'recent' : start === Date.parse('2026-01-01T00:00:00.000Z') - 1 ? 'initial' : 'overlap';
        if (process.env.MOCK_RESPONSE === 'all-failed' || process.env.MOCK_RESPONSE === kind + '-failed') return { ok: false, status: 503 };
        if (process.env.MOCK_RESPONSE === kind + '-invalid') return { ok: true, json: async () => ({ pageviews: -1, visitors: 1 }) };
        return { ok: true, json: async () => ({ pageviews: kind === 'recent' ? 123 : kind === 'initial' ? 987 : 150, visitors: 45 }) };
      };
    `);
    function run({ state = 'missing', bootstrap = false, mode = '', configured = true } = {}) {
      execFileSync(process.execPath, ['--import', pathToFileURL(mock).href, join(scripts, 'fetch-website-stats.mjs')], {
        env: { ...process.env, DOCS_UMAMI_WEBSITE_ID: configured ? 'test-site' : '', DOCS_UMAMI_API_KEY: configured ? 'test-secret' : '', DOCS_STATS_CHECKPOINT_STATE: state, DOCS_STATS_BOOTSTRAP: String(bootstrap), DOCS_STATS_CHECKPOINT: inputCheckpoint, DOCS_STATS_CHECKPOINT_OUTPUT: outputCheckpoint, MOCK_RESPONSE: mode },
        stdio: 'pipe',
      });
    }
    async function stats() { return JSON.parse(await readFile(output, 'utf8')); }
    run();
    assert.equal((await stats()).pageviews, 123);
    assert.ok(!('totalPageviews' in await stats()));
    await assert.rejects(readFile(outputCheckpoint), { code: 'ENOENT' });
    run({ bootstrap: true });
    const initial = await stats();
    assert.equal(initial.totalPageviews, 987);
    assert.equal(initial.totalSince, '2026-01-01T00:00:00.000Z');
    const checkpoint = JSON.parse(await readFile(outputCheckpoint, 'utf8'));
    assert.equal(checkpoint.websiteId, 'test-site');
    assert.equal(checkpoint.format, 1);
    // Simulate a later run: 987 - prior 30 days (123) + refreshed overlap (150).
    checkpoint.updatedAt = new Date(Date.now() - 86400000).toISOString();
    await writeFile(inputCheckpoint, JSON.stringify(checkpoint));
    run({ state: 'ready' });
    assert.equal((await stats()).totalPageviews, 1014);
    for (const options of [
      { state: 'unavailable', bootstrap: true },
      { state: 'missing', bootstrap: true, mode: 'range-failed' },
      { state: 'ready', mode: 'overlap-failed' },
      { state: 'ready', mode: 'overlap-invalid' },
    ]) {
      run(options);
      assert.equal((await stats()).pageviews, 123);
      assert.ok(!('totalPageviews' in await stats()));
      await assert.rejects(readFile(outputCheckpoint), { code: 'ENOENT' });
    }
    checkpoint.updatedAt = new Date(Date.now() - 61 * 86400000).toISOString();
    await writeFile(inputCheckpoint, JSON.stringify(checkpoint));
    run({ state: 'ready', bootstrap: true });
    assert.ok(!('totalPageviews' in await stats()));
    for (const options of [{ mode: 'all-failed' }, { mode: 'recent-invalid' }, { configured: false }]) {
      await writeFile(output, 'stale');
      run(options);
      await assert.rejects(readFile(output), { code: 'ENOENT' });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
