const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const manifestPaths = [
  'docs/releases/latest.json',
  'docs/releases/preview.json',
  'docs/releases/download.json',
  'docs/releases/download-preview.json',
];

function nextBuildNumber(manifests, releases, offset = 1000) {
  let highest = Number(offset);
  if (!Number.isSafeInteger(highest) || highest < 0) throw new Error('Invalid build number offset');
  const include = (value) => {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0) throw new Error(`Invalid build number: ${value}`);
    highest = Math.max(highest, number);
  };
  for (const manifest of manifests) {
    include(manifest.buildNumber ?? 0);
    include(manifest.artifactBuildNumber ?? 0);
  }
  for (const release of releases) {
    const marker = /<!-- anitabi-build-number: (\d+) -->/.exec(release.body ?? '');
    const tag = /-ota\.(\d+)$/.exec(release.tag_name ?? '');
    if (marker) include(marker[1]);
    if (tag) include(tag[1]);
  }
  if (highest >= 2100000000) throw new Error('Android versionCode limit reached');
  return highest + 1;
}

function downloadManifestPath(channel) {
  if (channel === 'production') return 'docs/releases/download.json';
  if (channel === 'preview') return 'docs/releases/download-preview.json';
  throw new Error(`Invalid release channel: ${channel}`);
}

function releaseManifestPath(channel, otaBundle) {
  const download = downloadManifestPath(channel);
  if (otaBundle) return download;
  return channel === 'preview' ? 'docs/releases/preview.json' : 'docs/releases/latest.json';
}

function otaTag(version, channel, buildNumber) {
  downloadManifestPath(channel);
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid app version');
  if (!Number.isSafeInteger(buildNumber) || buildNumber < 1) throw new Error('Invalid build number');
  return `v${version}${channel === 'preview' ? '-preview' : ''}-ota.${buildNumber}`;
}

function assertOtaBaseline(baseline, download, version, buildNumber) {
  if (!Number.isSafeInteger(buildNumber) || buildNumber < 1) throw new Error('Invalid build number');
  if (baseline?.version !== version) {
    throw new Error(
      'The current native release has changed; publish an OTA for its runtime before creating another bundled release.',
    );
  }
  if (download?.buildNumber > buildNumber) {
    throw new Error('A newer download has already been published; this bundled release cannot replace it.');
  }
}

function refreshOtaUpgradeManifest(baseline, download) {
  if (!baseline || typeof baseline.version !== 'string' || !baseline.version) {
    throw new Error('An existing native upgrade baseline is required');
  }
  assertOtaBaseline(baseline, null, download?.version, download?.buildNumber);
  if (!Number.isSafeInteger(baseline.buildNumber) || baseline.buildNumber < 1) {
    throw new Error('Invalid native baseline build number');
  }
  if (
    baseline.artifactBuildNumber !== undefined &&
    (!Number.isSafeInteger(baseline.artifactBuildNumber) || baseline.artifactBuildNumber < 1)
  ) {
    throw new Error('Invalid previous artifact build number');
  }
  if (download.buildNumber < Math.max(baseline.buildNumber, baseline.artifactBuildNumber ?? 0)) {
    throw new Error('An older installer cannot replace the native baseline or its newer artifact');
  }
  for (const field of ['apkUrl', 'fileName', 'releaseUrl']) {
    if (typeof download[field] !== 'string' || !download[field].trim()) {
      throw new Error(`The bundled download is missing ${field}`);
    }
  }
  if (typeof download.iosAvailable !== 'boolean') {
    throw new Error('The bundled download must specify iosAvailable');
  }

  // Legacy clients compare buildNumber before following apkUrl. Keep that
  // native upgrade threshold while letting older installations download the
  // latest embedded content, without prompting the baseline's existing users.
  return {
    ...baseline,
    apkUrl: download.apkUrl,
    fileName: download.fileName,
    releaseUrl: download.releaseUrl,
    iosAvailable: download.iosAvailable,
    artifactBuildNumber: download.buildNumber,
  };
}

function readManifest(ref, file) {
  if (!ref) return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  try {
    execFileSync('git', ['cat-file', '-e', `${ref}:${file}`], { stdio: 'ignore' });
  } catch {
    return null;
  }
  return JSON.parse(execFileSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8' }));
}

function main() {
  const [command, channel, version, build] = process.argv.slice(2);
  if (command === 'next-build') {
    const manifests = manifestPaths
      .flatMap((file) => [readManifest(null, file), readManifest('origin/main', file)])
      .filter(Boolean);
    // Release markers retain allocated numbers even if the following manifest push fails.
    const pages = JSON.parse(
      execFileSync(
        'gh',
        ['api', `repos/${process.env.GITHUB_REPOSITORY}/releases?per_page=100`, '--paginate', '--slurp'],
        { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
      ),
    );
    process.stdout.write(
      String(nextBuildNumber(manifests, pages.flat(), process.env.ANDROID_VERSION_CODE_OFFSET || 1000)),
    );
  } else if (command === 'download-path') {
    process.stdout.write(downloadManifestPath(channel));
  } else if (command === 'manifest-path') {
    process.stdout.write(releaseManifestPath(channel, version === 'true'));
  } else if (command === 'ota-tag') {
    process.stdout.write(otaTag(version, channel, Number(build)));
  } else if (command === 'check-ota-baseline') {
    const file = channel === 'preview' ? 'docs/releases/preview.json' : 'docs/releases/latest.json';
    assertOtaBaseline(
      readManifest('origin/main', file),
      readManifest('origin/main', downloadManifestPath(channel)),
      version,
      Number(build),
    );
  } else if (command === 'refresh-ota-upgrade') {
    const upgradePath = releaseManifestPath(channel, false);
    const downloadPath = downloadManifestPath(channel);
    // The source checkout may predate a policy change or another manifest
    // publication. The workflow fetches origin/main before reaching this step.
    const baseline = readManifest('origin/main', upgradePath);
    const download = readManifest(null, downloadPath);
    assertOtaBaseline(baseline, readManifest('origin/main', downloadPath), download?.version, download?.buildNumber);
    const manifest = refreshOtaUpgradeManifest(baseline, download);
    fs.writeFileSync(upgradePath, `${JSON.stringify(manifest, null, 2)}\n`);
  } else {
    throw new Error(`Unknown release-state command: ${command}`);
  }
}

module.exports = {
  nextBuildNumber,
  downloadManifestPath,
  releaseManifestPath,
  otaTag,
  assertOtaBaseline,
  refreshOtaUpgradeManifest,
};
if (require.main === module) main();
