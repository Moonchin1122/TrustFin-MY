import { createClient } from '@supabase/supabase-js';

const rawSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

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
const key = serviceRoleKey || anonKey || 'placeholder-key';

if (!hasValidSupabaseUrl) {
  console.warn('[SUPABASE-ADMIN] Invalid or missing EXPO_PUBLIC_SUPABASE_URL. Expected https://<project>.supabase.co');
}
if (!serviceRoleKey && !anonKey) {
  console.warn('[SUPABASE-ADMIN] Missing SUPABASE_SERVICE_ROLE_KEY and EXPO_PUBLIC_SUPABASE_ANON_KEY');
}


export const supabaseAdmin = createClient(supabaseUrl, key, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export function isSupabaseConfigured(): boolean {
  return hasValidSupabaseUrl && !!(serviceRoleKey || anonKey);
}

export function getSupabaseConfigStatus(): { hasValidSupabaseUrl: boolean; hasKey: boolean } {
  return {
    hasValidSupabaseUrl,
    hasKey: !!(serviceRoleKey || anonKey),
  };
}
