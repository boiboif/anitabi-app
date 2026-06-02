import { anitabiApiHandler, anitabiHandler } from './handlers';

/**
 * d = 每日轮换的查询参数，用于绕过 anitabi.cn 的 CDN 缓存。
 *
 * anitabi.cn 的地图数据 JSON 文件（/d/g0.json ~ /d/g6.json）如果 URL 固定，
 * CDN 会长期缓存旧数据。所以他们在 URL 末尾加了一个按「天」变化的参数 d，
 * 这样每天都是一个新的 URL，CDN 就会回源拿新数据。
 *
 * 公式拆解：
 *   Date.now()               → 当前时间戳（毫秒）
 *   / 1e3 / 60 / 24          → 转成「天数」（1e3 = 1000 毫秒 → 秒，/60 → 分钟，/24 → 小时 → 天）
 *   Math.floor(...)          → 向下取整，得到从 1970.1.1 到今天的天数
 *   + 6                      → 偏移量（anitabi 自己加的一个常数，让起始天偏移 6 天）
 *   .toString(36)            → 转成 36 进制字符串（字符集 0-9a-z），比十进制更短，URL 更干净
 *
 * 以今天为例：天数 ≈ 20607 → +6 = 20613 → toString(36) = "fwl3"
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

export const getG0JSON = anitabiHandler.get<any[][]>('/d/g0.json' + '?d=' + d());
export const getG1JSON = anitabiHandler.get<any[][]>('/d/g1.json' + '?d=' + d());
export const getG2JSON = anitabiHandler.get<any[][]>('/d/g2.json' + '?d=' + d());
export const getG3JSON = anitabiHandler.get<any[][]>('/d/g3.json' + '?d=' + d());
export const getG4JSON = anitabiHandler.get<any[][]>('/d/g4.json' + '?d=' + d());
export const getG5JSON = anitabiHandler.get<any[][]>('/d/g5.json' + '?d=' + d());

export const getGJSON = anitabiHandler.get<[any[][], number, number]>('/d/g.json' + '?d=' + d());

export const getBangumiIcons = anitabiApiHandler.get<{ ids: string[]; src: string }>(
  '/bangumi/icons.svg' + '?d=' + d(),
);
