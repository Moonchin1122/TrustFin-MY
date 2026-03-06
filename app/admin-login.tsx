import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ShieldCheck, X, Lock, Mail, Eye, EyeOff } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAuth, UserProfile } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useMutation } from '@tanstack/react-query';

type ProfileRoleRow = {
  role: string | null;
};

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

async function requireAdminByProfileRole(userId: string): Promise<void> {
  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle<ProfileRoleRow>();

  if (profileError) {
    throw new Error('Failed to verify admin access');
  }

  const role = profileRow?.role?.toLowerCase() ?? '';
  if (role !== 'admin') {
    await supabase.auth.signOut();
    throw new Error('Not authorized');
  }
}

export default function AdminLoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const adminLoginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedPassword = password.trim();

      console.log('[ADMIN LOGIN] Attempting Supabase signIn for:', normalizedEmail);

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: normalizedPassword,
      });

      if (authError) {
        console.log('[ADMIN LOGIN] Auth error:', authError.message);
        throw new Error(authError.message);
      }

      if (!authData.user) {
        throw new Error('No user returned from authentication');
      }

      console.log('[ADMIN LOGIN] Auth success, user id:', authData.user.id);

      await requireAdminByProfileRole(authData.user.id);

      const { data: userRow, error: userRowError } = await supabase
        .from('users')
        .select('id, name, email, phone')
        .eq('id', authData.user.id)
        .maybeSingle<UserRow>();

      if (userRowError) {
        console.log('[ADMIN LOGIN] users table fetch error:', userRowError.message);
      }

      const authEmail = authData.user.email ?? '';

      return {
        user: authData.user,
        profile: userRow ?? {
          id: authData.user.id,
          name: (authData.user.user_metadata?.full_name as string | undefined) ?? authEmail,
          phone: authData.user.phone ?? '',
          email: authEmail,
        },
      };
    },
    onSuccess: (data) => {
      const userProfile: UserProfile = {
        id: data.user.id,
        name: data.profile.name || data.user.email || '',
        phone: data.profile.phone || '',
        email: data.user.email || '',
        role: 'admin',
        isVerified: true,
      };
      login(userProfile);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/admin-dashboard');
    },
    onError: (error: Error) => {
      console.log('[ADMIN LOGIN] Error:', error.message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Login Failed', error.message);
    },
  });

  const { mutate: doLogin, isPending } = adminLoginMutation;

  const handleLogin = useCallback(() => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('', 'Please fill in all fields');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    doLogin({ email: email.trim().toLowerCase(), password: password.trim() });
  }, [email, password, doLogin]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} testID="admin-close-btn">
          <X size={22} color="#94A3B8" />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.logoContainer}>
          <View style={styles.shieldCircle}>
            <ShieldCheck size={36} color="#F8FAFC" />
          </View>
          <Text style={styles.title}>Admin Portal</Text>
          <Text style={styles.subtitle}>TrustFin MY Management Console</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email</Text>
            <View style={styles.inputRow}>
              <Mail size={18} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder="admin@trustfin.com"
                placeholderTextColor="#94A3B8"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
                testID="admin-email-input"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={styles.inputRow}>
              <Lock size={18} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder="Enter password"
                placeholderTextColor="#94A3B8"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                testID="admin-password-input"
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
                {showPassword ? (
                  <EyeOff size={18} color="#94A3B8" />
                ) : (
                  <Eye size={18} color="#94A3B8" />
                )}
              </Pressable>
            </View>
          </View>

          <Pressable
            style={[styles.loginBtn, isPending && styles.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={isPending}
            testID="admin-login-btn"
          >
            {isPending ? (
              <ActivityIndicator color="#F8FAFC" size="small" />
            ) : (
              <>
                <Lock size={16} color="#F8FAFC" />
                <Text style={styles.loginBtnText}>Sign In</Text>
              </>
            )}
          </Pressable>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            This portal is restricted to authorized administrators only.
            Unauthorized access attempts will be logged.
          </Text>
        </View>
      </KeyboardAvoidingView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
        <Text style={styles.bottomText}>TrustFin MY Admin v1.0</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  topBar: {
    flexDirection: 'row' as const,
    justifyContent: 'flex-end' as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeBtn: {
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center' as const,
  },
  logoContainer: {
    alignItems: 'center' as const,
    marginBottom: 40,
  },
  shieldCircle: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: '#1E3A5F',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(100, 160, 255, 0.2)',
  },
  title: {
    fontSize: 28,
    fontWeight: '800' as const,
    color: '#F8FAFC',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 6,
  },
  form: {
    gap: 18,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#94A3B8',
    marginLeft: 2,
  },
  inputRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 14,
    paddingHorizontal: 14,
    gap: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: '#F8FAFC',
  },
  loginBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    backgroundColor: '#2563EB',
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 8,
  },
  loginBtnDisabled: {
    opacity: 0.7,
  },
  loginBtnText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#F8FAFC',
  },
  infoBox: {
    marginTop: 28,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  infoText: {
    fontSize: 12,
    color: '#475569',
    textAlign: 'center' as const,
    lineHeight: 18,
  },
  bottomBar: {
    alignItems: 'center' as const,
    paddingTop: 10,
  },
  bottomText: {
    fontSize: 11,
    color: '#334155',
  },
});
