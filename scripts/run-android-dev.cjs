const { spawnSync } = require('node:child_process');
const path = require('node:path');

const projectRoot = path.resolve(process.cwd());
const expoCli = path.join(projectRoot, 'node_modules', 'expo', 'bin', 'cli');
const environment = {
  ...process.env,
  APP_VARIANT: 'development',
  EXPO_UPDATE_CHANNEL: 'development',
};

function runExpo(args) {
  const result = spawnSync(process.execPath, [expoCli, ...args], {
    cwd: projectRoot,
    env: environment,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

runExpo(['prebuild', '--no-clean', '--platform', 'android', '--no-install']);
runExpo(['run:android', ...process.argv.slice(2)]);
