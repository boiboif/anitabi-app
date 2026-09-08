import { StrictButton as Button } from '@/components/strict-button';
import { usePlans } from '@/store/use-plans';
import { ChevronRight, Plus } from '@tamagui/lucide-icons-2';
import { Stack, useRouter } from 'expo-router';
import { Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack, useTheme } from 'tamagui';

export default function PlansScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const plans = usePlans((state) => state.plans);

  return (
    <>
      <Stack.Screen
        options={{
          title: '巡礼计划',
          headerRight: () => (
            <Button
              chromeless
              circular
              size="$3"
              icon={<Plus size={22} strokeWidth={2} />}
              aria-label="新建计划"
              onPress={() => router.navigate('/plans/create' as never)}
            />
          ),
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1, backgroundColor: theme.background?.val }}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 12 }}
      >
        {plans.length === 0 ? (
          <YStack flex={1} minH={360} items="center" justify="center">
            <Text fontSize="$subtitle" fontWeight="600" color="$color12">
              还没有巡礼计划
            </Text>
          </YStack>
        ) : (
          plans.map((plan) => {
            return (
              <Pressable
                key={plan.id}
                onPress={() => router.navigate({ pathname: '/plans/[planId]', params: { planId: plan.id } } as never)}
              >
                <XStack py="$3" items="center" gap="$3">
                  <YStack flex={1} minW={0} gap="$1">
                    <XStack items="center" gap="$2">
                      <Text flex={1} minW={0} fontSize="$subtitle" fontWeight="600" color="$color12" numberOfLines={2}>
                        {plan.title}
                      </Text>
                      <XStack shrink={0}>
                        <Text fontSize="$caption" numberOfLines={1}>
                          {plan.items.length}个点位
                        </Text>
                      </XStack>
                    </XStack>
                    {plan.description && (
                      <Text fontSize="$footnote" color="$color11">
                        {plan.description}
                      </Text>
                    )}
                  </YStack>
                  <ChevronRight size={20} color="$color10" />
                </XStack>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </>
  );
}
