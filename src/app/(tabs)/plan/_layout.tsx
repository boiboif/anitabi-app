import Stack from 'expo-router/stack';

export default function PlanTabLayout() {
  return (
    <Stack screenOptions={{ headerShown: true, headerTransparent: false, headerTitleAlign: 'center' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
