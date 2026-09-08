import AddToPlanButton from '@/components/add-to-plan-button';
import ComparisonCameraButton from '@/components/comparison-camera-button';
import GoogleMapsNavigationButton from '@/components/google-maps-navigation-button';
import type { Bangumi, Point } from '@/services/types';
import { XStack } from 'tamagui';

type Props = {
  point: Point;
  bangumi: Bangumi;
  showAddToPlan?: boolean;
  showCamera?: boolean;
  showNavigation?: boolean;
  size?: number;
};

export default function PointCardActions({
  point,
  bangumi,
  showAddToPlan = true,
  showCamera = false,
  showNavigation = false,
  size = 36,
}: Props) {
  if (!showAddToPlan && !showCamera && !showNavigation) return null;

  return (
    <XStack justify="flex-end" items="center" gap="$0.5">
      {showAddToPlan ? <AddToPlanButton point={point} bangumi={bangumi} size={size} /> : null}
      {showCamera ? <ComparisonCameraButton point={point} bangumi={bangumi} compact compactSize={size} /> : null}
      {showNavigation ? <GoogleMapsNavigationButton point={point} compact compactSize={size} /> : null}
    </XStack>
  );
}
