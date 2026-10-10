export const COMPARISON_EXPORT_WIDTH = 2160;
export const COMPARISON_BORDER_WIDTH_MAX = 32;
export const COMPARISON_BORDER_COLORS = ['white', 'black', 'theme'] as const;
export type ComparisonBorderColor = (typeof COMPARISON_BORDER_COLORS)[number];

export type ComparisonExportSettings = {
  borderWidth: number;
  borderColor: ComparisonBorderColor;
  showName: boolean;
  name: string;
  showCapturedAt: boolean;
  showLocation: boolean;
  showWork: boolean;
  showScene: boolean;
  showCoordinates: boolean;
};

export const DEFAULT_COMPARISON_EXPORT_SETTINGS: ComparisonExportSettings = {
  borderWidth: 8,
  borderColor: 'white',
  showName: false,
  name: '',
  showCapturedAt: true,
  showLocation: true,
  showWork: true,
  showScene: true,
  showCoordinates: true,
};

export function normalizeComparisonExportSettings(value: unknown): ComparisonExportSettings {
  const source =
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Partial<ComparisonExportSettings>) : {};
  const defaults = DEFAULT_COMPARISON_EXPORT_SETTINGS;
  return {
    borderWidth:
      typeof source.borderWidth === 'number' && Number.isFinite(source.borderWidth)
        ? Math.max(0, Math.min(COMPARISON_BORDER_WIDTH_MAX, Math.round(source.borderWidth)))
        : defaults.borderWidth,
    borderColor: COMPARISON_BORDER_COLORS.find((color) => color === source.borderColor) ?? defaults.borderColor,
    name: typeof source.name === 'string' ? source.name.slice(0, 40) : '',
    showName: source.showName === true,
    showCapturedAt: typeof source.showCapturedAt === 'boolean' ? source.showCapturedAt : defaults.showCapturedAt,
    showLocation: typeof source.showLocation === 'boolean' ? source.showLocation : defaults.showLocation,
    showWork: typeof source.showWork === 'boolean' ? source.showWork : defaults.showWork,
    showScene: typeof source.showScene === 'boolean' ? source.showScene : defaults.showScene,
    showCoordinates: typeof source.showCoordinates === 'boolean' ? source.showCoordinates : defaults.showCoordinates,
  };
}

export function resolveComparisonBorderColor(color: ComparisonBorderColor, primary: string): `#${string}` {
  if (color === 'white') return '#ffffff';
  if (color === 'black') return '#000000';
  return /^#[0-9a-f]{6}$/i.test(primary) ? (primary as `#${string}`) : '#FB7299';
}

export function hexToImageColor(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
  };
}

export type ComparisonMetadataField = 'capturedAt' | 'location' | 'work' | 'scene' | 'coordinates';
export type ComparisonMetadataRow = {
  field: ComparisonMetadataField;
  value: string;
};
export type ComparisonMetadata = { name?: string; rows: ComparisonMetadataRow[] };

export function buildComparisonMetadata(
  settings: ComparisonExportSettings,
  values: Record<ComparisonMetadataField, string>,
): ComparisonMetadata {
  const fields: [ComparisonMetadataField, boolean][] = [
    ['work', settings.showWork],
    ['location', settings.showLocation],
    ['scene', settings.showScene],
    ['capturedAt', settings.showCapturedAt],
    ['coordinates', settings.showCoordinates],
  ];
  return {
    name: settings.showName && settings.name.trim() ? settings.name.trim() : undefined,
    rows: fields
      .filter(([, enabled]) => enabled)
      .map(([field]) => ({
        field,
        value: values[field],
      })),
  };
}

export function getComparisonExportLayout(
  referenceRatio: number,
  photoRatio: number,
  borderWidth: number,
  footerHeight: number,
) {
  const width = COMPARISON_EXPORT_WIDTH;
  const contentWidth = width - borderWidth * 2;
  const referenceHeight = Math.max(1, Math.round(contentWidth / referenceRatio));
  const photoHeight = Math.max(1, Math.round(contentWidth / photoRatio));
  const photoY = borderWidth * 2 + referenceHeight;
  const footerY = photoY + photoHeight + (footerHeight > 0 ? borderWidth : 0);
  return {
    width,
    contentWidth,
    referenceHeight,
    photoHeight,
    photoY,
    footerY,
    height: footerY + footerHeight + borderWidth,
  };
}

export function readPhotoCaptureTime(exif?: Record<string, unknown> | null): string | undefined {
  const raw = exif?.DateTimeOriginal ?? exif?.DateTimeDigitized ?? exif?.DateTime;
  if (typeof raw !== 'string') return;
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(raw);
  if (!match) return;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day, hour, minute, second);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  )
    return;
  const offset = exif?.OffsetTimeOriginal;
  if (typeof offset === 'string' && /^[+-]\d{2}:\d{2}$/.test(offset)) {
    const timestamp = new Date(`${raw.slice(0, 10).replaceAll(':', '-')}T${raw.slice(11)}${offset}`);
    return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : undefined;
  }
  return date.toISOString();
}
