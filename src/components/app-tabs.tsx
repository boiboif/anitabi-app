import { useDoubleBackExit } from '@/hooks/use-double-back-exit';
import { hexToRgba } from '@/lib/color';
import { useTabBarStyle } from '@/store/use-tab-bar-style';
import type { IconProps } from '@tamagui/helpers-icon';
import { CalendarDays, Heart, Map, User } from '@tamagui/lucide-icons-2';
import { BlurView } from 'expo-blur';
import { usePathname, useRouter } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { useState } from 'react';
import { Platform, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTokens, Text, useTheme, useThemeName, View } from 'tamagui';
import { AppTabBarInsetContext } from './app-tab-bar-inset';

const TAB_CONFIG = [
  { name: 'index', path: '/', label: 'map', icon: Map, nativeIcon: { sf: 'map', md: 'map' } },
  {
    name: 'favorites',
    path: '/favorites',
    label: 'favorites',
    icon: Heart,
    nativeIcon: { sf: 'heart', md: 'favorite' },
  },
  {
    name: 'plan',
    path: '/plan',
    label: 'plans',
    icon: CalendarDays,
    nativeIcon: { sf: 'calendar', md: 'calendar_month' },
  },
  {
    name: 'profile',
    path: '/profile',
    label: 'me',
    icon: User,
    nativeIcon: { sf: 'person.crop.circle', md: 'person' },
  },
] as const;

function TabItem({
  icon: Icon,
  label,
  isFocused,
  color,
  onPress,
}: {
  icon: typeof Map;
  label: string;
  isFocused: boolean;
  color: IconProps['color'];
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onPress}
      style={{
        flex: 1,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 6,
        gap: 2,
      }}
    >
      <Icon size={24} color={color} />
      <View style={{ overflow: 'hidden', borderRadius: 4 }}>
        <Text fontSize="$caption" color={color} fontWeight={isFocused ? '600' : '400'} textDecorationLine="none">
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export default function AppTabs() {
  useDoubleBackExit();

  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const theme = useTheme();
  const colorScheme = useThemeName() === 'dark' ? 'dark' : 'light';
  const usesLiquidGlass = Platform.OS === 'ios' && Number.parseInt(Platform.Version, 10) >= 26;
  const useCustomBar = useTabBarStyle((state) => state.style === 'custom');
  const { bottom } = useSafeAreaInsets();
  const [tabBarHeight, setTabBarHeight] = useState<number | null>(null);
  const tabBarBottom = Math.max(bottom, Platform.OS === 'ios' ? 54 : 34);
  // Android NativeTabs already reserves the system bottom inset when its bar is hidden.
  const sceneBottomInset = Platform.OS === 'android' ? bottom : 0;
  const customBarInset = tabBarHeight === null ? null : tabBarBottom + tabBarHeight - sceneBottomInset;
  const activeColor = theme.primary.val;
  const inactiveColor = theme.color11?.val ?? '#8E8E93';
  // Let Liquid Glass adapt inactive items to the content beneath the bar.
  const nativeInactiveColor = usesLiquidGlass ? undefined : theme.color11.val;
  const tabs = TAB_CONFIG.map((tab) => ({ ...tab, title: t(tab.label) }));

  return (
    <AppTabBarInsetContext value={useCustomBar ? customBarInset : undefined}>
      <View flex={1} bg="$pageBackground">
        <NativeTabs
          hidden={useCustomBar}
          disableHiddenAnimation
          sidebarAdaptable={false}
          labelVisibilityMode="labeled"
          minimizeBehavior={usesLiquidGlass ? 'never' : undefined}
          backgroundColor={theme.background.val}
          disableTransparentOnScrollEdge
          shadowColor={theme.color5.val}
          indicatorColor={theme.tabBarIndicator.val}
          rippleColor={hexToRgba(activeColor, colorScheme === 'dark' ? 0.2 : 0.12)}
          iconColor={{ default: nativeInactiveColor, selected: activeColor }}
          labelStyle={{ default: { color: nativeInactiveColor }, selected: { color: activeColor } }}
          tintColor={activeColor}
          unstable_nativeProps={{ colorScheme }}
        >
          {tabs.map((tab) => (
            <NativeTabs.Trigger key={tab.name} name={tab.name} disableAutomaticContentInsets={Platform.OS === 'ios'}>
              <NativeTabs.Trigger.Icon {...tab.nativeIcon} />
              <NativeTabs.Trigger.Label>{tab.title}</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>
          ))}
        </NativeTabs>

        {useCustomBar && (
          <View
            rounded="$9"
            position="absolute"
            b={tabBarBottom}
            l="$3"
            r="$3"
            z={1}
            onLayout={({ nativeEvent }) => setTabBarHeight(nativeEvent.layout.height)}
          >
            <BlurView
              intensity={80}
              tint={colorScheme}
              style={{
                borderRadius: getTokens().radius['9'].val,
                overflow: 'hidden',
                boxShadow:
                  colorScheme === 'light' ? '0 0 10px 0 rgba(0, 0, 0, 0.1)' : '0 0 10px 0 rgba(255, 255, 255, 0.1)',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  paddingVertical: 4,
                  paddingHorizontal: 8,
                  borderRadius: getTokens().radius['9'].val,
                }}
              >
                {tabs.map((tab) => {
                  const isFocused = pathname === tab.path || (tab.path !== '/' && pathname.startsWith(`${tab.path}/`));
                  return (
                    <TabItem
                      key={tab.name}
                      icon={tab.icon}
                      label={tab.title}
                      isFocused={isFocused}
                      color={isFocused ? activeColor : inactiveColor}
                      onPress={() => {
                        if (!isFocused) router.navigate(tab.path);
                      }}
                    />
                  );
                })}
              </View>
            </BlurView>
          </View>
        )}
      </View>
    </AppTabBarInsetContext>
  );
}
