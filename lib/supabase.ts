import { createClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

const rawSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const hasValidSupabaseUrl = isValidHttpUrl(rawSupabaseUrl);
const supabaseUrl = hasValidSupabaseUrl ? rawSupabaseUrl : 'https://placeholder.supabase.co';
const supabaseKey = supabaseAnonKey || 'placeholder-key';

if (!hasValidSupabaseUrl || !supabaseAnonKey) {
  console.warn('[SUPABASE] Invalid or missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY');
}

export function getRedirectUrl(): string {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      return window.location.origin + '/login';
    }
    return 'https://rork.com/login';
  }
  return Linking.createURL('login');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
