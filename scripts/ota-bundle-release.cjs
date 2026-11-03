const { execFileSync } = require('node:child_process');
const { Buffer } = require('node:buffer');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function contextFromEnvironment(env = process.env) {
  const context = {
    repo: env.GITHUB_REPOSITORY,
    sourceSha: env.GITHUB_SHA?.toLowerCase(),
    runId: env.GITHUB_RUN_ID,
    tag: env.TAG,
    version: env.APP_VERSION,
    buildNumber: Number(env.BUILD_NUMBER),
    channel: env.RELEASE_TYPE,
    notes: env.RELEASE_NOTES,
    androidAssetName: env.ANDROID_ASSET_NAME,
    iosAssetName: env.IOS_ASSET_NAME,
    distDirectory: path.resolve('dist'),
  };
  if (!/^[\w.-]+\/[\w.-]+$/.test(context.repo ?? '')) throw new Error('Invalid repository');
  if (!/^[a-f0-9]{40}$/.test(context.sourceSha ?? '')) throw new Error('Missing full source SHA');
  if (!/^\d+$/.test(context.runId ?? '')) throw new Error('Missing workflow run ID');
  if (!/^\d+\.\d+\.\d+$/.test(context.version ?? '')) throw new Error('Invalid app version');
  if (!Number.isSafeInteger(context.buildNumber) || context.buildNumber < 1 || context.buildNumber > 2100000000) {
    throw new Error('Invalid build number');
  }
  if (!['production', 'preview'].includes(context.channel)) throw new Error('Invalid release channel');
  const expectedTag = `v${context.version}${context.channel === 'preview' ? '-preview' : ''}-ota.${context.buildNumber}`;
  if (context.tag !== expectedTag) throw new Error('The OTA tag does not match its version, channel and build');
  let release;
  try {
    release = JSON.parse(env.OTA_RELEASE_JSON);
  } catch {
    throw new Error('Missing valid OTA release metadata');
  }
  if (
    typeof release?.group !== 'string' ||
    !/^[\w.-]+$/.test(release.group) ||
    release.sourceSha !== context.sourceSha ||
    release.channel !== context.channel
  ) {
    throw new Error('The OTA release metadata does not match this source and channel');
  }
  context.group = release.group;
  return context;
}

function ownership(context) {
  return {
    schemaVersion: 1,
    runId: context.runId,
    sourceSha: context.sourceSha,
    group: context.group,
    buildNumber: context.buildNumber,
  };
}

function releaseBody(context) {
  if (typeof context.notes !== 'string' || !context.notes.trim()) throw new Error('OTA release notes are required');
  const notes = context.notes.replace(/\\n/g, '\n');
  if (/<!--\s*anitabi-(?:build-number|ota-release):/.test(notes)) {
    throw new Error('Release notes cannot contain reserved release metadata');
  }
  return (
    `本安装包基于 ${context.version}，已内置本次热更新。已安装 ${context.version} 的用户可直接通过 OTA 更新。\n\n` +
    `本次更新：\n${notes}\n` +
    `<!-- anitabi-build-number: ${context.buildNumber} -->\n` +
    `<!-- anitabi-ota-release: ${JSON.stringify(ownership(context))} -->\n`
  );
}

function runGh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
}

function readRelease(context, gh, allowMissing = false) {
  let output;
  try {
    output = gh([
      'release',
      'view',
      context.tag,
      '--repo',
      context.repo,
      '--json',
      'body,isDraft,isPrerelease,tagName,targetCommitish,assets',
    ]);
  } catch (error) {
    if (allowMissing && /release not found|HTTP 404/i.test(String(error.stderr ?? ''))) return null;
    throw error;
  }
  const release = JSON.parse(output);
  assertOwnership(context, release);
  return release;
}

function assertOwnership(context, release) {
  const markers = [...(release.body ?? '').matchAll(/<!-- anitabi-ota-release: (.+?) -->/g)];
  const builds = [...(release.body ?? '').matchAll(/<!-- anitabi-build-number: (\d+) -->/g)];
  let marker;
  try {
    if (markers.length === 1) marker = JSON.parse(markers[0][1]);
  } catch {
    // A malformed marker cannot authorize reusing an existing tag.
  }
  const expected = ownership(context);
  if (
    !marker ||
    Object.keys(marker).length !== Object.keys(expected).length ||
    !Object.entries(expected).every(([key, value]) => marker[key] === value) ||
    builds.length !== 1 ||
    Number(builds[0][1]) !== context.buildNumber ||
    release.tagName !== context.tag ||
    release.targetCommitish !== context.sourceSha ||
    typeof release.isDraft !== 'boolean' ||
    release.isPrerelease !== (context.channel === 'preview')
  ) {
    throw new Error('The existing OTA release belongs to a different run, source, group or build');
  }
}

function withTemporaryDirectory(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'anitabi-ota-release-'));
  try {
    return run(directory);
  } finally {
    if (path.dirname(directory) !== path.resolve(os.tmpdir())) throw new Error('Unsafe temporary directory');
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function reserve(context, { gh = runGh } = {}) {
  const existing = readRelease(context, gh, true);
  if (existing) return existing;
  const body = releaseBody(context);
  withTemporaryDirectory((directory) => {
    const notesFile = path.join(directory, 'notes.md');
    fs.writeFileSync(notesFile, body);
    gh([
      'release',
      'create',
      context.tag,
      '--repo',
      context.repo,
      '--draft',
      '--latest=false',
      `--prerelease=${context.channel === 'preview'}`,
      '--target',
      context.sourceSha,
      '--title',
      context.tag,
      '--notes-file',
      notesFile,
    ]);
  });
  return readRelease(context, gh);
}

function hashFile(file) {
  const hash = crypto.createHash('sha256');
  const buffer = Buffer.alloc(1024 * 1024);
  const descriptor = fs.openSync(file, 'r');
  try {
    let bytes;
    while ((bytes = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0)
      hash.update(buffer.subarray(0, bytes));
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest('hex');
}

function localArtifacts(context) {
  const apk = context.androidAssetName;
  const ipa = context.iosAssetName;
  if (!/^[\w.-]+\.apk$/.test(apk ?? '') || !/^[\w.-]+\.ipa$/.test(ipa ?? '')) {
    throw new Error('Exact APK and IPA asset names are required');
  }
  const artifacts = [apk, ipa, `${apk}.sha256`].map((name) => {
    const file = path.join(context.distDirectory, name);
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size <= 0) throw new Error(`The ${name} artifact is empty or invalid`);
    return { name, file, size: stat.size, sha256: hashFile(file) };
  });
  const checksum = fs.readFileSync(artifacts[2].file, 'utf8').trim();
  const match = /^([a-f0-9]{64})[ \t]+\*?([^\r\n]+)$/i.exec(checksum);
  if (
    !match ||
    match[1].toLowerCase() !== artifacts[0].sha256 ||
    path.posix.basename(match[2].replaceAll('\\', '/')) !== apk
  ) {
    throw new Error('The APK checksum does not match the local artifact');
  }
  return artifacts;
}

function assertAssetMetadata(release, artifacts) {
  for (const artifact of artifacts) {
    const assets = (release.assets ?? []).filter((asset) => asset.name === artifact.name);
    if (assets.length !== 1 || assets[0].state !== 'uploaded' || assets[0].size !== artifact.size) {
      throw new Error(`The uploaded ${artifact.name} asset is missing, incomplete or has a different size`);
    }
    if (assets[0].digest && assets[0].digest !== `sha256:${artifact.sha256}`) {
      throw new Error(`The uploaded ${artifact.name} asset has a different digest`);
    }
  }
}

function assertPublicArtifacts(context, release, artifacts, gh) {
  assertAssetMetadata(release, artifacts);
  withTemporaryDirectory((directory) => {
    for (const artifact of artifacts) {
      const file = path.join(directory, artifact.name);
      gh(['release', 'download', context.tag, '--repo', context.repo, '--pattern', artifact.name, '--output', file]);
      if (hashFile(file) !== artifact.sha256)
        throw new Error(`The published ${artifact.name} differs from this run's artifact`);
    }
  });
}

function upload(context, { gh = runGh } = {}) {
  let release = readRelease(context, gh);
  const artifacts = localArtifacts(context);
  if (!release.isDraft) {
    assertPublicArtifacts(context, release, artifacts, gh);
    return release;
  }
  gh([
    'release',
    'upload',
    context.tag,
    ...artifacts.map((artifact) => artifact.file),
    '--repo',
    context.repo,
    '--clobber',
  ]);
  release = readRelease(context, gh);
  assertAssetMetadata(release, artifacts);
  return release;
}

function publish(context, { gh = runGh } = {}) {
  let release = readRelease(context, gh);
  const artifacts = localArtifacts(context);
  if (!release.isDraft) {
    assertPublicArtifacts(context, release, artifacts, gh);
    return release;
  }
  assertAssetMetadata(release, artifacts);
  gh([
    'release',
    'edit',
    context.tag,
    '--repo',
    context.repo,
    '--draft=false',
    `--latest=${context.channel === 'production'}`,
    `--prerelease=${context.channel === 'preview'}`,
  ]);
  release = readRelease(context, gh);
  if (release.isDraft) throw new Error('The OTA release is still a draft');
  assertAssetMetadata(release, artifacts);
  return release;
}

module.exports = {
  contextFromEnvironment,
  ownership,
  releaseBody,
  assertOwnership,
  localArtifacts,
  reserve,
  upload,
  publish,
};
if (require.main === module) {
  try {
    const command = process.argv[2];
    if (!['reserve', 'upload', 'publish'].includes(command)) throw new Error('Use reserve, upload or publish');
    const context = contextFromEnvironment();
    const release = module.exports[command](context);
    process.stdout.write(
      `[ota-bundle-release] ${command} ${context.tag}: ${release.isDraft ? 'draft' : 'published'}\n`,
    );
  } catch (error) {
    process.stderr.write(`[ota-bundle-release] ${error.message}\n`);
    process.exitCode = 1;
  }
}
