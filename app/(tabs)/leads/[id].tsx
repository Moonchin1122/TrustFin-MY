import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { CircleCheckBig, Clock3, Mail, MapPin, MessageCircleMore, Phone, UserRound } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import Colors from '@/constants/colors';

type ConsultationDetail = {
  id: string;
  borrower_name?: string | null;
  borrower_phone?: string | null;
  borrower_email?: string | null;
  loan_type?: string | null;
  loan_amount?: number | string | null;
  monthly_income?: number | string | null;
  work_type?: string | null;
  urgency?: string | null;
  state?: string | null;
  district?: string | null;
  message?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type ConsultationStatus = 'contacted' | 'in_progress' | 'done' | 'rejected';

type FeedbackState = {
  type: 'success' | 'error';
  message: string;
} | null;

const statusOptions: { value: ConsultationStatus; label: string }[] = [
  { value: 'contacted', label: '已联系' },
  { value: 'in_progress', label: '处理中' },
  { value: 'done', label: '已完成' },
  { value: 'rejected', label: '已拒绝' },
];

function formatAmount(value?: number | string | null): string {
  const amount = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(amount ?? Number.NaN) || !amount) {
    return '-';
  }
  return `RM ${Number(amount).toLocaleString('en-MY')}`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function getStatusText(status?: string | null): string {
  const normalized = (status ?? '').trim().toLowerCase();
  if (normalized === 'contacted') return '已联系';
  if (normalized === 'processing' || normalized === 'in_progress') return '处理中';
  if (normalized === 'completed' || normalized === 'done') return '已完成';
  if (normalized === 'closed' || normalized === 'rejected') return '已拒绝';
  return '待跟进';
}

function sanitizePhoneDigits(phone?: string | null): string {
  return (phone ?? '').replace(/[^\d]/g, '');
}

function buildWhatsAppMessage(detail?: ConsultationDetail | null): string {
  const parts = [
    '您好，我是贷款顾问，收到您的咨询。',
    `贷款类型：${detail?.loan_type?.trim() || '-'}`,
    `贷款金额：${formatAmount(detail?.loan_amount)}`,
    `留言：${detail?.message?.trim() || '无'}`,
  ];

  return parts.join('\n');
}

function getWhatsAppUrl(phone: string, message: string): string {
  const normalized = sanitizePhoneDigits(phone);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

async function openWhatsApp(phone: string, message?: string): Promise<void> {
  const digits = sanitizePhoneDigits(phone);
  if (!digits) {
    Alert.alert('提示', '客户尚未留下手机号');
    return;
  }

  const url = getWhatsAppUrl(digits, message ?? '');
  console.log('[AGENT_LEAD_DETAIL] WhatsApp click:', { digits, url });

  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        window.open(url, '_blank');
        return;
      }

      throw new Error('window is not available');
    }

    await Linking.openURL(url);
  } catch (error) {
    console.log('[AGENT_LEAD_DETAIL] Failed opening WhatsApp:', error);
    Alert.alert('打开失败', error instanceof Error ? error.message : '无法打开 WhatsApp');
  }
}

export default function LeadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = React.useState<FeedbackState>(null);
  const feedbackTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFeedback = React.useCallback((type: 'success' | 'error', message: string) => {
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current);
    }

    setFeedback({ type, message });
    feedbackTimeoutRef.current = setTimeout(() => {
      setFeedback(null);
      feedbackTimeoutRef.current = null;
    }, 2200);
  }, []);

  React.useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }
    };
  }, []);

  const detailQuery = useQuery({
    queryKey: ['agent-consultation-detail', user.id, id],
    enabled: Boolean(user.id && id),
    queryFn: async (): Promise<ConsultationDetail> => {
      console.log('[AGENT_LEAD_DETAIL] Fetching consultation detail:', { userId: user.id, id });
      const { data, error } = await supabase
        .from('consultations')
        .select('id, borrower_name, borrower_phone, borrower_email, loan_type, loan_amount, monthly_income, work_type, urgency, state, district, message, status, created_at')
        .eq('agent_id', user.id)
        .eq('id', id)
        .single();

      if (error) {
        console.log('[AGENT_LEAD_DETAIL] Failed loading detail:', error);
        throw new Error(error.message);
      }

      return data as ConsultationDetail;
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (status: ConsultationStatus) => {
      console.log('[AGENT_LEAD_DETAIL] Updating consultation status:', { consultationId: id, status, userId: user.id });
      const { error } = await supabase
        .from('consultations')
        .update({ status })
        .eq('id', id)
        .eq('agent_id', user.id);

      if (error) {
        console.log('[AGENT_LEAD_DETAIL] Failed updating status:', error);
        throw new Error(error.message);
      }

      return status;
    },
    onSuccess: async (status) => {
      queryClient.setQueryData<ConsultationDetail | undefined>(['agent-consultation-detail', user.id, id], (current) => {
        if (!current) return current;
        return { ...current, status };
      });
      queryClient.setQueryData<ConsultationDetail[] | undefined>(['agent-consultations-list', user.id], (current) => {
        if (!current) return current;
        return current.map((entry) => (entry.id === id ? { ...entry, status } : entry));
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['agent-consultations-list', user.id] }),
        queryClient.invalidateQueries({ queryKey: ['agent-consultation-detail', user.id, id] }),
      ]);
      showFeedback('success', '状态已更新');
    },
    onError: (error: Error) => {
      console.log('[AGENT_LEAD_DETAIL] Status update error message:', error);
      showFeedback('error', error.message || '状态更新失败，请稍后重试。');
    },
  });

  const handleStatusUpdate = React.useCallback(async (status: ConsultationStatus) => {
    try {
      await statusMutation.mutateAsync(status);
    } catch (error) {
      console.log('[AGENT_LEAD_DETAIL] handleStatusUpdate caught error:', error);
    }
  }, [statusMutation]);

  const prefilledText = React.useMemo(() => buildWhatsAppMessage(detailQuery.data), [detailQuery.data]);

  if (detailQuery.isLoading) {
    return (
      <View style={styles.centerState} testID="lead-detail-loading">
        <Text style={styles.centerText}>加载中...</Text>
      </View>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <View style={styles.centerState} testID="lead-detail-error">
        <Text style={styles.errorTitle}>无法加载咨询详情</Text>
        <Text style={styles.centerText}>{detailQuery.error instanceof Error ? detailQuery.error.message : 'Unknown error'}</Text>
      </View>
    );
  }

  const item = detailQuery.data;

  return (
    <>
      <Stack.Screen options={{ title: '咨询详情', headerBackTitle: '返回' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content} testID="lead-detail-screen">
        {feedback ? (
          <View
            style={[
              styles.feedbackToast,
              feedback.type === 'success' ? styles.feedbackToastSuccess : styles.feedbackToastError,
            ]}
            testID="lead-detail-feedback-toast"
          >
            <Text style={styles.feedbackToastText}>{feedback.message}</Text>
          </View>
        ) : null}
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroNameBlock}>
              <View style={styles.heroIconWrap}>
                <UserRound size={18} color={Colors.primary} />
              </View>
              <View style={styles.heroTextWrap}>
                <Text style={styles.heroName}>{item.borrower_name?.trim() || '未填写姓名'}</Text>
                <Text style={styles.heroSubtext}>{item.loan_type?.trim() || '贷款类型待补充'}</Text>
              </View>
            </View>

            <View style={styles.statusBadge}>
              {item.status?.trim().toLowerCase() === 'completed' ? (
                <CircleCheckBig size={14} color={Colors.success} />
              ) : (
                <Clock3 size={14} color={Colors.primary} />
              )}
              <Text style={styles.statusText}>{getStatusText(item.status)}</Text>
            </View>
          </View>

          <View style={styles.heroMetaGrid}>
            <MetaPill Icon={MapPin} text={`${item.state?.trim() || '-'} / ${item.district?.trim() || '-'}`} />
            <MetaPill Icon={Phone} text={item.borrower_phone?.trim() || '未填写电话'} />
            <MetaPill Icon={Mail} text={item.borrower_email?.trim() || '未填写邮箱'} />
            <MetaPill Icon={MessageCircleMore} text={formatDateTime(item.created_at)} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>贷款资料</Text>
          <InfoRow label="贷款金额" value={formatAmount(item.loan_amount)} />
          <InfoRow label="月收入" value={formatAmount(item.monthly_income)} />
          <InfoRow label="工作类型" value={item.work_type?.trim() || '-'} />
          <InfoRow label="紧急程度" value={item.urgency?.trim() || '-'} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>客户留言</Text>
          <Text style={styles.messageText}>{item.message?.trim() || '暂无留言'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>联系客户</Text>
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.contactButton, styles.whatsappButton]}
              onPress={() => openWhatsApp(item.borrower_phone ?? '', prefilledText)}
              testID="lead-detail-whatsapp-button"
            >
              <MessageCircleMore size={16} color={Colors.white} />
              <Text style={styles.contactButtonText}>WhatsApp</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>状态操作</Text>
          <View style={styles.statusActionList}>
            {statusOptions.map((option) => {
              const normalizedStatus = (item.status ?? '').trim().toLowerCase();
              const active = normalizedStatus === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.statusActionButton, active && styles.statusActionButtonActive, statusMutation.isPending && styles.statusActionButtonDisabled]}
                  onPress={async () => {
                    await handleStatusUpdate(option.value);
                  }}
                  disabled={statusMutation.isPending}
                  testID={`lead-detail-status-${option.value}`}
                >
                  <Text style={[styles.statusActionText, active && styles.statusActionTextActive]}>
                    {statusMutation.isPending && active ? '更新中...' : option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </>
  );
}

type MetaPillIconProps = {
  size?: number;
  color?: string;
};

type MetaPillProps = {
  Icon: React.ComponentType<MetaPillIconProps>;
  text: string;
};

function MetaPill({ Icon, text }: MetaPillProps) {
  return (
    <View style={styles.metaPill}>
      <Icon size={14} color={Colors.primary} />
      <Text style={styles.metaPillText}>{text}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
    gap: 14,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    paddingHorizontal: 24,
  },
  centerText: {
    textAlign: 'center',
    fontSize: 14,
    color: Colors.textSecondary,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  heroCard: {
    backgroundColor: Colors.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 14,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  heroNameBlock: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  heroIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.inputBg,
  },
  heroTextWrap: {
    flex: 1,
    gap: 4,
  },
  heroName: {
    fontSize: 21,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  heroSubtext: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: Colors.inputBg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  heroMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.inputBg,
  },
  metaPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  infoLabel: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '700',
  },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 14,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 22,
    color: Colors.textSecondary,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  contactButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
  },
  whatsappButton: {
    backgroundColor: Colors.success,
  },
  contactButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.white,
  },
  feedbackToast: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 2,
  },
  feedbackToastSuccess: {
    backgroundColor: Colors.success,
  },
  feedbackToastError: {
    backgroundColor: Colors.danger,
  },
  feedbackToastText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  statusActionList: {
    gap: 10,
  },
  statusActionButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.inputBg,
    paddingVertical: 13,
    alignItems: 'center',
  },
  statusActionButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: '#E8EEF7',
  },
  statusActionButtonDisabled: {
    opacity: 0.6,
  },
  statusActionText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textSecondary,
  },
  statusActionTextActive: {
    color: Colors.primary,
  },
});
