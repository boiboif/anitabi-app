import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const phases = [
  ['base', 'Install/start A; its version shows A contentRevision and the BASE bundle marker.'],
  ['ota1-ready', 'Publish OTA1, check updates on A; only the restart prompt appears.'],
  ['ota1-applied', 'Restart A into OTA1; its displayed content version and OTA_ONE marker match B.'],
  ['same-update', 'Check OTA1 again; no new restart or full-package prompt.'],
  ['bundled-old', 'Publish B in the download catalog; A stays on OTA1 without a package prompt.'],
  ['bundled-new', 'Fresh-install B; its embedded code is newer than OTA1 and no restart prompt appears.'],
  ['ota2-ready-old', 'Publish OTA2 and check A; A downloads it and offers a restart.'],
  ['ota2-applied-old', 'Restart A into OTA2; native A build is retained, content version is OTA2 and marker is NEXT.'],
  ['ota2-ready-new', 'Check B against OTA2; B also offers a restart.'],
  ['ota2-applied-new', 'Restart B into OTA2; native B build is retained, content version is OTA2 and marker is NEXT.'],
  ['runtime-mismatch', 'Offer a mismatching runtime; the local server returns 204 and no prompt appears.'],
  ['channel-mismatch', 'Offer a different channel; the local server returns 204 and no prompt appears.'],
  ['manifest-error', 'Inject manifest HTTP 503; installed code still runs and no restart prompt appears.'],
  ['asset-interruption', 'Interrupt an OTA download; verify it is not marked ready.'],
  [
    'asset-corruption',
    'Download C with a full-length one-byte corruption; reject its hash and keep OTA1 content without a restart prompt.',
  ],
  ['asset-retry', 'Clear the failure and check again; a complete asset is downloaded before restart is offered.'],
];

export function expectedPhase(phase, fixture) {
  assert.ok(
    phases.some(([name]) => name === phase),
    `Unknown phase: ${phase}`,
  );
  const newInstall = ['bundled-new', 'ota2-ready-new', 'ota2-applied-new'].includes(phase);
  const native = newInstall ? fixture.bundled : fixture.base;
  if (
    phase.startsWith('ota2-') ||
    phase === 'asset-retry' ||
    phase === 'asset-interruption' ||
    phase === 'asset-corruption'
  ) {
    assert.ok(fixture.updates.ota2, 'Load a distinct exported OTA2 bundle before checking this phase');
  }
  let updateId = native.embeddedId;
  let embedded = true;
  if (
    [
      'ota1-applied',
      'same-update',
      'bundled-old',
      'ota2-ready-old',
      'asset-retry',
      'runtime-mismatch',
      'channel-mismatch',
      'manifest-error',
      'asset-interruption',
      'asset-corruption',
    ].includes(phase)
  ) {
    updateId = fixture.updates.ota1.id;
    embedded = false;
  }
  if (phase.startsWith('ota2-applied-')) {
    updateId = fixture.updates.ota2.id;
    embedded = false;
  }
  const ready = phase.includes('-ready') || phase === 'asset-retry';
  const content = embedded
    ? native
    : updateId === fixture.updates.ota1.id
      ? fixture.updates.ota1
      : fixture.updates.ota2;
  assert.ok(content?.contentRevision, 'The fixture did not provide the expected contentRevision');
  return {
    native,
    updateId,
    embedded,
    ready,
    contentRevision: content.contentRevision,
    bundleMarker: content.bundleMarker,
    displayVersion: `${native.version}-${content.contentRevision.slice(0, 8)}`,
  };
}

export function verifyPhase(phase, fixture, reports, events) {
  const expected = expectedPhase(phase, fixture);
  const report = reports
    .filter(
      (entry) =>
        entry.data?.packageName === expected.native.packageName &&
        Number(entry.data?.nativeBuildVersion ?? entry.data?.nativeBuildNumber) === expected.native.buildNumber,
    )
    .at(-1)?.data;
  assert.ok(report, 'No fresh test-app report arrived; enable the test-only POST /reports probe');
  assert.equal(report.isChecking, false, 'Wait until the update check finishes');
  assert.equal(report.runtimeVersion, fixture.runtimeVersion);
  assert.equal(
    report.binaryUpdateBuildNumber ?? report.binaryUpdate?.buildNumber ?? null,
    null,
    'A bundled OTA release must not appear as a native-package upgrade',
  );
  assert.equal(Boolean(report.hotUpdateReady), expected.ready, 'Unexpected restart prompt state');
  assert.equal(Number(report.nativeBuildVersion ?? report.nativeBuildNumber), expected.native.buildNumber);
  assert.equal(report.nativeApplicationVersion, expected.native.version);
  assert.equal(report.updateId, expected.updateId);
  assert.equal(report.isEmbeddedLaunch, expected.embedded);
  assert.equal(report.displayVersion, expected.displayVersion);
  assert.equal(
    report.contentRevision,
    expected.contentRevision,
    'Loaded content revision differs from the expected content',
  );
  assert.equal(report.bundleMarker, expected.bundleMarker, 'The actual loaded JavaScript bundle marker is incorrect');
  if (phase !== 'base')
    assert.ok(
      events.some((event) => event.kind === 'manifest'),
      'No fresh native Expo Updates request was observed',
    );
  if (expected.ready) {
    const offeredId = phase === 'ota1-ready' ? fixture.updates.ota1.id : fixture.updates.ota2.id;
    assert.ok(
      events.some((event) => event.kind === 'manifest' && event.status === 200 && event.updateId === offeredId),
      'The expected next update was not offered by the native update endpoint',
    );
  }
  if (
    phase.endsWith('-applied-old') ||
    phase.endsWith('-applied-new') ||
    phase === 'ota1-applied' ||
    phase === 'same-update' ||
    phase === 'bundled-old' ||
    phase === 'bundled-new'
  ) {
    assert.ok(
      events.some((event) => event.kind === 'manifest' && event.currentId === expected.updateId),
      'The native request did not confirm the expected launched update',
    );
  }
  if (phase === 'runtime-mismatch' || phase === 'channel-mismatch')
    assert.ok(events.some((event) => event.kind === 'manifest' && event.status === 204));
  if (phase === 'manifest-error') assert.ok(events.some((event) => event.kind === 'manifest' && event.status === 503));
  if (phase === 'asset-interruption')
    assert.ok(events.some((event) => event.kind === 'asset' && event.status === 'interrupted'));
  if (phase === 'asset-corruption') {
    assert.ok(
      events.some(
        (event) => event.kind === 'manifest' && event.status === 200 && event.updateId === fixture.updates.ota2.id,
      ),
      'The native endpoint did not offer C for the integrity check',
    );
    assert.ok(
      events.some(
        (event) =>
          event.kind === 'asset' &&
          event.status === 200 &&
          event.key === `bundle-${fixture.updates.ota2.id}` &&
          event.corrupted === true &&
          event.declaredHash === fixture.updates.ota2.launchHash &&
          event.servedHash !== event.declaredHash,
      ),
      'The server did not finish a corrupt C launch-asset response with its original declared hash',
    );
  }
  if (phase === 'asset-retry')
    assert.ok(
      events.some(
        (event) =>
          event.kind === 'asset' && event.status === 200 && event.key.startsWith('bundle-') && event.corrupted !== true,
      ),
      'Retry did not finish a launch asset download',
    );
  return {
    phase,
    expectedDisplayVersion: expected.displayVersion,
    report,
    events,
  };
}

export function xmlTexts(xml) {
  const decode = (value) =>
    value
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  return [...xml.matchAll(/\btext="([^"]*)"/g)].map((match) => decode(match[1])).filter(Boolean);
}

async function main() {
  const options = {
    server: 'http://127.0.0.1:18790',
    after: 0,
    waitMs: 15000,
    output: '.tmp/ota-validation',
    surface: 'profile',
  };
  const names = {
    '--server': 'server',
    '--check': 'check',
    '--after': 'after',
    '--serial': 'serial',
    '--package': 'packageName',
    '--surface': 'surface',
    '--output': 'output',
    '--wait-ms': 'waitMs',
    '--scenario': 'scenario',
    '--fault': 'fault',
  };
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--plan' || args[index] === '--list') continue;
    assert.ok(args[index] in names && args[index + 1], `Unknown or incomplete option: ${args[index]}`);
    const name = names[args[index]];
    const value = args[++index];
    options[name] = ['after', 'waitMs'].includes(name) ? Number(value) : value;
  }
  if (!options.check && !options.scenario) {
    console.log(
      JSON.stringify(
        {
          mode: 'plan',
          operations:
            'This script never builds, installs, starts or clears an app. Set scenarios, perform the listed app actions, then assert fresh reports; --serial additionally captures the current UI.',
          requirements: [
            'Run the failure phases on A while it is still on OTA1, before OTA2 has been downloaded or cached.',
            'Install A and B as separate isolated test packages. Select the correct package/report for each phase.',
            'Both Profile and About should be captured with --surface profile/about after navigating to that screen.',
            'Supply --ota2-export with an inspected SDK 58 export. OTA2 bundle bytes must differ from B; the runtime probe must report NEXT.',
          ],
          expectedProbe: {
            updateId: 'Expo Updates current UUID',
            isEmbeddedLaunch: true,
            runtimeVersion: '0.8.0-sdk58',
            nativeBuildVersion: 'A/B versionCode as string',
            packageName: 'Native Application.applicationId (A/B use separate test packages)',
            nativeApplicationVersion: '0.8.0',
            displayVersion: 'getCurrentAppDisplayVersion()',
            contentRevision: 'A:a1111111, B/OTA1:b2222222, OTA2:c3333333',
            bundleMarker: 'A:BASE, B/OTA1:OTA_ONE, OTA2:NEXT',
            hotUpdateReady: false,
            binaryUpdateBuildNumber: null,
            isChecking: false,
          },
          cases: phases.map(([phase, action]) => ({ phase, action })),
          usage: [
            'node scripts/verify-ota-device.mjs --scenario ota1',
            'After performing the action, use the returned sequence to avoid stale evidence:',
            'node scripts/verify-ota-device.mjs --check ota1-ready --after <sequence> --serial <serial> --surface profile',
          ],
        },
        null,
        2,
      ),
    );
    return;
  }
  assert.ok(Number.isInteger(options.after) && options.after >= 0);
  assert.ok(Number.isInteger(options.waitMs) && options.waitMs >= 0 && options.waitMs <= 60000);
  const baseUrl = new URL(options.server);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(baseUrl.hostname), 'Only use a local validation server');
  const get = async (endpoint) => {
    const response = await fetch(new URL(endpoint, baseUrl));
    assert.equal(response.status, 200);
    return response.json();
  };
  const fixture = await get('/admin/state');
  if (options.scenario) {
    const state = {
      scenario: options.scenario,
      activeChannel: fixture.channel,
      activeRuntime: fixture.runtimeVersion,
      manifestFailures: 0,
      assetFailures: 0,
      assetInterruptions: 0,
      assetCorruptions: 0,
      assetDelayMs: 0,
    };
    if (options.fault === 'manifest-error') state.manifestFailures = 1;
    else if (options.fault === 'asset-interruption') state.assetInterruptions = 10;
    else if (options.fault === 'asset-corruption') state.assetCorruptions = 10;
    else if (options.fault === 'runtime-mismatch') state.activeRuntime += '-incompatible';
    else if (options.fault === 'channel-mismatch') state.activeChannel += '-other';
    else assert.ok(!options.fault, 'Unknown fault');
    const response = await fetch(new URL('/admin/state', baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    assert.equal(response.status, 200);
    console.log(JSON.stringify(await response.json(), null, 2));
    if (!options.check) return;
  }
  const deadline = Date.now() + options.waitMs;
  let result;
  let lastError;
  do {
    const [reports, events] = await Promise.all([
      get(`/admin/reports?after=${options.after}`),
      get(`/admin/events?after=${options.after}`),
    ]);
    try {
      result = verifyPhase(options.check, fixture, reports, events);
      break;
    } catch (error) {
      lastError = error;
    }
    if (Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 400));
  } while (Date.now() < deadline);
  assert.ok(result, lastError?.message ?? 'Phase verification failed');
  const output = path.resolve(options.output);
  await mkdir(output, { recursive: true });
  const label = `${options.check}-${options.surface}`;
  if (options.serial) {
    const adb = async (args, encoding = 'utf8') =>
      (await execFileAsync('adb', ['-s', options.serial, ...args], { encoding, maxBuffer: 32 * 1024 * 1024 })).stdout;
    const packageName = options.packageName ?? expectedPhase(options.check, fixture).native.packageName;
    assert.ok(packageName.includes('.test'), 'UI validation must target an isolated test package');
    const packageInfo = await adb(['shell', 'dumpsys', 'package', packageName]);
    assert.match(packageInfo, /versionCode=\d+/, 'The test package is not installed');
    await adb(['shell', 'uiautomator', 'dump', '/sdcard/anitabi-ota-validation.xml']);
    const xml = await adb(['exec-out', 'cat', '/sdcard/anitabi-ota-validation.xml']);
    await writeFile(path.join(output, `${label}.xml`), xml);
    const screenshot = await adb(['exec-out', 'screencap', '-p'], null);
    await writeFile(path.join(output, `${label}.png`), screenshot);
    result.uiTexts = xmlTexts(xml);
    assert.ok(
      result.uiTexts.some(
        (text) => text === result.expectedDisplayVersion || text === `v${result.expectedDisplayVersion}`,
      ),
      'Navigate to Profile/About so the exact expected version is visible before taking evidence',
    );
  }
  await writeFile(path.join(output, `${label}.json`), `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        phase: options.check,
        passed: true,
        displayVersion: result.expectedDisplayVersion,
        evidence: path.join(output, `${label}.json`),
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
