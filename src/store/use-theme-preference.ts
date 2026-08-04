import { getThemePreference, setThemePreference, type ThemePreference } from '@/lib/storage';
import { create } from 'zustand';

type ThemePreferenceStore = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const initialPreference = getThemePreference();

export const useThemePreference = create<ThemePreferenceStore>((set) => ({
  preference: initialPreference,
  setPreference: (preference) => {
    set({ preference });
    setThemePreference(preference);
  },
}));
