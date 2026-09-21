import { StrictButton as Button } from '@/components/strict-button';
import { useOpenSourceLibraries } from '@/hooks/use-open-source-libraries';
import { MaxContentWidth } from '@/tamagui.config';
import * as Linking from 'expo-linking';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Alert, Platform, Pressable, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spinner, Text, YStack, useTheme } from 'tamagui';

async function openExternalUrl(url: string, errorTitle: string, errorMessage: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert(errorTitle, errorMessage);
  }
}

export default function OpenSourceLicenseScreen() {
  const { t } = useTranslation();
  const { libraryId: libraryIdParam } = useLocalSearchParams<{ libraryId?: string | string[] }>();
  const libraryId = Array.isArray(libraryIdParam) ? libraryIdParam[0] : libraryIdParam;
  const safeAreaInsets = useSafeAreaInsets();
  const theme = useTheme();
  const { libraries, isLoading, error, retry } = useOpenSourceLibraries();
  const library = libraries.find((item) => item.id === libraryId);

  const contentPlatformStyle = Platform.select({
    android: {
      paddingLeft: safeAreaInsets.left,
      paddingRight: safeAreaInsets.right,
      paddingBottom: safeAreaInsets.bottom + 24,
    },
    ios: {
      paddingBottom: safeAreaInsets.bottom + 24,
    },
    web: {
      paddingBottom: 24,
    },
  });

  return (
    <>
      <Stack.Screen options={{ title: library?.name ?? t('licenseDetails', { defaultValue: '许可证详情' }) }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1, backgroundColor: theme.background?.val }}
        contentContainerStyle={{
          flexDirection: 'row',
          justifyContent: 'center',
          paddingTop: 16,
          ...contentPlatformStyle,
        }}
      >
        <YStack width="100%" maxW={MaxContentWidth} px="$4" gap="$4">
          {isLoading ? (
            <YStack items="center" py="$8" gap="$3">
              <Spinner size="large" color="$primary" />
              <Text fontSize="$body" color="$color11">
                {t('loadingLicense', { defaultValue: '正在加载许可证…' })}
              </Text>
            </YStack>
          ) : error ? (
            <YStack items="center" py="$8" gap="$3">
              <Text text="center" fontSize="$body" lineHeight={22} color="$color11">
                {error}
              </Text>
              <Button bg="$primary" color="white" onPress={retry}>
                {t('retry', { defaultValue: '重试' })}
              </Button>
            </YStack>
          ) : library ? (
            <>
              <YStack gap="$1">
                <Text selectable fontSize="$heading" lineHeight={30} fontWeight="600" color="$color12">
                  {library.name}
                </Text>
                {library.version ? (
                  <Text selectable fontSize="$body" lineHeight={20} color="$color11">
                    {t('versionVersion', { defaultValue: '版本 {{version}}', version: library.version })}
                  </Text>
                ) : null}
                {library.description ? (
                  <Text selectable mt="$2" fontSize="$body" lineHeight={22} color="$color11">
                    {library.description}
                  </Text>
                ) : null}
                {library.website ? (
                  <Pressable
                    accessibilityRole="link"
                    onPress={() =>
                      void openExternalUrl(
                        library.website!,
                        t('couldNotOpenLink', { defaultValue: '无法打开链接' }),
                        t('pleaseTryAgainLaterWithPeriod', { defaultValue: '请稍后重试。' }),
                      )
                    }
                    style={({ pressed }) => ({ alignSelf: 'flex-start', opacity: pressed ? 0.55 : 1 })}
                  >
                    <Text mt="$2" fontSize="$body" lineHeight={22} color="$primary">
                      {t('viewProjectHomepage', { defaultValue: '查看项目主页' })}
                    </Text>
                  </Pressable>
                ) : null}
              </YStack>

              {library.licenses.map((license, index) => (
                <YStack
                  key={`${license.name ?? 'license'}-${index}`}
                  bg="$backgroundHover"
                  rounded="$4"
                  p="$4"
                  gap="$3"
                >
                  <YStack gap="$1">
                    <Text selectable fontSize="$subtitle" lineHeight={24} fontWeight="600" color="$color12">
                      {license.name ??
                        (library.licenses.length > 1
                          ? t('numberedLicense', { defaultValue: '许可证 {{count}}', count: index + 1 })
                          : t('openSourceLicenses', { defaultValue: '开源许可证' }))}
                    </Text>
                    {license.year ? (
                      <Text selectable fontSize="$body" lineHeight={20} color="$color11">
                        {license.year}
                      </Text>
                    ) : null}
                    {license.url ? (
                      <Pressable
                        accessibilityRole="link"
                        onPress={() =>
                          void openExternalUrl(
                            license.url!,
                            t('couldNotOpenLink', { defaultValue: '无法打开链接' }),
                            t('pleaseTryAgainLaterWithPeriod', { defaultValue: '请稍后重试。' }),
                          )
                        }
                        style={({ pressed }) => ({ alignSelf: 'flex-start', opacity: pressed ? 0.55 : 1 })}
                      >
                        <Text fontSize="$body" lineHeight={20} color="$primary">
                          {t('viewLicenseSource', { defaultValue: '查看许可证来源' })}
                        </Text>
                      </Pressable>
                    ) : null}
                  </YStack>

                  <Text selectable fontSize="$body" lineHeight={22} color="$color12">
                    {license.licenseContent}
                  </Text>
                </YStack>
              ))}
            </>
          ) : (
            <Text text="center" py="$8" fontSize="$body" lineHeight={22} color="$color11">
              {t('noLicenseInformationWasFoundForThisOpenSourceComponent', {
                defaultValue: '没有找到这个开源组件的许可证信息。',
              })}
            </Text>
          )}
        </YStack>
      </ScrollView>
    </>
  );
}
