import { supabase } from '@/lib/supabase';

type AvatarCacheItem = {
  signedUrl: string;
  expiresAt: number;
};

const AVATAR_SIGNED_URL_TTL_SECONDS = 3600;
const AVATAR_SIGNED_URL_SAFETY_MS = 5000;
const avatarSignedUrlCache = new Map<string, AvatarCacheItem>();

function normalizeAvatarStoragePath(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      const full = `${parsed.pathname}${parsed.search}`;
      const bucketPattern = /(?:^|\/)avatars\/([^?]+)/i;
      const matched = full.match(bucketPattern);

      if (matched?.[1]) {
        return decodeURIComponent(matched[1]).replace(/^\/+/, '');
      }

      return trimmed;
    } catch {
      return trimmed;
    }
  }

  return trimmed.replace(/^\/+/, '').replace(/^avatars\//i, '');
}

function shouldUseSignedUrl(value: string): boolean {
  return !(value.startsWith('http://') || value.startsWith('https://'));
}

export async function resolveAvatarUrl(avatarUrl: string | null | undefined): Promise<string | null> {
  const raw = avatarUrl?.trim() ?? '';
  if (!raw) {
    return null;
  }

  if (!shouldUseSignedUrl(raw)) {
    return raw;
  }

  const storagePath = normalizeAvatarStoragePath(raw);
  if (!storagePath) {
    return null;
  }

  const cached = avatarSignedUrlCache.get(storagePath);
  const now = Date.now();
  if (cached && cached.expiresAt - AVATAR_SIGNED_URL_SAFETY_MS > now) {
    return cached.signedUrl;
  }

  const { data, error } = await supabase.storage.from('avatars').createSignedUrl(storagePath, AVATAR_SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    console.log('[AVATAR] Failed to create signed URL for path:', storagePath, error?.message ?? 'missing signed url');
    return null;
  }

  avatarSignedUrlCache.set(storagePath, {
    signedUrl: data.signedUrl,
    expiresAt: now + AVATAR_SIGNED_URL_TTL_SECONDS * 1000,
  });

  return data.signedUrl;
}
