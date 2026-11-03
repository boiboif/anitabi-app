import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { contextFromEnvironment, releaseBody, reserve, upload, publish } = require('../ota-bundle-release.cjs');
const sourceSha = 'a'.repeat(40);
const group = '12345678-1234-1234-1234-123456789abc';

function environment(channel = 'production', mode = 'coordinated') {
  return {
    GITHUB_REPOSITORY: 'example/app',
    GITHUB_SHA: sourceSha,
    GITHUB_RUN_ID: '12345',
    TAG: `v0.9.0${channel === 'preview' ? '-preview' : ''}-ota.1030`,
    APP_VERSION: '0.9.0',
    BUILD_NUMBER: '1030',
    RELEASE_TYPE: channel,
    RELEASE_NOTES: '修复地图加载\\n改善体验',
    OTA_RELEASE_JSON: JSON.stringify({ sourceSha, group, channel, mode }),
    ANDROID_ASSET_NAME: 'app-1030.apk',
    IOS_ASSET_NAME: 'app-1030.ipa',
  };
}

function artifacts(context, configuration) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'anitabi-ota-bundle-test-'));
  context.after(() => {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  configuration.distDirectory = directory;
  const apk = Buffer.from('the APK content');
  fs.writeFileSync(path.join(directory, configuration.androidAssetName), apk);
  fs.writeFileSync(path.join(directory, configuration.iosAssetName), 'the IPA content');
  const digest = crypto.createHash('sha256').update(apk).digest('hex');
  fs.writeFileSync(
    path.join(directory, `${configuration.androidAssetName}.sha256`),
    `${digest}  dist/${configuration.androidAssetName}\n`,
  );
}

function github(configuration) {
  const state = { release: null, calls: [], contents: new Map(), afterUpload: () => {} };
  const value = (args, name) => args[args.indexOf(name) + 1];
  state.gh = (args) => {
    state.calls.push(args);
    assert.equal(args[0], 'release');
    assert.equal(value(args, '--repo'), configuration.repo);
    switch (args[1]) {
      case 'view': {
        if (!state.release) throw Object.assign(new Error('Release missing'), { stderr: 'release not found' });
        return JSON.stringify(state.release);
      }
      case 'create': {
        assert.ok(args.includes('--draft'));
        assert.ok(args.includes('--latest=false'));
        state.release = {
          body: fs.readFileSync(value(args, '--notes-file'), 'utf8'),
          tagName: args[2],
          targetCommitish: value(args, '--target'),
          isDraft: true,
          isPrerelease: args.includes('--prerelease=true'),
          assets: [],
        };
        return '';
      }
      case 'upload': {
        assert.equal(state.release.isDraft, true, 'Published assets must never be overwritten');
        for (const file of args.slice(3, args.indexOf('--repo'))) {
          const bytes = fs.readFileSync(file);
          state.contents.set(path.basename(file), bytes);
        }
        state.release.assets = [...state.contents].map(([name, bytes]) => ({
          name,
          size: bytes.length,
          state: 'uploaded',
        }));
        state.afterUpload();
        return '';
      }
      case 'download': {
        fs.writeFileSync(value(args, '--output'), state.contents.get(value(args, '--pattern')));
        return '';
      }
      case 'edit': {
        assert.ok(args.includes('--draft=false'));
        state.release.isDraft = false;
        return '';
      }
      default:
        throw new Error(`Unexpected gh operation ${args[1]}`);
    }
  };
  return state;
}

for (const mode of ['coordinated', 'ota-first']) {
  test(`${mode} reserves a hidden release with the exact source, group, run and build before assets exist`, () => {
    const configuration = contextFromEnvironment(environment('production', mode));
    const gh = github(configuration);
    const result = reserve(configuration, gh);
    assert.equal(result.isDraft, true);
    assert.deepEqual(result.assets, []);
    assert.match(result.body, /本安装包基于 0\.9\.0，已内置本次热更新/);
    assert.match(result.body, /修复地图加载\n改善体验/);
    assert.match(result.body, /<!-- anitabi-build-number: 1030 -->/);
    assert.match(result.body, new RegExp(`"sourceSha":"${sourceSha}"`));
    assert.match(result.body, new RegExp(`"group":"${group}"`));
    assert.match(result.body, /"runId":"12345"/);
    reserve(configuration, gh);
    assert.equal(gh.calls.filter((args) => args[1] === 'create').length, 1);
  });
}

test('a reserved tag cannot be reused by a different workflow run, source, group or build', () => {
  for (const changed of [
    { runId: '99999' },
    { sourceSha: 'b'.repeat(40) },
    { group: 'different-group' },
    { buildNumber: 1031 },
  ]) {
    const configuration = contextFromEnvironment(environment());
    const gh = github(configuration);
    reserve(configuration, gh);
    const previousBody = gh.release.body;
    assert.throws(() => reserve({ ...configuration, ...changed }, gh), /different run, source, group or build/);
    assert.equal(gh.release.body, previousBody);
    assert.equal(gh.calls.filter((args) => args[1] === 'create').length, 1);
    assert.equal(gh.calls.filter((args) => args[1] === 'upload').length, 0);
  }
});

test('a release lookup failure does not create a replacement draft', () => {
  const configuration = contextFromEnvironment(environment());
  const calls = [];
  assert.throws(
    () =>
      reserve(configuration, {
        gh(args) {
          calls.push(args);
          throw Object.assign(new Error('Service unavailable'), { stderr: 'HTTP 503' });
        },
      }),
    /Service unavailable/,
  );
  assert.equal(calls.length, 1);
});

test('metadata must belong to the configured source/channel and cannot be injected through release notes', () => {
  for (const invalid of [
    { GITHUB_SHA: 'short' },
    { BUILD_NUMBER: '0' },
    { TAG: 'v0.8.0-ota.1030' },
    { OTA_RELEASE_JSON: JSON.stringify({ sourceSha: 'b'.repeat(40), channel: 'production', group }) },
    { OTA_RELEASE_JSON: JSON.stringify({ sourceSha, channel: 'preview', group }) },
  ])
    assert.throws(() => contextFromEnvironment({ ...environment(), ...invalid }));
  const configuration = contextFromEnvironment(environment());
  assert.throws(() => releaseBody({ ...configuration, notes: '<!-- anitabi-build-number: 999 -->' }));
});

test('upload requires both nonempty platform assets and a checksum matching the APK', (context) => {
  const configuration = contextFromEnvironment(environment());
  artifacts(context, configuration);
  const gh = github(configuration);
  reserve(configuration, gh);
  fs.writeFileSync(path.join(configuration.distDirectory, configuration.iosAssetName), '');
  assert.throws(() => upload(configuration, gh), /empty or invalid/);
  fs.writeFileSync(path.join(configuration.distDirectory, configuration.iosAssetName), 'restored IPA');
  fs.writeFileSync(
    path.join(configuration.distDirectory, `${configuration.androidAssetName}.sha256`),
    `${'0'.repeat(64)}  app-1030.apk`,
  );
  assert.throws(() => upload(configuration, gh), /checksum does not match/);
  assert.equal(gh.calls.filter((args) => args[1] === 'upload').length, 0);
});

test('an incomplete upload stays hidden and a retry can fill the same owned draft', (context) => {
  const configuration = contextFromEnvironment(environment());
  artifacts(context, configuration);
  const gh = github(configuration);
  reserve(configuration, gh);
  gh.afterUpload = () => {
    gh.release.assets = gh.release.assets.filter((asset) => asset.name !== configuration.iosAssetName);
  };
  assert.throws(() => upload(configuration, gh), /missing, incomplete/);
  assert.equal(gh.release.isDraft, true);
  assert.throws(() => publish(configuration, gh), /missing, incomplete/);
  assert.equal(gh.calls.filter((args) => args[1] === 'edit').length, 0);
  gh.afterUpload = () => {};
  upload(configuration, gh);
  assert.equal(gh.release.assets.length, 3);
  assert.equal(gh.release.isDraft, true);
});

test('assets still processing on GitHub cannot be published', (context) => {
  const configuration = contextFromEnvironment(environment());
  artifacts(context, configuration);
  const gh = github(configuration);
  reserve(configuration, gh);
  upload(configuration, gh);
  gh.release.assets[0].state = 'new';
  assert.throws(() => publish(configuration, gh), /missing, incomplete/);
  assert.equal(gh.release.isDraft, true);
});

for (const channel of ['production', 'preview']) {
  test(`${channel} publishes only a complete owned draft and verifies public retries without replacing assets`, (context) => {
    const configuration = contextFromEnvironment(environment(channel));
    artifacts(context, configuration);
    const gh = github(configuration);
    reserve(configuration, gh);
    upload(configuration, gh);
    publish(configuration, gh);
    const edit = gh.calls.find((args) => args[1] === 'edit');
    assert.ok(edit.includes(`--latest=${channel === 'production'}`));
    assert.ok(edit.includes(`--prerelease=${channel === 'preview'}`));
    gh.calls.length = 0;
    reserve(configuration, gh);
    upload(configuration, gh);
    publish(configuration, gh);
    assert.equal(gh.calls.filter((args) => ['create', 'upload', 'edit'].includes(args[1])).length, 0);
    assert.equal(gh.calls.filter((args) => args[1] === 'download').length, 6);
  });
}

test('a public release with same-size different bytes cannot be overwritten or reused by a retry', (context) => {
  const configuration = contextFromEnvironment(environment());
  artifacts(context, configuration);
  const gh = github(configuration);
  reserve(configuration, gh);
  upload(configuration, gh);
  publish(configuration, gh);
  gh.contents.set(
    configuration.androidAssetName,
    Buffer.alloc(gh.contents.get(configuration.androidAssetName).length, 'x'),
  );
  gh.calls.length = 0;
  assert.throws(() => upload(configuration, gh), /differs from this run/);
  assert.throws(() => publish(configuration, gh), /differs from this run/);
  assert.equal(gh.calls.filter((args) => ['upload', 'edit'].includes(args[1])).length, 0);
});
