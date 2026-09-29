import assert from 'node:assert/strict';
import test from 'node:test';
import { getImageFileFormat } from '../../src/utils/image-file-format.ts';

const bytes = (value) => Uint8Array.from(value, (character) => character.charCodeAt(0));

test('recognizes image bytes without trusting a URL or cache filename', () => {
  const cases = [
    ['\xff\xd8\xff\xe0', 'jpg', 'image/jpeg', 'public.jpeg'],
    ['\x89PNG\r\n\x1a\n', 'png', 'image/png', 'public.png'],
    ['GIF89a', 'gif', 'image/gif', 'com.compuserve.gif'],
    ['GIF87a', 'gif', 'image/gif', 'com.compuserve.gif'],
    ['RIFF\x00\x00\x00\x00WEBP', 'webp', 'image/webp', 'org.webmproject.webp'],
    ['\x00\x00\x00\x20ftypheic', 'heic', 'image/heic', 'public.heic'],
    ['\x00\x00\x00\x20ftypavif', 'avif', 'image/avif', 'public.avif'],
  ];
  for (const [signature, extension, mimeType, UTI] of cases)
    assert.deepEqual(getImageFileFormat(bytes(signature)), { extension, mimeType, UTI });
});

test('uses compatible brands to distinguish AVIF from generic HEIF', () => {
  const signature = '\x00\x00\x00\x20ftypmif1\x00\x00\x00\x00avif';
  assert.equal(getImageFileFormat(bytes(signature))?.extension, 'avif');
});

test('rejects an empty or truncated download and an HTML error response', () => {
  for (const value of ['', '\xff\xd8', 'PNG', '<html>Not found</html>', 'RIFF\x00\x00\x00\x00WAVE'])
    assert.equal(getImageFileFormat(bytes(value)), null);
});
