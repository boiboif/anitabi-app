import { DARK_MAP_STYLE_INDEX, STREET_MAP_STYLE_INDEX } from '@/lib/map-styles';
import { useMapStylePreference } from '@/store/use-map-style-preference';
import { useCallback, useState } from 'react';
import { useThemeName } from 'tamagui';

export function useThemedMapStyle() {
  const themeName = useThemeName();
  const followsTheme = useMapStylePreference((state) => state.followsTheme);
  const themeDefaultStyleIndex = followsTheme && themeName === 'dark' ? DARK_MAP_STYLE_INDEX : STREET_MAP_STYLE_INDEX;
  const themeContextKey = followsTheme ? `follow-${themeName}` : 'manual';
  const [selection, setSelection] = useState({
    contextKey: themeContextKey,
    styleIndex: themeDefaultStyleIndex,
  });
  const styleIndex = selection.contextKey === themeContextKey ? selection.styleIndex : themeDefaultStyleIndex;

  const setStyleIndex = useCallback(
    (nextStyleIndex: number) => {
      setSelection({ contextKey: themeContextKey, styleIndex: nextStyleIndex });
    },
    [themeContextKey],
  );

  return [styleIndex, setStyleIndex] as const;
}
