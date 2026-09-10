import { clearMapCache } from '@/lib/map-storage';
import { Directory, Paths } from 'expo-file-system';
import { Image } from 'expo-image';

const BANGUMI_ICON_CACHE_DIRECTORY = 'bangumi-icons';

export async function clearAppCache(): Promise<void> {
  clearMapCache();

  const bangumiIconCache = new Directory(Paths.document, BANGUMI_ICON_CACHE_DIRECTORY);
  if (bangumiIconCache.exists) bangumiIconCache.delete();

  await Promise.all([Image.clearMemoryCache(), Image.clearDiskCache()]);
}
