import { getMapStyleFollowsTheme, setMapStyleFollowsTheme } from '@/lib/storage';
import { create } from 'zustand';

type MapStylePreferenceStore = {
  followsTheme: boolean;
  setFollowsTheme: (followsTheme: boolean) => void;
};

export const useMapStylePreference = create<MapStylePreferenceStore>((set) => ({
  followsTheme: getMapStyleFollowsTheme(),
  setFollowsTheme: (followsTheme) => {
    set({ followsTheme });
    setMapStyleFollowsTheme(followsTheme);
  },
}));
