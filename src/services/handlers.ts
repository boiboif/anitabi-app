import { createHandler } from './createHandler';

// export const baseUrl = 'https://ww.anitabi.cn';
export const baseUrl = 'http://192.168.144.7:8080';

export const apiUrl = 'https://www.anitabi.cn/api';

// export const imageUrl = 'https://img-tc.anitabi.cn';
export const imageUrl = 'http://192.168.144.7:8080/assets';

export const anitabiHandler = createHandler({
  baseUrl,
});

export const anitabiApiHandler = createHandler({
  baseUrl: apiUrl,
});

// export const buildImageUrl = (path: string, query?: string) =>
//   path.startsWith('http://') || path.startsWith('https://')
//     ? path.replace('http://', 'https://')
//     : `${imageUrl}${path}${query ? `?${query}` : ''}`.replace('/images', '');

export const buildImageUrl = (path: string, query?: string) => {
  if (!path) return '';

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = `/${path.replace(/^\/+/, '')}`;
  const normalizedImageUrl = imageUrl.replace(/\/+$/, '');
  const isMirror = /\/assets$/i.test(normalizedImageUrl);

  if (isMirror) {
    const plan = new URLSearchParams(query ?? '').get('plan');
    const variant = plan === 'h160' || plan === 'h360' ? plan : 'original';

    const assetPath =
      variant === 'original'
        ? normalizedPath
        : /\.[^/.]+$/.test(normalizedPath)
          ? normalizedPath.replace(/\.[^/.]+$/, '.jpg')
          : `${normalizedPath}.jpg`;

    return `${normalizedImageUrl}/${variant}${assetPath}`;
  }

  const upstreamPath = normalizedPath.replace(/^\/images/, '');
  return `${normalizedImageUrl}${upstreamPath}${query ? `?${query}` : ''}`;
};
