import { createContext, use } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Undefined selects the native bar. Null means the floating bar is still being measured.
export const AppTabBarInsetContext = createContext<number | null | undefined>(undefined);

/** Distance from the tab scene's bottom to the top of the visible tab bar. */
export function useAppTabBarInset() {
  const floatingInset = use(AppTabBarInsetContext);
  const { bottom } = useSafeAreaInsets();
  // Android NativeTabs lays out the scene above the bar. iOS reports the bar in the scene safe area.
  return floatingInset === undefined ? (Platform.OS === 'android' ? 0 : bottom) : floatingInset;
}
