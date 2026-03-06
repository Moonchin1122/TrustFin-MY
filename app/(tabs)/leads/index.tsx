import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { View, Text, StyleSheet, ActivityIndicator, Pressable, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChartBar, CircleCheckBig, MessageCircleMore, Users } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/lib/supabase';
import { resolveAgentProfileId } from '@/lib/agentProfile';
import Colors from '@/constants/colors';

type AgentDashboardStatsRpcRow = {
  total?: number | null;
  new?: number | null;
  contacted?: number | null;
  done?: number | null;
};

type AgentDashboardStats = {
  total: number;
  new: number;
  contacted: number;
  done: number;
};

type AgentSubscriptionRow = {
  id: string;
  plan: string;
  lead_limit: number | null;
  leads_used: number | null;
  end_date: string;
};

function toSafeStat(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

const EMPTY_DASHBOARD_STATS: AgentDashboardStats = {
  total: 0,
  new: 0,
  contacted: 0,
  done: 0,
};

export default function AgentDashboardScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const userId = user.id;
  const userName = user.name;
  const userPhone = user.phone;
  const userState = user.state;
  const userRating = user.rating;
  const userVerified = user.isVerified;
  const userEmail = user.email;
  const userRole = user.role;
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const agentProfileIdQuery = useQuery({
    queryKey: ['agent-profile-id', userId, userName, userPhone, userState, userRating, userVerified, userEmail, userRole],
    enabled: userRole === 'agent' && !!userId,
    queryFn: async (): Promise<string> => {
      console.log('[AGENT_DASHBOARD] Resolving agent profile id for user:', userId);
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

  const subscriptionQuery = useQuery({
    queryKey: ['agent-subscription-active', agentProfileIdQuery.data],
    enabled: user.role === 'agent' && !!agentProfileIdQuery.data,
    queryFn: async (): Promise<AgentSubscriptionRow | null> => {
      const now = new Date().toISOString();
      console.log('[AGENT_DASHBOARD] Checking active subscription for agent profile:', agentProfileIdQuery.data);
      const { data, error } = await supabase
        .from('agent_subscriptions')
        .select('id, plan, lead_limit, leads_used, end_date')
        .eq('agent_id', agentProfileIdQuery.data)
        .eq('status', 'active')
        .gt('end_date', now)
        .order('end_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.log('[AGENT_DASHBOARD] Subscription check failed:', error);
        throw new Error(error.message);
      }

      return (data as AgentSubscriptionRow | null) ?? null;
    },
  });

  const dashboardStatsQuery = useQuery({
    queryKey: ['agent-dashboard-stats', agentProfileIdQuery.data],
    enabled: user.role === 'agent' && !!agentProfileIdQuery.data && !!subscriptionQuery.data,
    queryFn: async (): Promise<AgentDashboardStats> => {
      console.log('[AGENT_DASHBOARD] Loading dashboard stats via RPC agent_dashboard_stats for agent profile:', agentProfileIdQuery.data);
      const { data, error } = await supabase.rpc('agent_dashboard_stats');

      if (error) {
        console.log('[AGENT_DASHBOARD] agent_dashboard_stats RPC failed:', error);
        throw new Error(error.message);
      }

      const rpcRow = Array.isArray(data)
        ? ((data[0] ?? null) as AgentDashboardStatsRpcRow | null)
        : ((data ?? null) as AgentDashboardStatsRpcRow | null);

      const safeStats: AgentDashboardStats = {
        total: toSafeStat(rpcRow?.total),
        new: toSafeStat(rpcRow?.new),
        contacted: toSafeStat(rpcRow?.contacted),
        done: toSafeStat(rpcRow?.done),
      };

      console.log('[AGENT_DASHBOARD] agent_dashboard_stats RPC success:', safeStats);
      return safeStats;
    },
  });

  const stats = useMemo<AgentDashboardStats>(() => {
    if (dashboardStatsQuery.error) {
      return EMPTY_DASHBOARD_STATS;
    }

    return dashboardStatsQuery.data ?? EMPTY_DASHBOARD_STATS;
  }, [dashboardStatsQuery.data, dashboardStatsQuery.error]);

  const isAtLeadLimit = useMemo(() => {
    const sub = subscriptionQuery.data;
    if (!sub) return false;
    if (sub.lead_limit === null) return false;
    return (sub.leads_used ?? 0) >= sub.lead_limit;
  }, [subscriptionQuery.data]);

  useEffect(() => {
    if (!dashboardStatsQuery.error) {
      return;
    }

    const message = dashboardStatsQuery.error instanceof Error ? dashboardStatsQuery.error.message : 'Failed to load dashboard stats';
    console.log('[AGENT_DASHBOARD] Showing dashboard stats error feedback:', message);
    setFeedbackMessage(message);

    const timeout = setTimeout(() => {
      setFeedbackMessage((currentMessage) => (currentMessage === message ? null : currentMessage));
    }, 2800);

    return () => clearTimeout(timeout);
  }, [dashboardStatsQuery.error]);

  if (agentProfileIdQuery.isLoading || subscriptionQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} testID="agent-dashboard-loading-safe-area">
        <View style={styles.centerState} testID="agent-dashboard-loading-subscription">
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.centerText}>{t('checkingSubscription')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (agentProfileIdQuery.isError) {
    return (
      <SafeAreaView style={styles.container} testID="agent-dashboard-missing-profile-safe-area">
        <View style={styles.centerState} testID="agent-dashboard-missing-profile">
          <Text style={styles.blockTitle}>{t('agentProfileRequired')}</Text>
          <Text style={styles.centerText}>{agentProfileIdQuery.error instanceof Error ? agentProfileIdQuery.error.message : 'Please complete agent registration first.'}</Text>
          <Pressable style={styles.primaryButton} onPress={() => router.push('/agent-register')} testID="agent-dashboard-go-agent-register">
            <Text style={styles.primaryButtonText}>{t('completeAgentRegistration')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!subscriptionQuery.data) {
    return (
      <SafeAreaView style={styles.container} testID="agent-dashboard-no-subscription-safe-area">
        <View style={styles.centerState} testID="agent-dashboard-no-subscription">
          <Text style={styles.blockTitle}>{t('subscriptionRequired')}</Text>
          <Text style={styles.centerText}>{t('agentsMustSubscribe')}</Text>
          <Pressable style={styles.primaryButton} onPress={() => router.replace('/subscription')} testID="agent-dashboard-go-subscription">
            <Text style={styles.primaryButtonText}>{t('goToSubscription')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (isAtLeadLimit) {
    return (
      <SafeAreaView style={styles.container} testID="agent-dashboard-limit-safe-area">
        <View style={styles.centerState} testID="agent-dashboard-limit-message">
          <Text style={styles.blockTitle}>{t('leadLimitReached')}</Text>
          <Text style={styles.centerText}>{t('leadLimitReachedDesc')}</Text>
          <Pressable style={styles.primaryButton} onPress={() => router.replace('/subscription')} testID="agent-dashboard-upgrade-subscription">
            <Text style={styles.primaryButtonText}>{t('upgradeSubscription')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (dashboardStatsQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} testID="agent-dashboard-loading-safe-area-assignments">
        <View style={styles.centerState} testID="agent-dashboard-loading-assignments">
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.centerText}>{t('loadingDashboard')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} testID="agent-dashboard-screen">
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={dashboardStatsQuery.isRefetching}
            onRefresh={() => {
              console.log('[AGENT_DASHBOARD] Pull to refresh triggered');
              void dashboardStatsQuery.refetch();
            }}
          />
        }
        contentContainerStyle={styles.scrollContent}
        testID="agent-dashboard-scroll-view"
      >
        <View style={styles.header}>
          <Text style={styles.title}>{t('agentDashboard')}</Text>
          <Text style={styles.subtitle}>{t('trackLeadPerformance')}</Text>
        </View>

        {feedbackMessage ? (
          <View style={styles.feedbackToast} testID="agent-dashboard-feedback-toast">
            <Text style={styles.feedbackToastText}>{feedbackMessage}</Text>
          </View>
        ) : null}

        <View style={styles.grid}>
          <StatCard icon={<Users size={20} color={Colors.primary} />} label={t('totalLeads')} value={stats.total} testID="stat-total-leads" />
          <StatCard icon={<ChartBar size={20} color={Colors.warning} />} label={t('newLeads')} value={stats.new} testID="stat-new-leads" />
          <StatCard icon={<MessageCircleMore size={20} color={Colors.accent} />} label={t('contactedLeads')} value={stats.contacted} testID="stat-contacted-leads" />
          <StatCard icon={<CircleCheckBig size={20} color={Colors.success} />} label={t('completedLeads')} value={stats.done} testID="stat-completed-leads" />
        </View>

        <Pressable style={styles.primaryButton} onPress={() => router.push('/leads/agent-leads')} testID="open-agent-leads-button">
          <Text style={styles.primaryButtonText}>{t('openMyLeads')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function IconSlot({ icon }: { icon: React.ReactElement }) {
  return icon;
}

function StatCard({ icon, label, value, testID }: { icon: React.ReactElement; label: string; value: number; testID: string }) {
  return (
    <View style={styles.statCard} testID={testID}>
      <View style={styles.iconWrap}>
        <IconSlot icon={icon} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  header: {
    marginTop: 8,
    marginBottom: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: Colors.textSecondary,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
  },
  centerText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  blockTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    width: '48%',
    backgroundColor: Colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  statLabel: {
    marginTop: 4,
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  feedbackToast: {
    marginBottom: 16,
    backgroundColor: Colors.danger,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  feedbackToastText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '600',
  },
  primaryButton: {
    marginTop: 6,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
});
