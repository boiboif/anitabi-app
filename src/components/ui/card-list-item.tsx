import { CARD_LIST_ITEM_INSET } from '@/lib/card-list-layout';
import type { ReactNode } from 'react';
import { YStack, type YStackProps } from 'tamagui';

type Props = {
  children: ReactNode;
  horizontalInset?: YStackProps['px'];
  grid?: boolean;
};

/** List rows own spacing; the card inside owns its surface and content clipping. */
export default function CardListItem({ children, horizontalInset, grid = false }: Props) {
  return (
    <YStack
      py={CARD_LIST_ITEM_INSET}
      px={horizontalInset ?? (grid ? CARD_LIST_ITEM_INSET : 0)}
      flex={grid ? 1 : undefined}
    >
      {children}
    </YStack>
  );
}
