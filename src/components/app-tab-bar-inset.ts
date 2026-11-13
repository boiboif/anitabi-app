import { createContext } from 'react';

/** Distance from the screen bottom to the measured top of the floating tab bar. */
export const AppTabBarInsetContext = createContext<number | null>(null);
