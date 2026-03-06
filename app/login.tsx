import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { X, Phone, ArrowRight, ShieldCheck, User, Briefcase } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth, UserProfile } from '@/contexts/AuthContext';
import Colors from '@/constants/colors';
import { supabase, getRedirectUrl } from '@/lib/supabase';

type ScreenMode = 'login' | 'register';
type RegisterRole = 'borrower' | 'agent';
type AuthMethod = 'phone' | 'email';
type Step = 'phone' | 'otp' | 'role' | 'info';

export default function LoginScreen() {
  const { t } = useLanguage();
  const { login } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<ScreenMode>('login');
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState<string>('');
  const [otp, setOtp] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [authMethod, setAuthMethod] = useState<AuthMethod>('phone');
  const [role, setRole] = useState<RegisterRole>('borrower');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const otpInputRefs = useRef<(TextInput | null)[]>([]);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const [devOtpCode, setDevOtpCode] = useState<string | null>(null);

  const animateTransition = useCallback((callback: () => void) => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -20, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      callback();
      slideAnim.setValue(20);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    });
  }, [fadeAnim, slideAnim]);

  const handleSendOtp = useCallback(() => {
    if (authMethod === 'email') {
      if (!email.trim() || !password.trim()) {
        Alert.alert('', 'Please enter email and password.');
        return;
      }

      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(email.trim())) {
        Alert.alert('', 'Please enter a valid email address.');
        return;
      }

      if (mode === 'register') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        animateTransition(() => setStep('role'));
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsLoading(true);
      console.log('[LOGIN] Email login started for:', email.trim().toLowerCase());

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('NETWORK_TIMEOUT')), 20000);
      });

      Promise.race([
        supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        }),
        timeoutPromise,
      ])
        .then((result) => {
          const typedResult = result as Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>;
          if (typedResult.error || !typedResult.data.user) {
            const message = typedResult.error?.message ?? 'Login failed. Please try again.';
            Alert.alert('', message);
            return;
          }

          const profile: UserProfile = {
            id: typedResult.data.user.id,
            name: (typedResult.data.user.user_metadata?.full_name as string | undefined) ?? '',
            phone: typedResult.data.user.phone ?? '',
            email: typedResult.data.user.email ?? email.trim().toLowerCase(),
            role: ((typedResult.data.user.user_metadata?.role as UserProfile['role'] | undefined) ?? 'borrower'),
            isVerified: true,
            kycStatus: 'none',
          };

          login(profile);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert('', t('loginSuccess'), [{ text: 'OK', onPress: () => router.back() }]);
        })
        .catch((error: unknown) => {
          console.log('[LOGIN] Email login error:', error);
          const message = error instanceof Error ? error.message : String(error);
          const status = (error as any)?.status ?? (error as any)?.statusCode ?? '';
          if (message === 'NETWORK_TIMEOUT') {
            Alert.alert('', 'Network timeout while connecting to Supabase Auth.');
            return;
          }
          Alert.alert('Login Error', status ? `[${status}] ${message}` : message);
        })
        .finally(() => {
          setIsLoading(false);
        });
      return;
    }

    if (phone.length < 9) {
      Alert.alert('', t('invalidPhone'));
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);
    setDevOtpCode(null);
    const fullPhone = `+60${phone}`;
    console.log('[LOGIN] Sending OTP via Supabase to', fullPhone);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('NETWORK_TIMEOUT')), 20000);
    });

    Promise.race([
      supabase.auth.signInWithOtp({ phone: fullPhone }),
      timeoutPromise,
    ])
      .then((result) => {
        const typedResult = result as Awaited<ReturnType<typeof supabase.auth.signInWithOtp>>;
        if (typedResult.error) {
          console.log('[LOGIN] Supabase signInWithOtp error:', typedResult.error.message);
          Alert.alert('Send OTP Error', typedResult.error.message);
          return;
        }
        console.log('[LOGIN] OTP sent successfully via Supabase');
        setOtp('');
        animateTransition(() => setStep('otp'));
      })
      .catch((error: unknown) => {
        console.log('[LOGIN] Send OTP failed:', error);
        const message = error instanceof Error ? error.message : String(error);
        if (message === 'NETWORK_TIMEOUT') {
          Alert.alert('', 'Network timeout. Please check your connection and try again.');
        } else {
          Alert.alert('Send OTP Error', message);
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [authMethod, email, mode, password, phone, t, animateTransition, login, router]);

  const handleVerifyOtp = useCallback(() => {
    if (otp.length < 6) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);
    const fullPhone = `+60${phone}`;
    console.log('[LOGIN] Verifying OTP via Supabase:', otp, 'for', fullPhone);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('NETWORK_TIMEOUT')), 20000);
    });

    Promise.race([
      supabase.auth.verifyOtp({ phone: fullPhone, token: otp, type: 'sms' }),
      timeoutPromise,
    ])
      .then((result) => {
        const typedResult = result as Awaited<ReturnType<typeof supabase.auth.verifyOtp>>;
        if (typedResult.error) {
          console.log('[LOGIN] Supabase verifyOtp error:', typedResult.error.message);
          Alert.alert('Verify OTP Error', typedResult.error.message);
          return;
        }

        const su = typedResult.data.user;
        if (!su) {
          Alert.alert('', 'Verification failed. Please try again.');
          return;
        }

        console.log('[LOGIN] OTP verified successfully, user:', su.id);

        if (mode === 'login') {
          const profile: UserProfile = {
            id: su.id,
            name: (su.user_metadata?.full_name as string | undefined) ?? '',
            phone: su.phone ?? fullPhone,
            email: su.email ?? '',
            role: ((su.user_metadata?.role as UserProfile['role'] | undefined) ?? 'borrower'),
            isVerified: true,
            kycStatus: (su.user_metadata?.kyc_status as UserProfile['kycStatus'] | undefined) ?? 'none',
          };
          login(profile);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert('', t('loginSuccess'), [{ text: 'OK', onPress: () => router.back() }]);
        } else {
          animateTransition(() => setStep('role'));
        }
      })
      .catch((error: unknown) => {
        console.log('[LOGIN] Verify OTP failed:', error);
        const message = error instanceof Error ? error.message : String(error);
        if (message === 'NETWORK_TIMEOUT') {
          Alert.alert('', 'Network timeout. Please check your connection and try again.');
        } else {
          Alert.alert('Verify OTP Error', message);
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [otp, mode, phone, t, login, router, animateTransition]);

  const handleSelectRole = useCallback((selected: RegisterRole) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRole(selected);
    animateTransition(() => setStep('info'));
  }, [animateTransition]);

  const handleRegister = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert('', t('fillAllFields'));
      return;
    }

    if (authMethod === 'phone' && phone.length < 9) {
      Alert.alert('', t('invalidPhone'));
      return;
    }

    if (authMethod === 'email') {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(email.trim())) {
        Alert.alert('', 'Please enter a valid email address.');
        return;
      }
      if (password.trim().length < 6) {
        Alert.alert('', 'Password must be at least 6 characters.');
        return;
      }
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);

    const normalizedPhone = phone.length > 0 ? `+60${phone}` : '';
    const randomPassword = authMethod === 'email'
      ? password.trim()
      : `TrustFin_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    console.log('[LOGIN] Sign up started, method:', authMethod);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('NETWORK_TIMEOUT')), 20000);
    });

    try {
      const redirectUrl = getRedirectUrl();
      console.log('[LOGIN] Email redirect URL:', redirectUrl);

      const signUpPromise = authMethod === 'email'
        ? supabase.auth.signUp({
            email: email.trim().toLowerCase(),
            password: randomPassword,
            options: {
              emailRedirectTo: redirectUrl,
              data: {
                full_name: name.trim(),
                role,
                phone: normalizedPhone || undefined,
              },
            },
          })
        : supabase.auth.signUp({
            phone: normalizedPhone,
            password: randomPassword,
            options: {
              data: {
                full_name: name.trim(),
                role,
              },
            },
          });

      const signUpResult = await Promise.race([signUpPromise, timeoutPromise]);
      const { data, error } = signUpResult;

      if (error) {
        console.log('[LOGIN] Supabase signUp error:', error.message);
        Alert.alert('', error.message || 'Registration failed. Please try again.');
        return;
      }

      console.log('[LOGIN] Supabase signUp result:', {
        userId: data.user?.id ?? null,
        hasSession: !!data.session,
        emailConfirmed: !!data.user?.email_confirmed_at,
      });

      if (data.session && data.user) {
        const profile: UserProfile = {
          id: data.user.id,
          name: (data.user.user_metadata?.full_name as string | undefined) ?? name.trim(),
          phone: data.user.phone ?? normalizedPhone,
          email: data.user.email ?? email.trim().toLowerCase(),
          role: ((data.user.user_metadata?.role as UserProfile['role'] | undefined) ?? role),
          isVerified: true,
          kycStatus: 'none',
        };
        login(profile);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('', t('loginSuccess'), [{ text: 'OK', onPress: () => router.back() }]);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          'Check Your Email',
          'A confirmation link has been sent to ' + email.trim().toLowerCase() + '. Please click the link to verify your account, then come back and log in.',
          [{
            text: 'OK',
            onPress: () => {
              animateTransition(() => {
                setMode('login');
                setStep('phone');
              });
            },
          }]
        );
      }
    } catch (error: unknown) {
      console.log('[LOGIN] Supabase signUp request failed:', error);
      const message = error instanceof Error ? error.message : String(error);
      const status = (error as any)?.status ?? (error as any)?.statusCode ?? '';
      if (message === 'NETWORK_TIMEOUT') {
        Alert.alert('', 'Network timeout. Please check your network connection and try again.');
      } else {
        Alert.alert('Registration Error', status ? `[${status}] ${message}` : message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [name, phone, role, t, authMethod, email, password, login, router, animateTransition]);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === 'info') {
      animateTransition(() => setStep('role'));
    } else if (step === 'role') {
      animateTransition(() => setStep('otp'));
    } else if (step === 'otp') {
      animateTransition(() => setStep('phone'));
    } else {
      router.back();
    }
  }, [step, router, animateTransition]);

  const switchMode = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateTransition(() => {
      setMode(mode === 'login' ? 'register' : 'login');
      setStep('phone');
      setOtp('');
    });
  }, [mode, animateTransition]);

  const renderPhoneStep = () => (
    <View style={styles.stepContainer}>
      <View style={styles.iconCircle}>
        <Phone size={28} color={Colors.white} />
      </View>
      <Text style={styles.stepTitle}>
        {mode === 'login' ? t('loginTitle') : t('registerTitle')}
      </Text>
      <Text style={styles.stepSubtitle}>
        {mode === 'login' ? t('loginSubtitle') : t('registerSubtitle')}
      </Text>

      <View style={styles.methodSwitch}>
        <Pressable
          style={[styles.methodChip, authMethod === 'phone' && styles.methodChipActive]}
          onPress={() => setAuthMethod('phone')}
          testID="auth-method-phone"
        >
          <Text style={[styles.methodChipText, authMethod === 'phone' && styles.methodChipTextActive]}>Phone</Text>
        </Pressable>
        <Pressable
          style={[styles.methodChip, authMethod === 'email' && styles.methodChipActive]}
          onPress={() => setAuthMethod('email')}
          testID="auth-method-email"
        >
          <Text style={[styles.methodChipText, authMethod === 'email' && styles.methodChipTextActive]}>Email</Text>
        </Pressable>
      </View>

      {authMethod === 'phone' ? (
        <View style={styles.inputGroup}>
          <View style={styles.phoneInputRow}>
            <View style={styles.countryCode}>
              <Text style={styles.countryCodeText}>+60</Text>
            </View>
            <TextInput
              style={styles.phoneInput}
              placeholder={t('phoneNumber')}
              placeholderTextColor={Colors.textMuted}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              maxLength={12}
              testID="phone-input"
            />
          </View>
        </View>
      ) : (
        <>
          <View style={styles.inputGroup}>
            <TextInput
              style={styles.input}
              placeholder="email@example.com"
              placeholderTextColor={Colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
              testID="email-auth-input"
            />
          </View>
          <View style={styles.inputGroup}>
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              testID="password-auth-input"
            />
          </View>
        </>
      )}

      <Pressable
        style={[styles.primaryBtn, isLoading && styles.btnDisabled]}
        onPress={handleSendOtp}
        disabled={isLoading}
        testID="send-otp-btn"
      >
        <Text style={styles.primaryBtnText}>
          {isLoading ? '...' : authMethod === 'email' ? (mode === 'login' ? 'Login with Email' : 'Continue with Email') : t('sendOtp')}
        </Text>
        {!isLoading && <ArrowRight size={18} color={Colors.white} />}
      </Pressable>

      <View style={styles.switchRow}>
        <Text style={styles.switchText}>
          {mode === 'login' ? t('noAccount') : t('haveAccount')}
        </Text>
        <Pressable onPress={switchMode}>
          <Text style={styles.switchLink}>
            {mode === 'login' ? t('registerNow') : t('loginNow')}
          </Text>
        </Pressable>
      </View>
    </View>
  );

  const handleOtpDigitChange = useCallback((text: string, index: number) => {
    const digit = text.replace(/[^0-9]/g, '');
    if (digit.length <= 1) {
      const newOtp = otp.split('');
      newOtp[index] = digit;
      const joined = newOtp.join('').slice(0, 6);
      setOtp(joined);
      if (digit && index < 5) {
        otpInputRefs.current[index + 1]?.focus();
      }
    } else if (digit.length === 6) {
      setOtp(digit);
      otpInputRefs.current[5]?.focus();
    }
  }, [otp]);

  const handleOtpKeyPress = useCallback((key: string, index: number) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      const newOtp = otp.split('');
      newOtp[index - 1] = '';
      setOtp(newOtp.join(''));
      otpInputRefs.current[index - 1]?.focus();
    }
  }, [otp]);

  const renderOtpStep = () => (
    <View style={styles.stepContainer}>
      <View style={[styles.iconCircle, { backgroundColor: Colors.success }]}>
        <ShieldCheck size={28} color={Colors.white} />
      </View>
      <Text style={styles.stepTitle}>{t('enterOtp')}</Text>
      <Text style={styles.stepSubtitle}>{t('otpSent')}</Text>
      <Text style={styles.phoneDisplay}>+60 {phone}</Text>

      {devOtpCode && (
        <View style={styles.devBanner}>
          <Text style={styles.devBannerTitle}>DEV MODE</Text>
          <Text style={styles.devBannerCode}>{devOtpCode}</Text>
          <Text style={styles.devBannerHint}>Configure Twilio to send real SMS</Text>
        </View>
      )}

      <View style={styles.otpRow}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <TextInput
            key={i}
            ref={(ref) => { otpInputRefs.current[i] = ref; }}
            style={[
              styles.otpInput,
              otp[i] ? styles.otpInputFilled : null,
            ]}
            keyboardType="number-pad"
            maxLength={i === 0 ? 6 : 1}
            value={otp[i] || ''}
            onChangeText={(text) => handleOtpDigitChange(text, i)}
            onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, i)}
            autoFocus={i === 0}
            selectTextOnFocus
            testID={`otp-input-${i}`}
          />
        ))}
      </View>

      <Pressable
        style={[styles.primaryBtn, (isLoading || otp.length < 6) && styles.btnDisabled]}
        onPress={handleVerifyOtp}
        disabled={isLoading || otp.length < 6}
        testID="verify-otp-btn"
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={Colors.white} />
        ) : (
          <Text style={styles.primaryBtnText}>{t('verify')}</Text>
        )}
      </Pressable>

      <Pressable onPress={() => { setOtp(''); otpInputRefs.current[0]?.focus(); handleSendOtp(); }} style={styles.resendBtn}>
        <Text style={styles.resendText}>{t('resendOtp')}</Text>
      </Pressable>
    </View>
  );

  const renderRoleStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>{t('registerAs')}</Text>
      <Text style={styles.stepSubtitle}>{t('registerSubtitle')}</Text>

      <Pressable
        style={[styles.roleCard, role === 'borrower' && styles.roleCardActive]}
        onPress={() => handleSelectRole('borrower')}
        testID="role-borrower"
      >
        <View style={[styles.roleIcon, { backgroundColor: '#E8F5E9' }]}>
          <User size={26} color={Colors.success} />
        </View>
        <View style={styles.roleInfo}>
          <Text style={styles.roleName}>{t('borrower')}</Text>
          <Text style={styles.roleDesc}>{t('borrowerDesc')}</Text>
        </View>
        <ArrowRight size={18} color={Colors.textMuted} />
      </Pressable>

      <Pressable
        style={[styles.roleCard, role === 'agent' && styles.roleCardActive]}
        onPress={() => handleSelectRole('agent')}
        testID="role-agent"
      >
        <View style={[styles.roleIcon, { backgroundColor: '#FFF3E0' }]}>
          <Briefcase size={26} color={Colors.accent} />
        </View>
        <View style={styles.roleInfo}>
          <Text style={styles.roleName}>{t('agents')}</Text>
          <Text style={styles.roleDesc}>{t('agentDesc')}</Text>
        </View>
        <ArrowRight size={18} color={Colors.textMuted} />
      </Pressable>
    </View>
  );

  const renderInfoStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>{t('personalInfo')}</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{t('fullName')} *</Text>
        <TextInput
          style={styles.input}
          placeholder={t('fullName')}
          placeholderTextColor={Colors.textMuted}
          value={name}
          onChangeText={setName}
          testID="name-input"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{authMethod === 'email' ? 'Email *' : t('emailOptional')}</Text>
        <TextInput
          style={styles.input}
          placeholder="email@example.com"
          placeholderTextColor={Colors.textMuted}
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          testID="email-input"
        />
      </View>

      {authMethod === 'email' && (
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Password *</Text>
          <TextInput
            style={styles.input}
            placeholder="At least 6 characters"
            placeholderTextColor={Colors.textMuted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            testID="register-password-input"
          />
        </View>
      )}

      <Pressable
        style={[styles.primaryBtn, isLoading && styles.btnDisabled]}
        onPress={handleRegister}
        disabled={isLoading}
        testID="register-btn"
      >
        <Text style={styles.primaryBtnText}>
          {isLoading ? '...' : (role === 'agent' ? `${t('register')} & ${t('kycVerification')}` : t('register'))}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={handleBack} style={styles.backBtn} testID="back-btn">
          {step === 'phone' ? (
            <X size={22} color={Colors.textPrimary} />
          ) : (
            <Text style={styles.backBtnText}>{t('back')}</Text>
          )}
        </Pressable>
        {step !== 'phone' && (
          <Text style={styles.stepIndicator}>
            {step === 'otp' && (mode === 'login' ? '2/2' : '2/4')}
            {step === 'role' && '3/4'}
            {step === 'info' && '4/4'}
          </Text>
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            {step === 'phone' && renderPhoneStep()}
            {step === 'otp' && renderOtpStep()}
            {step === 'role' && renderRoleStep()}
            {step === 'info' && renderInfoStep()}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.bottomSafe, { paddingBottom: insets.bottom + 8 }]}>
        <ShieldCheck size={14} color={Colors.textMuted} />
        <Text style={styles.bottomText}>{t('disclaimer')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    padding: 8,
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  stepIndicator: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textMuted,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  stepContainer: {
    alignItems: 'center' as const,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 20,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center' as const,
  },
  stepSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center' as const,
    marginBottom: 28,
    lineHeight: 20,
    paddingHorizontal: 10,
  },
  phoneDisplay: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.primary,
    marginBottom: 24,
  },
  inputGroup: {
    width: '100%' as const,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    marginBottom: 6,
    marginLeft: 2,
  },
  methodSwitch: {
    flexDirection: 'row' as const,
    width: '100%' as const,
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    padding: 4,
    marginBottom: 14,
    gap: 6,
  },
  methodChip: {
    flex: 1,
    borderRadius: 10,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 10,
  },
  methodChipActive: {
    backgroundColor: Colors.primary,
  },
  methodChipText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
  },
  methodChipTextActive: {
    color: Colors.white,
  },
  phoneInputRow: {
    flexDirection: 'row' as const,
    gap: 10,
  },
  countryCode: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  countryCodeText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
  },
  phoneInput: {
    flex: 1,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  input: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  otpRow: {
    flexDirection: 'row' as const,
    gap: 10,
    marginBottom: 16,
  },
  otpInput: {
    width: 46,
    height: 54,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.inputBorder,
    backgroundColor: Colors.white,
    textAlign: 'center' as const,
    fontSize: 22,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  otpInputFilled: {
    borderColor: Colors.primary,
    backgroundColor: Colors.inputBg,
  },

  primaryBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    backgroundColor: Colors.primary,
    width: '100%' as const,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 12,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.white,
  },
  switchRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginTop: 20,
  },
  switchText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  switchLink: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  resendBtn: {
    marginTop: 16,
    padding: 8,
  },
  resendText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  roleCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 18,
    width: '100%' as const,
    marginBottom: 14,
    gap: 14,
  },
  roleCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.inputBg,
  },
  roleIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  roleInfo: {
    flex: 1,
  },
  roleName: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  roleDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  bottomSafe: {
    alignItems: 'center' as const,
    paddingHorizontal: 30,
    paddingTop: 10,
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  bottomText: {
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: 'center' as const,
    lineHeight: 14,
  },
  devBanner: {
    backgroundColor: '#FFF8E1',
    borderWidth: 1,
    borderColor: '#FFD54F',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    width: '100%' as const,
    alignItems: 'center' as const,
  },
  devBannerTitle: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: '#F57F17',
    letterSpacing: 1,
    marginBottom: 4,
  },
  devBannerCode: {
    fontSize: 28,
    fontWeight: '800' as const,
    color: '#E65100',
    letterSpacing: 6,
    marginBottom: 4,
  },
  devBannerHint: {
    fontSize: 11,
    color: '#9E9E9E',
  },
});
