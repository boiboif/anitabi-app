import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTheme } from 'tamagui';

export default function AppTabs() {
  const theme = useTheme();

  return (
    <NativeTabs
      backgroundColor={theme.background?.val}
      indicatorColor={theme.color2?.val}
      rippleColor={theme.color4?.val}
      labelStyle={{ selected: { color: theme.primary?.val }, default: { color: theme.color11?.val } }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          selectedColor={theme.primary?.val}
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>我的</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          selectedColor={theme.primary?.val}
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
