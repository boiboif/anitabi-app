import { getCurrentLanguage, resolveLanguageTag } from '@/i18n';
import type { Bangumi, Point } from '@/services/types';

export function getBangumiTitle(bangumi: Bangumi, languageTag?: string): string {
  const language = languageTag ? resolveLanguageTag(languageTag) : getCurrentLanguage();

  if (language === 'en') return bangumi.en || bangumi.title || '';
  if (language === 'ja') return bangumi.title || bangumi.tAbbr || '';
  return bangumi.cn || bangumi.title || '';
}

export function getBangumiMapLabel(bangumi: Bangumi, languageTag?: string): string {
  const language = languageTag ? resolveLanguageTag(languageTag) : getCurrentLanguage();
  return language === 'ja' ? bangumi.tAbbr || bangumi.title || '' : getBangumiTitle(bangumi, language);
}

export function getPointTitle(point: Point, languageTag?: string): string {
  const language = languageTag ? resolveLanguageTag(languageTag) : getCurrentLanguage();
  return language === 'ja' ? point.name || point.cn || '' : point.cn || point.name || '';
}
