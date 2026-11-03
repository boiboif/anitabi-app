import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const root = path.resolve(import.meta.dirname, '../..');
const workflow = (name) => yaml.load(fs.readFileSync(path.join(root, '.github/workflows', name), 'utf8'));

function commandPosition(steps, command, { last = false } = {}) {
  const matches = steps.flatMap((step, stepIndex) => {
    const offset = step.run?.indexOf(command) ?? -1;
    return offset < 0 ? [] : [{ step, stepIndex, offset }];
  });
  assert.ok(matches.length > 0, `Missing workflow command: ${command}`);
  return last ? matches.at(-1) : matches[0];
}

function assertBefore(left, right, message) {
  assert.ok(
    left.stepIndex < right.stepIndex || (left.stepIndex === right.stepIndex && left.offset < right.offset),
    message,
  );
}

test('OTA dispatch defaults to coordinated publication and preserves an explicit OTA-first option', () => {
  const caller = workflow('eas-update.yml');
  const mode = caller.on.workflow_dispatch.inputs.publication_mode;
  assert.equal(mode.type, 'choice');
  assert.equal(mode.default, 'coordinated');
  assert.deepEqual(mode.options, ['coordinated', 'ota-first']);
  assert.equal(caller.concurrency['cancel-in-progress'], false);
  assert.equal(caller.concurrency.queue, 'max');
  const steps = caller.jobs.publish.steps;
  const preflight = commandPosition(steps, 'scripts/ota-release.cjs preflight');
  const publish = commandPosition(steps, 'npx eas-cli@21.8.0');
  const capture = commandPosition(steps, 'scripts/ota-release.cjs capture');
  assertBefore(preflight, publish, 'Pending candidates must be checked before publishing another update');
  assertBefore(publish, capture, 'Capture must record the result of the successful publish');
  assert.equal(preflight.step.id, 'ota-preflight');
  assert.equal(publish.step.if, "steps.ota-preflight.outputs.resume != 'true'");
  assert.equal(capture.step.id, 'ota-release');
  assert.equal(capture.step.env.OTA_RESUME, '${{ steps.ota-preflight.outputs.resume }}');
  assert.match(capture.step.run, /capture\s+ota-update\.json/);
  assert.match(publish.step.run, /--json/);
  assert.match(publish.step.run, /--rollout-percentage/);
});

test('the exact published candidate identity is archived and passed to the reusable installer workflow', () => {
  const caller = workflow('eas-update.yml');
  const publishJob = caller.jobs.publish;
  const releaseOutput = Object.entries(publishJob.outputs).find(
    ([, expression]) => expression === '${{ steps.ota-release.outputs.release }}',
  );
  assert.ok(releaseOutput, 'Expose the captured candidate state rather than rediscovering it by latest update');
  const bundled = caller.jobs['bundled-release'];
  assert.equal(bundled.needs, 'publish');
  assert.equal(bundled.with.ota_release_json, '${{ needs.publish.outputs.' + releaseOutput[0] + ' }}');
  assert.equal(bundled.with.publication_mode, '${{ inputs.publication_mode }}');
  assert.equal(bundled.with.release_notes, '${{ inputs.message }}', 'Installer notes retain the user message');
  const artifact = publishJob.steps.find(
    (step) => step.uses?.startsWith('actions/upload-artifact@') && step.with?.name === 'ota-release-state',
  );
  assert.ok(artifact, 'Retain the candidate state for inspection and recovery');
  assert.equal(artifact.if, "always() && hashFiles('ota-update.json') != ''");
  assert.equal(artifact.with.overwrite, true, 'A retry can replace the same run artifact');
  assert.equal(artifact.with['if-no-files-found'], 'error');
  const mobile = workflow('mobile-release.yml');
  assert.equal(mobile.on.workflow_call.inputs.ota_release_json.type, 'string');
  assert.equal(mobile.on.workflow_call.inputs.ota_release_json.required, true);
  assert.equal(mobile.on.workflow_call.inputs.publication_mode.type, 'string');
  assert.equal(mobile.on.workflow_call.inputs.publication_mode.default, 'coordinated');
});

test('OTA installers reserve a private release before building and expose it only after both builds succeed', () => {
  const mobile = workflow('mobile-release.yml');
  const prepareSteps = mobile.jobs.prepare.steps;
  const verify = commandPosition(prepareSteps, 'scripts/ota-release.cjs verify');
  const reserve = commandPosition(prepareSteps, 'scripts/ota-bundle-release.cjs reserve');
  assertBefore(verify, reserve, 'Verify the candidate before reserving an installer release');
  assertBefore(
    commandPosition(prepareSteps, '--validate-notes'),
    reserve,
    'Invalid release notes must not reserve a release',
  );
  assert.equal(reserve.step.if, 'inputs.ota_bundle');
  assert.deepEqual(mobile.jobs.publish.needs, ['prepare', 'android', 'ios']);
  for (const name of ['prepare', 'android', 'ios']) {
    assert.ok(mobile.jobs.publish.if.includes(`needs.${name}.result == 'success'`));
  }
  const steps = mobile.jobs.publish.steps;
  const upload = commandPosition(steps, 'scripts/ota-bundle-release.cjs upload');
  const generate = commandPosition(steps, 'scripts/generate-release-manifest.cjs');
  const refresh = commandPosition(steps, 'scripts/release-state.cjs refresh-ota-upgrade');
  const expose = commandPosition(steps, 'scripts/ota-bundle-release.cjs publish');
  const promote = commandPosition(steps, 'scripts/ota-release.cjs promote');
  const finalRefresh = commandPosition(steps, 'scripts/release-state.cjs refresh-ota-upgrade', { last: true });
  const finalVerify = commandPosition(steps, 'scripts/ota-release.cjs verify', { last: true });
  const commit = commandPosition(steps, 'git commit');
  assertBefore(
    commandPosition(steps, 'sha256sum'),
    upload,
    'Calculate the APK checksum before uploading installer assets',
  );
  assertBefore(upload, generate, 'Generate manifests only after the installer assets have uploaded');
  assertBefore(generate, refresh, 'Refresh the upgrade feed from the newly generated installer manifest');
  assertBefore(refresh, expose, 'Prepare both manifests before exposing the draft release');
  assert.ok(
    steps.some(
      (step, index) =>
        index > refresh.stepIndex &&
        index < expose.stepIndex &&
        step.run?.includes('ota-release.cjs verify') &&
        step.run.includes('release-state.cjs check-ota-baseline'),
    ),
    'Recheck the candidate and current native baseline immediately before exposing installers',
  );
  assertBefore(expose, promote, 'The installer must be downloadable before the OTA candidate becomes public');
  assertBefore(promote, finalRefresh, 'Re-read the latest upgrade baseline after promotion');
  assertBefore(promote, finalVerify, 'Check public OTA identity after promotion');
  assertBefore(finalRefresh, commit, 'Commit only the refreshed upgrade and download manifests');
  assertBefore(finalVerify, commit, 'A failed final OTA verification must not advance either manifest');
  assertBefore(
    commit,
    commandPosition(steps, 'gh workflow run docs-pages.yml'),
    'Refresh the website after publication',
  );
});

function shellFixture(context) {
  const bash =
    process.platform === 'win32'
      ? path.join(process.env.ProgramFiles ?? 'C:/Program Files', 'Git/bin/bash.exe')
      : 'bash';
  if (process.platform === 'win32' && !fs.existsSync(bash)) {
    context.skip('Git Bash is required to execute the real GitHub Actions shell step on Windows');
    return null;
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'anitabi-ota-workflow-'));
  context.after(() => {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const bin = path.join(directory, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(
    path.join(bin, 'npx'),
    '#!/usr/bin/env bash\nprintf \'%s\\0\' "$@" > "$MOCK_NPX_ARGS"\nif [[ "$MOCK_PUBLISH_FAIL" == "true" ]]; then exit 41; fi\nprintf \'[]\\n\'\n',
    { mode: 0o755 },
  );
  fs.writeFileSync(
    path.join(bin, 'node'),
    `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$MOCK_NODE_COMMANDS"
if [[ "$2" == "preflight" ]]; then
  if [[ "$MOCK_PREFLIGHT_FAIL" == "true" ]]; then exit 42; fi
  printf 'resume=%s\\n' "$MOCK_RESUME" >> "$GITHUB_OUTPUT"
  if [[ "$MOCK_RESUME" == "true" ]]; then printf '[{"id":"original-candidate"}]\\n' > ota-update.json; fi
fi
if [[ "$2" == "capture" ]]; then
  test -s "$3"
  printf 'capture-resume=%s\\n' "\${OTA_RESUME:-unset}" >> "$MOCK_NODE_COMMANDS"
fi
`,
    { mode: 0o755 },
  );
  const env = {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    EXPO_UPDATE_CHANNEL: 'production',
    EAS_ENVIRONMENT: 'production',
    INPUT_MESSAGE: 'A candidate with spaces',
    GITHUB_RUN_ID: '12345678',
    GITHUB_OUTPUT: path.join(directory, 'github-output'),
    MOCK_NPX_ARGS: path.join(directory, 'npx-args'),
    MOCK_NODE_COMMANDS: path.join(directory, 'node-commands'),
    MOCK_PUBLISH_FAIL: 'false',
    MOCK_PREFLIGHT_FAIL: 'false',
    MOCK_RESUME: 'false',
  };
  return {
    run: (script, extraEnv) =>
      execFileSync(bash, ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script], {
        cwd: directory,
        env: { ...env, ...extraEnv },
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    args: () => fs.readFileSync(env.MOCK_NPX_ARGS, 'utf8').split('\0').filter(Boolean),
    published: () => fs.existsSync(env.MOCK_NPX_ARGS),
    commands: () => (fs.existsSync(env.MOCK_NODE_COMMANDS) ? fs.readFileSync(env.MOCK_NODE_COMMANDS, 'utf8') : ''),
    candidate: () => JSON.parse(fs.readFileSync(path.join(directory, 'ota-update.json'), 'utf8')),
  };
}

for (const mode of ['coordinated', 'ota-first']) {
  test(`the actual OTA publishing shell uses the intended initial exposure in ${mode} mode`, (context) => {
    const fixture = shellFixture(context);
    if (!fixture) return;
    const steps = workflow('eas-update.yml').jobs.publish.steps;
    const publish = commandPosition(steps, 'npx eas-cli@21.8.0');
    fixture.run(publish.step.run, { OTA_PUBLICATION_MODE: mode, PUBLICATION_MODE: mode });
    const args = fixture.args();
    assert.equal(args[0], 'eas-cli@21.8.0');
    assert.equal(args[1], 'update');
    assert.ok(args.includes('--json'));
    assert.equal(args[args.indexOf('--channel') + 1], 'production');
    assert.equal(
      args[args.indexOf('--message') + 1],
      `A candidate with spaces\n\n<!-- anitabi-ota-run: 12345678; mode: ${mode} -->`,
    );
    const rolloutIndex = args.indexOf('--rollout-percentage');
    if (mode === 'coordinated') {
      assert.ok(rolloutIndex >= 0);
      assert.equal(args[rolloutIndex + 1], '0');
    } else {
      assert.equal(rolloutIndex, -1);
    }
  });
}

for (const mode of ['coordinated', 'ota-first']) {
  test(`a same-run ${mode} retry captures the recovered candidate without another EAS publish`, (context) => {
    const fixture = shellFixture(context);
    if (!fixture) return;
    const steps = workflow('eas-update.yml').jobs.publish.steps;
    const preflight = commandPosition(steps, 'scripts/ota-release.cjs preflight');
    const publish = commandPosition(steps, 'npx eas-cli@21.8.0');
    const capture = commandPosition(steps, 'scripts/ota-release.cjs capture');
    // Exercise the actual shell steps using the exact output and condition wired
    // above; the node substitute stands in for the independently tested API guard.
    const script = `${preflight.step.run}
while IFS='=' read -r key value; do
  if [[ "$key" == "resume" ]]; then export OTA_RESUME="$value"; fi
done < "$GITHUB_OUTPUT"
if [[ "$OTA_RESUME" != "true" ]]; then
${publish.step.run}
fi
${capture.step.run}`;
    fixture.run(script, { PUBLICATION_MODE: mode, MOCK_RESUME: 'true' });
    assert.equal(fixture.published(), false, 'Resuming must preserve the update IDs and creation time');
    assert.deepEqual(fixture.candidate(), [{ id: 'original-candidate' }]);
    assert.match(fixture.commands(), /ota-release\.cjs capture ota-update\.json/);
    assert.match(fixture.commands(), /capture-resume=true/);
  });
}

test('reserved OTA and installer metadata in the message is rejected before uploading any candidate', (context) => {
  const fixture = shellFixture(context);
  if (!fixture) return;
  const publish = commandPosition(workflow('eas-update.yml').jobs.publish.steps, 'npx eas-cli@21.8.0');
  for (const marker of [
    '<!-- anitabi-ota-run: 12345678; mode: coordinated -->',
    '<!--\tanitabi-ota-release: {} -->',
    '<!--\n  anitabi-build-number: 1030 -->',
  ]) {
    assert.throws(() =>
      fixture.run(publish.step.run, {
        PUBLICATION_MODE: 'coordinated',
        INPUT_MESSAGE: `Normal release notes\n${marker}`,
      }),
    );
    assert.equal(fixture.published(), false, 'Invalid notes must not strand a zero-percent candidate');
  }
});

test('an unfinished candidate detected by preflight prevents another OTA from being published', (context) => {
  const fixture = shellFixture(context);
  if (!fixture) return;
  const steps = workflow('eas-update.yml').jobs.publish.steps;
  const preflight = commandPosition(steps, 'scripts/ota-release.cjs preflight');
  const capture = commandPosition(steps, 'scripts/ota-release.cjs capture');
  const script = steps
    .slice(preflight.stepIndex, capture.stepIndex + 1)
    .map((step) => step.run)
    .filter(Boolean)
    .join('\n');
  assert.throws(() => fixture.run(script, { PUBLICATION_MODE: 'ota-first', MOCK_PREFLIGHT_FAIL: 'true' }));
  assert.equal(fixture.published(), false, 'Even OTA-first publication must respect the pending-candidate guard');
  assert.doesNotMatch(fixture.commands(), /ota-release\.cjs capture/);
});

test('a failed EAS publish cannot be captured as a successful candidate', (context) => {
  const fixture = shellFixture(context);
  if (!fixture) return;
  const steps = workflow('eas-update.yml').jobs.publish.steps;
  const publish = commandPosition(steps, 'npx eas-cli@21.8.0');
  const capture = commandPosition(steps, 'scripts/ota-release.cjs capture');
  const script = steps
    .slice(publish.stepIndex, capture.stepIndex + 1)
    .map((step) => step.run)
    .filter(Boolean)
    .join('\n');
  assert.throws(() =>
    fixture.run(script, {
      OTA_PUBLICATION_MODE: 'coordinated',
      PUBLICATION_MODE: 'coordinated',
      MOCK_PUBLISH_FAIL: 'true',
    }),
  );
  assert.doesNotMatch(fixture.commands(), /ota-release\.cjs capture/);
});
