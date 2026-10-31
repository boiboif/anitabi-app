import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

// Local protocol fixture, not a publisher. The launch bundle is copied byte for byte
// from a native-compatible APK; no Metro export, native build or online OTA is run.
const mimeTypes = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  ttf: 'font/ttf',
  otf: 'font/otf',
  json: 'application/json',
};
const scales = { ldpi: 0.75, mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('base64url');

export function parseResourceDump(text) {
  const result = new Map();
  let name;
  for (const line of text.split(/\r?\n/)) {
    const resource = /^\s*resource 0x[\da-f]+ (\S+)/i.exec(line);
    if (resource) name = resource[1];
    const entry = /^\s*\(([^)]*)\) \(file\) (\S+)/.exec(line);
    if (name && entry) {
      const density = entry[1].split('-').find((part) => part in scales);
      const entries = result.get(name) ?? [];
      entries.push({ scale: scales[density] ?? 1, file: entry[2] });
      result.set(name, entries);
    }
  }
  return result;
}

export function findAapt2(explicitPath) {
  if (explicitPath) return explicitPath;
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  assert.ok(sdk, 'Set ANDROID_HOME or supply --aapt2 to inspect APK resources');
  const tools = path.join(sdk, 'build-tools');
  const versions = fs.readdirSync(tools).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const executable = versions
    .map((version) => path.join(tools, version, process.platform === 'win32' ? 'aapt2.exe' : 'aapt2'))
    .find((file) => fs.existsSync(file));
  assert.ok(executable, 'aapt2 was not found in Android SDK build-tools');
  return executable;
}

export function readApk(apk, { aapt2 } = {}) {
  const executable = findAapt2(aapt2);
  const bytes = fs.readFileSync(apk);
  const files = unzipSync(bytes, {
    filter: (entry) =>
      entry.name.startsWith('res/') ||
      ['assets/app.config', 'assets/app.manifest', 'assets/index.android.bundle'].includes(entry.name),
  });
  for (const name of ['assets/app.config', 'assets/app.manifest', 'assets/index.android.bundle'])
    assert.ok(files[name], `APK is missing ${name}`);
  const embedded = JSON.parse(Buffer.from(files['assets/app.manifest']).toString('utf8'));
  const config = JSON.parse(Buffer.from(files['assets/app.config']).toString('utf8'));
  const dump = execFileSync(executable, ['dump', 'resources', apk], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const badging = execFileSync(executable, ['dump', 'badging', apk], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const native = /package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/.exec(badging);
  assert.ok(native, 'Cannot read native package/versionCode/versionName from APK');
  const resources = parseResourceDump(dump);
  const assets = new Map();
  for (const asset of embedded.assets) {
    if (assets.has(asset.packagerHash)) continue;
    const candidates = resources.get(`${asset.resourcesFolder}/${asset.resourcesFilename}`) ?? [];
    const resource =
      candidates.find((item) => item.scale === (asset.scale ?? 1)) ?? (candidates.length === 1 ? candidates[0] : null);
    assert.ok(
      resource && files[resource.file],
      `Cannot resolve embedded asset ${asset.resourcesFilename}@${asset.scale}`,
    );
    const data = Buffer.from(files[resource.file]);
    assets.set(asset.packagerHash, {
      key: asset.packagerHash,
      hash: hash(data),
      contentType: mimeTypes[asset.type] ?? 'application/octet-stream',
      fileExtension: `.${asset.type}`,
      bytes: data,
    });
  }
  return {
    path: path.resolve(apk),
    apkBytes: bytes,
    embedded,
    config,
    bundle: Buffer.from(files['assets/index.android.bundle']),
    assets: [...assets.values()],
    native: { packageName: native[1], buildNumber: Number(native[2]), version: native[3] },
  };
}

export function readOtaExport(directory, configFile) {
  assert.ok(configFile, 'Supply --ota2-config with the public Expo config from the same export environment');
  const root = fs.realpathSync(directory);
  const containedFile = (relative) => {
    assert.equal(typeof relative, 'string', 'Export paths must be strings');
    const normalized = relative.replaceAll('\\', '/');
    assert.ok(
      normalized &&
        !path.isAbsolute(normalized) &&
        !/^[a-z]:/i.test(normalized) &&
        !normalized.split('/').includes('..'),
      'Export path traversal is not allowed',
    );
    const file = path.resolve(root, normalized);
    const actual = fs.realpathSync(file);
    const resolved = path.relative(root, actual);
    assert.ok(
      resolved && !resolved.startsWith(`..${path.sep}`) && resolved !== '..' && !path.isAbsolute(resolved),
      'Export path traversal is not allowed',
    );
    assert.ok(fs.statSync(actual).isFile(), `Export resource must be a file: ${relative}`);
    return actual;
  };
  const metadata = JSON.parse(fs.readFileSync(containedFile('metadata.json'), 'utf8'));
  assert.equal(metadata.version, 0, 'Only inspected Expo SDK58 export metadata version 0 is supported');
  assert.equal(metadata.bundler, 'metro', 'Only Metro exports are supported');
  const android = metadata.fileMetadata?.android;
  assert.ok(
    android && typeof android.bundle === 'string' && Array.isArray(android.assets),
    'Export metadata must include an Android bundle and Android asset list',
  );
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  assert.equal(config.extra?.appVariant, 'test', 'OTA2 config must belong to an isolated test build');
  assert.ok(typeof config.runtimeVersion === 'string', 'OTA2 public config must specify its native runtimeVersion');
  assert.ok(
    typeof config.extra?.contentRevision === 'string' && /^[a-f0-9]{7,40}$/i.test(config.extra.contentRevision),
    'OTA2 public config must include its actual contentRevision',
  );
  const bundle = fs.readFileSync(containedFile(android.bundle));
  assert.ok(bundle.length, 'The exported Android launch bundle is empty');
  const assets = new Map();
  for (const asset of android.assets) {
    assert.ok(
      typeof asset.ext === 'string' && /^[a-z0-9]+$/i.test(asset.ext),
      'Export asset extension is missing or invalid',
    );
    const data = fs.readFileSync(containedFile(asset.path));
    const key = path.posix.basename(asset.path.replaceAll('\\', '/'));
    assert.ok(/^[a-z0-9_.-]+$/i.test(key) && !['.', '..'].includes(key), 'Export asset key is invalid');
    const entry = {
      key,
      hash: hash(data),
      contentType: mimeTypes[asset.ext] ?? 'application/octet-stream',
      fileExtension: `.${asset.ext}`,
      bytes: data,
    };
    if (assets.has(key))
      assert.equal(assets.get(key).hash, entry.hash, 'Export assets with the same key have different contents');
    assets.set(key, entry);
  }
  return { config, bundle, assets: [...assets.values()], metadata, exportDirectory: root };
}

export function createUpdate(
  apk,
  { id = crypto.randomUUID(), createdAt, runtimeVersion, contentRevision = apk.config.extra?.contentRevision },
) {
  assert.match(id, /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i, 'Update id must be a UUID');
  assert.ok(Number.isFinite(new Date(createdAt).getTime()), 'createdAt must be a date');
  const launchAsset = {
    key: `bundle-${id}`,
    hash: hash(apk.bundle),
    contentType: 'application/javascript',
    bytes: apk.bundle,
  };
  return {
    id,
    createdAt: new Date(createdAt).toISOString(),
    runtimeVersion,
    launchAsset,
    assets: apk.assets,
    metadata: {},
    extra: {
      expoClient: { ...apk.config, extra: { ...apk.config.extra, contentRevision } },
      eas: apk.config.extra?.eas ?? {},
    },
  };
}

function manifestOf(update, origin) {
  const asset = ({ bytes: _bytes, ...metadata }, filename) => ({
    ...metadata,
    url: `${origin}/assets/${update.id}/${filename}`,
  });
  return {
    ...update,
    launchAsset: asset(update.launchAsset, 'bundle.hbc'),
    assets: update.assets.map((item) => asset(item, `${item.key}${item.fileExtension}`)),
  };
}

const presets = {
  base: { update: null, bundleAvailable: false },
  ota1: { update: 'ota1', bundleAvailable: false },
  bundled: { update: 'ota1', bundleAvailable: true },
  ota2: { update: 'ota2', bundleAvailable: true },
};

export function createOtaTestServer({
  base,
  bundled,
  channel = bundled.config.extra?.updateChannel ?? 'production',
  runtimeVersion = bundled.config.runtimeVersion,
  ota1Id,
  ota2Id,
  ota2Source,
  ota2Revision = 'c3333333',
  baseMarker = 'BASE',
  bundledMarker = 'OTA_ONE',
  ota2Marker = 'NEXT',
  onEvent = () => {},
}) {
  assert.equal(typeof runtimeVersion, 'string', 'An explicit runtimeVersion is required');
  assert.equal(base.config.runtimeVersion, runtimeVersion, 'A native runtime differs from the tested runtime');
  assert.equal(bundled.config.runtimeVersion, runtimeVersion, 'B native runtime differs from the tested runtime');
  for (const apk of [base, bundled])
    assert.ok(
      typeof apk.config.extra?.contentRevision === 'string' && apk.config.extra.contentRevision.trim(),
      'A/B must embed an explicit contentRevision',
    );
  assert.notEqual(
    base.config.extra.contentRevision,
    bundled.config.extra.contentRevision,
    'A/B content revisions must differ',
  );
  assert.ok(typeof ota2Revision === 'string' && ota2Revision.trim(), 'OTA2 requires a contentRevision');
  assert.notEqual(ota2Revision, bundled.config.extra.contentRevision, 'OTA2 must use a new content revision');
  assert.equal(base.native.version, bundled.native.version, 'A/B native versions must match');
  assert.ok(bundled.native.buildNumber > base.native.buildNumber, 'B must have a greater native buildNumber');
  assert.ok(
    bundled.embedded.commitTime - base.embedded.commitTime >= 2,
    'Build B after A so OTA1 can precede B but follow A',
  );
  const ota1Time = Math.floor((base.embedded.commitTime + bundled.embedded.commitTime) / 2);
  const updates = {
    ota1: createUpdate(bundled, { id: ota1Id, createdAt: ota1Time, runtimeVersion }),
    ...(ota2Source
      ? {
          ota2: createUpdate(ota2Source, {
            id: ota2Id,
            createdAt: Math.max(Date.now(), bundled.embedded.commitTime + 1000),
            runtimeVersion,
            contentRevision: ota2Revision,
          }),
        }
      : {}),
  };
  if (updates.ota2)
    assert.notEqual(
      updates.ota2.launchAsset.hash,
      updates.ota1.launchAsset.hash,
      'OTA2 must contain a genuinely different exported JavaScript bundle',
    );
  if (ota2Source) {
    assert.equal(
      ota2Source.config.runtimeVersion,
      runtimeVersion,
      'OTA2 export runtime does not match the native APK runtime',
    );
    assert.equal(
      ota2Source.config.extra?.contentRevision,
      ota2Revision,
      'OTA2 public config contentRevision differs from --ota2-revision',
    );
  }
  const state = {
    ...presets.base,
    activeChannel: channel,
    activeRuntime: runtimeVersion,
    manifestFailures: 0,
    assetFailures: 0,
    assetInterruptions: 0,
    assetCorruptions: 0,
    assetDelayMs: 0,
  };
  const events = [];
  const reports = [];
  let sequence = 0;
  const log = (event) => {
    const entry = { sequence: ++sequence, at: new Date().toISOString(), ...event };
    events.push(entry);
    if (events.length > 10000) events.shift();
    onEvent(entry);
    return entry;
  };
  const metadata = (origin) => ({
    origin,
    channel,
    runtimeVersion,
    sequence,
    state: { ...state },
    base: {
      ...base.native,
      contentRevision: base.config.extra.contentRevision,
      bundleMarker: baseMarker,
      embeddedId: base.embedded.id,
      embeddedCreatedAt: new Date(base.embedded.commitTime).toISOString(),
    },
    bundled: {
      ...bundled.native,
      contentRevision: bundled.config.extra.contentRevision,
      bundleMarker: bundledMarker,
      embeddedId: bundled.embedded.id,
      embeddedCreatedAt: new Date(bundled.embedded.commitTime).toISOString(),
    },
    updates: Object.fromEntries(
      Object.entries(updates).map(([key, update]) => [
        key,
        {
          id: update.id,
          createdAt: update.createdAt,
          launchHash: update.launchAsset.hash,
          contentRevision: update.extra.expoClient.extra.contentRevision,
          bundleMarker: key === 'ota1' ? bundledMarker : ota2Marker,
        },
      ]),
    ),
    note: 'User-facing versions follow contentRevision; update UUIDs remain diagnostic. OTA2 is unavailable until a distinct exported JavaScript bundle is provided.',
  });
  const server = http.createServer(async (request, response) => {
    const origin = `http://${request.headers.host}`;
    const url = new URL(request.url, origin);
    const common = {
      'Cache-Control': 'no-store',
      'Expo-Protocol-Version': '1',
      'Expo-SFV-Version': '0',
      'Expo-Manifest-Filters': '',
      'Expo-Server-Defined-Headers': '',
    };
    const reply = (status, body) => {
      const bytes = body === undefined ? null : Buffer.from(JSON.stringify(body));
      response.writeHead(status, {
        ...common,
        ...(bytes ? { 'Content-Type': 'application/json', 'Content-Length': bytes.length } : {}),
      });
      response.end(bytes);
    };
    try {
      if (request.method === 'POST' && ['/admin/state', '/reports'].includes(url.pathname)) {
        let body = '';
        for await (const chunk of request) {
          body += chunk;
          if (body.length > 256 * 1024) throw new Error('Request body too large');
        }
        const data = JSON.parse(body || '{}');
        if (url.pathname === '/reports') {
          const entry = log({ kind: 'report', data });
          reports.push(entry);
          reply(200, { sequence: entry.sequence });
        } else {
          if (data.scenario !== undefined) {
            assert.ok(data.scenario in presets, 'Unknown scenario');
            if (presets[data.scenario].update)
              assert.ok(
                updates[presets[data.scenario].update],
                'Supply a distinct --ota2-export before selecting OTA2',
              );
            Object.assign(state, presets[data.scenario]);
          }
          for (const key of [
            'manifestFailures',
            'assetFailures',
            'assetInterruptions',
            'assetCorruptions',
            'assetDelayMs',
          ]) {
            if (data[key] !== undefined) {
              assert.ok(Number.isInteger(data[key]) && data[key] >= 0, `Invalid ${key}`);
              state[key] = data[key];
            }
          }
          for (const key of ['activeChannel', 'activeRuntime'])
            if (typeof data[key] === 'string') state[key] = data[key];
          log({ kind: 'state', state: { ...state } });
          reply(200, metadata(origin));
        }
        return;
      }
      if (url.pathname === '/admin/state') {
        reply(200, metadata(origin));
        return;
      }
      if (url.pathname === '/admin/events') {
        reply(
          200,
          events.filter((event) => event.sequence > Number(url.searchParams.get('after') || 0)),
        );
        return;
      }
      if (url.pathname === '/admin/reports') {
        reply(
          200,
          reports.filter((event) => event.sequence > Number(url.searchParams.get('after') || 0)),
        );
        return;
      }
      if (url.pathname === '/updates') {
        const event = {
          kind: 'manifest',
          runtimeVersion: request.headers['expo-runtime-version'],
          channel: request.headers['expo-channel-name'],
          platform: request.headers['expo-platform'],
          currentId: request.headers['expo-current-update-id'],
          embeddedId: request.headers['expo-embedded-update-id'],
        };
        if (state.manifestFailures > 0) {
          state.manifestFailures--;
          log({ ...event, status: 503 });
          reply(503, { error: 'Injected manifest network failure' });
          return;
        }
        const update = updates[state.update];
        if (request.headers['expo-protocol-version'] !== '1' || request.headers['expo-expect-signature']) {
          log({ ...event, status: 406 });
          reply(406, { error: 'This local fixture supports unsigned Expo Updates protocol v1 only' });
          return;
        }
        const matches =
          update &&
          event.platform === 'android' &&
          event.runtimeVersion === update.runtimeVersion &&
          event.runtimeVersion === state.activeRuntime &&
          event.channel === state.activeChannel;
        if (!matches) {
          log({ ...event, status: 204 });
          reply(204);
          return;
        }
        log({ ...event, status: 200, updateId: update.id });
        reply(200, manifestOf(update, origin));
        return;
      }
      if (url.pathname === '/releases/latest.json' || url.pathname === '/releases/download.json') {
        const isCatalog = url.pathname.endsWith('/download.json');
        const apk = isCatalog && state.bundleAvailable ? bundled : base;
        log({ kind: isCatalog ? 'catalog' : 'upgrade', buildNumber: apk.native.buildNumber, status: 200 });
        reply(200, {
          version: apk.native.version,
          displayVersion: apk.native.version,
          buildNumber: apk.native.buildNumber,
          mandatory: false,
          title: 'Local OTA validation',
          releaseNotes: 'Local test only',
          apkUrl: `${origin}/packages/${apk === bundled ? 'bundled' : 'base'}.apk`,
          releaseUrl: `${origin}/admin/state`,
          fileName: `anitabi-test-${apk.native.buildNumber}.apk`,
        });
        return;
      }
      let bytes;
      let contentType;
      let assetId;
      let declaredHash;
      const match = /^\/assets\/([^/]+)\/(.+)$/.exec(url.pathname);
      if (match) {
        const update = Object.values(updates).find((item) => item.id === match[1]);
        const asset =
          match[2] === 'bundle.hbc'
            ? update?.launchAsset
            : update?.assets.find((item) => `${item.key}${item.fileExtension}` === match[2]);
        if (!asset) {
          reply(404, { error: 'Unknown immutable asset' });
          return;
        }
        bytes = asset.bytes;
        contentType = asset.contentType;
        assetId = asset.key;
        declaredHash = asset.hash;
      } else if (url.pathname === '/packages/base.apk' || url.pathname === '/packages/bundled.apk') {
        bytes = url.pathname.endsWith('/bundled.apk') ? bundled.apkBytes : base.apkBytes;
        contentType = 'application/vnd.android.package-archive';
      }
      if (bytes) {
        if (assetId && state.assetFailures > 0) {
          state.assetFailures--;
          log({ kind: 'asset', key: assetId, status: 503 });
          reply(503, { error: 'Injected asset failure' });
          return;
        }
        const corrupted = Boolean(assetId && assetId === updates.ota2?.launchAsset.key && state.assetCorruptions > 0);
        if (corrupted) {
          state.assetCorruptions--;
          // Mutate a response copy only. Keep the immutable source and manifest
          // hash intact, so clearing the fault retries exactly the same update.
          bytes = Buffer.from(bytes);
          bytes[bytes.length - 1] ^= 1;
        }
        response.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': bytes.length,
          'Cache-Control': 'no-store',
        });
        const interrupt = assetId && state.assetInterruptions > 0;
        if (interrupt) state.assetInterruptions--;
        let sent = 0;
        const write = () => {
          if (response.destroyed) return;
          const end = Math.min(sent + 64 * 1024, bytes.length);
          response.write(bytes.subarray(sent, end));
          sent = end;
          if (interrupt && sent >= Math.min(128 * 1024, Math.ceil(bytes.length / 2))) {
            log({ kind: 'asset', key: assetId, status: 'interrupted', bytes: sent });
            setTimeout(() => response.destroy(), 10);
          } else if (sent === bytes.length) {
            response.end();
            log({
              kind: assetId ? 'asset' : 'package',
              key: assetId,
              status: 200,
              bytes: sent,
              ...(corrupted ? { corrupted: true, declaredHash, servedHash: hash(bytes) } : {}),
            });
          } else setTimeout(write, state.assetDelayMs);
        };
        write();
        return;
      }
      reply(404, { error: 'Unknown route' });
    } catch (error) {
      log({ kind: 'error', error: error.message });
      if (!response.headersSent) reply(400, { error: error.message });
      else response.destroy();
    }
  });
  return {
    server,
    state,
    events,
    reports,
    updates,
    metadata,
    async listen(port = 18790) {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', resolve);
      });
      return `http://127.0.0.1:${server.address().port}`;
    },
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

async function main() {
  const options = {};
  const names = {
    '--base-apk': 'baseApk',
    '--bundled-apk': 'bundledApk',
    '--port': 'port',
    '--channel': 'channel',
    '--aapt2': 'aapt2',
    '--inspect-apk': 'inspectApk',
    '--ota2-export': 'ota2Export',
    '--ota2-config': 'ota2Config',
    '--ota2-revision': 'ota2Revision',
    '--base-marker': 'baseMarker',
    '--bundled-marker': 'bundledMarker',
    '--ota2-marker': 'ota2Marker',
  };
  for (let i = 0; i < process.argv.slice(2).length; i++) {
    const args = process.argv.slice(2);
    assert.ok(args[i] in names && args[i + 1], `Unknown or incomplete option: ${args[i]}`);
    options[names[args[i]]] = args[++i];
  }
  if (options.inspectApk) {
    const apk = readApk(options.inspectApk, options);
    console.log(
      JSON.stringify(
        {
          ...apk.native,
          embeddedId: apk.embedded.id,
          commitTime: apk.embedded.commitTime,
          runtimeVersion: apk.config.runtimeVersion,
          channel: apk.config.extra?.updateChannel,
          contentRevision: apk.config.extra?.contentRevision,
          assetCount: apk.assets.length,
          bundleBytes: apk.bundle.length,
        },
        null,
        2,
      ),
    );
    return;
  }
  assert.ok(
    options.baseApk && options.bundledApk,
    'Supply --base-apk A.apk --bundled-apk B.apk (or --inspect-apk file.apk)',
  );
  const fixture = createOtaTestServer({
    base: readApk(options.baseApk, options),
    bundled: readApk(options.bundledApk, options),
    channel: options.channel,
    ota2Source: options.ota2Export ? readOtaExport(options.ota2Export, options.ota2Config) : undefined,
    ota2Revision: options.ota2Revision,
    baseMarker: options.baseMarker,
    bundledMarker: options.bundledMarker,
    ota2Marker: options.ota2Marker,
    onEvent: (event) => console.log(JSON.stringify(event)),
  });
  const origin = await fixture.listen(Number(options.port || 18790));
  console.log(JSON.stringify(fixture.metadata(origin), null, 2));
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => {
      void fixture.close();
    });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
