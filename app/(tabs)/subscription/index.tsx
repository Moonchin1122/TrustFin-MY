import React, { useMemo, useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckCircle2, Crown, Coins, Tag } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/lib/supabase';
import { resolveAgentProfileId } from '@/lib/agentProfile';
import { fetchAgentCreditInfo, spendAgentCredits } from '@/lib/credits';
import Colors from '@/constants/colors';

type AgentSubscriptionRow = {
  id: string;
  plan: string;
  price: number;
  lead_limit: number | null;
  leads_used: number | null;
  status: string;
  start_date: string;
  end_date: string;
};

type PlanKey = 'basic' | 'pro' | 'elite';


const PLANS_DATA: { key: PlanKey; price: number; leadLimit: number | null; nameKey: string; benefitKeys: string[] }[] = [
  {
    key: 'basic',
    price: 49,
    leadLimit: 20,
    nameKey: 'planBasic',
    benefitKeys: ['benefitAccessLeads', 'benefitContactBorrowers'],
  },
  {
    key: 'pro',
    price: 149,
    leadLimit: 80,
    nameKey: 'planPro',
    benefitKeys: ['benefitPriorityMatching', 'benefitFasterRefresh'],
  },
  {
    key: 'elite',
    price: 399,
    leadLimit: null,
    nameKey: 'planElite',
    benefitKeys: ['benefitUnlimitedOpens', 'benefitTopPriority', 'benefitBestConversion'],
  },
];

export default function AgentSubscriptionScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>('basic');
  const [useCredits, setUseCredits] = useState<boolean>(false);
  const userId = user.id;
  const userName = user.name;
  const userPhone = user.phone;
  const userState = user.state;
  const userRating = user.rating;
  const userVerified = user.isVerified;
  const userEmail = user.email;
  const userRole = user.role;

  const agentProfileIdQuery = useQuery({
    queryKey: ['agent-profile-id', userId, userName, userPhone, userState, userRating, userVerified, userEmail, userRole],
    enabled: userRole === 'agent' && !!userId,
    queryFn: async (): Promise<string> => {
      console.log('[SUBSCRIPTION] Resolving agent profile id for user:', userId);
      return resolveAgentProfileId({
        id: userId,
        name: userName,
        phone: userPhone,
        state: userState,
        rating: userRating,
        isVerified: userVerified,
        email: userEmail,
        role: userRole,
      });
    },
  });

  const creditInfoQuery = useQuery({
    queryKey: ['agent-credit-info', agentProfileIdQuery.data],
    enabled: userRole === 'agent' && !!agentProfileIdQuery.data,
    queryFn: () => fetchAgentCreditInfo(agentProfileIdQuery.data!),
  });

  const activeSubscriptionQuery = useQuery({
    queryKey: ['agent-subscription-active', agentProfileIdQuery.data],
    enabled: user.role === 'agent' && !!agentProfileIdQuery.data,
    queryFn: async (): Promise<AgentSubscriptionRow | null> => {
      const now = new Date().toISOString();
      console.log('[SUBSCRIPTION] Checking active subscription for agent profile:', agentProfileIdQuery.data);
      const { data, error } = await supabase
        .from('agent_subscriptions')
        .select('id, plan, price, lead_limit, leads_used, status, start_date, end_date')
        .eq('agent_id', agentProfileIdQuery.data)
        .eq('status', 'active')
        .gt('end_date', now)
        .order('end_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.log('[SUBSCRIPTION] Failed checking active subscription:', error);
        throw new Error(error.message);
      }

      return (data as AgentSubscriptionRow | null) ?? null;
    },
  });

  const selectedPlanData = useMemo(() => PLANS_DATA.find((p) => p.key === selectedPlan), [selectedPlan]);

  const creditBalance = creditInfoQuery.data?.credit_balance ?? 0;
  const planPrice = selectedPlanData?.price ?? 0;
  const creditsToUse = useCredits ? Math.min(creditBalance, planPrice) : 0;
  const netPrice = planPrice - creditsToUse;

  const subscribeMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      const plan = PLANS_DATA.find((item) => item.key === selectedPlan);
      if (!plan) {
        throw new Error('Invalid plan selected');
      }
      const agentProfileId = agentProfileIdQuery.data;
      if (!agentProfileId) {
        throw new Error('Agent profile is missing. Please complete agent registration first.');
      }

      const now = new Date();
      const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      console.log('[SUBSCRIPTION] Creating subscription. agent profile:', agentProfileId, 'plan:', plan.key);
      const { error } = await supabase.from('agent_subscriptions').insert({
        agent_id: agentProfileId,
        plan: plan.key,
        price: plan.price,
        lead_limit: plan.leadLimit,
        leads_used: 0,
        status: 'active',
        start_date: now.toISOString(),
        end_date: endDate.toISOString(),
      });

      if (error) {
        console.log('[SUBSCRIPTION] Failed creating subscription:', error);
        throw new Error(error.message);
      }

      if (useCredits && creditsToUse > 0) {
        console.log('[SUBSCRIPTION] Spending credits:', creditsToUse);
        const spendResult = await spendAgentCredits(
          agentProfileId,
          creditsToUse,
          'subscription_discount',
          `${plan.key} plan subscription discount`
        );
        if (!spendResult.success) {
          console.log('[SUBSCRIPTION] Credit spend failed (subscription already created):', spendResult.error);
        }
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agent-subscription-active', agentProfileIdQuery.data] });
      await queryClient.invalidateQueries({ queryKey: ['agent-credit-info', agentProfileIdQuery.data] });
      await queryClient.invalidateQueries({ queryKey: ['agent-credit-ledger'] });

      const planName = selectedPlanData ? t(selectedPlanData.nameKey) : '';
      const receipt = creditsToUse > 0
        ? `${t('plan')}: ${planName}\n${t('price')}: RM${planPrice}\n${t('creditsUsed')}: ${creditsToUse}\n${t('netPrice')}: RM${netPrice}`
        : `${t('plan')}: ${planName}\n${t('price')}: RM${planPrice}`;

      Alert.alert(t('subscriptionActivated'), receipt);
      router.replace('/leads');
    },
    onError: (error: Error) => {
      console.log('[SUBSCRIPTION] Subscribe error:', error);
      const status = (error as any)?.status ?? (error as any)?.statusCode ?? '';
      Alert.alert(t('subscriptionFailed'), status ? `[${status}] ${error.message}` : error.message);
    },
  });

  const { mutate: doSubscribe } = subscribeMutation;

  const handleSubscribe = useCallback(() => {
    if (!agentProfileIdQuery.data) {
      router.push('/agent-register');
      return;
    }
    if (useCredits && creditsToUse > 0) {
      const planName = selectedPlanData ? t(selectedPlanData.nameKey) : '';
      Alert.alert(
        t('confirmSubscription'),
        `${t('plan')}: ${planName}\n${t('price')}: RM${planPrice}\n${t('creditsUsed')}: ${creditsToUse}\n${t('youPay')}: RM${netPrice}`,
        [
          { text: t('cancel'), style: 'cancel' },
          { text: t('confirm'), onPress: () => doSubscribe() },
        ]
      );
    } else {
      doSubscribe();
    }
  }, [agentProfileIdQuery.data, useCredits, creditsToUse, selectedPlanData, planPrice, netPrice, router, doSubscribe, t]);

  const activeInfo = useMemo(() => {
    const data = activeSubscriptionQuery.data;
    if (!data) return null;
    const limitLabel = data.lead_limit === null ? t('unlimited') : `${data.leads_used ?? 0}/${data.lead_limit}`;
    return {
      plan: data.plan.toUpperCase(),
      endDate: new Date(data.end_date).toLocaleDateString('en-MY'),
      limitLabel,
    };
  }, [activeSubscriptionQuery.data, t]);

  if (agentProfileIdQuery.isLoading || activeSubscriptionQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} testID="agent-subscription-loading-safe-area">
        <View style={styles.centerState} testID="agent-subscription-loading-state">
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.centerText}>{t('checkingSubscription')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} testID="agent-subscription-screen">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {agentProfileIdQuery.isError ? (
          <View style={styles.activeBox} testID="agent-profile-missing-box">
            <Text style={styles.activeTitle}>{t('agentProfileRequired')}</Text>
            <Text style={styles.activeText}>{agentProfileIdQuery.error instanceof Error ? agentProfileIdQuery.error.message : 'Please complete agent registration first.'}</Text>
          </View>
        ) : null}

        <View style={styles.header}>
          <Text style={styles.title}>{t('agentSubscription')}</Text>
          <Text style={styles.subtitle}>{t('choosePlanToAccess')}</Text>
        </View>

        {activeInfo ? (
          <View style={styles.activeBox} testID="active-subscription-box">
            <View style={styles.activeTitleRow}>
              <Crown size={16} color={Colors.accent} />
              <Text style={styles.activeTitle}>{t('activePlan')}: {activeInfo.plan}</Text>
            </View>
            <Text style={styles.activeText}>{t('leadUsage')}: {activeInfo.limitLabel}</Text>
            <Text style={styles.activeText}>{t('validUntil')}: {activeInfo.endDate}</Text>
            <Pressable style={styles.primaryButton} onPress={() => router.replace('/leads')} testID="open-dashboard-button">
              <Text style={styles.primaryButtonText}>{t('openDashboard')}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.planList}>
          {PLANS_DATA.map((plan) => {
            const isSelected = selectedPlan === plan.key;
            return (
              <Pressable
                key={plan.key}
                style={[styles.planCard, isSelected && styles.planCardSelected]}
                onPress={() => setSelectedPlan(plan.key)}
                testID={`select-plan-${plan.key}`}
              >
                <View style={styles.planRow}>
                  <Text style={styles.planName}>{t(plan.nameKey)}</Text>
                  <Text style={styles.planPrice}>RM{plan.price}</Text>
                </View>
                <Text style={styles.planLimit}>{plan.leadLimit === null ? t('unlimitedLeads') : `${plan.leadLimit} ${t('leadsPerMonth')}`}</Text>
                {plan.leadLimit !== null && (
                  <View style={styles.benefitRow}>
                    <CheckCircle2 size={14} color={Colors.success} />
                    <Text style={styles.benefitText}>{plan.leadLimit} {t('benefitLeadOpens')}</Text>
                  </View>
                )}
                {plan.benefitKeys.map((benefitKey) => (
                  <View style={styles.benefitRow} key={`${plan.key}-${benefitKey}`}>
                    <CheckCircle2 size={14} color={Colors.success} />
                    <Text style={styles.benefitText}>{t(benefitKey)}</Text>
                  </View>
                ))}
              </Pressable>
            );
          })}
        </View>

        {creditBalance > 0 && !activeInfo && (
          <View style={styles.creditsCard} testID="credits-discount-card">
            <View style={styles.creditsHeader}>
              <View style={styles.creditsIconBg}>
                <Coins size={18} color={Colors.accent} />
              </View>
              <View style={styles.creditsHeaderText}>
                <Text style={styles.creditsTitle}>{t('useCreditsLabel')}</Text>
                <Text style={styles.creditsBalance}>{t('balance')}: {creditBalance.toFixed(0)} {t('credits')}</Text>
              </View>
              <Switch
                value={useCredits}
                onValueChange={setUseCredits}
                trackColor={{ false: Colors.inputBg, true: Colors.primary + '60' }}
                thumbColor={useCredits ? Colors.primary : Colors.textMuted}
                testID="use-credits-toggle"
              />
            </View>
            {useCredits && creditsToUse > 0 && (
              <View style={styles.creditsBreakdown}>
                <View style={styles.creditsBreakdownRow}>
                  <Text style={styles.creditsBreakdownLabel}>{t('planPrice')}</Text>
                  <Text style={styles.creditsBreakdownValue}>RM{planPrice}</Text>
                </View>
                <View style={styles.creditsBreakdownRow}>
                  <View style={styles.creditsDiscountRow}>
                    <Tag size={12} color={Colors.success} />
                    <Text style={[styles.creditsBreakdownLabel, { color: Colors.success }]}>{t('creditsDiscountLabel')}</Text>
                  </View>
                  <Text style={[styles.creditsBreakdownValue, { color: Colors.success }]}>-{creditsToUse}</Text>
                </View>
                <View style={styles.creditsDivider} />
                <View style={styles.creditsBreakdownRow}>
                  <Text style={styles.creditsNetLabel}>{t('youPay')}</Text>
                  <Text style={styles.creditsNetValue}>RM{netPrice}</Text>
                </View>
              </View>
            )}
            <Text style={styles.creditsNote}>{t('creditsNonCashNote')}</Text>
          </View>
        )}

        <Pressable
          style={[styles.primaryButton, subscribeMutation.isPending && styles.disabledButton]}
          onPress={handleSubscribe}
          disabled={subscribeMutation.isPending}
          testID="subscribe-now-button"
        >
          <Text style={styles.primaryButtonText}>
            {subscribeMutation.isPending
              ? t('subscribing')
              : !agentProfileIdQuery.data
                ? t('completeAgentProfile')
                : useCredits && creditsToUse > 0
                  ? `${t('subscribeNow')} · RM${netPrice}`
                  : t('subscribeNow')}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  header: {
    paddingTop: 10,
    paddingBottom: 8,
  },
  title: {
    fontSize: 25,
    fontWeight: '800' as const,
    color: Colors.textPrimary,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  centerState: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
  },
  centerText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  activeBox: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 12,
    marginTop: 8,
    marginBottom: 12,
    gap: 4,
  },
  activeTitleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  activeTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  activeText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  planList: {
    gap: 10,
    marginBottom: 14,
  },
  planCard: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  planCardSelected: {
    borderColor: Colors.primary,
    borderWidth: 2,
  },
  planRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  planName: {
    fontSize: 17,
    fontWeight: '800' as const,
    color: Colors.textPrimary,
  },
  planPrice: {
    fontSize: 17,
    fontWeight: '800' as const,
    color: Colors.primary,
  },
  planLimit: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  benefitRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  benefitText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  creditsCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE7B0',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    gap: 12,
  },
  creditsHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  creditsIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  creditsHeaderText: {
    flex: 1,
  },
  creditsTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  creditsBalance: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  creditsBreakdown: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  creditsBreakdownRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  creditsBreakdownLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  creditsBreakdownValue: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
  },
  creditsDiscountRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  creditsDivider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  creditsNetLabel: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  creditsNetValue: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.primary,
  },
  creditsNote: {
    fontSize: 11,
    color: Colors.textMuted,
    lineHeight: 15,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center' as const,
  },
  primaryButtonText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  disabledButton: {
    opacity: 0.6,
  },
});
