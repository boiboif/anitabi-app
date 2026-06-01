import { createHandler } from './createHandler';

export const baseUrl = 'https://www.anitabi.cn';

export const apiUrl = 'https://www.anitabi.cn/api';

/** 番剧雪碧图地址 — 按 allowedIds 顺序排列，20列网格，每格 60×60 */
export const bangumiSpriteUrl = 'https://www.anitabi.cn/images/bangumi-icons.webp';

export const anitabiHandler = createHandler({
  baseUrl,
});

export const anitabiApiHandler = createHandler({
  baseUrl: apiUrl,
});
