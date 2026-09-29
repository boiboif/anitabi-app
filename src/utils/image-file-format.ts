/** Detect the encoded image, including URLs/cache files without an extension. */
export function getImageFileFormat(bytes: Uint8Array) {
  const text = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return { extension: 'jpg', mimeType: 'image/jpeg', UTI: 'public.jpeg' };
  if (text(0, 8) === '\x89PNG\r\n\x1a\n') return { extension: 'png', mimeType: 'image/png', UTI: 'public.png' };
  if (['GIF87a', 'GIF89a'].includes(text(0, 6)))
    return { extension: 'gif', mimeType: 'image/gif', UTI: 'com.compuserve.gif' };
  if (text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP')
    return { extension: 'webp', mimeType: 'image/webp', UTI: 'org.webmproject.webp' };
  if (text(4, 4) === 'ftyp') {
    const brands = [text(8, 4)];
    for (let offset = 16; offset + 4 <= bytes.length; offset += 4) brands.push(text(offset, 4));
    if (brands.some((brand) => ['avif', 'avis'].includes(brand)))
      return { extension: 'avif', mimeType: 'image/avif', UTI: 'public.avif' };
    if (brands.some((brand) => ['heic', 'heix', 'hevc', 'hevx'].includes(brand)))
      return { extension: 'heic', mimeType: 'image/heic', UTI: 'public.heic' };
    if (brands.some((brand) => ['mif1', 'msf1'].includes(brand)))
      return { extension: 'heif', mimeType: 'image/heif', UTI: 'public.heif' };
  }
  return null;
}
