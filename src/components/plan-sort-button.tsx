import { StrictButton as Button } from '@/components/strict-button';
import type { PlanListSortOrder } from '@/lib/plan-storage';
import { ICON_BUTTON_ICON_SIZE } from '@/lib/ui-sizes';
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from '@tamagui/lucide-icons-2';
import { useTranslation } from 'react-i18next';

type Props = {
  sortOrder: PlanListSortOrder;
  onPress: () => void;
};

export default function PlanSortButton({ sortOrder, onPress }: Props) {
  const { t } = useTranslation();

  return (
    <Button
      chromeless
      circular
      size="$3"
      icon={
        sortOrder === 'desc' ? (
          <ArrowDownWideNarrow size={ICON_BUTTON_ICON_SIZE} strokeWidth={2} color="$color11" />
        ) : (
          <ArrowUpNarrowWide size={ICON_BUTTON_ICON_SIZE} strokeWidth={2} color="$color11" />
        )
      }
      aria-label={
        sortOrder === 'desc'
          ? t('sortPlansOldestFirst', { defaultValue: '当前按创建时间倒序，点击切换为正序' })
          : t('sortPlansNewestFirst', { defaultValue: '当前按创建时间正序，点击切换为倒序' })
      }
      onPress={onPress}
    />
  );
}
