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
  for (const manifest of manifests) include(manifest.buildNumber ?? 0);
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
  } else {
    throw new Error(`Unknown release-state command: ${command}`);
  }
}

module.exports = { nextBuildNumber, downloadManifestPath, releaseManifestPath, otaTag, assertOtaBaseline };
if (require.main === module) main();
