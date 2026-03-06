import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, NativeModules } from 'react-native';
import createContextHook from '@nkzw/create-context-hook';
import translations, { Language } from '@/i18n/translations';

const LANGUAGE_KEY = 'trustfin_language';

function getDeviceLanguage(): Language {
  try {
    let locale = 'en';
    if (Platform.OS === 'web') {
      locale = navigator?.language || 'en';
    } else if (Platform.OS === 'ios') {
      locale = NativeModules.SettingsManager?.settings?.AppleLocale ||
        NativeModules.SettingsManager?.settings?.AppleLanguages?.[0] || 'en';
    } else {
      locale = NativeModules.I18nManager?.localeIdentifier || 'en';
    }
    if (locale.startsWith('ms') || locale.startsWith('my')) return 'ms';
    if (locale.startsWith('zh')) return 'zh';
    return 'en';
  } catch {
    return 'en';
  }
}

export const [LanguageProvider, useLanguage] = createContextHook(() => {
  const [language, setLanguageState] = useState<Language>('en');
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const stored = await AsyncStorage.getItem(LANGUAGE_KEY);
        if (stored && (stored === 'ms' || stored === 'en' || stored === 'zh')) {
          setLanguageState(stored as Language);
        } else {
          const detected = getDeviceLanguage();
          setLanguageState(detected);
        }
      } catch (e) {
        console.log('Failed to load language preference:', e);
      } finally {
        setIsLoaded(true);
      }
    };
    loadLanguage();
  }, []);

  const setLanguage = useCallback(async (lang: Language) => {
    setLanguageState(lang);
    try {
      await AsyncStorage.setItem(LANGUAGE_KEY, lang);
    } catch (e) {
      console.log('Failed to save language preference:', e);
    }
  }, []);

  const t = useCallback((key: string): string => {
    const entry = translations[key];
    if (!entry) return key;
    return entry[language] || entry.en || key;
  }, [language]);

  return { language, setLanguage, t, isLoaded };
});
