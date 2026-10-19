export const CARD_LIST_SHADOW = '0 1px 3px $shadowColor';

/** Transparent room for CARD_LIST_SHADOW on each side of a row. */
export const CARD_LIST_ITEM_INSET = 4;
export const CARD_LIST_GAP = CARD_LIST_ITEM_INSET * 2;

/** Includes the row's shadow room; use for fixed sizes and scroll estimates. */
export function getCardListItemHeight(cardHeight: number): number {
  return cardHeight + CARD_LIST_GAP;
}

/** Desired surface-to-header/edge gap, after accounting for the row's inset. */
export function getCardListBoundarySpacing(gap: number): number {
  return Math.max(0, gap - CARD_LIST_ITEM_INSET);
}
