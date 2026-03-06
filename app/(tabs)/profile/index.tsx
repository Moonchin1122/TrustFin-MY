import React, { useCallback, useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Animated,
  Alert,
  ActivityIndicator,
  AppState,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  User,
  Globe,
  Bell,
  Info,
  ChevronRight,
  FileText,
  LogOut,
  LogIn,
  ShieldCheck,
  Check,
  Briefcase,
  BadgeCheck,
  Clock,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Camera,
} from 'lucide-react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { resolveAvatarUrl } from '@/lib/avatar';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAnalytics } from '@/hooks/useAnalytics';
import { Language } from '@/i18n/translations';
import Colors from '@/constants/colors';
import { supabase } from '@/lib/supabase';

const languageOptions: { code: Language; label: string; flag: string }[] = [
  { code: 'ms', label: 'Bahasa Melayu', flag: '🇲🇾' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
];

export default function ProfileScreen() {
  const { t, language, setLanguage } = useLanguage();
  const { user, isLoggedIn, isAdmin, logout, saveUser } = useAuth();
  const { trackScreenView } = useAnalytics();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [showLanguages, setShowLanguages] = React.useState<boolean>(false);
  const [versionTaps, setVersionTaps] = useState<number>(0);
  const [rejectReason, setRejectReason] = useState<string | null>(null);
  const [loadingReason, setLoadingReason] = useState<boolean>(false);
  const [isRefreshingKyc, setIsRefreshingKyc] = useState<boolean>(false);
  const [avatarSignedUrl, setAvatarSignedUrl] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState<boolean>(false);

  const fetchKycStatus = useCallback(async (options?: { silent?: boolean }) => {
    if (!isLoggedIn || user.role !== 'agent' || !user.id) {
      return;
    }

    const isSilent = options?.silent ?? false;
    if (!isSilent) {
      setIsRefreshingKyc(true);
    }

    try {
      console.log('[PROFILE] Fetching latest KYC status for agent:', user.id);
      const [{ data: latestKyc, error: kycError }, { data: agentRow, error: agentError }] = await Promise.all([
        supabase
          .from('kyc_submissions')
          .select('status, updated_at, created_at, reject_reason')
          .eq('agent_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle<{ status: string | null; updated_at: string | null; created_at: string | null; reject_reason?: string | null }>(),
        supabase
          .from('agents')
          .select('verified')
          .eq('id', user.id)
          .maybeSingle<{ verified: boolean | null }>(),
      ]);

      if (kycError) {
        throw new Error(kycError.message);
      }
      if (agentError) {
        throw new Error(agentError.message);
      }

      const latestStatus = (latestKyc?.status ?? '').toLowerCase();
      const isVerifiedNow = agentRow?.verified === true || latestStatus === 'approved';
      const nextKycStatus: 'none' | 'pending' | 'verified' | 'rejected' = isVerifiedNow
        ? 'verified'
        : latestStatus === 'rejected'
          ? 'rejected'
          : latestStatus === 'pending' || latestStatus === 'reviewing'
            ? 'pending'
            : 'none';

      console.log('[PROFILE] Latest KYC status resolved:', {
        latestStatus,
        agentVerified: agentRow?.verified ?? false,
        nextKycStatus,
      });

      setRejectReason(nextKycStatus === 'rejected' ? (latestKyc?.reject_reason ?? null) : null);

      if (user.kycStatus !== nextKycStatus || user.isVerified !== isVerifiedNow) {
        await saveUser({
          ...user,
          kycStatus: nextKycStatus,
          isVerified: isVerifiedNow,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.log('[PROFILE] fetchKycStatus error:', message);
      Alert.alert('Refresh failed', 'Network error. Please try again.');
    } finally {
      setLoadingReason(false);
      setIsRefreshingKyc(false);
    }
  }, [isLoggedIn, saveUser, user]);

  useEffect(() => {
    if (isLoggedIn && user.role === 'agent' && user.kycStatus === 'rejected' && user.id) {
      setLoadingReason(true);
      void fetchKycStatus({ silent: true });
    }
  }, [fetchKycStatus, isLoggedIn, user.id, user.kycStatus, user.role]);

  React.useEffect(() => {
    trackScreenView('profile');
  }, [trackScreenView]);

  useFocusEffect(
    useCallback(() => {
      void fetchKycStatus({ silent: true });
    }, [fetchKycStatus]),
  );

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void fetchKycStatus({ silent: true });
      }
    });

    return () => {
      appStateSubscription.remove();
    };
  }, [fetchKycStatus]);

  useEffect(() => {
    if (!isLoggedIn || user.role !== 'agent' || !user.id) {
      return;
    }

    const kycChannel = supabase
      .channel(`kyc-status-${user.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'kyc_submissions',
        filter: `agent_id=eq.${user.id}`,
      }, () => {
        console.log('[PROFILE] Realtime kyc_submissions update received');
        void fetchKycStatus({ silent: true });
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'agents',
        filter: `id=eq.${user.id}`,
      }, () => {
        console.log('[PROFILE] Realtime agents update received');
        void fetchKycStatus({ silent: true });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(kycChannel);
    };
  }, [fetchKycStatus, isLoggedIn, user.id, user.role]);

  const handleLanguageSelect = useCallback(
    async (lang: Language) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await setLanguage(lang);
      setShowLanguages(false);
    },
    [setLanguage],
  );

  const handleLogin = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/login');
  }, [router]);

  const handleAgentRegister = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!isLoggedIn) {
      router.push('/login');
    } else {
      router.push('/agent-register');
    }
  }, [isLoggedIn, router]);

  const handleLogout = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      t('logout'),
      '',
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('logout'),
          style: 'destructive',
          onPress: () => {
            logout();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ],
    );
  }, [t, logout]);

  const resolveProfileAvatarUrl = useCallback(async () => {
    if (!isLoggedIn || user.role !== 'agent') {
      setAvatarSignedUrl(null);
      return;
    }

    const resolved = await resolveAvatarUrl(user.avatar ?? null);
    setAvatarSignedUrl(resolved);
  }, [isLoggedIn, user.avatar, user.role]);

  useEffect(() => {
    void resolveProfileAvatarUrl();
  }, [resolveProfileAvatarUrl]);

  const handleAvatarUpload = useCallback(async () => {
    if (!isLoggedIn || user.role !== 'agent' || !user.id) {
      Alert.alert('Upload failed', 'Agent account is required.');
      return;
    }

    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please allow photo access.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      setIsUploadingAvatar(true);
      const selectedAsset = result.assets[0];
      const storagePath = `agents/${user.id}/avatar.jpg`;
      console.log('[PROFILE] Uploading avatar to:', storagePath);

      let uploadBody: FormData | Blob;

      if (typeof window !== 'undefined') {
        const response = await fetch(selectedAsset.uri);
        uploadBody = await response.blob();
      } else {
        const formData = new FormData();
        formData.append('file', {
          uri: selectedAsset.uri,
          name: 'avatar.jpg',
          type: selectedAsset.mimeType || 'image/jpeg',
        } as never);
        uploadBody = formData;
      }

      const { data: uploadData, error: uploadError } = await supabase.storage.from('avatars').upload(storagePath, uploadBody, {
        contentType: selectedAsset.mimeType || 'image/jpeg',
        upsert: true,
      });

      if (uploadError || !uploadData?.path) {
        throw new Error(uploadError?.message || 'Failed to upload avatar');
      }

      const { error: updateError } = await supabase
        .from('agents')
        .update({ avatar_url: uploadData.path, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      await saveUser({
        ...user,
        avatar: uploadData.path,
      });

      const signedUrl = await resolveAvatarUrl(uploadData.path);
      setAvatarSignedUrl(signedUrl);
      Alert.alert('Success', 'Avatar updated.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.log('[PROFILE] Avatar upload error:', message);
      Alert.alert('Upload failed', message);
    } finally {
      setIsUploadingAvatar(false);
    }
  }, [isLoggedIn, saveUser, user]);

  const getKycStatusDisplay = () => {
    if (user.kycStatus === 'pending') {
      return { icon: <Clock size={16} color={Colors.warning} />, text: t('kycPending'), color: Colors.warning, bg: '#FFF8E1' };
    }
    if (user.kycStatus === 'verified') {
      return { icon: <BadgeCheck size={16} color={Colors.success} />, text: t('kycVerified'), color: Colors.success, bg: '#E8F5E9' };
    }
    if (user.kycStatus === 'rejected') {
      return { icon: <XCircle size={16} color={Colors.danger} />, text: t('kycRejected'), color: Colors.danger, bg: '#FFEBEE' };
    }
    return null;
  };

  const kycStatus = user.role === 'agent' ? getKycStatusDisplay() : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 30 }}
        refreshControl={(
          <RefreshControl
            refreshing={isRefreshingKyc}
            onRefresh={() => {
              setLoadingReason(user.kycStatus === 'rejected');
              void fetchKycStatus();
            }}
          />
        )}
      >
        <Pressable
          style={styles.header}
          onPress={!isLoggedIn ? handleLogin : undefined}
          testID="profile-header"
        >
          <Pressable
            style={styles.avatarContainer}
            onPress={isLoggedIn && user.role === 'agent' ? handleAvatarUpload : undefined}
            testID="profile-avatar-upload-btn"
          >
            {avatarSignedUrl ? (
              <Image source={{ uri: avatarSignedUrl }} style={styles.avatarImage} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, isLoggedIn && user.role === 'agent' && styles.avatarAgent]}>
                {user.role === 'agent' ? (
                  <Briefcase size={28} color={Colors.white} />
                ) : (
                  <User size={28} color={Colors.white} />
                )}
              </View>
            )}
            {isLoggedIn && user.role === 'agent' && (
              <View style={styles.avatarEditBadge}>
                {isUploadingAvatar ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Camera size={12} color={Colors.white} />
                )}
              </View>
            )}
            {isLoggedIn && user.isVerified && (
              <View style={styles.verifiedBadge}>
                <BadgeCheck size={18} color={Colors.success} />
              </View>
            )}
          </Pressable>
          <Text style={styles.userName}>
            {isLoggedIn ? user.name : t('guest')}
          </Text>
          {isLoggedIn ? (
            <View style={styles.roleRow}>
              <Text style={styles.roleText}>
                {user.role === 'agent' ? t('agents') : t('borrower')}
              </Text>
              {kycStatus && (
                <View style={[styles.kycBadge, { backgroundColor: kycStatus.bg }]}>
                  {kycStatus.icon}
                  <Text style={[styles.kycBadgeText, { color: kycStatus.color }]}>
                    {kycStatus.text}
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <Text style={styles.guestHint}>{t('login')} / {t('register')}</Text>
          )}
        </Pressable>

        {!isLoggedIn && (
          <View style={styles.section}>
            <Pressable style={styles.agentBanner} onPress={handleAgentRegister} testID="become-agent-btn">
              <View style={styles.agentBannerLeft}>
                <View style={styles.agentBannerIcon}>
                  <Briefcase size={22} color={Colors.accent} />
                </View>
                <View style={styles.agentBannerText}>
                  <Text style={styles.agentBannerTitle}>{t('becomeAgent')}</Text>
                  <Text style={styles.agentBannerDesc}>{t('becomeAgentDesc')}</Text>
                </View>
              </View>
              <ChevronRight size={18} color={Colors.accent} />
            </Pressable>
          </View>
        )}

        {isLoggedIn && user.role === 'agent' && user.kycStatus === 'rejected' && (
          <View style={styles.section}>
            <View style={styles.rejectedBanner}>
              <View style={styles.rejectedBannerHeader}>
                <AlertTriangle size={20} color="#DC2626" />
                <Text style={styles.rejectedBannerTitle}>{t('kycRejected') || 'Your KYC was rejected'}</Text>
              </View>
              {loadingReason ? (
                <ActivityIndicator size="small" color="#EF4444" style={{ marginTop: 6 }} />
              ) : rejectReason ? (
                <Text style={styles.rejectedBannerReason}>Reason: {rejectReason}</Text>
              ) : null}
              <Pressable style={styles.resubmitBtn} onPress={handleAgentRegister} testID="resubmit-kyc-btn">
                <RotateCcw size={16} color="#FFFFFF" />
                <Text style={styles.resubmitBtnText}>Resubmit KYC</Text>
              </Pressable>
            </View>
          </View>
        )}

        {isLoggedIn && user.role === 'agent' && user.kycStatus !== 'verified' && user.kycStatus !== 'rejected' && (
          <View style={styles.section}>
            <Pressable style={styles.kycBanner} onPress={handleAgentRegister} testID="kyc-banner">
              <View style={styles.kycBannerIcon}>
                <ShieldCheck size={24} color={Colors.white} />
              </View>
              <View style={styles.kycBannerText}>
                <Text style={styles.kycBannerTitle}>{t('kycVerification')}</Text>
                <Text style={styles.kycBannerDesc}>
                  {user.kycStatus === 'pending' ? t('kycPending') : t('kycDesc')}
                </Text>
              </View>
              <ChevronRight size={18} color={Colors.white} />
            </Pressable>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('language')}</Text>
          <Pressable style={styles.menuItem} onPress={() => setShowLanguages(!showLanguages)}>
            <View style={styles.menuLeft}>
              <Globe size={20} color={Colors.primary} />
              <Text style={styles.menuText}>{t('language')}</Text>
            </View>
            <View style={styles.menuRight}>
              <Text style={styles.menuValue}>
                {languageOptions.find((l) => l.code === language)?.label}
              </Text>
              <ChevronRight size={16} color={Colors.textMuted} />
            </View>
          </Pressable>

          {showLanguages && (
            <View style={styles.languageList}>
              {languageOptions.map((opt) => (
                <LanguageOption
                  key={opt.code}
                  option={opt}
                  isActive={language === opt.code}
                  onPress={() => handleLanguageSelect(opt.code)}
                />
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('settings')}</Text>
          {isLoggedIn && user.role === 'agent' ? (
            <MenuItem
              icon={<Briefcase size={20} color={Colors.primary} />}
              label="维护中介资料"
              onPress={() => router.push('/(tabs)/profile/agent-profile-edit')}
              testID="profile-agent-edit"
            />
          ) : null}
          <MenuItem
            icon={<FileText size={20} color={Colors.primary} />}
            label={t('myApplications')}
            onPress={() => router.push('/my-applications')}
            testID="profile-my-applications"
          />
          <MenuItem
            icon={<Bell size={20} color={Colors.primary} />}
            label={t('notifications')}
          />
          <MenuItem
            icon={<Info size={20} color={Colors.primary} />}
            label={t('about')}
          />
        </View>

        <View style={styles.section}>
          {isLoggedIn ? (
            <Pressable style={styles.logoutBtn} onPress={handleLogout} testID="logout-btn">
              <LogOut size={18} color={Colors.danger} />
              <Text style={styles.logoutText}>{t('logout')}</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.loginBtn} onPress={handleLogin} testID="login-btn">
              <LogIn size={18} color={Colors.primary} />
              <Text style={styles.loginBtnText}>{t('login')}</Text>
            </Pressable>
          )}
        </View>

        {isAdmin && (
          <View style={styles.section}>
            <Pressable
              style={styles.adminBtn}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/admin-dashboard'); }}
              testID="admin-dashboard-btn"
            >
              <ShieldCheck size={18} color="#3B82F6" />
              <Text style={styles.adminBtnText}>Admin Dashboard</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.footer}>
          <ShieldCheck size={16} color={Colors.textMuted} />
          <Text style={styles.footerText}>{t('disclaimer')}</Text>
          <Text style={styles.footerCompliance}>{t('bnmCompliance')}</Text>
          <Pressable
            onPress={() => {
              const newTaps = versionTaps + 1;
              setVersionTaps(newTaps);
              if (newTaps >= 5) {
                setVersionTaps(0);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                router.push('/admin-login');
              }
            }}
          >
            <Text style={styles.footerVersion}>TrustFin MY v1.0.0</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const LanguageOption = React.memo(function LanguageOption({
  option,
  isActive,
  onPress,
}: {
  option: { code: Language; label: string; flag: string };
  isActive: boolean;
  onPress: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(scaleAnim, { toValue: 1, friction: 3, useNativeDriver: true }).start()}
    >
      <Animated.View style={[styles.langOption, isActive && styles.langOptionActive, { transform: [{ scale: scaleAnim }] }]}>
        <Text style={styles.langFlag}>{option.flag}</Text>
        <Text style={[styles.langLabel, isActive && styles.langLabelActive]}>{option.label}</Text>
        {isActive && <Check size={18} color={Colors.primary} />}
      </Animated.View>
    </Pressable>
  );
});

const MenuItem = React.memo(function MenuItem({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: React.ReactNode;
  label: string;
  onPress?: () => void;
  testID?: string;
}) {
  return (
    <Pressable style={styles.menuItem} onPress={onPress} testID={testID}>
      <View style={styles.menuLeft}>
        {icon}
        <Text style={styles.menuText}>{label}</Text>
      </View>
      <ChevronRight size={16} color={Colors.textMuted} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    alignItems: 'center' as const,
    paddingVertical: 24,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  avatarContainer: {
    marginBottom: 12,
    position: 'relative' as const,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.inputBg,
  },
  avatarEditBadge: {
    position: 'absolute' as const,
    bottom: -1,
    left: -1,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    borderWidth: 2,
    borderColor: Colors.white,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  avatarAgent: {
    backgroundColor: Colors.accent,
  },
  verifiedBadge: {
    position: 'absolute' as const,
    bottom: -2,
    right: -2,
    backgroundColor: Colors.white,
    borderRadius: 10,
    padding: 2,
  },
  userName: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  guestHint: {
    fontSize: 13,
    color: Colors.primary,
    marginTop: 4,
    fontWeight: '500' as const,
  },
  roleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginTop: 6,
  },
  roleText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  kycBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  kycBadgeText: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
  section: {
    marginTop: 20,
    marginHorizontal: 20,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  agentBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: '#FFF8E1',
    borderWidth: 1,
    borderColor: Colors.accentLight,
    borderRadius: 14,
    padding: 16,
  },
  agentBannerLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    flex: 1,
  },
  agentBannerIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFF3E0',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  agentBannerText: {
    flex: 1,
  },
  agentBannerTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  agentBannerDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  kycBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  kycBannerIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  kycBannerText: {
    flex: 1,
  },
  kycBannerTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.white,
    marginBottom: 2,
  },
  kycBannerDesc: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 16,
  },
  menuItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: Colors.white,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 2,
  },
  menuLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
  },
  menuRight: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  menuText: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.textPrimary,
  },
  menuValue: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  languageList: {
    marginTop: 4,
    gap: 6,
  },
  langOption: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: Colors.white,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 12,
  },
  langOptionActive: {
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  langFlag: {
    fontSize: 20,
  },
  langLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.textPrimary,
  },
  langLabelActive: {
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  loginBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
  },
  loginBtnText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.white,
  },
  logoutBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    backgroundColor: Colors.white,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.danger,
  },
  footer: {
    alignItems: 'center' as const,
    marginTop: 28,
    paddingHorizontal: 30,
    gap: 6,
  },
  footerText: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center' as const,
    lineHeight: 16,
  },
  footerCompliance: {
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: 'center' as const,
  },
  footerVersion: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 4,
  },
  adminBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    backgroundColor: '#EFF6FF',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  adminBtnText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#3B82F6',
  },
  rejectedBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  rejectedBannerHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  rejectedBannerTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#DC2626',
  },
  rejectedBannerReason: {
    fontSize: 13,
    color: '#991B1B',
    lineHeight: 19,
    paddingLeft: 28,
  },
  resubmitBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    backgroundColor: '#DC2626',
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 4,
  },
  resubmitBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#FFFFFF',
  },
});
