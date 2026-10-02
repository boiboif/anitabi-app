import { useMapBrowse } from '@/store/use-map-browse';
import { Toast } from '@boiboif/react-native-toast';
import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';

const EXIT_CONFIRMATION_WINDOW_MS = 2000;
const DETAIL_DISMISS_BACK_GUARD_MS = 500;

export function useDoubleBackExit() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const lastBackPressAt = useRef(0);
  const lastDetailsClosedAt = useRef(0);

  useEffect(() => {
    if (Platform.OS !== 'android' || pathname !== '/') {
      lastBackPressAt.current = 0;
      lastDetailsClosedAt.current = 0;
      return undefined;
    }

    const unsubscribe = useMapBrowse.subscribe((state, previousState) => {
      if (state.openedBangumiDetailsId !== previousState.openedBangumiDetailsId) {
        lastBackPressAt.current = 0;
        if (previousState.openedBangumiDetailsId !== null && state.openedBangumiDetailsId === null) {
          lastDetailsClosedAt.current = Date.now();
        }
      }
    });

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      // TrueSheet registers its own back handler only after the opening animation finishes.
      const { openedBangumiDetailsId, closeBangumiDetails } = useMapBrowse.getState();
      if (openedBangumiDetailsId !== null) {
        closeBangumiDetails();
        return true;
      }

      const now = Date.now();
      // A second back event while the sheet is being removed must not enter the exit flow.
      if (now - lastDetailsClosedAt.current <= DETAIL_DISMISS_BACK_GUARD_MS) return true;

      if (now - lastBackPressAt.current <= EXIT_CONFIRMATION_WINDOW_MS) {
        BackHandler.exitApp();
        return true;
      }

      lastBackPressAt.current = now;
      Toast.show(t('pressBackAgainToExit', { defaultValue: '再按一次退出应用' }));
      return true;
    });

    return () => {
      subscription.remove();
      unsubscribe();
    };
  }, [pathname, t]);
}
