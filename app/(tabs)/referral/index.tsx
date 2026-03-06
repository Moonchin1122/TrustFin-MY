import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Animated,
  RefreshControl,
  Share,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Gift,
  Copy,
  Users,
  Trophy,
  Coins,
  ArrowUpRight,
  ArrowDownRight,
  Crown,
  Medal,
  Star,
  Share2,
  Clock,
  CheckCircle,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import {
  fetchAgentCreditInfo,
  fetchCreditLedger,
  fetchReferralCount,
  fetchLeaderboard,
  validateAndApplyReferralCode,
  generateReferralCodeIfMissing,
} from '@/lib/credits';
import type { AgentCreditInfo, CreditLedgerEntry, LeaderboardEntry } from '@/lib/credits';
import { supabase } from '@/lib/supabase';

type TabKey = 'overview' | 'history' | 'leaderboard';

export default function ReferralScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [referralInput, setReferralInput] = useState<string>('');
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const agentId = user.id;

  const creditInfoQuery = useQuery({
    queryKey: ['agent-credit-info', agentId],
    queryFn: () => fetchAgentCreditInfo(agentId),
    enabled: user.role === 'agent' && !!agentId,
  });

  const ledgerQuery = useQuery({
    queryKey: ['agent-credit-ledger', agentId],
    queryFn: () => fetchCreditLedger(agentId),
    enabled: user.role === 'agent' && !!agentId && activeTab === 'history',
  });

  const referralCountQuery = useQuery({
    queryKey: ['agent-referral-count', agentId],
    queryFn: () => fetchReferralCount(agentId),
    enabled: user.role === 'agent' && !!agentId,
  });

  const leaderboardQuery = useQuery({
    queryKey: ['agent-leaderboard'],
    queryFn: () => fetchLeaderboard(20),
    enabled: user.role === 'agent' && activeTab === 'leaderboard',
  });

  useEffect(() => {
    if (!agentId || user.role !== 'agent') return;
    generateReferralCodeIfMissing(agentId).then((code) => {
      if (code) {
        console.log('[REFERRAL] Ensured referral code:', code);
        queryClient.invalidateQueries({ queryKey: ['agent-credit-info', agentId] });
      }
    });
  }, [agentId, user.role, queryClient]);

  useEffect(() => {
    if (!agentId || user.role !== 'agent') return;
    const channel = supabase
      .channel('credit-ledger-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'credit_ledger', filter: `agent_id=eq.${agentId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['agent-credit-info', agentId] });
        queryClient.invalidateQueries({ queryKey: ['agent-credit-ledger', agentId] });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'agents', filter: `id=eq.${agentId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['agent-credit-info', agentId] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [agentId, user.role, queryClient]);

  const applyReferralMutation = useMutation({
    mutationFn: async () => {
      if (!referralInput.trim()) throw new Error('Please enter a referral code.');
      return validateAndApplyReferralCode(agentId, referralInput.trim());
    },
    onSuccess: (result) => {
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Referral Applied', `You were referred by ${result.referrerName ?? 'an agent'}. Credits will be awarded when your KYC is approved.`);
        setReferralInput('');
        queryClient.invalidateQueries({ queryKey: ['agent-credit-info', agentId] });
      } else {
        Alert.alert('Error', result.error ?? 'Failed to apply referral code.');
      }
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message);
    },
  });

  const handleCopyCode = useCallback(() => {
    const code = creditInfoQuery.data?.referral_code;
    if (!code) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === 'web') {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = code;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch { /* noop */ }
    }
    Alert.alert('Copied', `Referral code "${code}" copied to clipboard.`);
  }, [creditInfoQuery.data?.referral_code]);

  const handleShareCode = useCallback(async () => {
    const code = creditInfoQuery.data?.referral_code;
    if (!code) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await Share.share({
        message: `Join TrustFin as an agent! Use my referral code: ${code}`,
      });
    } catch {
      console.log('[REFERRAL] Share cancelled or failed');
    }
  }, [creditInfoQuery.data?.referral_code]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await queryClient.invalidateQueries({ queryKey: ['agent-credit-info'] });
    await queryClient.invalidateQueries({ queryKey: ['agent-credit-ledger'] });
    await queryClient.invalidateQueries({ queryKey: ['agent-referral-count'] });
    await queryClient.invalidateQueries({ queryKey: ['agent-leaderboard'] });
    setRefreshing(false);
  }, [queryClient]);

  const info = creditInfoQuery.data;
  const isLoading = creditInfoQuery.isLoading;

  if (user.role !== 'agent') {
    return (
      <SafeAreaView style={styles.container} testID="referral-not-agent">
        <View style={styles.centerState}>
          <Gift size={48} color={Colors.textMuted} />
          <Text style={styles.centerTitle}>Agent Only</Text>
          <Text style={styles.centerText}>Referral rewards are available for registered agents only.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} testID="referral-screen">
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Gift size={24} color={Colors.accent} />
          <View>
            <Text style={styles.headerTitle}>Referral Rewards</Text>
            <Text style={styles.headerSubtitle}>Earn credits by referring agents</Text>
          </View>
        </View>
      </View>

      <View style={styles.tabRow}>
        {([
          { key: 'overview' as const, label: 'Overview', icon: Coins },
          { key: 'history' as const, label: 'History', icon: Clock },
          { key: 'leaderboard' as const, label: 'Top Agents', icon: Trophy },
        ]).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              style={[styles.tabBtn, isActive && styles.tabBtnActive]}
              onPress={() => { setActiveTab(tab.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Icon size={14} color={isActive ? Colors.primary : Colors.textMuted} />
              <Text style={[styles.tabBtnText, isActive && styles.tabBtnTextActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.centerText}>Loading credits...</Text>
          </View>
        ) : (
          <>
            {activeTab === 'overview' && info && (
              <OverviewSection
                info={info}
                referralCount={referralCountQuery.data ?? 0}
                referralInput={referralInput}
                setReferralInput={setReferralInput}
                onApplyReferral={() => applyReferralMutation.mutate()}
                isApplying={applyReferralMutation.isPending}
                onCopyCode={handleCopyCode}
                onShareCode={handleShareCode}
              />
            )}
            {activeTab === 'history' && (
              <HistorySection
                entries={ledgerQuery.data ?? []}
                isLoading={ledgerQuery.isLoading}
              />
            )}
            {activeTab === 'leaderboard' && (
              <LeaderboardSection
                entries={leaderboardQuery.data ?? []}
                isLoading={leaderboardQuery.isLoading}
                myAgentId={agentId}
              />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const OverviewSection = React.memo(function OverviewSection({
  info,
  referralCount,
  referralInput,
  setReferralInput,
  onApplyReferral,
  isApplying,
  onCopyCode,
  onShareCode,
}: {
  info: AgentCreditInfo;
  referralCount: number;
  referralInput: string;
  setReferralInput: (v: string) => void;
  onApplyReferral: () => void;
  isApplying: boolean;
  onCopyCode: () => void;
  onShareCode: () => void;
}) {
  const { t } = useLanguage();
  const balanceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(balanceAnim, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true }).start();
  }, [balanceAnim]);

  return (
    <View style={styles.sectionContent}>
      <Animated.View style={[styles.balanceCard, { transform: [{ scale: balanceAnim }] }]}>
        <View style={styles.balanceIconRow}>
          <View style={styles.balanceIconBg}>
            <Coins size={28} color="#F59E0B" />
          </View>
        </View>
        <Text style={styles.balanceLabel}>{t('availableCredits')}</Text>
        <Text style={styles.balanceValue}>{info.credit_balance.toFixed(0)}</Text>
        <Text style={styles.balanceNote}>{t('nonCashCreditsNote')}</Text>
        <View style={styles.balanceStatsRow}>
          <View style={styles.balanceStat}>
            <ArrowUpRight size={14} color="#16A34A" />
            <Text style={styles.balanceStatLabel}>{t('earned')}</Text>
            <Text style={[styles.balanceStatValue, { color: '#16A34A' }]}>{info.credit_earned_total.toFixed(0)}</Text>
          </View>
          <View style={styles.balanceDivider} />
          <View style={styles.balanceStat}>
            <ArrowDownRight size={14} color="#DC2626" />
            <Text style={styles.balanceStatLabel}>{t('spent')}</Text>
            <Text style={[styles.balanceStatValue, { color: '#DC2626' }]}>{info.credit_spent_total.toFixed(0)}</Text>
          </View>
          <View style={styles.balanceDivider} />
          <View style={styles.balanceStat}>
            <Users size={14} color={Colors.primary} />
            <Text style={styles.balanceStatLabel}>{t('referred')}</Text>
            <Text style={[styles.balanceStatValue, { color: Colors.primary }]}>{referralCount}</Text>
          </View>
        </View>
      </Animated.View>

      <View style={styles.referralCodeCard}>
        <Text style={styles.sectionTitle}>{t('yourReferralCode')}</Text>
        <Text style={styles.sectionSubtitle}>{t('shareCodeToEarn')}</Text>
        <View style={styles.codeRow}>
          <View style={styles.codeBox}>
            <Text style={styles.codeText}>{info.referral_code || '...'}</Text>
          </View>
          <Pressable style={styles.codeActionBtn} onPress={onCopyCode} testID="copy-referral-code">
            <Copy size={18} color={Colors.white} />
          </Pressable>
          <Pressable style={[styles.codeActionBtn, { backgroundColor: Colors.success }]} onPress={onShareCode} testID="share-referral-code">
            <Share2 size={18} color={Colors.white} />
          </Pressable>
        </View>
      </View>

      <View style={styles.rewardInfoCard}>
        <View style={styles.rewardInfoRow}>
          <View style={styles.rewardInfoIcon}>
            <Gift size={20} color={Colors.accent} />
          </View>
          <View style={styles.rewardInfoText}>
            <Text style={styles.rewardInfoTitle}>{t('howItWorks')}</Text>
            <Text style={styles.rewardInfoDesc}>{t('howItWorksDesc')}{' '}<Text style={styles.boldText}>{t('twentyCredits')}</Text>.</Text>
          </View>
        </View>
        <View style={styles.rewardSteps}>
          <RewardStep number="1" text={t('referralStep1')} />
          <RewardStep number="2" text={t('referralStep2')} />
          <RewardStep number="3" text={t('referralStep3')} />
          <RewardStep number="4" text={t('referralStep4')} />
        </View>
      </View>

      {!info.referred_by_agent_id && (
        <View style={styles.enterCodeCard}>
          <Text style={styles.sectionTitle}>{t('haveReferralCode')}</Text>
          <Text style={styles.sectionSubtitle}>{t('enterAnotherAgentCode')}</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.referralInput}
              placeholder={t('enterReferralCode')}
              placeholderTextColor={Colors.textMuted}
              value={referralInput}
              onChangeText={setReferralInput}
              autoCapitalize="characters"
              testID="referral-code-input"
            />
            <Pressable
              style={[styles.applyBtn, (!referralInput.trim() || isApplying) && styles.applyBtnDisabled]}
              onPress={onApplyReferral}
              disabled={!referralInput.trim() || isApplying}
              testID="apply-referral-btn"
            >
              {isApplying ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Text style={styles.applyBtnText}>{t('applyCode')}</Text>
              )}
            </Pressable>
          </View>
        </View>
      )}

      {info.referred_by_agent_id && (
        <View style={styles.referredBadge}>
          <CheckCircle size={16} color={Colors.success} />
          <Text style={styles.referredBadgeText}>{t('referredByAgent')}</Text>
        </View>
      )}
    </View>
  );
});

const RewardStep = React.memo(function RewardStep({ number, text }: { number: string; text: string }) {
  return (
    <View style={styles.rewardStep}>
      <View style={styles.rewardStepNum}>
        <Text style={styles.rewardStepNumText}>{number}</Text>
      </View>
      <Text style={styles.rewardStepText}>{text}</Text>
    </View>
  );
});

const HistorySection = React.memo(function HistorySection({
  entries,
  isLoading,
}: {
  entries: CreditLedgerEntry[];
  isLoading: boolean;
}) {
  const { t } = useLanguage();
  if (isLoading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }

  if (entries.length === 0) {
    return (
      <View style={styles.centerState}>
        <Clock size={40} color={Colors.textMuted} />
        <Text style={styles.centerTitle}>{t('noTransactionsYet')}</Text>
        <Text style={styles.centerText}>{t('creditHistoryHere')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.sectionContent}>
      <Text style={styles.listCount}>{entries.length} {t('transactions')}</Text>
      {entries.map((entry) => (
        <LedgerEntryCard key={entry.id} entry={entry} />
      ))}
    </View>
  );
});

const LedgerEntryCard = React.memo(function LedgerEntryCard({ entry }: { entry: CreditLedgerEntry }) {
  const { t } = useLanguage();
  const isEarn = entry.entry_type === 'earn';

  const reasonLabel = useMemo(() => {
    switch (entry.reason) {
      case 'referral_kyc_bonus': return t('referralKycBonus');
      case 'subscription_discount': return t('subscriptionDiscount');
      case 'admin_adjust': return t('adminAdjustment');
      default: return entry.reason.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }, [entry.reason, t]);

  return (
    <View style={styles.ledgerCard}>
      <View style={styles.ledgerLeft}>
        <View style={[styles.ledgerIcon, { backgroundColor: isEarn ? '#ECFDF5' : '#FEF2F2' }]}>
          {isEarn ? (
            <ArrowUpRight size={16} color="#16A34A" />
          ) : (
            <ArrowDownRight size={16} color="#DC2626" />
          )}
        </View>
        <View style={styles.ledgerInfo}>
          <Text style={styles.ledgerReason}>{reasonLabel}</Text>
          <Text style={styles.ledgerDate}>
            {new Date(entry.created_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
          </Text>
          {entry.note ? <Text style={styles.ledgerNote}>{entry.note}</Text> : null}
        </View>
      </View>
      <Text style={[styles.ledgerAmount, { color: isEarn ? '#16A34A' : '#DC2626' }]}>
        {isEarn ? '+' : '-'}{entry.amount.toFixed(0)}
      </Text>
    </View>
  );
});

const LeaderboardSection = React.memo(function LeaderboardSection({
  entries,
  isLoading,
  myAgentId,
}: {
  entries: LeaderboardEntry[];
  isLoading: boolean;
  myAgentId: string;
}) {
  const { t } = useLanguage();
  if (isLoading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }

  if (entries.length === 0) {
    return (
      <View style={styles.centerState}>
        <Trophy size={40} color={Colors.textMuted} />
        <Text style={styles.centerTitle}>{t('noRankingsYet')}</Text>
        <Text style={styles.centerText}>{t('beFirstToEarn')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.sectionContent}>
      <View style={styles.leaderboardHeader}>
        <Trophy size={20} color={Colors.accent} />
        <Text style={styles.leaderboardTitle}>{t('topAgentsByCredits')}</Text>
      </View>

      {entries.slice(0, 3).length > 0 && (
        <View style={styles.podiumRow}>
          {entries.slice(0, 3).map((entry, idx) => {
            const isMe = entry.agent_id === myAgentId;
            const podiumColors = ['#F59E0B', '#94A3B8', '#CD7F32'];
            const podiumIcons = [Crown, Medal, Star];
            const PodiumIcon = podiumIcons[idx] ?? Star;
            return (
              <View key={entry.agent_id} style={[styles.podiumItem, idx === 0 && styles.podiumItemFirst]}>
                <View style={[styles.podiumIconBg, { backgroundColor: podiumColors[idx] + '20' }]}>
                  <PodiumIcon size={idx === 0 ? 24 : 20} color={podiumColors[idx]} />
                </View>
                <Text style={[styles.podiumName, isMe && styles.podiumNameMe]} numberOfLines={1}>
                  {isMe ? t('you') : entry.agent_name}
                </Text>
                <Text style={styles.podiumCredits}>{entry.credits_earned.toFixed(0)} cr</Text>
                <View style={[styles.podiumRank, { backgroundColor: podiumColors[idx] + '30' }]}>
                  <Text style={[styles.podiumRankText, { color: podiumColors[idx] }]}>#{entry.rank}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {entries.slice(3).map((entry) => {
        const isMe = entry.agent_id === myAgentId;
        return (
          <View key={entry.agent_id} style={[styles.leaderRow, isMe && styles.leaderRowMe]}>
            <View style={styles.leaderRank}>
              <Text style={styles.leaderRankText}>#{entry.rank}</Text>
            </View>
            <View style={styles.leaderInfo}>
              <Text style={[styles.leaderName, isMe && styles.leaderNameMe]} numberOfLines={1}>
                {isMe ? `${entry.agent_name} (${t('you')})` : entry.agent_name}
              </Text>
            </View>
            <Text style={styles.leaderCredits}>{entry.credits_earned.toFixed(0)} cr</Text>
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  tabRow: {
    flexDirection: 'row' as const,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.inputBg,
  },
  tabBtnActive: {
    backgroundColor: '#E8EDF5',
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textMuted,
  },
  tabBtnTextActive: {
    color: Colors.primary,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  sectionContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 14,
  },
  centerState: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 60,
    gap: 10,
  },
  centerTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  centerText: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center' as const,
    paddingHorizontal: 40,
  },
  balanceCard: {
    backgroundColor: Colors.primary,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center' as const,
    gap: 4,
  },
  balanceIconRow: {
    marginBottom: 8,
  },
  balanceIconBg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  balanceLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: 'rgba(255,255,255,0.7)',
  },
  balanceValue: {
    fontSize: 48,
    fontWeight: '900' as const,
    color: Colors.white,
    lineHeight: 56,
  },
  balanceNote: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  balanceStatsRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 0,
  },
  balanceStat: {
    flex: 1,
    alignItems: 'center' as const,
    gap: 4,
  },
  balanceStatLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500' as const,
  },
  balanceStatValue: {
    fontSize: 16,
    fontWeight: '800' as const,
  },
  balanceDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  referralCodeCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  codeRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  codeBox: {
    flex: 1,
    backgroundColor: Colors.inputBg,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  codeText: {
    fontSize: 20,
    fontWeight: '900' as const,
    color: Colors.primary,
    letterSpacing: 3,
    textAlign: 'center' as const,
  },
  codeActionBtn: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  rewardInfoCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#FDE7B0',
  },
  rewardInfoRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    marginBottom: 14,
  },
  rewardInfoIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  rewardInfoText: {
    flex: 1,
  },
  rewardInfoTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  rewardInfoDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  boldText: {
    fontWeight: '700' as const,
    color: Colors.accent,
  },
  rewardSteps: {
    gap: 8,
  },
  rewardStep: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  rewardStepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.accent,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  rewardStepNumText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.white,
  },
  rewardStepText: {
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
  },
  enterCodeCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inputRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  referralInput: {
    flex: 1,
    backgroundColor: Colors.inputBg,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    letterSpacing: 2,
  },
  applyBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  applyBtnDisabled: {
    opacity: 0.5,
  },
  applyBtnText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.white,
  },
  referredBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  referredBadgeText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#16A34A',
  },
  listCount: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '500' as const,
  },
  ledgerCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  ledgerLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    flex: 1,
  },
  ledgerIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  ledgerInfo: {
    flex: 1,
  },
  ledgerReason: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
  },
  ledgerDate: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  ledgerNote: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  ledgerAmount: {
    fontSize: 18,
    fontWeight: '800' as const,
  },
  leaderboardHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 4,
  },
  leaderboardTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  podiumRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    justifyContent: 'center' as const,
    gap: 10,
    paddingVertical: 8,
  },
  podiumItem: {
    flex: 1,
    alignItems: 'center' as const,
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  podiumItemFirst: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  podiumIconBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  podiumName: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
    textAlign: 'center' as const,
  },
  podiumNameMe: {
    color: Colors.primary,
    fontWeight: '700' as const,
  },
  podiumCredits: {
    fontSize: 14,
    fontWeight: '800' as const,
    color: Colors.accent,
  },
  podiumRank: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  podiumRankText: {
    fontSize: 11,
    fontWeight: '700' as const,
  },
  leaderRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  leaderRowMe: {
    borderColor: Colors.primary,
    backgroundColor: '#F0F4FA',
  },
  leaderRank: {
    width: 32,
    alignItems: 'center' as const,
  },
  leaderRankText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.textMuted,
  },
  leaderInfo: {
    flex: 1,
  },
  leaderName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
  },
  leaderNameMe: {
    color: Colors.primary,
    fontWeight: '700' as const,
  },
  leaderCredits: {
    fontSize: 15,
    fontWeight: '800' as const,
    color: Colors.accent,
  },
});
