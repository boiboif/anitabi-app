import { anitabiHandler } from './handlers';
import type { RawGBangumi, RawGDetail } from './types';

/**
 * d = 跟随 anitabi 网页端轮换的 CDN 查询参数。
 *
 * anitabi.cn 的地图数据 JSON 文件（/d/g0.json、/d/g1.json……）如果 URL 固定，
 * CDN 会长期缓存旧数据。下面的上游公式每 24 分钟轮换一次，
 * 保留该公式以兼容上游；地图刷新另外使用版本参数区分不同数据版本。
 *
 * 公式拆解：
 *   Date.now()               → 当前时间戳（毫秒）
 *   / 1e3 / 60 / 24          → 转成 24 分钟的时间段数
 *   Math.floor(...)          → 向下取整
 *   + 6                      → 保留 anitabi 使用的固定偏移量
 *   .toString(36)            → 转成 36 进制字符串（字符集 0-9a-z），比十进制更短，URL 更干净
 *
 * 逆向来源（给想自己跟一遍的同学）：
 *   1. 打开 anitabi.cn 的页面，在 DevTools 的 Sources 里搜索 /d/g.json?d=
 *   2. 找到 const P = T(), h = `/d/g.json?d=${P}`
 *   3. 发现 T 来自 import {h as z, i as T} from "./5361fdd2.js"
 *   4. 打开 5361fdd2.js，找到最后的导出映射 Ee as i（即 i → T → Ee）
 *   5. Ee 函数体就是下面这个公式
 */
const d = () => {
  return (Math.floor(Date.now() / 1e3 / 60 / 24) + 6).toString(36);
};

export type MapDataRequestOptions = {
  signal?: AbortSignal;
  timeout?: number;
  suppressErrorToast?: boolean;
  revision?: number;
  bypassCache?: boolean;
};

let requestSequence = 0;

function getMapJSON<T>(path: string, options: MapDataRequestOptions = {}): Promise<T> {
  const query = `d=${d()}${options.revision === undefined ? '' : `&v=${options.revision}`}${
    options.bypassCache ? `&check=${Date.now()}-${++requestSequence}` : ''
  }`;
  // The service owns retry feedback; intermediate failures must not produce repeated toasts.
  const config = {
    signal: options.signal,
    timeout: options.timeout,
    suppressErrorToast: options.suppressErrorToast,
  };
  return anitabiHandler.get<T>(`${path}?${query}`)(undefined, config);
}

export const getGDetailJSON = (index: number, options?: MapDataRequestOptions) =>
  getMapJSON<RawGDetail[]>(`/d/g${index}.json`, options);

export const getGJSON = (options?: MapDataRequestOptions) =>
  getMapJSON<[RawGBangumi[], number, number]>('/d/g.json', options);

export const getBangumiIcons = anitabiHandler.get<{ ids: string[]; src: string }>(
  '/d/bangumi-icons.json' + '?d=' + d(),
);
