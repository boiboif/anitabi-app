import { createHandler } from './createHandler';

export const baseUrl = 'https://www.anitabi.cn';

export const apiUrl = 'https://www.anitabi.cn/api';

export const anitabiHandler = createHandler({
  baseUrl,
});

export const anitabiApiHandler = createHandler({
  baseUrl: apiUrl,
});
