import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { checkIconAssets, createIconAssets } from '../generate-app-icons.mjs';

async function withDirectory(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'anitabi-icons-'));
  try {
    await run(directory);
  } finally {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test('check reports missing and stale assets without modifying them', async () => {
  await withDirectory(async (directory) => {
    const expected = await sharp({ create: { width: 2, height: 2, channels: 4, background: 'white' } })
      .png()
      .toBuffer();
    const changed = await sharp({ create: { width: 2, height: 2, channels: 4, background: 'black' } })
      .png()
      .toBuffer();
    await fs.writeFile(path.join(directory, 'icon.png'), changed);
    await fs.writeFile(path.join(directory, 'icon.svg'), '<svg/>');
    const assets = new Map([
      ['icon.png', expected],
      ['icon.svg', Buffer.from('<svg><rect/></svg>')],
      ['missing.svg', Buffer.from('<svg/>')],
    ]);
    assert.deepEqual(await checkIconAssets(directory, assets), ['icon.png', 'icon.svg', 'missing.svg']);
    assert.deepEqual(await fs.readFile(path.join(directory, 'icon.png')), changed);
    assert.equal(await fs.readFile(path.join(directory, 'icon.svg'), 'utf8'), '<svg/>');
    await assert.rejects(fs.access(path.join(directory, 'missing.svg')), { code: 'ENOENT' });
  });
});

test('check accepts PNG recompression and Windows line endings', async () => {
  await withDirectory(async (directory) => {
    const image = sharp({ create: { width: 16, height: 16, channels: 4, background: '#FB7299' } });
    const expected = await image.clone().png({ compressionLevel: 0 }).toBuffer();
    const compressed = await image.clone().png({ compressionLevel: 9 }).toBuffer();
    await fs.writeFile(path.join(directory, 'icon.png'), compressed);
    await fs.writeFile(path.join(directory, 'icon.svg'), '<svg>\r\n</svg>\r\n');
    assert.deepEqual(
      await checkIconAssets(
        directory,
        new Map([
          ['icon.png', expected],
          ['icon.svg', Buffer.from('<svg>\n</svg>\n')],
        ]),
      ),
      [],
    );
  });
});

test('monochrome camera remains a transparent cutout and fits the safe circle', async () => {
  const source = await fs.readFile(new URL('../../assets/images/anitabi-icon.svg', import.meta.url), 'utf8');
  const assets = await createIconAssets(source);
  const { data, info } = await sharp(assets.get('assets/images/anitabi-icon-adaptive-monochrome.png'))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alpha = (x, y) => data[(y * info.width + x) * 4 + 3];
  assert.equal(alpha(446, 391), 0, 'camera body must be cut out, not painted white over the pin');
  assert.equal(alpha(512, 412), 255, 'lens center must remain visible inside the camera cutout');
  assert.equal(alpha(0, 0), 0);
  const radius = (info.width * 33) / 108;
  let visible = 0;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      if (alpha(x, y) < 32) continue;
      visible++;
      assert.ok(
        Math.hypot(x + 0.5 - 512, y + 0.5 - 512) <= radius,
        'critical artwork must fit within the 66dp safe circle',
      );
    }
  assert.ok(visible > 0);
});

test('generator fails clearly if a required source element is missing', async () => {
  const source = await fs.readFile(new URL('../../assets/images/anitabi-icon.svg', import.meta.url), 'utf8');
  await assert.rejects(
    createIconAssets(source.replace('id="camera-shape"', 'id="renamed-camera"')),
    /Missing camera shape/,
  );
});
