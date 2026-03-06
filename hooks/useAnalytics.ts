import { useCallback, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';

const INSTALL_TRACKED_KEY = 'trustfin_install_tracked';

type AnalyticsEventType = 'install' | 'app_open' | 'screen_view' | 'signup';

interface AnalyticsEventPayload {
  type: AnalyticsEventType;
  deviceId: string;
  userId?: string;
  screenName?: string;
}

export function useAnalytics() {
  const { user, deviceId, isLoaded } = useAuth();
  const hasTrackedOpen = useRef<boolean>(false);

  const { mutate: trackEvent } = useMutation({
    mutationFn: async (payload: AnalyticsEventPayload) => {
      console.log('[ANALYTICS] Event queued locally:', payload);
      return payload;
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.log('[ANALYTICS] Failed to track event:', message);
    },
  });

  useEffect(() => {
    if (!isLoaded || !deviceId || hasTrackedOpen.current) return;
    hasTrackedOpen.current = true;

    const trackLaunch = async () => {
      try {
        const installTracked = await AsyncStorage.getItem(INSTALL_TRACKED_KEY);
        if (!installTracked) {
          console.log('[ANALYTICS] First launch - tracking install');
          trackEvent({
            type: 'install',
            deviceId,
            userId: user.id || undefined,
          });
          await AsyncStorage.setItem(INSTALL_TRACKED_KEY, 'true');
        }

        console.log('[ANALYTICS] Tracking app open');
        trackEvent({
          type: 'app_open',
          deviceId,
          userId: user.id || undefined,
        });
      } catch (e: unknown) {
        console.log('[ANALYTICS] Error tracking launch:', e);
      }
    };

    trackLaunch();
  }, [deviceId, isLoaded, trackEvent, user.id]);

  const trackScreenView = useCallback(
    (screenName: string) => {
      if (!deviceId) return;
      console.log('[ANALYTICS] Screen view:', screenName);
      trackEvent({
        type: 'screen_view',
        deviceId,
        userId: user.id || undefined,
        screenName,
      });
    },
    [deviceId, trackEvent, user.id],
  );

  const trackSignup = useCallback(() => {
    if (!deviceId) return;
    console.log('[ANALYTICS] Signup event');
    trackEvent({
      type: 'signup',
      deviceId,
      userId: user.id || undefined,
    });
  }, [deviceId, trackEvent, user.id]);

  return { trackScreenView, trackSignup };
}
