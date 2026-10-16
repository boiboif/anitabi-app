import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adaptiveViewBox = '-252 -252 1528 1528';
const normalize = (text) => text.replace(/\r\n/g, '\n').trim();

function requiredMatch(source, pattern, name) {
  const match = source.match(pattern);
  if (!match) throw new Error(`Missing ${name} in assets/images/anitabi-icon.svg`);
  return match;
}

function document(viewBox, definitions, artwork) {
  return `<svg width="1024" height="1024" viewBox="${viewBox}" fill="none" xmlns="http://www.w3.org/2000/svg">\n  <defs>\n${definitions}\n  </defs>\n${artwork}\n</svg>\n`;
}

// These named elements are the small, explicit source schema shared by all variants.
export async function createIconAssets(source) {
  source = `${normalize(source)}\n`;
  const root = requiredMatch(source, /^<svg\b[^>]*>/, 'SVG root')[0];
  requiredMatch(root, /\bwidth="1024"/, '1024-pixel width');
  requiredMatch(root, /\bheight="1024"/, '1024-pixel height');
  requiredMatch(root, /viewBox="0 0 1024 1024"/, '1024-square viewBox');
  const defs = requiredMatch(source, /<defs>([\s\S]*?)<\/defs>/, 'definitions')[1].trimEnd();
  const sky = requiredMatch(defs, /<linearGradient id="sky"[\s\S]*?<\/linearGradient>/, 'sky gradient')[0];
  const pinPath = requiredMatch(defs, /<path id="pin-shape"[^>]*\/>/, 'pin shape')[0];
  const cameraPath = requiredMatch(defs, /<path id="camera-shape"[^>]*\/>/, 'camera shape')[0];
  const pinTransform = requiredMatch(source, /<g id="pin" transform="([^"]+)"/, 'pin transform')[1];
  const cameraTransform = requiredMatch(source, /<g id="camera" transform="([^"]+)"/, 'camera transform')[1];
  const pinStroke = requiredMatch(source, /<use href="#pin-shape"[^>]*stroke-width="([\d.]+)"/, 'pin stroke width')[1];
  const artwork = source
    .slice(source.indexOf('</defs>') + 7)
    .replace(/<\/svg>\s*$/, '')
    .trim();
  const backgroundRect = requiredMatch(artwork, /<rect id="icon-background"[^>]*\/>/, 'background rectangle')[0];
  const foreground = document(
    adaptiveViewBox,
    defs.replace(sky, '').replace(/^\s*\n/, ''),
    artwork.replace(backgroundRect, '').trim(),
  );
  const background = document(
    adaptiveViewBox,
    `    ${sky}`,
    '  <rect x="-252" y="-252" width="1528" height="1528" fill="url(#sky)"/>',
  );
  const rounded = document(
    '0 0 1024 1024',
    `${defs}\n    <clipPath id="icon-rounded"><rect width="1024" height="1024" rx="224"/></clipPath>`,
    `  <g clip-path="url(#icon-rounded)">\n${artwork}\n  </g>`,
  );
  // Monochrome is an alpha silhouette: cut the camera out of the pin so its
  // details survive system tinting. Decorative map blocks are intentionally omitted.
  const monochrome = document(
    adaptiveViewBox,
    `    ${pinPath}\n    ${cameraPath}\n    <mask id="camera-cutout" maskUnits="userSpaceOnUse" x="-252" y="-252" width="1528" height="1528">\n      <rect x="-252" y="-252" width="1528" height="1528" fill="white"/>\n      <g transform="${pinTransform}"><g transform="${cameraTransform}"><use href="#camera-shape" fill="black" fill-rule="evenodd"/></g></g>\n    </mask>`,
    `  <g mask="url(#camera-cutout)">\n    <g transform="${pinTransform}"><use href="#pin-shape" fill="white" stroke="white" stroke-width="${pinStroke}" stroke-linejoin="round"/></g>\n  </g>`,
  );

  const assets = new Map([
    ['docs/public/app-icon.svg', Buffer.from(source)],
    ['docs/public/app-icon-rounded.svg', Buffer.from(rounded)],
    ['assets/images/anitabi-icon-adaptive-foreground.svg', Buffer.from(foreground)],
    ['assets/images/anitabi-icon-adaptive-background.svg', Buffer.from(background)],
    ['assets/images/anitabi-icon-adaptive-monochrome.svg', Buffer.from(monochrome)],
  ]);
  for (const [filename, svg, opaque] of [
    ['anitabi-icon.png', source, true],
    ['anitabi-icon-adaptive-foreground.png', foreground, false],
    ['anitabi-icon-adaptive-background.png', background, true],
    ['anitabi-icon-adaptive-monochrome.png', monochrome, false],
    ['anitabi-splash-icon.png', rounded, false],
  ]) {
    let image = sharp(Buffer.from(svg));
    if (opaque) image = image.removeAlpha();
    assets.set(`assets/images/${filename}`, await image.png().toBuffer());
  }
  return assets;
}

// Compare decoded pixels, not compression or optional PNG metadata. --check is
// read-only and reports every missing/stale asset without silently repairing it.
export async function checkIconAssets(root, assets) {
  const stale = [];
  for (const [filename, expected] of assets) {
    let actual;
    try {
      actual = await fs.readFile(path.join(root, filename));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      stale.push(filename);
      continue;
    }
    if (filename.endsWith('.svg')) {
      if (normalize(actual.toString()) !== normalize(expected.toString())) stale.push(filename);
      continue;
    }
    try {
      const decode = (buffer) => sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const [a, b] = await Promise.all([decode(actual), decode(expected)]);
      if (a.info.width !== b.info.width || a.info.height !== b.info.height || !a.data.equals(b.data))
        stale.push(filename);
    } catch {
      stale.push(filename);
    }
  }
  return stale;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--check')) throw new Error('Usage: node scripts/generate-app-icons.mjs [--check]');
  const source = await fs.readFile(path.join(projectRoot, 'assets/images/anitabi-icon.svg'), 'utf8');
  const assets = await createIconAssets(source);
  if (args.includes('--check')) {
    const stale = await checkIconAssets(projectRoot, assets);
    if (stale.length) throw new Error(`Run yarn icons:generate to update:\n${stale.join('\n')}`);
    console.log(`All ${assets.size} generated icon assets are up to date.`);
  } else {
    for (const [filename, data] of assets) {
      await fs.writeFile(path.join(projectRoot, filename), data);
      console.log(`Updated ${filename}`);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
