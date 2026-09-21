import type { TFunction } from 'i18next';

import type zh from './translations/zh';
import type { TranslationKey } from './translations/zh';

export type TranslationMessage = {
  [Key in TranslationKey]: {
    key: Key;
    defaultValue: (typeof zh)[Key];
  };
}[TranslationKey];

const categoryMessages: Record<string, TranslationMessage> = {
  动画: { key: 'anime', defaultValue: '动画' },
  电影: { key: 'movie', defaultValue: '电影' },
  游戏: { key: 'game', defaultValue: '游戏' },
  小说: { key: 'novel', defaultValue: '小说' },
  漫画: { key: 'manga', defaultValue: '漫画' },
};

export function getCategoryMessage(category?: string): TranslationMessage | undefined {
  return category ? categoryMessages[category] : undefined;
}

export function translateMessage(t: TFunction<'translation'>, message: TranslationMessage): string {
  return t(message.key, { defaultValue: message.defaultValue } as never);
}
