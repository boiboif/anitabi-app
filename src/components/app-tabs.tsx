import { useThemeOverride } from '@/lib/theme-context';
import { Home, User } from '@tamagui/lucide-icons-2';
import { BlurView } from 'expo-blur';
import { usePathname } from 'expo-router';
import { TabList, Tabs, TabSlot, TabTrigger } from 'expo-router/ui';
import { Platform, Pressable, Text, View } from 'react-native';
import { useTheme } from 'tamagui';

const TAB_CONFIG = [
  { name: 'index', label: 'Home', icon: Home },
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
      <View
        style={{
          position: 'absolute',
          bottom: Platform.OS === 'ios' ? 54 : 34,
          left: 16,
          right: 16,
          borderRadius: 24,
          overflow: 'visible',
          boxShadow: theme === 'light' ? '0 0 10px 0 rgba(0, 0, 0, 0.1)' : '0 0 10px 0 rgba(255, 255, 255, 0.1)',
        }}
      >
        <BlurView
          intensity={80}
          tint={theme === 'dark' ? 'dark' : 'light'}
          style={{ borderRadius: 24, overflow: 'hidden' }}
        >
          <View
            style={{
              flexDirection: 'row',
              paddingVertical: 4,
              paddingHorizontal: 8,
              borderRadius: 24,
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
