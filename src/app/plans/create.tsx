import { usePlans } from '@/store/use-plans';
import { Button } from '@tamagui/button';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Input, Text, YStack, useTheme } from 'tamagui';

export default function CreatePlanScreen() {
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
      <Stack.Screen options={{ title: '新建计划', presentation: 'modal' }} />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: theme.background?.val }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, gap: 18 }}>
          <YStack gap="$2">
            <Text fontSize="$body" fontWeight="600" color="$color12">
              计划名称
            </Text>
            <Input
              bg="$background"
              placeholderTextColor="$color6"
              value={title}
              onChangeText={setTitle}
              placeholder="请输入"
              fontSize="$body"
              autoFocus
              maxLength={60}
            />
          </YStack>
          <YStack gap="$2">
            <Text fontSize="$body" fontWeight="600" color="$color12">
              备注（可选）
            </Text>
            <Input
              value={description}
              onChangeText={setDescription}
              bg="$background"
              placeholderTextColor="$color6"
              placeholder="请输入"
              multiline
              minH={90}
              textAlignVertical="top"
              fontSize="$body"
            />
          </YStack>
          <Button
            bg="$primary"
            color="white"
            size="$4"
            fontSize="$body"
            opacity={!title.trim() ? 0.5 : 1}
            onPress={() => {
              if (!title.trim()) return;
              submit();
            }}
          >
            创建计划
          </Button>
          <Button bg="$color3" color="$color11" size="$4" fontSize="$body" onPress={() => router.back()}>
            取消
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
