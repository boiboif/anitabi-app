import { useOpenSourceLibraries } from '@/hooks/use-open-source-libraries';
import { getCurrentAppDisplayVersion } from '@/services/app-update';
import { MaxContentWidth } from '@/tamagui.config';
import { ChevronRight } from '@tamagui/lucide-icons-2';
import * as Linking from 'expo-linking';
import { Link, Stack, type Href, useLocalSearchParams } from 'expo-router';
import { Alert, FlatList, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Library } from 'react-native-legal';
import { Button, Spinner, Text, XStack, YStack, useTheme } from 'tamagui';

async function openLicenseUrl(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('无法打开链接', '请稍后重试。');
  }
}

function LicenseListItem({ item }: { item: Library }) {
  const licenseCount = item.licenses.length;

  return (
    <YStack width="100%" maxW={MaxContentWidth} self="center">
      <Link href={{ pathname: '/open-source-license', params: { libraryId: item.id } } as unknown as Href} asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.name}，${licenseCount} 份许可证`}
          style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
        >
          <YStack minH={76} justify="center" items="flex-start" px="$4" py="$3" gap="$0.5">
            <Text selectable width="100%" fontSize="$subtitle" lineHeight={22} fontWeight="500" color="$color12">
              {item.name}
            </Text>
            <Text width="100%" fontSize="$body" lineHeight={20} color="$color11">
              {licenseCount} 份许可证
            </Text>
          </YStack>
        </Pressable>
      </Link>
    </YStack>
  );
}

export default function OpenSourceLicensesScreen() {
  const { scope: scopeParam } = useLocalSearchParams<{ scope?: string | string[] }>();
  const scope = Array.isArray(scopeParam) ? scopeParam[0] : scopeParam;
  const isAdditionalList = scope === 'additional';
  const safeAreaInsets = useSafeAreaInsets();
  const theme = useTheme();
  const { primaryLibraries, additionalLibraries, isLoading, error, retry } = useOpenSourceLibraries();
  const displayedLibraries = isAdditionalList ? additionalLibraries : primaryLibraries;

  return (
    <>
      <Stack.Screen options={{ title: isAdditionalList ? '其他第三方依赖' : '许可' }} />
      <FlatList
        data={displayedLibraries}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <LicenseListItem item={item} />}
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1, backgroundColor: theme.background?.val }}
        contentContainerStyle={{
          paddingLeft: safeAreaInsets.left,
          paddingRight: safeAreaInsets.right,
          paddingBottom: safeAreaInsets.bottom + 24,
        }}
        ListHeaderComponent={
          isAdditionalList ? (
            <YStack width="100%" maxW={MaxContentWidth} self="center" px="$4" pt="$5" pb="$3">
              <Text selectable fontSize="$body" lineHeight={22} color="$color11">
                以下组件由项目依赖间接引入，保留在完整清单中以满足开源许可证声明要求。
              </Text>
            </YStack>
          ) : (
            <YStack width="100%" maxW={MaxContentWidth} self="center" items="center" pt="$8" pb="$6">
              <Text selectable fontSize="$heading" lineHeight={30} fontWeight="500" color="$color12">
                Anitabi
              </Text>
              <Text selectable mt="$0.5" fontSize="$body" lineHeight={20} color="$color12">
                {getCurrentAppDisplayVersion()}
              </Text>

              <Pressable
                accessibilityRole="link"
                accessibilityLabel="查看 Anitabi 开源许可证"
                onPress={() => void openLicenseUrl('https://github.com/boiboif/anitabi-app/blob/main/LICENSE')}
                style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
              >
                <Text mt="$5" fontSize="$body" lineHeight={22} fontWeight="500" color="$color12">
                  开源许可证
                </Text>
              </Pressable>

              <Text mt="$5" fontSize="$body" lineHeight={22} color="$color12">
                Powered by Expo
              </Text>
            </YStack>
          )
        }
        ListFooterComponent={
          !isAdditionalList && additionalLibraries.length > 0 ? (
            <Link push href={{ pathname: '/open-source-licenses', params: { scope: 'additional' } }} asChild>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`查看其他第三方依赖，共 ${additionalLibraries.length} 个组件`}
                style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
              >
                <XStack
                  width="100%"
                  maxW={MaxContentWidth}
                  minH={76}
                  self="center"
                  items="center"
                  px="$4"
                  py="$3"
                  gap="$3"
                >
                  <YStack flex={1} gap="$0.5">
                    <Text fontSize="$subtitle" lineHeight={22} fontWeight="500" color="$color12">
                      其他第三方依赖
                    </Text>
                    <Text fontSize="$body" lineHeight={20} color="$color11">
                      {additionalLibraries.length} 个组件，查看完整声明
                    </Text>
                  </YStack>
                  <ChevronRight size={20} color="$color10" />
                </XStack>
              </Pressable>
            </Link>
          ) : null
        }
        ListEmptyComponent={
          <YStack width="100%" maxW={MaxContentWidth} self="center" items="center" px="$4" py="$8" gap="$3">
            {isLoading ? <Spinner size="large" color="$primary" /> : null}
            <Text text="center" fontSize="$body" lineHeight={22} color="$color11">
              {isLoading ? '正在整理开源许可证…' : (error ?? '当前构建中没有可显示的许可证数据。')}
            </Text>
            {error ? (
              <Button size="$3" bg="$primary" color="white" onPress={retry}>
                重试
              </Button>
            ) : null}
          </YStack>
        }
      />
    </>
  );
}
