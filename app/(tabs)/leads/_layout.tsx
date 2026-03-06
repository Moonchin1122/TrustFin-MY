import { Stack } from 'expo-router';
import React from 'react';
import Colors from '@/constants/colors';

export default function LeadsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.white },
        headerTintColor: Colors.textPrimary,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="agent-leads" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: '咨询详情', headerBackTitle: '返回' }} />
    </Stack>
  );
}
