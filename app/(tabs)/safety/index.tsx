import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Animated,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ShieldCheck,
  BadgeCheck,
  Building2,
  Lock,
  Search,
  FileWarning,
  TriangleAlert,
  CircleCheck,
  Phone,
  Landmark,
  Send,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';

interface SafetyTip {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  tone: 'warning' | 'info' | 'success';
}

interface VerifyResult {
  status: 'idle' | 'verified' | 'unverified';
  message: string;
}

const SHADOW_STYLE = Platform.select({
  ios: {
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  android: { elevation: 3 },
  web: {
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
});

export default function SafetyScreen() {
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const { t } = useLanguage();

  const [agentCode, setAgentCode] = useState<string>('');
  const [verifyResult, setVerifyResult] = useState<VerifyResult>({ status: 'idle', message: '' });

  const [reportName, setReportName] = useState<string>('');
  const [reportPhone, setReportPhone] = useState<string>('');
  const [reportDetails, setReportDetails] = useState<string>('');
  const [reportState, setReportState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 450,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const tips: SafetyTip[] = useMemo(
    () => [
      {
        id: 'tip-1',
        title: t('tipNeverPayTitle'),
        description: t('tipNeverPayDesc'),
        icon: <TriangleAlert size={20} color="#F59E0B" />,
        tone: 'warning',
      },
      {
        id: 'tip-2',
        title: t('tipCompanyAccountTitle'),
        description: t('tipCompanyAccountDesc'),
        icon: <Landmark size={20} color={Colors.primary} />,
        tone: 'info',
      },
      {
        id: 'tip-3',
        title: t('tipVerificationBadgeTitle'),
        description: t('tipVerificationBadgeDesc'),
        icon: <BadgeCheck size={20} color={Colors.verified} />,
        tone: 'success',
      },
      {
        id: 'tip-4',
        title: t('tipKeepRecordsTitle'),
        description: t('tipKeepRecordsDesc'),
        icon: <FileWarning size={20} color="#EF4444" />,
        tone: 'warning',
      },
    ],
    [t]
  );

  const onVerifyAgent = useCallback(() => {
    const cleaned = agentCode.trim().toUpperCase();
    console.log('[SafetyScreen] Verify agent tapped', { cleaned, length: cleaned.length });

    if (!cleaned) {
      setVerifyResult({ status: 'unverified', message: t('verifyAgentRequiredMessage') });
      return;
    }

    const isValidFormat = /^TF-[A-Z0-9]{4,12}$/.test(cleaned);
    if (!isValidFormat) {
      setVerifyResult({
        status: 'unverified',
        message: t('verifyAgentInvalidFormatMessage'),
      });
      return;
    }

    const trustedPrefixes = ['TF-AG', 'TF-VIP', 'TF-BK'];
    const verified = trustedPrefixes.some((prefix) => cleaned.startsWith(prefix));

    if (verified) {
      setVerifyResult({
        status: 'verified',
        message: t('verifyAgentValidMessage'),
      });
      return;
    }

    setVerifyResult({
      status: 'unverified',
      message: t('verifyAgentNotFoundMessage'),
    });
  }, [agentCode, t]);

  const onSubmitReport = useCallback(() => {
    const trimmedName = reportName.trim();
    const trimmedPhone = reportPhone.trim();
    const trimmedDetails = reportDetails.trim();

    console.log('[SafetyScreen] Submit scam report', {
      hasName: Boolean(trimmedName),
      hasPhone: Boolean(trimmedPhone),
      detailsLength: trimmedDetails.length,
    });

    if (!trimmedName || !trimmedPhone || !trimmedDetails) {
      setReportState('error');
      Alert.alert(t('missingInformationTitle'), t('missingInformationMessage'));
      return;
    }

    const phoneOk = /^\+?[0-9]{7,15}$/.test(trimmedPhone.replace(/\s/g, ''));
    if (!phoneOk) {
      setReportState('error');
      Alert.alert(t('invalidPhoneTitle'), t('invalidPhoneMessage'));
      return;
    }

    setReportState('submitting');

    setTimeout(() => {
      setReportState('success');
      setReportName('');
      setReportPhone('');
      setReportDetails('');
      Alert.alert(t('reportSubmittedTitle'), t('reportSubmittedMessage'));
    }, 650);
  }, [reportName, reportPhone, reportDetails, t]);

  const verifyToneStyle =
    verifyResult.status === 'verified'
      ? styles.verifyResultVerified
      : verifyResult.status === 'unverified'
        ? styles.verifyResultUnverified
        : null;

  return (
    <View style={styles.screen} testID="safety-screen">
      <ScrollView
        testID="safety-scroll-view"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <LinearGradient
          colors={[Colors.primaryDark, Colors.primary, '#123B70']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + 14 }]}
        >
          <View style={styles.heroIconWrap}>
            <ShieldCheck size={26} color={Colors.white} />
          </View>
          <Text style={styles.heroTitle}>{t('safetyCenterTitle')}</Text>
          <Text style={styles.heroSubtitle}>
            {t('safetyCenterSubtitle')}
          </Text>

          <View style={styles.heroTrustBar} testID="trust-pill-row">
            <TrustPill icon={<BadgeCheck size={14} color={Colors.verified} />} label={t('verifiedAgents')} />
            <TrustPill icon={<Building2 size={14} color={Colors.accent} />} label={t('partnerBanks')} />
            <TrustPill icon={<Lock size={14} color={Colors.white} />} label={t('securePlatform')} light />
          </View>
        </LinearGradient>

        <Animated.View style={[styles.body, { opacity: fadeAnim }]}>
          <View style={styles.sectionCard} testID="verify-agent-card">
            <Text style={styles.sectionTitle}>{t('verifyAnAgent')}</Text>
            <Text style={styles.sectionSubtitle}>
              {t('verifyAgentSubtitle')}
            </Text>

            <View style={styles.inputWrap}>
              <Search size={18} color={Colors.textMuted} />
              <TextInput
                testID="verify-agent-input"
                value={agentCode}
                onChangeText={setAgentCode}
                placeholder={t('verifyAgentPlaceholder')}
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="characters"
                style={styles.input}
              />
            </View>

            <Pressable
              testID="verify-agent-button"
              onPress={onVerifyAgent}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            >
              <CircleCheck size={18} color={Colors.white} />
              <Text style={styles.primaryButtonText}>{t('checkRegistration')}</Text>
            </Pressable>

            {verifyResult.status !== 'idle' ? (
              <View style={[styles.verifyResultBox, verifyToneStyle]} testID="verify-result-box">
                <Text style={styles.verifyResultText}>{verifyResult.message}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.sectionCard} testID="report-scam-card">
            <Text style={styles.sectionTitle}>{t('reportScam')}</Text>
            <Text style={styles.sectionSubtitle}>{t('reportScamSubtitle')}</Text>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>{t('yourName')}</Text>
              <TextInput
                testID="report-name-input"
                value={reportName}
                onChangeText={setReportName}
                placeholder={t('fullNamePlaceholder')}
                placeholderTextColor={Colors.textMuted}
                style={styles.inputSolo}
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>{t('phoneNumber')}</Text>
              <View style={styles.inputWrap}>
                <Phone size={18} color={Colors.textMuted} />
                <TextInput
                  testID="report-phone-input"
                  value={reportPhone}
                  onChangeText={setReportPhone}
                  placeholder="+60123456789"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="phone-pad"
                  style={styles.input}
                />
              </View>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>{t('whatHappened')}</Text>
              <TextInput
                testID="report-details-input"
                value={reportDetails}
                onChangeText={setReportDetails}
                placeholder={t('incidentDetailsPlaceholder')}
                placeholderTextColor={Colors.textMuted}
                multiline
                textAlignVertical="top"
                style={styles.textArea}
              />
            </View>

            <Pressable
              testID="submit-report-button"
              onPress={onSubmitReport}
              disabled={reportState === 'submitting'}
              style={({ pressed }) => [
                styles.warningButton,
                reportState === 'submitting' && styles.warningButtonDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Send size={18} color={Colors.white} />
              <Text style={styles.warningButtonText}>
                {reportState === 'submitting' ? t('submittingReport') : t('submitReport')}
              </Text>
            </Pressable>
          </View>

          <View style={styles.sectionCard} testID="safety-tips-card">
            <Text style={styles.sectionTitle}>{t('safetyTips')}</Text>
            <Text style={styles.sectionSubtitle}>{t('safetyTipsSubtitle')}</Text>

            <View style={styles.tipsWrap}>
              {tips.map((tip) => (
                <View
                  key={tip.id}
                  style={[
                    styles.tipItem,
                    tip.tone === 'warning'
                      ? styles.tipWarning
                      : tip.tone === 'success'
                        ? styles.tipSuccess
                        : styles.tipInfo,
                  ]}
                  testID={`safety-tip-${tip.id}`}
                >
                  <View style={styles.tipIconWrap}>{tip.icon}</View>
                  <View style={styles.tipTextWrap}>
                    <Text style={styles.tipTitle}>{tip.title}</Text>
                    <Text style={styles.tipDescription}>{tip.description}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const TrustPill = React.memo(function TrustPill({
  icon,
  label,
  light,
}: {
  icon: React.ReactNode;
  label: string;
  light?: boolean;
}) {
  return (
    <View style={[styles.trustPill, light ? styles.trustPillLight : null]} testID={`trust-pill-${label}`}>
      {icon}
      <Text style={[styles.trustPillText, light ? styles.trustPillTextLight : null]}>{label}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingBottom: 36,
  },
  hero: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  heroIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  heroTitle: {
    marginTop: 12,
    fontSize: 24,
    fontWeight: '800' as const,
    color: Colors.white,
  },
  heroSubtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.88)',
  },
  heroTrustBar: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 14,
  },
  trustPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  trustPillLight: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  trustPillText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: 'rgba(255,255,255,0.95)',
  },
  trustPillTextLight: {
    color: Colors.white,
  },
  body: {
    padding: 16,
    gap: 16,
  },
  sectionCard: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    ...SHADOW_STYLE,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.textPrimary,
  },
  sectionSubtitle: {
    marginTop: 6,
    marginBottom: 14,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.textSecondary,
  },
  inputWrap: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: 12,
    backgroundColor: Colors.inputBg,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 15,
  },
  inputSolo: {
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: 12,
    backgroundColor: Colors.inputBg,
    paddingHorizontal: 12,
    minHeight: 48,
    color: Colors.textPrimary,
    fontSize: 15,
  },
  textArea: {
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: 12,
    backgroundColor: Colors.inputBg,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 110,
    color: Colors.textPrimary,
    fontSize: 15,
  },
  primaryButton: {
    marginTop: 12,
    height: 46,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
  },
  primaryButtonText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  warningButton: {
    marginTop: 4,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#D64745',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
  },
  warningButtonDisabled: {
    opacity: 0.72,
  },
  warningButtonText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  verifyResultBox: {
    marginTop: 12,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  verifyResultVerified: {
    backgroundColor: '#ECFDF5',
    borderColor: '#86EFAC',
  },
  verifyResultUnverified: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  verifyResultText: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.textPrimary,
    fontWeight: '600' as const,
  },
  fieldBlock: {
    marginBottom: 12,
  },
  fieldLabel: {
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
  },
  tipsWrap: {
    gap: 10,
  },
  tipItem: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row' as const,
    gap: 10,
  },
  tipWarning: {
    borderColor: '#FBD38D',
    backgroundColor: '#FFFBEB',
  },
  tipInfo: {
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
  },
  tipSuccess: {
    borderColor: '#86EFAC',
    backgroundColor: '#ECFDF5',
  },
  tipIconWrap: {
    width: 32,
    alignItems: 'center' as const,
    paddingTop: 2,
  },
  tipTextWrap: {
    flex: 1,
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  tipDescription: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.textSecondary,
  },
});
