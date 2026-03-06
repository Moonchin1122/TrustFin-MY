import { Stack } from 'expo-router';
import React from 'react';
import Colors from '@/constants/colors';

export default function ProfileLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.white },
        headerTintColor: Colors.textPrimary,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="agent-profile-edit" options={{ title: 'Edit Agent Profile' }} />
    </Stack>
  );
}
