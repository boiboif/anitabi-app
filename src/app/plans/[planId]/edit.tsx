import { StrictButton as Button } from '@/components/strict-button';
import { BLOCK_BUTTON_ICON_SIZE } from '@/lib/ui-sizes';
import { usePlans } from '@/store/use-plans';
import { Check } from '@tamagui/lucide-icons-2';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Input, Text, View, YStack, useTheme } from 'tamagui';

export default function EditPlanScreen() {
  const { t } = useTranslation();
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const router = useRouter();
  const theme = useTheme();
  const plan = usePlans((state) => state.plans.find((item) => item.id === planId));
  const updatePlan = usePlans((state) => state.updatePlan);
  const [title, setTitle] = useState(plan?.title ?? '');
  const [description, setDescription] = useState(plan?.description ?? '');

  if (!plan) {
    return (
      <View flex={1} items="center" justify="center" bg="$background">
        <Text color="$color11">
          {t('thePlanDoesNotExistOrHasBeenDeleted', { defaultValue: '计划不存在或已被删除' })}
        </Text>
      </View>
    );
  }

  const submit = () => {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    updatePlan(plan.id, { title: nextTitle, description: description.trim() || undefined });
    router.back();
  };

  return (
    <>
      <Stack.Screen options={{ title: t('editPlan', { defaultValue: '编辑计划' }) }} />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: theme.background?.val }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, gap: 18 }}>
          <YStack gap="$2">
            <Text fontSize="$body" fontWeight="600" color="$color12">
              {t('planName', { defaultValue: '计划名称' })}
            </Text>
            <Input
              value={title}
              onChangeText={setTitle}
              bg="$background"
              placeholderTextColor="$color6"
              placeholder={t('forExampleBocchiTheRockInShimokitazawa', {
                defaultValue: '例如：下北泽《孤独摇滚》巡礼',
              })}
              maxLength={60}
            />
          </YStack>
          <YStack gap="$2">
            <Text fontSize="$body" fontWeight="600" color="$color12">
              {t('notesOptional', { defaultValue: '备注（可选）' })}
            </Text>
            <Input
              value={description}
              onChangeText={setDescription}
              bg="$background"
              placeholderTextColor="$color6"
              placeholder={t('addDatesCompanionsOrOtherArrangements', { defaultValue: '记录日期、同行人或其他安排' })}
              multiline
              minH={90}
              textAlignVertical="top"
            />
          </YStack>
          <Button
            bg="$primary"
            color="white"
            icon={<Check size={BLOCK_BUTTON_ICON_SIZE} />}
            disabled={!title.trim()}
            accessibilityState={{ disabled: !title.trim() }}
            opacity={!title.trim() ? 0.5 : 1}
            onPress={submit}
          >
            {t('saveChanges', { defaultValue: '保存修改' })}
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
