import i18n, { resolveLanguagePreference } from '@/i18n';
import { getLanguagePreference, setLanguagePreference, type LanguagePreference } from '@/lib/storage';
import { create } from 'zustand';

type LanguagePreferenceStore = {
  preference: LanguagePreference;
  setPreference: (preference: LanguagePreference) => void;
};

export const useLanguagePreference = create<LanguagePreferenceStore>((set) => ({
  preference: getLanguagePreference(),
  setPreference: (preference) => {
    setLanguagePreference(preference);
    set({ preference });
    void i18n.changeLanguage(resolveLanguagePreference(preference));
  },
}));
