import Toast from '@modules/toaster';
import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';

const EXIT_CONFIRMATION_WINDOW_MS = 2000;

export function useDoubleBackExit() {
  const pathname = usePathname();
  const lastBackPressAt = useRef(0);

  useEffect(() => {
    if (Platform.OS !== 'android' || pathname !== '/') {
      lastBackPressAt.current = 0;
      return undefined;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const now = Date.now();

      if (now - lastBackPressAt.current <= EXIT_CONFIRMATION_WINDOW_MS) {
        BackHandler.exitApp();
        return true;
      }

      lastBackPressAt.current = now;
      Toast.show('再按一次退出应用');
      return true;
    });

    return () => subscription.remove();
  }, [pathname]);
}
