import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  nextBuildNumber,
  downloadManifestPath,
  releaseManifestPath,
  otaTag,
  assertOtaBaseline,
} = require('../release-state.cjs');
const yaml = require('js-yaml');
const root = path.resolve(import.meta.dirname, '../..');
const workflow = (name) => yaml.load(fs.readFileSync(path.join(root, '.github/workflows', name), 'utf8'));

test('build numbers advance across native, production and preview download manifests', () => {
  assert.equal(
    nextBuildNumber([{ buildNumber: 1026 }, { buildNumber: 1021 }, { buildNumber: 1030 }, { buildNumber: 1032 }], []),
    1033,
  );
  assert.equal(nextBuildNumber([], [], 2000), 2001);
});

test('a published release reserves its build even if the manifest push failed', () => {
  const releases = [
    { tag_name: 'v0.8.0-ota.1033', body: '' },
    { tag_name: 'v0.8.0-preview-ota.1035', body: '' },
    { tag_name: 'v0.9.0', body: 'Native release\n<!-- anitabi-build-number: 1036 -->' },
  ];
  assert.equal(nextBuildNumber([{ buildNumber: 1032 }], releases), 1037);
});

test('invalid counters fail before packaging and Android versionCode cannot overflow', () => {
  assert.throws(() => nextBuildNumber([{ buildNumber: 'broken' }], []), /Invalid build number/);
  assert.throws(() => nextBuildNumber([], [], -1), /offset/);
  assert.throws(() => nextBuildNumber([{ buildNumber: 2100000000 }], []), /limit/);
});

test('OTA releases keep the native version and isolate download manifests by channel', () => {
  assert.equal(otaTag('0.8.0', 'production', 1030), 'v0.8.0-ota.1030');
  assert.equal(otaTag('0.8.0', 'preview', 1031), 'v0.8.0-preview-ota.1031');
  assert.equal(releaseManifestPath('production', false), 'docs/releases/latest.json');
  assert.equal(releaseManifestPath('preview', false), 'docs/releases/preview.json');
  assert.equal(releaseManifestPath('production', true), downloadManifestPath('production'));
  assert.equal(releaseManifestPath('preview', true), downloadManifestPath('preview'));
  assert.throws(() => downloadManifestPath('development'), /Invalid release channel/);
});

test('stale retries cannot replace a newer runtime or downloadable bundle', () => {
  assert.throws(() => assertOtaBaseline({ version: '0.9.0' }, null, '0.8.0', 1037), /native release has changed/);
  assert.throws(() => assertOtaBaseline({ version: '0.8.0' }, { buildNumber: 1038 }, '0.8.0', 1037), /newer download/);
  assert.doesNotThrow(() => assertOtaBaseline({ version: '0.8.0' }, { buildNumber: 1037 }, '0.8.0', 1037));
});

test('generating an OTA download manifest leaves both existing upgrade manifests unchanged', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'anitabi-release-'));
  try {
    const before = ['latest.json', 'preview.json'].map((name) => {
      const bytes = fs.readFileSync(path.join(root, 'docs/releases', name));
      fs.mkdirSync(path.join(directory, 'docs/releases'), { recursive: true });
      fs.writeFileSync(path.join(directory, 'docs/releases', name), bytes);
      return bytes;
    });
    for (const channel of ['production', 'preview']) {
      const output = path.join(directory, releaseManifestPath(channel, true));
      const tag = otaTag('0.8.0', channel, 1037);
      execFileSync(process.execPath, [
        path.join(root, 'scripts/generate-release-manifest.cjs'),
        '--repo',
        'boiboif/anitabi-app',
        '--version',
        '0.8.0',
        '--tag',
        tag,
        '--build-number',
        '1037',
        '--notes',
        'Latest JavaScript',
        '--output',
        output,
      ]);
      const manifest = JSON.parse(fs.readFileSync(output));
      assert.equal(manifest.version, '0.8.0');
      assert.equal(manifest.displayVersion, tag.slice(1));
      assert.equal(manifest.buildNumber, 1037);
      assert.equal(manifest.mandatory, false);
      assert.equal(manifest.releaseNotes, 'Latest JavaScript');
      assert.match(manifest.apkUrl, new RegExp(`/releases/download/${tag}/`));
    }
    ['latest.json', 'preview.json'].forEach((name, index) => {
      assert.deepEqual(fs.readFileSync(path.join(directory, 'docs/releases', name)), before[index]);
    });
  } finally {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('OTA gates the reusable dual-platform release and pins every checkout to its commit', () => {
  const update = workflow('eas-update.yml');
  const bundled = update.jobs['bundled-release'];
  assert.equal(bundled.needs, 'publish');
  assert.equal(bundled.uses, './.github/workflows/mobile-release.yml');
  assert.equal(bundled.with.ota_bundle, true);
  assert.equal(bundled.with.source_sha, '${{ github.sha }}');
  const mobile = workflow('mobile-release.yml');
  assert.deepEqual(mobile.jobs.publish.needs, ['prepare', 'android', 'ios']);
  for (const job of Object.values(mobile.jobs)) {
    const checkout = job.steps.find((step) => step.uses?.startsWith('actions/checkout@'));
    assert.equal(checkout.with.ref, '${{ inputs.source_sha || github.sha }}');
  }
  assert.equal(mobile.concurrency.group, workflow('android-release.yml').concurrency.group);
  assert.equal(mobile.concurrency.queue, 'max');
  assert.equal(mobile.concurrency['cancel-in-progress'], false);
});

test('only OTA publication and its matching installers receive a content revision', () => {
  const update = workflow('eas-update.yml');
  assert.equal(update.jobs.publish.env.APP_CONTENT_REVISION, '${{ github.sha }}');
  assert.equal(update.jobs['bundled-release'].with.source_sha, update.jobs.publish.env.APP_CONTENT_REVISION);

  const mobile = workflow('mobile-release.yml');
  for (const name of ['android', 'ios']) {
    const job = mobile.jobs[name];
    assert.equal(job.env.APP_CONTENT_REVISION, "${{ inputs.ota_bundle && inputs.source_sha || '' }}");
    for (const step of job.steps) {
      assert.equal(step.env?.APP_CONTENT_REVISION, undefined, 'Every build step must retain the job content identity');
    }
  }
  assert.equal(workflow('android-release.yml').jobs['build-release'].env.APP_CONTENT_REVISION, '');
});

test('production release workflows explicitly refresh the website download page', () => {
  for (const name of ['mobile-release.yml', 'android-release.yml']) {
    const release = workflow(name);
    const steps = Object.values(release.jobs).flatMap((job) => job.steps);
    assert.ok(steps.some((step) => step.run === 'gh workflow run docs-pages.yml --ref main'));
    assert.equal(release.permissions.actions, 'write');
  }
  const panel = fs.readFileSync(path.join(root, 'docs/.vitepress/theme/components/DownloadPanel.vue'), 'utf8');
  assert.match(panel, /import release from '\.\.\/\.\.\/\.\.\/releases\/download\.json'/);
});
