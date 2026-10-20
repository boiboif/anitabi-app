/** Transparent spacing on each side of a row; retained for consistent list geometry. */
export const CARD_LIST_ITEM_INSET = 4;
export const CARD_LIST_GAP = CARD_LIST_ITEM_INSET * 2;

/** Includes the row's spacing; use for fixed sizes and scroll estimates. */
export function getCardListItemHeight(cardHeight: number): number {
  return cardHeight + CARD_LIST_GAP;
}

/** Desired surface-to-header/edge gap, after accounting for the row's inset. */
export function getCardListBoundarySpacing(gap: number): number {
  return Math.max(0, gap - CARD_LIST_ITEM_INSET);
}
