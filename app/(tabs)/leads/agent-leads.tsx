import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronRight, CircleAlert, CircleCheckBig, Clock3, Phone, UserRound } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { resolveAgentProfileId } from '@/lib/agentProfile';
import Colors from '@/constants/colors';

type AgentSubscriptionRow = {
  id: string;
  plan?: string | null;
  lead_limit: number | null;
  leads_used: number | null;
};

type ConsultationRow = {
  id: string;
  borrower_name?: string | null;
  borrower_phone?: string | null;
  loan_type?: string | null;
  loan_amount?: number | string | null;
  state?: string | null;
  district?: string | null;
  message?: string | null;
  status?: string | null;
  created_at?: string | null;
};

function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatAmount(value?: number | string | null): string {
  const amount = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(amount ?? Number.NaN) || !amount) {
    return '金额待补充';
  }
  return `RM ${Number(amount).toLocaleString('en-MY')}`;
}

function getStatusText(status?: string | null): string {
  const normalized = (status ?? '').trim().toLowerCase();
  if (normalized === 'contacted') return '已联系';
  if (normalized === 'processing' || normalized === 'in_progress') return '处理中';
  if (normalized === 'completed' || normalized === 'done') return '已完成';
  if (normalized === 'closed' || normalized === 'rejected') return '已拒绝';
  return '待跟进';
}

function getStatusColor(status?: string | null): string {
  const normalized = (status ?? '').trim().toLowerCase();
  if (normalized === 'contacted') return Colors.warning;
  if (normalized === 'processing' || normalized === 'in_progress') return Colors.primary;
  if (normalized === 'completed' || normalized === 'done') return Colors.success;
  if (normalized === 'closed' || normalized === 'rejected') return Colors.danger;
  return Colors.accent;
}

function getSnippet(message?: string | null): string {
  const trimmed = message?.trim() ?? '';
  if (!trimmed) return '暂无留言';
  return trimmed.length > 64 ? `${trimmed.slice(0, 64)}...` : trimmed;
}

export default function AgentLeadsScreen() {
  const { user } = useAuth();
  const router = useRouter();
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
      console.log('[AGENT_LEADS] Resolving agent profile id for user:', userId);
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
      const { data, error } = await supabase
        .from('agent_subscriptions')
        .select('id, plan, lead_limit, leads_used')
        .eq('agent_id', agentProfileIdQuery.data)
        .eq('status', 'active')
        .gt('end_date', now)
        .order('end_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.log('[AGENT_LEADS] Failed to check subscription:', error);
        throw new Error(error.message);
      }

      return (data as AgentSubscriptionRow | null) ?? null;
    },
  });

  const leadsQuery = useQuery({
    queryKey: ['agent-consultations-list', user.id],
    enabled: user.role === 'agent' && !!user.id,
    queryFn: async (): Promise<ConsultationRow[]> => {
      console.log('[AGENT_LEADS] Fetching consultations for agent:', user.id);
      const { data, error } = await supabase
        .from('consultations')
        .select('id, borrower_name, borrower_phone, loan_type, loan_amount, state, district, message, status, created_at')
        .eq('agent_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.log('[AGENT_LEADS] Failed loading consultations:', error);
        throw new Error(error.message);
      }

      return (data as ConsultationRow[] | null) ?? [];
    },
  });

  if (agentProfileIdQuery.isLoading || subscriptionQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} testID="agent-leads-loading-safe-area">
        <View style={styles.centerState} testID="agent-leads-check-subscription-loading">
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.centerText}>Checking subscription...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (agentProfileIdQuery.isError) {
    return (
      <SafeAreaView style={styles.container} testID="agent-leads-missing-profile-safe-area">
        <View style={styles.centerState} testID="agent-leads-missing-profile">
          <Text style={styles.errorTitle}>Agent profile required</Text>
          <Text style={styles.centerText}>{agentProfileIdQuery.error instanceof Error ? agentProfileIdQuery.error.message : 'Please complete agent registration first.'}</Text>
          <Pressable style={styles.primaryButton} onPress={() => router.push('/agent-register')} testID="agent-leads-go-agent-register-button">
            <Text style={styles.primaryButtonText}>Complete Agent Registration</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!subscriptionQuery.data) {
    return (
      <SafeAreaView style={styles.container} testID="agent-leads-no-subscription-safe-area">
        <View style={styles.centerState} testID="agent-leads-no-subscription">
          <Text style={styles.errorTitle}>Subscription required</Text>
          <Text style={styles.centerText}>Agents must subscribe before accessing leads.</Text>
          <Pressable style={styles.primaryButton} onPress={() => router.replace('/subscription')} testID="agent-leads-go-subscription-button">
            <Text style={styles.primaryButtonText}>Go to Subscription</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const leadLimitLabel = subscriptionQuery.data.lead_limit === null
    ? '无限'
    : `${subscriptionQuery.data.leads_used ?? 0} / ${subscriptionQuery.data.lead_limit}`;

  return (
    <SafeAreaView style={styles.container} testID="agent-leads-screen">
      <View style={styles.header}>
        <Text style={styles.title}>咨询 / 订单</Text>
        <Text style={styles.subtitle}>查看用户提交给你的贷款咨询</Text>

        <View style={styles.quotaCard} testID="agent-leads-quota-card">
          <View style={styles.quotaTopRow}>
            <Text style={styles.quotaLabel}>本月咨询配额</Text>
            <View style={styles.quotaBadge}>
              <CircleAlert size={14} color={Colors.primary} />
              <Text style={styles.quotaBadgeText}>{leadLimitLabel}</Text>
            </View>
          </View>
          <Text style={styles.quotaSubtext}>
            {subscriptionQuery.data.lead_limit === null ? 'Elite 方案，本月可无限接单。' : '达到上限后系统会自动隐藏你的代理卡片。'}
          </Text>
        </View>
      </View>

      {leadsQuery.isLoading ? (
        <View style={styles.centerState} testID="agent-leads-loading-list">
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.centerText}>Loading leads...</Text>
        </View>
      ) : (
        <FlatList
          data={leadsQuery.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.centerText}>暂无咨询记录。</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => router.push(`/leads/${item.id}`)}
              testID={`agent-lead-card-${item.id}`}
            >
              <View style={styles.cardTopRow}>
                <View style={styles.customerBlock}>
                  <View style={styles.customerIconWrap}>
                    <UserRound size={16} color={Colors.primary} />
                  </View>
                  <View style={styles.customerTextWrap}>
                    <Text style={styles.customerName}>{item.borrower_name?.trim() || '未填写姓名'}</Text>
                    <View style={styles.inlineMetaRow}>
                      <Phone size={12} color={Colors.textMuted} />
                      <Text style={styles.inlineMetaText}>{item.borrower_phone?.trim() || '未填写电话'}</Text>
                    </View>
                  </View>
                </View>

                <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(item.status)}18` }]}>
                  {['completed', 'done'].includes(item.status?.trim().toLowerCase() ?? '') ? (
                    <CircleCheckBig size={14} color={getStatusColor(item.status)} />
                  ) : (
                    <Clock3 size={14} color={getStatusColor(item.status)} />
                  )}
                  <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>{getStatusText(item.status)}</Text>
                </View>
              </View>

              <View style={styles.summaryRow}>
                <Text style={styles.loanType}>{item.loan_type?.trim() || '贷款类型待补充'}</Text>
                <Text style={styles.amount}>{formatAmount(item.loan_amount)}</Text>
              </View>

              <Text style={styles.location}>{`${item.state?.trim() || '-'} / ${item.district?.trim() || '-'}`}</Text>
              <Text style={styles.messageSnippet}>{getSnippet(item.message)}</Text>

              <View style={styles.cardFooter}>
                <Text style={styles.timeText}>{formatDateTime(item.created_at)}</Text>
                <ChevronRight size={18} color={Colors.textMuted} />
              </View>
            </Pressable>
          )}
          testID="agent-leads-list"
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  subtitle: {
    marginTop: -6,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  quotaCard: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 14,
    gap: 8,
  },
  quotaTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  quotaLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  quotaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.inputBg,
  },
  quotaBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.primary,
  },
  quotaSubtext: {
    fontSize: 12,
    lineHeight: 18,
    color: Colors.textSecondary,
  },
  listContent: {
    paddingHorizontal: 14,
    paddingBottom: 24,
    gap: 12,
  },
  card: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 14,
    gap: 12,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  customerBlock: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  customerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.inputBg,
  },
  customerTextWrap: {
    flex: 1,
    gap: 4,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  inlineMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inlineMetaText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '800',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  loanType: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  amount: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.primary,
  },
  location: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  messageSnippet: {
    fontSize: 13,
    lineHeight: 19,
    color: Colors.textSecondary,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '700',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  centerText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  errorTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  primaryButton: {
    marginTop: 10,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
});
