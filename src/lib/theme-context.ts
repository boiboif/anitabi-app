import { createContext, useContext } from 'react';

type ThemeContextType = {
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
};

export const ThemeOverrideContext = createContext<ThemeContextType>({
  theme: 'light',
  setTheme: () => {},
});

export const useThemeOverride = () => useContext(ThemeOverrideContext);