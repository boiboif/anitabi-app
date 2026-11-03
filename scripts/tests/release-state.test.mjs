import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const {
  nextBuildNumber,
  downloadManifestPath,
  releaseManifestPath,
  otaTag,
  assertOtaBaseline,
  refreshOtaUpgradeManifest,
} = require('../release-state.cjs');
const yaml = require('js-yaml');
const root = path.resolve(import.meta.dirname, '../..');
const workflow = (name) => yaml.load(fs.readFileSync(path.join(root, '.github/workflows', name), 'utf8'));

test('release manifests advertise iOS updates only when the release includes an IPA', () => {
  for (const hasIpa of [false, true]) {
    let output = '';
    const assets = [{ name: 'app.apk', url: 'https://example.test/app.apk' }];
    if (hasIpa) assets.push({ name: 'app-unsigned.ipa', url: 'https://example.test/app.ipa' });
    const processDouble = {
      argv: [
        'node',
        'generate-release-manifest.cjs',
        '--repo',
        'boiboif/anitabi-app',
        '--version',
        '0.9.0',
        '--from-github',
        '--dry-run',
      ],
      env: {},
      stdout: {
        write: (value) => {
          output += value;
        },
      },
    };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'scripts/generate-release-manifest.cjs'), 'utf8'), {
      __dirname: path.join(root, 'scripts'),
      process: processDouble,
      console,
      require: (name) =>
        name === 'child_process'
          ? {
              execFileSync: () =>
                JSON.stringify({ name: 'v0.9.0', body: 'Release notes', url: 'https://example.test/release', assets }),
            }
          : require(name),
    });
    assert.equal(processDouble.exitCode, undefined);
    assert.equal(JSON.parse(output).iosAvailable, hasIpa);
  }
});

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

test('an upgrade feed reserves the actual artifact build even while its native threshold stays lower', () => {
  assert.equal(nextBuildNumber([{ buildNumber: 1027, artifactBuildNumber: 1034 }], []), 1035);
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

test('generating the download manifest alone does not rewrite the upgrade feeds', () => {
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

const nativeBaseline = {
  version: '0.9.0',
  buildNumber: 1027,
  displayVersion: '0.9.0',
  title: 'v0.9.0',
  releaseNotes: 'Native features and earlier changes',
  releaseNotesHistory: [{ version: '0.9.0', buildNumber: 1027, notes: 'Native features', importance: 'major' }],
  mandatory: true,
  minSupportedVersion: '0.8.0',
  minSupportedBuildNumber: 1020,
  apkUrl: 'https://example.test/v0.9.0/app.apk',
  fileName: 'app-v0.9.0.apk',
  releaseUrl: 'https://example.test/v0.9.0',
  iosAvailable: false,
};
const otaDownload = {
  version: '0.9.0',
  buildNumber: 1030,
  displayVersion: '0.9.0-ota.1030',
  title: 'v0.9.0-ota.1030',
  releaseNotes: 'Only the latest JavaScript fix',
  releaseNotesHistory: [],
  mandatory: false,
  apkUrl: 'https://example.test/v0.9.0-ota.1030/app.apk',
  fileName: 'app-v0.9.0-ota.1030.apk',
  releaseUrl: 'https://example.test/v0.9.0-ota.1030',
  iosAvailable: true,
};

test('OTA installers replace download resources without changing who must upgrade or their release notes', () => {
  const baseline = structuredClone(nativeBaseline);
  const download = structuredClone(otaDownload);
  const updated = refreshOtaUpgradeManifest(baseline, download);
  assert.deepEqual(updated, {
    ...nativeBaseline,
    apkUrl: otaDownload.apkUrl,
    fileName: otaDownload.fileName,
    releaseUrl: otaDownload.releaseUrl,
    iosAvailable: true,
    artifactBuildNumber: 1030,
  });
  assert.deepEqual(baseline, nativeBaseline);
  assert.deepEqual(download, otaDownload);
});

test('repeated OTA refreshes retain the native threshold and allow an idempotent retry', () => {
  const first = refreshOtaUpgradeManifest(nativeBaseline, otaDownload);
  assert.deepEqual(refreshOtaUpgradeManifest(first, otaDownload), first);
  const next = { ...otaDownload, buildNumber: 1031, apkUrl: 'https://example.test/next.apk', fileName: 'next.apk' };
  const refreshed = refreshOtaUpgradeManifest(first, next);
  assert.equal(refreshed.buildNumber, 1027);
  assert.equal(refreshed.artifactBuildNumber, 1031);
  assert.equal(refreshed.apkUrl, next.apkUrl);
  assert.throws(() => refreshOtaUpgradeManifest(refreshed, otaDownload));
});

test('missing, incompatible, stale or incomplete OTA installers cannot change the upgrade manifest', () => {
  const cases = [
    [null, otaDownload],
    [nativeBaseline, null],
    [{ ...nativeBaseline, version: '1.0.0' }, otaDownload],
    [{ ...nativeBaseline, buildNumber: undefined }, otaDownload],
    [{ ...nativeBaseline, buildNumber: '1027' }, otaDownload],
    [nativeBaseline, { ...otaDownload, buildNumber: '1030' }],
    [nativeBaseline, { ...otaDownload, buildNumber: 0 }],
    [nativeBaseline, { ...otaDownload, buildNumber: 1026 }],
    [{ ...nativeBaseline, artifactBuildNumber: 1031 }, otaDownload],
    [nativeBaseline, { ...otaDownload, apkUrl: '' }],
    [nativeBaseline, { ...otaDownload, fileName: ' ' }],
    [nativeBaseline, { ...otaDownload, releaseUrl: undefined }],
    [nativeBaseline, { ...otaDownload, iosAvailable: 'true' }],
  ];
  for (const [baseline, download] of cases) {
    const before = structuredClone([baseline, download]);
    assert.throws(() => refreshOtaUpgradeManifest(baseline, download));
    assert.deepEqual([baseline, download], before);
  }
});

function manifestRepository(context, channel, publishedDownload = otaDownload) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'anitabi-ota-manifest-'));
  context.after(() => {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    // Git objects are read-only on Windows, where recursive removal can fail.
    for (const entry of fs.readdirSync(directory, { recursive: true })) {
      const file = path.join(directory, entry);
      if (fs.lstatSync(file).isFile()) fs.chmodSync(file, 0o600);
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const git = (...args) => execFileSync('git', args, { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
  const read = (file) => fs.readFileSync(path.join(directory, file));
  const write = (file, value) => fs.writeFileSync(path.join(directory, file), `${JSON.stringify(value, null, 2)}\n`);
  fs.mkdirSync(path.join(directory, 'docs/releases'), { recursive: true });
  for (const target of ['production', 'preview']) {
    write(releaseManifestPath(target, false), nativeBaseline);
    write(downloadManifestPath(target), target === channel ? publishedDownload : nativeBaseline);
  }
  git('init', '--quiet');
  git('add', '.');
  git(
    '-c',
    'user.name=Manifest Test',
    '-c',
    'user.email=manifest@example.test',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--quiet',
    '-m',
    'Published state',
  );
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  const run = (target = channel) =>
    execFileSync(process.execPath, [path.join(root, 'scripts/release-state.cjs'), 'refresh-ota-upgrade', target], {
      cwd: directory,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  return { directory, git, read, write, run };
}

for (const channel of ['production', 'preview']) {
  test(`OTA refresh uses the published ${channel} baseline and leaves the other channel unchanged`, (context) => {
    const repo = manifestRepository(context, channel, { ...otaDownload, buildNumber: 1029 });
    const upgradePath = releaseManifestPath(channel, false);
    const downloadPath = downloadManifestPath(channel);
    const other = channel === 'production' ? 'preview' : 'production';
    const otherPaths = [releaseManifestPath(other, false), downloadManifestPath(other)];
    const untouched = otherPaths.map(repo.read);
    // The source checkout can predate a native release or its policy changes.
    repo.write(upgradePath, { ...nativeBaseline, buildNumber: 1026, mandatory: false, releaseNotes: 'Old notes' });
    repo.write(downloadPath, otaDownload);
    const downloadBytes = repo.read(downloadPath);
    repo.run();
    assert.deepEqual(JSON.parse(repo.read(upgradePath)), refreshOtaUpgradeManifest(nativeBaseline, otaDownload));
    assert.deepEqual(repo.read(downloadPath), downloadBytes);
    otherPaths.forEach((file, index) => assert.deepEqual(repo.read(file), untouched[index]));
  });
}

for (const [label, download] of [
  ['a newer native version', { ...otaDownload, version: '0.8.0' }],
  ['a newer published installer', { ...otaDownload, buildNumber: 1029 }],
  ['a missing installer URL', { ...otaDownload, apkUrl: '' }],
]) {
  test(`OTA refresh fails without writing any manifest when it encounters ${label}`, (context) => {
    const repo = manifestRepository(context, 'production');
    repo.write(downloadManifestPath('production'), download);
    const files = ['production', 'preview'].flatMap((channel) => [
      releaseManifestPath(channel, false),
      downloadManifestPath(channel),
    ]);
    const before = files.map(repo.read);
    assert.throws(() => repo.run());
    files.forEach((file, index) => assert.deepEqual(repo.read(file), before[index]));
  });
}

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

test('the published OTA installer refreshes the upgrade feed before both manifests are committed', () => {
  const { steps } = workflow('mobile-release.yml').jobs.publish;
  const refreshIndex = steps.findIndex((step) => step.run?.includes('release-state.cjs refresh-ota-upgrade'));
  assert.ok(refreshIndex > steps.findIndex((step) => step.name === 'Create or update release'));
  assert.ok(refreshIndex > steps.findIndex((step) => step.name === 'Generate update manifest'));
  assert.equal(steps[refreshIndex].if, 'inputs.ota_bundle');
  assert.match(steps[refreshIndex].run, /refresh-ota-upgrade "\$RELEASE_TYPE"/);
  const commitIndex = steps.findIndex((step) => step.name === 'Commit update manifest');
  assert.ok(commitIndex > refreshIndex);
  assert.match(steps[commitIndex].run, /manifest-path "\$RELEASE_TYPE" false/);
});

test('repeated OTA publication from one source commit preserves newer main changes without a rebase conflict', (context) => {
  const bash =
    process.platform === 'win32'
      ? path.join(process.env.ProgramFiles ?? 'C:/Program Files', 'Git/bin/bash.exe')
      : 'bash';
  if (process.platform === 'win32' && !fs.existsSync(bash)) {
    context.skip('Git Bash is required to execute the actual GitHub Actions shell step on Windows');
    return;
  }
  const repo = manifestRepository(context, 'production', nativeBaseline);
  const { directory, git } = repo;
  git('config', 'commit.gpgsign', 'false');
  git('config', 'user.name', 'Manifest Test');
  git('config', 'user.email', 'manifest@example.test');
  fs.mkdirSync(path.join(directory, 'scripts'));
  fs.copyFileSync(path.join(root, 'scripts/release-state.cjs'), path.join(directory, 'scripts/release-state.cjs'));
  git('add', 'scripts/release-state.cjs');
  git('commit', '--quiet', '-m', 'OTA source');
  const sourceSha = git('rev-parse', 'HEAD').toString().trim();
  const remote = path.join(directory, 'local-remote.git');
  git('init', '--bare', '--quiet', remote);
  git('remote', 'add', 'origin', remote);
  git('push', '--quiet', 'origin', 'HEAD:main');
  git('fetch', '--quiet', 'origin', 'main');
  const temporaryWorktrees = path.join(directory, 'publication-worktrees');
  fs.mkdirSync(temporaryWorktrees);
  const commitStep = workflow('mobile-release.yml').jobs.publish.steps.find(
    (step) => step.name === 'Commit update manifest',
  ).run;
  const publish = (download) => {
    repo.write(downloadManifestPath('production'), download);
    repo.run();
    execFileSync(bash, ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', commitStep], {
      cwd: directory,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        OTA_BUNDLE: 'true',
        RELEASE_TYPE: 'production',
        MANIFEST_PATH: downloadManifestPath('production'),
        DOWNLOAD_MANIFEST_PATH: downloadManifestPath('production'),
        TAG: `v0.9.0-ota.${download.buildNumber}`,
        TMPDIR: temporaryWorktrees.replaceAll('\\', '/'),
      },
    });
    assert.equal(git('rev-parse', 'HEAD').toString().trim(), sourceSha, 'The OTA source checkout must stay pinned');
    git('fetch', '--quiet', 'origin', 'main');
  };
  publish(otaDownload);

  // Simulate unrelated main changes after that first installer was published.
  const mainWorktree = path.join(directory, 'main-edit');
  git('worktree', 'add', '--detach', mainWorktree, 'origin/main');
  const revisedBaseline = {
    ...JSON.parse(git('show', 'origin/main:docs/releases/latest.json')),
    releaseNotes: 'Corrected upgrade notes from main',
    minSupportedVersion: '0.8.1',
  };
  fs.writeFileSync(path.join(mainWorktree, 'docs/releases/latest.json'), JSON.stringify(revisedBaseline));
  fs.writeFileSync(path.join(mainWorktree, 'independent.txt'), 'Keep this unrelated change\n');
  git('-C', mainWorktree, 'add', 'docs/releases/latest.json', 'independent.txt');
  git('-C', mainWorktree, 'commit', '--quiet', '-m', 'Independent main changes');
  git('-C', mainWorktree, 'push', '--quiet', 'origin', 'HEAD:main');
  git('fetch', '--quiet', 'origin', 'main');
  const publishedParent = git('rev-parse', 'origin/main').toString().trim();
  const nextDownload = {
    ...otaDownload,
    buildNumber: 1031,
    apkUrl: 'https://example.test/v0.9.0-ota.1031/app.apk',
    fileName: 'app-v0.9.0-ota.1031.apk',
    releaseUrl: 'https://example.test/v0.9.0-ota.1031',
  };
  publish(nextDownload);
  assert.equal(git('rev-parse', 'origin/main^').toString().trim(), publishedParent);
  assert.equal(git('show', 'origin/main:independent.txt').toString().trim(), 'Keep this unrelated change');
  assert.deepEqual(
    JSON.parse(git('show', 'origin/main:docs/releases/latest.json')),
    refreshOtaUpgradeManifest(revisedBaseline, nextDownload),
  );
  assert.deepEqual(JSON.parse(git('show', 'origin/main:docs/releases/download.json')), nextDownload);
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
