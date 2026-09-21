import { StrictButton as Button } from '@/components/strict-button';
import { usePlans } from '@/store/use-plans';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Input, Text, YStack, useTheme } from 'tamagui';

export default function CreatePlanScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const createPlan = usePlans((state) => state.createPlan);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const submit = () => {
    const name = title.trim();
    if (!name) return;
    const id = createPlan(name, description);
    router.replace({ pathname: '/plans/[planId]', params: { planId: id } } as never);
  };

  return (
    <>
      <Stack.Screen options={{ title: t('newPlan', { defaultValue: '新建计划' }), presentation: 'modal' }} />
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
              bg="$background"
              placeholderTextColor="$color6"
              value={title}
              onChangeText={setTitle}
              placeholder={t('enterText', { defaultValue: '请输入' })}
              fontSize="$body"
              autoFocus
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
              placeholder={t('enterText', { defaultValue: '请输入' })}
              multiline
              minH={90}
              textAlignVertical="top"
              fontSize="$body"
            />
          </YStack>
          <YStack gap="$2">
            <Button
              bg="$primary"
              color="white"
              disabled={!title.trim()}
              accessibilityState={{ disabled: !title.trim() }}
              opacity={!title.trim() ? 0.5 : 1}
              onPress={submit}
            >
              {t('createPlan', { defaultValue: '创建计划' })}
            </Button>
            <Button bg="$color3" color="$color11" onPress={() => router.back()}>
              {t('cancel', { defaultValue: '取消' })}
            </Button>
          </YStack>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
