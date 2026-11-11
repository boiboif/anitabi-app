type RGB = [number, number, number];
type Color = { rgb: RGB; alpha: number };

const MIN_CONTRAST = 4.5;
const clamp = (value: number, max = 1) => Math.max(0, Math.min(max, value));

function numericToken(value: string): { value: number; unit: string } | null {
  const match = /^([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?)(%|deg|grad|rad|turn)?$/i.exec(value);
  if (!match || !Number.isFinite(Number(match[1]))) return null;
  return { value: Number(match[1]), unit: match[2]?.toLowerCase() ?? '' };
}

function parseColor(value: string): Color | null {
  const source = value.trim().toLowerCase();
  if (source === 'white') return { rgb: [255, 255, 255], alpha: 1 };
  if (source === 'black') return { rgb: [0, 0, 0], alpha: 1 };
  if (source === 'transparent') return { rgb: [0, 0, 0], alpha: 0 };
  if (/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/.test(source)) {
    const hex = source.length <= 5 ? [...source.slice(1)].map((digit) => digit + digit).join('') : source.slice(1);
    return {
      rgb: [0, 2, 4].map((start) => parseInt(hex.slice(start, start + 2), 16)) as RGB,
      alpha: hex.length === 8 ? parseInt(hex.slice(6), 16) / 255 : 1,
    };
  }
  const match = /^(rgba?|hsla?)\(([^()]*)\)$/.exec(source);
  if (!match) return null;
  let parts: string[];
  if (match[2].includes(',')) {
    if (match[2].includes('/')) return null;
    parts = match[2].split(',').map((part) => part.trim());
  } else {
    const slash = match[2].split('/');
    if (slash.length > 2) return null;
    parts = slash[0].trim().split(/\s+/);
    if (parts.length !== 3) return null;
    if (slash.length === 2) parts.push(slash[1].trim());
  }
  if (parts.length !== 3 && parts.length !== 4) return null;
  const parsed = parts.map(numericToken);
  if (parsed.some((part) => !part)) return null;
  const [a, b, c, alphaPart] = parsed as NonNullable<ReturnType<typeof numericToken>>[];
  if (alphaPart && alphaPart.unit !== '' && alphaPart.unit !== '%') return null;
  const alpha = alphaPart ? clamp(alphaPart.value / (alphaPart.unit === '%' ? 100 : 1)) : 1;
  if (match[1].startsWith('rgb')) {
    if ([a, b, c].some((part) => part.unit !== '' && part.unit !== '%')) return null;
    return { rgb: [a, b, c].map((part) => clamp(part.value * (part.unit === '%' ? 2.55 : 1), 255)) as RGB, alpha };
  }
  if (!['', 'deg', 'grad', 'rad', 'turn'].includes(a.unit) || b.unit !== '%' || c.unit !== '%') return null;
  const hueDegrees = a.value * (a.unit === 'turn' ? 360 : a.unit === 'rad' ? 180 / Math.PI : a.unit === 'grad' ? 0.9 : 1);
  if (!Number.isFinite(hueDegrees)) return null;
  const hue = ((hueDegrees % 360) + 360) % 360 / 60;
  const saturation = clamp(b.value / 100);
  const lightness = clamp(c.value / 100);
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(hue % 2 - 1));
  const base = lightness - chroma / 2;
  const channels = hue < 1 ? [chroma, x, 0] : hue < 2 ? [x, chroma, 0] : hue < 3 ? [0, chroma, x]
    : hue < 4 ? [0, x, chroma] : hue < 5 ? [x, 0, chroma] : [chroma, 0, x];
  return { rgb: channels.map((channel) => (channel + base) * 255) as RGB, alpha };
}

function luminance(rgb: RGB): number {
  const linear = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(rgb: RGB, backgroundLuminance: number): number {
  const foreground = luminance(rgb);
  return (Math.max(foreground, backgroundLuminance) + 0.05) / (Math.min(foreground, backgroundLuminance) + 0.05);
}

const hex = (rgb: RGB) => `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;

/** Keep map label colors when readable on the opaque card; otherwise adjust toward black or white. */
export function getReadableMapTextColor(color: string, background: string): string | null {
  const foreground = parseColor(color);
  const backdrop = parseColor(background);
  if (!foreground || !backdrop || backdrop.alpha !== 1) return null;
  const backgroundLuminance = luminance(backdrop.rgb);
  const composed = foreground.rgb.map((channel, index) =>
    channel * foreground.alpha + backdrop.rgb[index] * (1 - foreground.alpha)) as RGB;
  if (foreground.alpha === 1 && contrast(composed, backgroundLuminance) >= MIN_CONTRAST) return color;
  const rounded = composed.map(Math.round) as RGB;
  if (contrast(rounded, backgroundLuminance) >= MIN_CONTRAST) return hex(rounded);

  let best: { rgb: RGB; amount: number } | null = null;
  for (const target of [0, 255]) {
    if (contrast([target, target, target], backgroundLuminance) < MIN_CONTRAST) continue;
    const mix = (amount: number) => composed.map((channel) => Math.round(channel + (target - channel) * amount)) as RGB;
    let low = 0;
    let high = 1;
    // Compare the rounded output itself: 4.499:1 must not pass as 4.5:1.
    for (let step = 0; step < 24; step++) {
      const middle = (low + high) / 2;
      if (contrast(mix(middle), backgroundLuminance) >= MIN_CONTRAST) high = middle;
      else low = middle;
    }
    if (!best || high < best.amount) best = { rgb: mix(high), amount: high };
  }
  return best ? hex(best.rgb) : null;
}
