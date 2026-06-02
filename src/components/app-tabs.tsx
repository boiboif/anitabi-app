import { useThemeOverride } from '@/lib/theme-context';
import { Heart, Map, User } from '@tamagui/lucide-icons-2';
import { BlurView } from 'expo-blur';
import { usePathname } from 'expo-router';
import { TabList, Tabs, TabSlot, TabTrigger } from 'expo-router/ui';
import { Platform, Pressable, Text } from 'react-native';
import { getTokens, useTheme, View } from 'tamagui';

const TAB_CONFIG = [
  { name: 'index', label: '地图', icon: Map },
  { name: 'favorites', label: '收藏', icon: Heart },
  { name: 'profile', label: '我的', icon: User },
] as const;

function TabItem({ name, label, icon: Icon }: (typeof TAB_CONFIG)[number]) {
  const theme = useTheme();
  const pathname = usePathname();
  const isFocused = name === 'index' ? pathname === '/' : pathname.startsWith(`/${name}`);

  const activeColor = theme.primary?.val ?? '#007AFF';
  const inactiveColor = theme.color11?.val ?? '#8E8E93';
  const color = isFocused ? activeColor : inactiveColor;

  return (
    <TabTrigger name={name} asChild>
      <Pressable
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
          <Text style={{ fontSize: 10, color, fontWeight: isFocused ? '600' : '400', textDecorationLine: 'none' }}>
            {label}
          </Text>
        </View>
      </Pressable>
    </TabTrigger>
  );
}

export default function AppTabs() {
  const { theme } = useThemeOverride();

  return (
    <Tabs>
      <TabSlot />

      {/* Hidden route registration */}
      <TabList style={{ position: 'absolute', left: -9999, width: 0, height: 0, overflow: 'hidden', opacity: 0 }}>
        {TAB_CONFIG.map((tab) => (
          <TabTrigger key={tab.name} name={tab.name} href={tab.name === 'index' ? '/' : `/${tab.name}`} />
        ))}
      </TabList>

      {/* Floating tab bar */}
      <View rounded="$9" position="absolute" b={Platform.OS === 'ios' ? 54 : 34} l="$3" r="$3">
        <BlurView
          intensity={80}
          tint={theme}
          style={{
            borderRadius: getTokens().radius['9'].val,
            overflow: 'hidden',
            boxShadow: theme === 'light' ? '0 0 10px 0 rgba(0, 0, 0, 0.1)' : '0 0 10px 0 rgba(255, 255, 255, 0.1)',
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
            {TAB_CONFIG.map((tab) => (
              <TabItem key={tab.name} {...tab} />
            ))}
          </View>
        </BlurView>
      </View>
    </Tabs>
  );
}
