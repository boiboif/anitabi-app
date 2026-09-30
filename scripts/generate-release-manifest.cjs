#!/usr/bin/env node

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const defaultOutputPath = path.join(projectRoot, 'docs', 'releases', 'latest.json');
const releaseNotesDirectory = path.join(projectRoot, 'release-notes');

function printHelp() {
  console.log(`Generate the GitHub APK update manifest.

Usage:
  yarn release:manifest --notes "Fix map loading"
  yarn release:manifest --notes-file ./release-notes.md --mandatory
  yarn release:manifest --from-github

Options:
  --version <x.y.z>                 App version; defaults to app.config.ts
  --build-number <number>            Android versionCode
  --tag <tag>                       GitHub tag; defaults to v<version>
  --title <text>                    Dialog title
  --notes <text>                    In-app release notes text (overrides GitHub body)
  --notes-file <path>               Read in-app notes from a UTF-8 file (overrides GitHub body)
  --validate-notes                  Validate release note metadata without creating a manifest
  --from-github                     Read title, notes and APK asset from GitHub Release
  --repo <owner/name>               GitHub repository; defaults to GH_REPO or git origin
  --asset-name <filename.apk>       APK asset name
  --mandatory                       Make the update mandatory
  --min-supported-version <x.y.z>   Versions below this are forced to update
  --min-supported-build-number <n>  Build numbers below this are forced to update
  --output <path>                   Output path; defaults to docs/releases/latest.json
  --dry-run                         Print JSON without writing a file
  --help                            Show this help
`);
}

function parseArgs(argv) {
  const options = { mandatory: false, fromGithub: false, dryRun: false, validateNotes: false };
  const valueOptions = new Set([
    'version',
    'build-number',
    'tag',
    'title',
    'notes',
    'notes-file',
    'repo',
    'asset-name',
    'min-supported-version',
    'min-supported-build-number',
    'output',
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) throw new Error(`Unknown argument: ${argument}`);

    const name = argument.slice(2);
    if (name === 'mandatory') options.mandatory = true;
    else if (name === 'from-github') options.fromGithub = true;
    else if (name === 'dry-run') options.dryRun = true;
    else if (name === 'validate-notes') options.validateNotes = true;
    else if (name === 'help') options.help = true;
    else if (valueOptions.has(name)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for --${name}`);
      options[toCamelCase(name)] = value;
      index += 1;
    } else {
      throw new Error(`Unknown option: --${name}`);
    }
  }

  return options;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function readAppVersion() {
  const configPath = path.join(projectRoot, 'app.config.ts');
  const configContent = fs.readFileSync(configPath, 'utf8');
  const match = configContent.match(/const appVersion\s*=\s*'([^']+)'/);
  if (!match) throw new Error('Could not read version from app.config.ts');
  return match[1];
}

function assertVersion(value, optionName) {
  if (!/^\d+\.\d+\.\d+$/.test(value)) {
    throw new Error(`${optionName} must use x.y.z format: ${value}`);
  }
}

function assertBuildNumber(value, optionName) {
  if (!/^\d+$/.test(String(value)) || Number(value) < 1) {
    throw new Error(`${optionName} must be a positive integer: ${value}`);
  }
}

function resolveRepo(explicitRepo) {
  if (explicitRepo) return normalizeRepo(explicitRepo);
  if (process.env.GH_REPO) return normalizeRepo(process.env.GH_REPO);

  try {
    const origin = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return normalizeRepo(origin);
  } catch {
    throw new Error('Could not resolve GitHub repo. Pass --repo owner/name or set GH_REPO.');
  }
}

function normalizeRepo(value) {
  const normalized = value
    .trim()
    .replace(/^git@github\.com:/, '')
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\.git$/, '')
    .replace(/^\/+|\/+$/g, '');

  if (!/^[^/\s]+\/[^/\s]+$/.test(normalized)) {
    throw new Error(`Invalid GitHub repo: ${value}`);
  }
  return normalized;
}

function readReleaseFromGithub(tag, repo, preferredAssetName) {
  let output;
  try {
    output = execFileSync('gh', ['release', 'view', tag, '--repo', repo, '--json', 'name,body,url,assets'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    });
  } catch {
    throw new Error(`Could not read GitHub Release ${tag}. Check gh auth and confirm the Release exists.`);
  }

  const release = JSON.parse(output);
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const apkAsset = preferredAssetName
    ? assets.find((asset) => asset.name === preferredAssetName)
    : assets.find((asset) => typeof asset.name === 'string' && asset.name.endsWith('.apk'));

  if (!apkAsset?.url) {
    throw new Error(
      preferredAssetName
        ? `GitHub Release ${tag} has no asset named ${preferredAssetName}`
        : `GitHub Release ${tag} has no APK asset`,
    );
  }

  return {
    title: release.name || tag,
    releaseNotes: release.body?.trim() || `Anitabi ${tag}`,
    releaseUrl: release.url,
    apkUrl: `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(apkAsset.name)}`,
    fileName: apkAsset.name,
  };
}

function compareVersions(left, right) {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

function readImportance(tag) {
  const exactPath = path.join(releaseNotesDirectory, `${tag}.meta.json`);
  const previewPath = path.join(releaseNotesDirectory, `${tag.replace(/-preview\.\d+$/, '-preview')}.meta.json`);
  const metadataPath = fs.existsSync(exactPath) ? exactPath : previewPath;
  if (!fs.existsSync(metadataPath)) return 'normal';
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  if (metadata?.importance !== 'major' && metadata?.importance !== 'normal') {
    throw new Error(`${metadataPath}: importance must be "major" or "normal"`);
  }
  return metadata.importance;
}

function buildReleaseNotesHistory(tag, version, currentNotes, buildNumber) {
  const currentEntry = {
    version,
    displayVersion: tag.replace(/^v/, ''),
    notes: currentNotes,
    importance: readImportance(tag),
  };
  if (buildNumber) currentEntry.buildNumber = Number(buildNumber);

  // Preview build numbers and tags have a separate lifecycle from production.
  if (tag !== `v${version}`) return [currentEntry];

  const previousEntries = fs.existsSync(releaseNotesDirectory)
    ? fs
        .readdirSync(releaseNotesDirectory)
        .filter((name) => /^v\d+\.\d+\.\d+-app\.txt$/.test(name))
        .map((name) => {
          const entryVersion = name.slice(1, -'-app.txt'.length);
          if (compareVersions(entryVersion, version) >= 0) return null;
          const notes = fs.readFileSync(path.join(releaseNotesDirectory, name), 'utf8').trim();
          if (!notes) throw new Error(`${name} is empty`);
          return {
            version: entryVersion,
            displayVersion: entryVersion,
            notes,
            importance: readImportance(`v${entryVersion}`),
          };
        })
        .filter(Boolean)
    : [];

  return [...previousEntries, currentEntry].sort((left, right) => compareVersions(left.version, right.version));
}

function readLegacyReleaseNotes(tag, currentNotes) {
  const exactPath = path.join(releaseNotesDirectory, `${tag}-upgrade.txt`);
  const previewPath = path.join(releaseNotesDirectory, `${tag.replace(/-preview\.\d+$/, '-preview')}-upgrade.txt`);
  const notesPath = fs.existsSync(exactPath) ? exactPath : previewPath;
  if (!fs.existsSync(notesPath)) return currentNotes;
  const notes = fs.readFileSync(notesPath, 'utf8').trim();
  if (!notes) throw new Error(`${notesPath} is empty`);
  return notes;
}

function buildManifest(options) {
  const version = options.version ?? readAppVersion();
  assertVersion(version, '--version');
  if (options.minSupportedVersion) {
    assertVersion(options.minSupportedVersion, '--min-supported-version');
  }
  if (options.buildNumber) assertBuildNumber(options.buildNumber, '--build-number');
  if (options.minSupportedBuildNumber) {
    assertBuildNumber(options.minSupportedBuildNumber, '--min-supported-build-number');
  }

  const repo = resolveRepo(options.repo);
  const tag = options.tag ?? `v${version}`;
  const defaultAssetName = options.assetName ?? `anitabi-app-${tag}-android.apk`;
  const overrideNotes = options.notesFile
    ? fs.readFileSync(path.resolve(projectRoot, options.notesFile), 'utf8').trim()
    : options.notes?.trim();
  if (options.notesFile && !overrideNotes) {
    throw new Error(`--notes-file is empty: ${options.notesFile}`);
  }
  let releaseData;

  if (options.fromGithub) {
    releaseData = readReleaseFromGithub(tag, repo, options.assetName);
    if (overrideNotes) releaseData.releaseNotes = overrideNotes;
  } else {
    if (!overrideNotes) {
      throw new Error('Pass --notes, --notes-file, or --from-github to provide release notes.');
    }

    releaseData = {
      title: options.title ?? `Anitabi ${tag}`,
      releaseNotes: overrideNotes,
      releaseUrl: `https://github.com/${repo}/releases/tag/${encodeURIComponent(tag)}`,
      apkUrl: `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(defaultAssetName)}`,
      fileName: defaultAssetName,
    };
  }

  const releaseNotesHistory = buildReleaseNotesHistory(tag, version, releaseData.releaseNotes, options.buildNumber);
  const manifest = {
    version,
    displayVersion: tag.replace(/^v/, ''),
    title: options.title ?? releaseData.title,
    releaseNotes: readLegacyReleaseNotes(tag, releaseData.releaseNotes),
    releaseNotesHistory,
    apkUrl: releaseData.apkUrl,
    releaseUrl: releaseData.releaseUrl,
    mandatory: options.mandatory,
  };

  if (options.minSupportedVersion) manifest.minSupportedVersion = options.minSupportedVersion;
  if (options.buildNumber) manifest.buildNumber = Number(options.buildNumber);
  if (options.minSupportedBuildNumber) {
    manifest.minSupportedBuildNumber = Number(options.minSupportedBuildNumber);
  }
  manifest.fileName = releaseData.fileName;
  return manifest;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      return;
    }

    if (options.validateNotes) {
      const version = options.version ?? readAppVersion();
      assertVersion(version, '--version');
      const tag = options.tag ?? `v${version}`;
      const exactNotesPath = path.join(releaseNotesDirectory, `${tag}-app.txt`);
      const previewNotesPath = path.join(releaseNotesDirectory, `${tag.replace(/-preview\.\d+$/, '-preview')}-app.txt`);
      const appNotesPath = fs.existsSync(exactNotesPath) ? exactNotesPath : previewNotesPath;
      const notes = fs.existsSync(appNotesPath)
        ? fs.readFileSync(appNotesPath, 'utf8').trim()
        : 'Release notes fallback';
      if (!notes) throw new Error(`${appNotesPath} is empty`);
      buildReleaseNotesHistory(tag, version, notes);
      readLegacyReleaseNotes(tag, notes);
      console.log(`[release:manifest] Release note metadata is valid for ${tag}`);
      return;
    }

    const manifest = buildManifest(options);
    const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

    if (options.dryRun) {
      process.stdout.write(serialized);
      return;
    }

    const outputPath = options.output ? path.resolve(projectRoot, options.output) : defaultOutputPath;
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, serialized, 'utf8');
    console.log(`[release:manifest] Wrote ${path.relative(projectRoot, outputPath)}`);
  } catch (error) {
    console.error(`[release:manifest] ${error.message}`);
    console.error('Run yarn release:manifest --help for usage.');
    process.exitCode = 1;
  }
}

main();
