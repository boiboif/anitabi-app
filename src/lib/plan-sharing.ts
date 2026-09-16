import type { ItineraryPlan } from '@/lib/plan-storage';
import type { AssembledData, Bangumi, Point } from '@/services/types';
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';

export const PLAN_SHARE_VERSION = 1 as const;
export const PLAN_SHARE_FILE_TYPE = 'anitabi-plan' as const;
export const PLAN_SHARE_MAX_QR_ITEMS = 150;
export const PLAN_SHARE_MAX_QR_URL_BYTES = 1000;
export const PLAN_SHARE_MAX_FILE_ITEMS = 5000;
export const PLAN_SHARE_MAX_FILE_BYTES = 1024 * 1024;

const PLAN_SHARE_MAX_TITLE_LENGTH = 60;
const PLAN_SHARE_MAX_POINT_ID_LENGTH = 80;
const PLAN_SHARE_MAX_PACKED_LENGTH = 4096;
const PLAN_SHARE_MAX_INFLATED_BYTES = 64 * 1024;
const DEFAULT_SHARE_BASE_URL = 'https://boiboif.github.io/anitabi-app/share/';

export type SharedPlanPoint = [bangumiId: number, pointId: string];

export type SharedPlan = {
  v: typeof PLAN_SHARE_VERSION;
  t: string;
  i: SharedPlanPoint[];
};

export type SharedPlanFile = SharedPlan & {
  type: typeof PLAN_SHARE_FILE_TYPE;
};

export type PlanShareBundle = {
  data: SharedPlan;
  packed: string;
  url: string;
  urlBytes: number;
  qrEligible: boolean;
};

export type ResolvedSharedPlanPoint = {
  bangumi: Bangumi;
  point: Point;
};

export type ResolvedSharedPlan = {
  points: ResolvedSharedPlanPoint[];
  missingCount: number;
  bangumiCount: number;
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function isSharedPlanPoint(value: unknown): value is SharedPlanPoint {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    Number.isSafeInteger(value[0]) &&
    value[0] > 0 &&
    typeof value[1] === 'string' &&
    value[1].length > 0 &&
    value[1].length <= PLAN_SHARE_MAX_POINT_ID_LENGTH
  );
}

function parseSharedPlan(value: unknown, maxItems: number, requireFileType: boolean): SharedPlan {
  if (!value || typeof value !== 'object') throw new Error('计划文件格式不正确');
  const candidate = value as Partial<SharedPlanFile>;
  if (requireFileType && candidate.type !== PLAN_SHARE_FILE_TYPE) throw new Error('这不是 Anitabi 巡礼计划文件');
  if (candidate.v !== PLAN_SHARE_VERSION) throw new Error('暂不支持这个计划文件版本');
  if (typeof candidate.t !== 'string' || !candidate.t.trim() || candidate.t.length > PLAN_SHARE_MAX_TITLE_LENGTH) {
    throw new Error('计划名称无效');
  }
  if (!Array.isArray(candidate.i) || candidate.i.length === 0) throw new Error('计划中没有可导入的点位');
  if (candidate.i.length > maxItems) throw new Error(`计划点位不能超过 ${maxItems} 个`);

  const seen = new Set<string>();
  const items: SharedPlanPoint[] = [];
  for (const item of candidate.i) {
    if (!isSharedPlanPoint(item)) throw new Error('计划中包含无效点位');
    const key = `${item[0]}:${item[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push([item[0], item[1]]);
  }

  if (items.length === 0) throw new Error('计划中没有可导入的点位');
  return { v: PLAN_SHARE_VERSION, t: candidate.t.trim(), i: items };
}

export function createSharedPlan(plan: ItineraryPlan): SharedPlan {
  return {
    v: PLAN_SHARE_VERSION,
    t: plan.title.trim().slice(0, PLAN_SHARE_MAX_TITLE_LENGTH),
    i: plan.items.map((item) => [item.bangumiId, item.pointId]),
  };
}

export function encodeSharedPlan(data: SharedPlan): string {
  return bytesToBase64Url(deflateSync(strToU8(JSON.stringify(data)), { level: 9 }));
}

export function decodeSharedPlan(packed: string): SharedPlan {
  if (!packed || packed.length > PLAN_SHARE_MAX_PACKED_LENGTH) throw new Error('二维码中的计划数据无效');
  const inflated = inflateSync(base64UrlToBytes(packed));
  if (inflated.byteLength > PLAN_SHARE_MAX_INFLATED_BYTES) throw new Error('二维码中的计划数据过大');
  return parseSharedPlan(JSON.parse(strFromU8(inflated)), PLAN_SHARE_MAX_QR_ITEMS, false);
}

export function getPlanShareBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_PLAN_SHARE_BASE_URL?.trim();
  return (configured || DEFAULT_SHARE_BASE_URL).replace(/#.*$/u, '');
}

export function createPlanShareBundle(plan: ItineraryPlan): PlanShareBundle {
  const data = createSharedPlan(plan);
  const packed = encodeSharedPlan(data);
  const url = `${getPlanShareBaseUrl()}#${packed}`;
  const urlBytes = strToU8(url).byteLength;
  return {
    data,
    packed,
    url,
    urlBytes,
    qrEligible: data.i.length <= PLAN_SHARE_MAX_QR_ITEMS && urlBytes <= PLAN_SHARE_MAX_QR_URL_BYTES,
  };
}

export function createSharedPlanFileContent(plan: ItineraryPlan): string {
  const data = createSharedPlan(plan);
  if (data.i.length > PLAN_SHARE_MAX_FILE_ITEMS) {
    throw new Error(`计划文件最多支持 ${PLAN_SHARE_MAX_FILE_ITEMS} 个点位`);
  }
  const file: SharedPlanFile = { type: PLAN_SHARE_FILE_TYPE, ...data };
  return `${JSON.stringify(file, null, 2)}\n`;
}

export function parseSharedPlanFile(content: string): SharedPlan {
  if (strToU8(content).byteLength > PLAN_SHARE_MAX_FILE_BYTES) throw new Error('计划文件不能超过 1 MB');
  return parseSharedPlan(JSON.parse(content), PLAN_SHARE_MAX_FILE_ITEMS, true);
}

export function extractPackedPlanFromValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('二维码内容为空');

  try {
    const url = new URL(trimmed);
    const queryData = url.searchParams.get('data');
    if (queryData) return queryData;
    const hashData = url.hash.replace(/^#(?:p=)?/u, '');
    if (hashData) return hashData;
  } catch {
    // A raw payload is accepted for forward compatibility with copied plan codes.
  }

  if (/^[A-Za-z0-9_-]+$/u.test(trimmed)) return trimmed;
  throw new Error('这不是有效的 Anitabi 巡礼计划二维码');
}

export function decodeSharedPlanValue(value: string): SharedPlan {
  return decodeSharedPlan(extractPackedPlanFromValue(value));
}

export function resolveSharedPlan(data: SharedPlan, mapData: AssembledData): ResolvedSharedPlan {
  const bangumis = new Map(mapData.data.bangumis.map((bangumi) => [bangumi.id, bangumi]));
  const pointMaps = new Map<number, Map<string, Point>>();
  const points: ResolvedSharedPlanPoint[] = [];
  const resolvedBangumiIds = new Set<number>();

  for (const [bangumiId, pointId] of data.i) {
    const bangumi = bangumis.get(bangumiId);
    if (!bangumi) continue;
    let pointMap = pointMaps.get(bangumiId);
    if (!pointMap) {
      pointMap = new Map(bangumi.points.map((point) => [point.id, point]));
      pointMaps.set(bangumiId, pointMap);
    }
    const point = pointMap.get(pointId);
    if (!point) continue;
    points.push({ bangumi, point });
    resolvedBangumiIds.add(bangumiId);
  }

  return {
    points,
    missingCount: data.i.length - points.length,
    bangumiCount: resolvedBangumiIds.size,
  };
}

export function sanitizePlanFileName(title: string): string {
  const safeTitle = title.replace(/[<>:"/\\|?*\u0000-\u001F]/gu, '-').replace(/[. ]+$/u, '').trim();
  return `${safeTitle || '巡礼计划'}.anitabi-plan.json`;
}
