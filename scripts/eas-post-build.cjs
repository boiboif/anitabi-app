#!/usr/bin/env node
// EAS Build 成功后自动创建 GitHub Release
// 按 Expo 官方文档推荐使用 eas-build-on-success npm hook

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const profile = process.env.EAS_BUILD_PROFILE;
const fullHash = process.env.EAS_BUILD_GIT_COMMIT_HASH || '';
const shortHash = fullHash.slice(0, 7);
const platform = process.env.EAS_BUILD_PLATFORM;
const repo = process.env.GH_REPO;

// development 跳过
if (!profile || profile === 'development') {
  console.log(`[eas-post-build] profile=${profile} → 跳过`);
  process.exit(0);
}

// 从 app.config.ts 读取 version
const configPath = path.join(__dirname, '..', 'app.config.ts');
const configContent = fs.readFileSync(configPath, 'utf8');
const match = configContent.match(/version:\s*'([^']+)'/);
const version = match ? match[1] : '1.0.0';

const isPreview = profile === 'preview';
const tag = isPreview ? `v${version}-preview+${shortHash}` : `v${version}`;

console.log(
  `[eas-post-build] profile=${profile}, platform=${platform}, version=${version}, tag=${tag}${repo ? `, repo=${repo}` : ''}`,
);

// 查找构建产物
function findArtifact() {
  const buildDir = path.join(__dirname, '..');
  if (platform === 'android') {
    const apk = path.join(buildDir, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
    if (fs.existsSync(apk)) return { filepath: apk, ext: 'apk' };
    const aab = path.join(buildDir, 'android', 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
    if (fs.existsSync(aab)) return { filepath: aab, ext: 'aab' };
  }
  return null;
}

const artifact = findArtifact();
const displayName = artifact ? `anitabi-app-${tag}-${platform}.${artifact.ext}` : null;

const args = ['gh release create', tag];

if (artifact) {
  args.push(`${artifact.filepath}#${displayName}`);
}

args.push(
  '--title',
  isPreview ? `"v${version}-preview+${shortHash}"` : `"v${version}"`,
  '--target',
  fullHash,
  '--generate-notes',
);

if (repo) {
  args.push('--repo', repo);
}

if (isPreview) {
  args.push('--prerelease');
}

console.log(`[eas-post-build] running: ${args.join(' ')}`);
execSync(args.join(' '), { stdio: 'inherit' });
