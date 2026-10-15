export const COMPARISON_EXPORT_WIDTH = 2160;
export const COMPARISON_BORDER_WIDTH_MAX = 32;
export const COMPARISON_BORDER_COLORS = ['white', 'black', 'theme'] as const;
export type ComparisonBorderColor = (typeof COMPARISON_BORDER_COLORS)[number];
export const COMPARISON_EXPORT_LAYOUTS = ['vertical', 'horizontal'] as const;
export const COMPARISON_REFERENCE_FITS = ['cover', 'contain'] as const;

export type ComparisonExportSettings = {
  borderWidth: number;
  borderColor: ComparisonBorderColor;
  showOuterBorder: boolean;
  showInnerBorder: boolean;
  layout: (typeof COMPARISON_EXPORT_LAYOUTS)[number];
  matchPhotoRatio: boolean;
  referenceFit: (typeof COMPARISON_REFERENCE_FITS)[number];
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
  showOuterBorder: true,
  showInnerBorder: true,
  layout: 'vertical',
  matchPhotoRatio: false,
  referenceFit: 'cover',
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
    showOuterBorder: typeof source.showOuterBorder === 'boolean' ? source.showOuterBorder : defaults.showOuterBorder,
    showInnerBorder: typeof source.showInnerBorder === 'boolean' ? source.showInnerBorder : defaults.showInnerBorder,
    layout: COMPARISON_EXPORT_LAYOUTS.find((layout) => layout === source.layout) ?? defaults.layout,
    matchPhotoRatio: typeof source.matchPhotoRatio === 'boolean' ? source.matchPhotoRatio : defaults.matchPhotoRatio,
    referenceFit: COMPARISON_REFERENCE_FITS.find((fit) => fit === source.referenceFit) ?? defaults.referenceFit,
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
  settings: ComparisonExportSettings,
  footerHeight: number,
) {
  const width = COMPARISON_EXPORT_WIDTH;
  const outerBorder = settings.showOuterBorder ? settings.borderWidth : 0;
  const gap = settings.showInnerBorder ? settings.borderWidth : 0;
  const contentWidth = width - outerBorder * 2;
  const panelRatio = settings.matchPhotoRatio ? photoRatio : referenceRatio;
  const horizontal = settings.layout === 'horizontal';
  // Side-by-side panels share a height; their widths follow their own aspect ratios.
  const sharedHeight = (contentWidth - gap) / (panelRatio + photoRatio);
  const referenceWidth = horizontal ? Math.round(sharedHeight * panelRatio) : contentWidth;
  const photoWidth = horizontal ? contentWidth - gap - referenceWidth : contentWidth;
  const referenceHeight = Math.max(1, Math.round(horizontal ? sharedHeight : contentWidth / panelRatio));
  const photoHeight = horizontal ? referenceHeight : Math.max(1, Math.round(contentWidth / photoRatio));
  const reference = { x: outerBorder, y: outerBorder, width: referenceWidth, height: referenceHeight };
  const photo = {
    x: horizontal ? outerBorder + referenceWidth + gap : outerBorder,
    y: horizontal ? outerBorder : outerBorder + referenceHeight + gap,
    width: photoWidth,
    height: photoHeight,
  };
  const imagesHeight = horizontal ? referenceHeight : referenceHeight + gap + photoHeight;
  const footerGap = footerHeight > 0 ? outerBorder : 0;
  const footerY = outerBorder + imagesHeight + footerGap;
  return {
    width,
    contentWidth,
    outerBorder,
    gap,
    footerGap,
    imagesHeight,
    reference,
    photo,
    footerY,
    height: footerY + footerHeight + outerBorder,
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
