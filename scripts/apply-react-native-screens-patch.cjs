/* global __dirname */
const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const patchFile = path.join(projectRoot, 'patches', 'react-native-screens+4.30.0.patch');
const packageFile = path.join(projectRoot, 'node_modules', 'react-native-screens', 'package.json');

function gitApply(...args) {
  const result = spawnSync('git', ['apply', ...args, '--', patchFile], {
    cwd: projectRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  return result;
}

try {
  const { version } = JSON.parse(readFileSync(packageFile, 'utf8'));
  if (version !== '4.30.0') {
    throw new Error(
      `Expected react-native-screens 4.30.0, found ${version}. Review the native patch before upgrading.`,
    );
  }

  // Check the complete patch before writing any of its three Kotlin files.
  const check = gitApply('--check');
  if (check.status === 0) {
    const applied = gitApply();
    if (applied.status !== 0) throw new Error(applied.stderr || 'git apply failed');
    console.log('[screens-patch] Applied Android header removal fix (upstream PR #3777).');
  } else if (gitApply('--reverse', '--check').status === 0) {
    console.log('[screens-patch] Android header removal fix is already applied.');
  } else {
    throw new Error(`Cannot apply the Android header removal patch:\n${check.stderr}`);
  }
} catch (error) {
  console.error(`[screens-patch] ${error.message}`);
  process.exitCode = 1;
}
