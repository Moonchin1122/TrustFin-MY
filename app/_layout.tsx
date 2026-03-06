import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Colors from '@/constants/colors';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { trpc, trpcClient } from '@/lib/trpc';
import { supabase } from '@/lib/supabase';
import ErrorBoundary from '@/components/ErrorBoundary';

SplashScreen.preventAutoHideAsync().catch((error) => {
  console.log('[RootLayout] preventAutoHideAsync error:', error);
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="agent/[id]" options={{ headerShown: true }} />
      <Stack.Screen name="loan-guide/[id]" options={{ headerShown: true }} />
      <Stack.Screen name="login" options={{ presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="agent-register" options={{ presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="admin-login" options={{ presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="admin-dashboard" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [isAppReady, setIsAppReady] = useState<boolean>(false);

  useEffect(() => {
    const prepare = async () => {
      try {
        console.log('[RootLayout] App startup begin');
        await SplashScreen.hideAsync();
        console.log('[RootLayout] Splash hidden');
      } catch (error) {
        console.log('[RootLayout] hideAsync error:', error);
      } finally {
        setIsAppReady(true);
      }
    };

    prepare();
  }, []);

  useEffect(() => {
    const handleDeepLink = async (url: string) => {
      console.log('[RootLayout] Deep link received:', url);
      try {
        if (url.includes('access_token') || url.includes('token_hash') || url.includes('type=signup') || url.includes('type=email')) {
          const hashIndex = url.indexOf('#');
          if (hashIndex !== -1) {
            const fragment = url.substring(hashIndex + 1);
            const params = new URLSearchParams(fragment);
            const accessToken = params.get('access_token');
            const refreshToken = params.get('refresh_token');

            if (accessToken && refreshToken) {
              console.log('[RootLayout] Setting session from deep link tokens');
              const { error } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });
              if (error) {
                console.log('[RootLayout] setSession error:', error.message);
              } else {
                console.log('[RootLayout] Session set successfully from deep link');
              }
            }
          }
        }
      } catch (e) {
        console.log('[RootLayout] Deep link handling error:', e);
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const fullUrl = window.location.href;
      if (fullUrl.includes('access_token') || fullUrl.includes('token_hash')) {
        handleDeepLink(fullUrl);
      }
    }

    const sub = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });

    return () => {
      sub.remove();
    };
  }, []);

  return (
    <ErrorBoundary>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={styles.root}>
            {!isAppReady ? (
              <View style={styles.loadingContainer} testID="root-loading-screen">
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.loadingText}>Starting TrustFin...</Text>
              </View>
            ) : (
              <LanguageProvider>
                <AuthProvider>
                  <RootLayoutNav />
                </AuthProvider>
              </LanguageProvider>
            )}
          </GestureHandlerRootView>
        </QueryClientProvider>
      </trpc.Provider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500' as const,
  },
});
