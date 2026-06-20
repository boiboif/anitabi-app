import { createHandler } from './createHandler';

export const baseUrl = 'https://www.anitabi.cn';

export const apiUrl = 'https://www.anitabi.cn/api';

export const imageUrl = 'https://img-tc.anitabi.cn';

export const anitabiHandler = createHandler({
  baseUrl,
});

export const anitabiApiHandler = createHandler({
  baseUrl: apiUrl,
});

export const buildImageUrl = (path: string, query?: string) =>
  path.startsWith('http://') || path.startsWith('https://')
    ? path + (query ? `?${query}` : '')
    : `${imageUrl}${path}${query ? `?${query}` : ''}`.replace('/images', '');
