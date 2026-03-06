import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { supabase } from '@/lib/supabase';

const AUTH_KEY = 'trustfin_auth';
const DEVICE_ID_KEY = 'trustfin_device_id';

export type UserRole = 'guest' | 'borrower' | 'agent' | 'admin';

export interface UserProfile {
  id: string;
  name: string;
  phone: string;
  email: string;
  role: UserRole;
  avatar?: string;
  isVerified: boolean;
  agentType?: 'individual' | 'company';
  kycStatus?: 'none' | 'pending' | 'verified' | 'rejected';
  companyName?: string;
  licenseNo?: string;
  state?: string;
  district?: string;
  rating?: number;
  interests?: string[];
}

const defaultGuest: UserProfile = {
  id: '',
  name: '',
  phone: '',
  email: '',
  role: 'guest',
  isVerified: false,
  kycStatus: 'none',
};

async function syncUserToDb(profile: UserProfile): Promise<void> {
  if (!profile.id || profile.role === 'guest') return;
  try {
    const now = new Date().toISOString();
    console.log('[AUTH-SYNC] Syncing user to users table:', profile.id, profile.name, profile.role);
    const { error } = await supabase
      .from('users')
      .upsert({
        id: profile.id,
        name: profile.name || '',
        phone: profile.phone || '',
        email: profile.email || '',
        role: profile.role,
        is_verified: profile.isVerified ?? false,
        agent_type: profile.agentType ?? null,
        kyc_status: profile.kycStatus ?? 'none',
        company_name: profile.companyName ?? null,
        license_no: profile.licenseNo ?? null,
        state: profile.state ?? null,
        district: profile.district ?? null,
        is_online: true,
        last_active_at: now,
        updated_at: now,
      }, { onConflict: 'id' });
    if (error) {
      console.log('[AUTH-SYNC] users upsert error:', error.message, error.code);
    } else {
      console.log('[AUTH-SYNC] User synced successfully:', profile.id);
    }
  } catch (e) {
    console.log('[AUTH-SYNC] Sync failed (non-blocking):', e);
  }
}

function generateDeviceId(): string {
  return `device_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [user, setUser] = useState<UserProfile>(defaultGuest);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [deviceId, setDeviceId] = useState<string>('');

  useEffect(() => {
    const loadAuth = async () => {
      try {
        const stored = await AsyncStorage.getItem(AUTH_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as UserProfile;
          setUser(parsed);
        }

        let storedDeviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
        if (!storedDeviceId) {
          storedDeviceId = generateDeviceId();
          await AsyncStorage.setItem(DEVICE_ID_KEY, storedDeviceId);
        }
        setDeviceId(storedDeviceId);
      } catch (e) {
        console.log('Failed to load auth:', e);
      } finally {
        setIsLoaded(true);
      }
    };
    loadAuth();
  }, []);

  useEffect(() => {
    if (!isLoaded || user.role !== 'agent' || !user.id) return;

    const resolveKycStatus = (row: { verified?: boolean | null; status?: string | null; kyc_status?: string | null }) => {
      const statusValue = (row.kyc_status ?? row.status ?? '').toLowerCase();
      if (row.verified === true || statusValue === 'approved' || statusValue === 'verified') {
        return 'verified' as const;
      }
      if (statusValue === 'rejected') {
        return 'rejected' as const;
      }
      if (statusValue === 'pending' || statusValue === 'reviewing') {
        return 'pending' as const;
      }
      return 'none' as const;
    };

    const applyAgentStatus = (row: { verified?: boolean | null; status?: string | null; kyc_status?: string | null }) => {
      const nextKycStatus = resolveKycStatus(row);
      const nextIsVerified = row.verified === true || nextKycStatus === 'verified';

      setUser((prev) => {
        if (prev.kycStatus === nextKycStatus && prev.isVerified === nextIsVerified) {
          return prev;
        }
        const updated: UserProfile = {
          ...prev,
          kycStatus: nextKycStatus,
          isVerified: nextIsVerified,
        };
        console.log('[AUTH] Agent status changed:', prev.kycStatus, '->', nextKycStatus, 'verified:', nextIsVerified);
        AsyncStorage.setItem(AUTH_KEY, JSON.stringify(updated)).catch((error) => {
          console.log('[AUTH] Failed to persist updated status:', error);
        });
        return updated;
      });
    };

    const fetchAgentStatus = async () => {
      try {
        console.log('[AUTH] Fetching agent status for:', user.id);
        const { data: agentData, error: agentError } = await supabase
          .from('agents')
          .select('verified, status, kyc_status, reject_reason')
          .eq('id', user.id)
          .maybeSingle<{ verified?: boolean | null; status?: string | null; kyc_status?: string | null }>();

        if (agentError) {
          console.log('[AUTH] Failed to fetch status from agents table:', agentError.message);
        }

        if (agentData) {
          applyAgentStatus(agentData);
          return;
        }

        console.log('[AUTH] No agents row, falling back to users table for:', user.id);
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('is_verified, kyc_status')
          .eq('id', user.id)
          .eq('role', 'agent')
          .maybeSingle<{ is_verified?: boolean | null; kyc_status?: string | null }>();

        if (userError) {
          console.log('[AUTH] Failed to fetch status from users table fallback:', userError.message);
          return;
        }

        if (userData) {
          applyAgentStatus({ verified: userData.is_verified ?? false, kyc_status: userData.kyc_status ?? null });
        }
      } catch (e) {
        console.log('[AUTH] Error fetching agent status:', e);
      }
    };

    fetchAgentStatus();

    const agentChannel = supabase
      .channel(`agent-status-${user.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'agents',
        filter: `id=eq.${user.id}`,
      }, (payload) => {
        console.log('[AUTH] Realtime agents update:', payload.new);
        const row = payload.new as { verified?: boolean | null; status?: string | null; kyc_status?: string | null };
        applyAgentStatus(row);
      })
      .subscribe();

    const userChannel = supabase
      .channel(`user-agent-status-${user.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'users',
        filter: `id=eq.${user.id}`,
      }, (payload) => {
        console.log('[AUTH] Realtime users update:', payload.new);
        const row = payload.new as { is_verified?: boolean | null; kyc_status?: string | null; role?: string | null };
        if ((row.role ?? 'agent') !== 'agent') {
          return;
        }
        applyAgentStatus({ verified: row.is_verified ?? false, kyc_status: row.kyc_status ?? null });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(agentChannel);
      supabase.removeChannel(userChannel);
    };
  }, [isLoaded, user.role, user.id]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[AUTH] Supabase auth event:', event);
      if (event === 'SIGNED_IN' && session?.user) {
        const su = session.user;
        const existingStored = await AsyncStorage.getItem(AUTH_KEY);
        if (existingStored) {
          const parsed = JSON.parse(existingStored) as UserProfile;
          if (parsed.id === su.id && parsed.role !== 'guest') {
            return;
          }
        }

        const email = su.email ?? '';
        const normalizedEmail = email.trim().toLowerCase();
        let resolvedRole: UserRole = ((su.user_metadata?.role as UserRole | undefined) ?? 'borrower');

        try {
          const { data: userRow, error: userRowError } = await supabase
            .from('users')
            .select('role')
            .eq('id', su.id)
            .maybeSingle<{ role: string | null }>();

          if (userRowError) {
            console.log('[AUTH] Failed to resolve role from users table:', userRowError.message);
          } else if (userRow?.role) {
            const dbRole = userRow.role.toLowerCase();
            if (dbRole === 'admin' || dbRole === 'agent' || dbRole === 'borrower') {
              resolvedRole = dbRole as UserRole;
            }
          }
        } catch (roleError) {
          console.log('[AUTH] Exception resolving role from users table:', roleError);
        }

        const isKnownAdminEmail = normalizedEmail === 'admin@trustfin.com' || normalizedEmail.endsWith('@trustfin.my');
        if (isKnownAdminEmail) {
          resolvedRole = 'admin';
        }

        const profile: UserProfile = {
          id: su.id,
          name: (su.user_metadata?.full_name as string | undefined) ?? '',
          phone: su.phone ?? '',
          email,
          role: resolvedRole,
          isVerified: !!su.email_confirmed_at || !!su.phone_confirmed_at,
          kycStatus: 'none',
        };
        console.log('[AUTH] Auto-login from Supabase auth event:', profile.email, 'resolvedRole:', resolvedRole);
        setUser(profile);
        try {
          await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(profile));
        } catch (e) {
          console.log('Failed to save auth from listener:', e);
        }
        syncUserToDb(profile);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const saveUser = useCallback(async (profile: UserProfile) => {
    setUser(profile);
    try {
      await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(profile));
    } catch (e) {
      console.log('Failed to save auth:', e);
    }
    syncUserToDb(profile);
  }, []);

  const login = useCallback(async (profile: UserProfile) => {
    await saveUser(profile);
    syncUserToDb(profile);
  }, [saveUser]);

  const logout = useCallback(async () => {
    const oldId = user.id;
    setUser(defaultGuest);
    try {
      await AsyncStorage.removeItem(AUTH_KEY);
    } catch (e) {
      console.log('Failed to remove auth:', e);
    }
    if (oldId) {
      supabase.from('users').update({ is_online: false, last_active_at: new Date().toISOString() }).eq('id', oldId).then(() => {});
    }
  }, [user.id]);

  const isLoggedIn = user.role !== 'guest' && user.id !== '';
  const isAdmin = user.role === 'admin';

  return { user, login, logout, isLoggedIn, isAdmin, isLoaded, saveUser, deviceId };
});
