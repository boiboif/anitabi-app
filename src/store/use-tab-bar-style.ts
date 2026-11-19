import { getTabBarStyle, setTabBarStyle, type TabBarStyle } from '@/lib/storage';
import { create } from 'zustand';

type TabBarStyleStore = {
  style: TabBarStyle;
  setStyle: (style: TabBarStyle) => void;
};

export const useTabBarStyle = create<TabBarStyleStore>((set) => ({
  style: getTabBarStyle(),
  setStyle: (style) => {
    setTabBarStyle(style);
    set({ style });
  },
}));
