import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Animated,
  Platform,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FileText,
  Calculator,
  ChevronRight,
  Users,
  CheckCircle2,
  Wallet,
  Car,
  Home,
  CreditCard,
  Briefcase,
  RefreshCw,
  GraduationCap,
  Banknote,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useLanguage } from '@/contexts/LanguageContext';
import { loanGuides } from '@/mocks/categories';
import { agents } from '@/mocks/agents';
import Colors from '@/constants/colors';

const iconMap: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  homeLoan: Home,
  personalLoan: Wallet,
  carLoan: Car,
  businessLoan: Briefcase,
  creditCard: CreditCard,
  refinancing: RefreshCw,
  educationLoan: GraduationCap,
  quickCash: Banknote,
};

const colorMap: Record<string, string> = {
  homeLoan: '#D4A843',
  personalLoan: '#0A1E3D',
  carLoan: '#2ECC71',
  businessLoan: '#8B5CF6',
  creditCard: '#E74C3C',
  refinancing: '#F39C12',
  educationLoan: '#3498DB',
  quickCash: '#1ABC9C',
};

function formatRM(val: number): string {
  return `RM ${val.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function LoanGuideScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useLanguage();
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const guide = useMemo(() => (id ? loanGuides[id] : null), [id]);
  const loanColor = id ? colorMap[id] || Colors.primary : Colors.primary;
  const IconComp = id ? iconMap[id] || Wallet : Wallet;

  const [loanAmount, setLoanAmount] = useState<string>(guide ? guide.minAmount.toString() : '100000');
  const [interestRate, setInterestRate] = useState<string>(guide ? guide.defaultRate.toString() : '5');
  const [tenure, setTenure] = useState<string>('10');

  const matchingAgents = useMemo(() => {
    if (!id) return [];
    return agents.filter((a) => a.specialties.includes(id)).slice(0, 5);
  }, [id]);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  const calcResult = useMemo(() => {
    const P = parseFloat(loanAmount) || 0;
    const annualRate = parseFloat(interestRate) || 0;
    const years = parseInt(tenure, 10) || 1;

    if (P <= 0 || annualRate <= 0 || years <= 0) {
      return { monthly: 0, total: 0, interest: 0 };
    }

    const r = annualRate / 100 / 12;
    const n = years * 12;
    const monthly = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    const total = monthly * n;
    const interest = total - P;

    return { monthly, total, interest };
  }, [loanAmount, interestRate, tenure]);

  if (!guide || !id) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: t('loanGuide') }} />
        <Text style={styles.emptyText}>Loan guide not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t(guide.translationKey) }} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        <Animated.View style={{ opacity: fadeAnim }}>
          <View style={[styles.heroSection, { backgroundColor: loanColor + '12' }]}>
            <View style={[styles.heroIcon, { backgroundColor: loanColor + '20' }]}>
              <IconComp size={36} color={loanColor} />
            </View>
            <Text style={styles.heroTitle}>{t(guide.translationKey)}</Text>
            <Text style={styles.heroSubtitle}>{t('loanGuide')}</Text>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <FileText size={18} color={loanColor} />
              <Text style={styles.sectionTitle}>{t('stepsToApply')}</Text>
            </View>
            {guide.steps.map((stepKey, idx) => (
              <View key={stepKey} style={styles.stepRow}>
                <View style={[styles.stepNumber, { backgroundColor: loanColor }]}>
                  <Text style={styles.stepNumberText}>{idx + 1}</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepText}>{t(stepKey)}</Text>
                </View>
                {idx < guide.steps.length - 1 && <View style={[styles.stepLine, { backgroundColor: loanColor + '30' }]} />}
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <CheckCircle2 size={18} color={loanColor} />
              <Text style={styles.sectionTitle}>{t('requiredDocs')}</Text>
            </View>
            {guide.documents.map((docKey) => (
              <View key={docKey} style={styles.docRow}>
                <View style={[styles.docBullet, { backgroundColor: loanColor }]} />
                <Text style={styles.docText}>{t(docKey)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Calculator size={18} color={loanColor} />
              <Text style={styles.sectionTitle}>{t('loanCalculator')}</Text>
            </View>

            <View style={styles.calcCard}>
              <View style={styles.calcInputGroup}>
                <Text style={styles.calcLabel}>{t('loanAmount')}</Text>
                <View style={styles.calcInputRow}>
                  <Text style={styles.calcPrefix}>RM</Text>
                  <TextInput
                    style={styles.calcInput}
                    value={loanAmount}
                    onChangeText={setLoanAmount}
                    keyboardType="numeric"
                    placeholder="100,000"
                    placeholderTextColor={Colors.textMuted}
                    testID="loan-amount-input"
                  />
                </View>
              </View>

              <View style={styles.calcInputGroup}>
                <Text style={styles.calcLabel}>{t('interestRate')}</Text>
                <View style={styles.calcInputRow}>
                  <TextInput
                    style={[styles.calcInput, { flex: 1 }]}
                    value={interestRate}
                    onChangeText={setInterestRate}
                    keyboardType="decimal-pad"
                    placeholder="4.5"
                    placeholderTextColor={Colors.textMuted}
                    testID="interest-rate-input"
                  />
                  <Text style={styles.calcSuffix}>%</Text>
                </View>
              </View>

              <View style={styles.calcInputGroup}>
                <Text style={styles.calcLabel}>{t('tenure')}</Text>
                <View style={styles.calcInputRow}>
                  <TextInput
                    style={[styles.calcInput, { flex: 1 }]}
                    value={tenure}
                    onChangeText={setTenure}
                    keyboardType="numeric"
                    placeholder="10"
                    placeholderTextColor={Colors.textMuted}
                    testID="tenure-input"
                  />
                  <Text style={styles.calcSuffix}>{t('tenure').split('(')[1]?.replace(')', '') || 'yrs'}</Text>
                </View>
              </View>

              <View style={styles.calcDivider} />

              <View style={styles.calcResultRow}>
                <Text style={styles.calcResultLabel}>{t('monthlyPayment')}</Text>
                <Text style={[styles.calcResultValue, { color: loanColor }]}>
                  {calcResult.monthly > 0 ? formatRM(calcResult.monthly) : '—'}
                </Text>
              </View>
              <View style={styles.calcResultRow}>
                <Text style={styles.calcResultLabel}>{t('totalPayment')}</Text>
                <Text style={styles.calcResultValueSmall}>
                  {calcResult.total > 0 ? formatRM(calcResult.total) : '—'}
                </Text>
              </View>
              <View style={styles.calcResultRow}>
                <Text style={styles.calcResultLabel}>{t('totalInterest')}</Text>
                <Text style={[styles.calcResultValueSmall, { color: Colors.danger }]}>
                  {calcResult.interest > 0 ? formatRM(calcResult.interest) : '—'}
                </Text>
              </View>
            </View>
          </View>

          {matchingAgents.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Users size={18} color={loanColor} />
                <Text style={styles.sectionTitle}>{t('findAgents')}</Text>
              </View>
              {matchingAgents.map((agent) => (
                <Pressable
                  key={agent.id}
                  style={styles.agentRow}
                  onPress={() => {
                    console.log('[LoanGuide] Navigate to agent:', agent.id);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/agent/${agent.id}`);
                  }}
                  testID={`agent-row-${agent.id}`}
                >
                  <View style={styles.agentInfo}>
                    <Text style={styles.agentName}>{agent.name}</Text>
                    <Text style={styles.agentCompany}>{agent.company}</Text>
                    <Text style={styles.agentMeta}>⭐ {agent.rating} · {agent.state}</Text>
                  </View>
                  <ChevronRight size={18} color={Colors.textMuted} />
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.ctaSection}>
            <Pressable
              style={[styles.ctaBtn, { backgroundColor: loanColor }]}
              onPress={() => {
                console.log('[LoanGuide] Navigate to apply for:', id);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push('/apply');
              }}
              testID="apply-loan-btn"
            >
              <Text style={styles.ctaBtnText}>{t('applyForLoan')}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  emptyText: {
    textAlign: 'center' as const,
    marginTop: 40,
    fontSize: 16,
    color: Colors.textMuted,
  },
  heroSection: {
    alignItems: 'center' as const,
    paddingVertical: 28,
    paddingHorizontal: 20,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800' as const,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  section: {
    marginTop: 16,
    marginHorizontal: 20,
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 16,
    ...Platform.select({
      ios: { shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 },
      android: { elevation: 2 },
      web: { shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 },
    }),
  },
  sectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  stepRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    marginBottom: 16,
    position: 'relative' as const,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: 12,
    zIndex: 1,
  },
  stepNumberText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.white,
  },
  stepContent: {
    flex: 1,
    paddingTop: 4,
  },
  stepText: {
    fontSize: 14,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  stepLine: {
    position: 'absolute' as const,
    left: 13,
    top: 28,
    width: 2,
    height: 20,
  },
  docRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    marginBottom: 10,
  },
  docBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  docText: {
    fontSize: 14,
    color: Colors.textPrimary,
    flex: 1,
  },
  calcCard: {
    backgroundColor: Colors.inputBg,
    borderRadius: 12,
    padding: 16,
  },
  calcInputGroup: {
    marginBottom: 14,
  },
  calcLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  calcInputRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: Colors.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    paddingHorizontal: 12,
  },
  calcPrefix: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    marginRight: 6,
  },
  calcSuffix: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    marginLeft: 6,
  },
  calcInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
    paddingVertical: Platform.OS === 'web' ? 10 : 10,
    padding: 0,
  },
  calcDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 14,
  },
  calcResultRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 8,
  },
  calcResultLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  calcResultValue: {
    fontSize: 22,
    fontWeight: '800' as const,
  },
  calcResultValueSmall: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
  },
  agentRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  agentInfo: {
    flex: 1,
  },
  agentName: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
  },
  agentCompany: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  agentMeta: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  ctaSection: {
    marginTop: 20,
    marginHorizontal: 20,
  },
  ctaBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center' as const,
  },
  ctaBtnText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.white,
  },
});
