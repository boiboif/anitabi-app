import { normalizeNavigationMap, type NavigationMap } from '@/lib/pilgrimage-navigation';
import { getNavigationMapPreference, setNavigationMapPreference } from '@/lib/storage';
import { Platform } from 'react-native';
import { create } from 'zustand';

type PilgrimagePreferencesStore = {
  navigationMap: NavigationMap;
  setNavigationMap: (map: NavigationMap) => void;
};

export const usePilgrimagePreferences = create<PilgrimagePreferencesStore>((set) => ({
  navigationMap: normalizeNavigationMap(getNavigationMapPreference(), Platform.OS),
  setNavigationMap: (map) => {
    const navigationMap = normalizeNavigationMap(map, Platform.OS);
    setNavigationMapPreference(navigationMap);
    set({ navigationMap });
  },
}));
