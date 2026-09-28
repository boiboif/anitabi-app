import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { getImageFileFormat } from '../../src/utils/image-file-format.ts';

// Execute the actual service with asynchronous native-file doubles. A missing
// await must fail even when a tiny real image happens to copy fast on a device.
const source = readFileSync(new URL('../../src/lib/image-preview-files.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup({ cached = true, failCopy = false, afterCopy } = {}) {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
  const files = new Map([
    ['file:///original.jpg', jpeg],
    ['file:///cached-original', jpeg],
  ]);
  let downloads = 0;
  class Directory {
    constructor(...parts) {
      this.uri = parts.map((part) => part.uri ?? part).join('/');
    }
    create() {}
    list() {
      return [];
    }
  }
  class File {
    constructor(...parts) {
      this.uri = parts.map((part) => part.uri ?? part).join('/');
    }
    get name() {
      return this.uri.split('/').at(-1);
    }
    get exists() {
      return files.has(this.uri);
    }
    get size() {
      return files.get(this.uri)?.length ?? 0;
    }
    async copy(destination) {
      await new Promise((resolve) => setImmediate(resolve));
      files.set(destination.uri, files.get(this.uri));
      if (failCopy) throw new Error('Native copy failed');
      afterCopy?.();
    }
    open() {
      assert.ok(this.exists, 'File was opened before the asynchronous copy finished');
      return { readBytes: () => files.get(this.uri), close() {} };
    }
    rename(name) {
      const previous = this.uri;
      this.uri = `${previous.slice(0, previous.lastIndexOf('/') + 1)}${name}`;
      files.set(this.uri, files.get(previous));
      files.delete(previous);
    }
    delete() {
      files.delete(this.uri);
    }
    static async downloadFileAsync(uri, destination) {
      downloads++;
      files.set(destination.uri, jpeg);
      return destination;
    }
  }
  const exports = {};
  const modules = {
    '@/utils/image-file-format': { getImageFileFormat },
    'expo-file-system': { Directory, File, FileMode: { ReadOnly: 'r' }, Paths: { cache: 'file:///cache' } },
    'expo-image': { Image: { getCachePathAsync: async () => (cached ? '/cached-original' : null) } },
  };
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => {
      assert.ok(modules[name], `Unexpected dependency: ${name}`);
      return modules[name];
    },
  });
  return { prepare: exports.preparePreviewImage, files, downloads: () => downloads };
}

for (const uri of ['https://example.test/no-extension', 'file:///original.jpg']) {
  test(`waits for the complete asynchronous copy: ${uri}`, async () => {
    const runtime = setup();
    const result = await runtime.prepare(uri, new AbortController().signal);
    assert.equal(result.mimeType, 'image/jpeg');
    assert.match(result.file.uri, /\.jpg$/);
    assert.equal(result.file.size, 4);
    assert.equal(runtime.downloads(), 0);
  });
}

test('copy failure is caught and a partial destination is cleaned up', async () => {
  const runtime = setup({ failCopy: true });
  await assert.rejects(runtime.prepare('file:///original.jpg', new AbortController().signal), /Native copy failed/);
  assert.equal(runtime.files.size, 2);
});

test('closing during a copy prevents processing and removes the temporary copy', async () => {
  const controller = new AbortController();
  const runtime = setup({ afterCopy: () => controller.abort() });
  await assert.rejects(runtime.prepare('file:///original.jpg', controller.signal), /cancelled/);
  assert.equal(runtime.files.size, 2);
});

test('a missing original cache downloads the original and identifies its format', async () => {
  const runtime = setup({ cached: false });
  const result = await runtime.prepare('https://example.test/no-extension', new AbortController().signal);
  assert.equal(runtime.downloads(), 1);
  assert.equal(result.mimeType, 'image/jpeg');
});
