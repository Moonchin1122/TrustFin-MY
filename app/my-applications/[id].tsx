import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { CircleAlert } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import Colors from '@/constants/colors';

type ApplicationStatus = 'submitted' | 'assigned' | 'contacted' | 'closed';

interface ApplicationDetail {
  id: string;
  type: 'basic' | 'premium';
  state: string;
  loan_type: string;
  amount: number;
  monthly_income: number | null;
  occupation: string | null;
  status: ApplicationStatus;
  created_at: string;
}

interface LegacyApplicationDetail {
  id: string;
  mode: 'basic' | 'premium' | null;
  state: string | null;
  loan_type: string | null;
  amount: string | null;
  monthly_income: string | null;
  occupation: string | null;
  status: string | null;
  created_at: string | null;
}

function normalizeStatus(status: string | null): ApplicationStatus {
  if (status === 'assigned' || status === 'contacted' || status === 'closed') {
    return status;
  }
  return 'submitted';
}

function mapLegacyDetail(item: LegacyApplicationDetail): ApplicationDetail {
  const parsedAmount = Number(item.amount ?? '0');
  const parsedMonthlyIncome = item.monthly_income ? Number(item.monthly_income) : null;

  return {
    id: item.id,
    type: item.mode === 'premium' ? 'premium' : 'basic',
    state: item.state ?? '-',
    loan_type: item.loan_type ?? '-',
    amount: Number.isFinite(parsedAmount) ? parsedAmount : 0,
    monthly_income: parsedMonthlyIncome !== null && Number.isFinite(parsedMonthlyIncome) ? parsedMonthlyIncome : null,
    occupation: item.occupation ?? null,
    status: normalizeStatus(item.status),
    created_at: item.created_at ?? new Date().toISOString(),
  };
}

function shouldUseLoanApplicationsFallback(errorMessage: string): boolean {
  const normalized = errorMessage.toLowerCase();
  return normalized.includes("could not find the table 'public.applications'") || normalized.includes('relation "applications" does not exist') || normalized.includes('pgrst205');
}

function formatDate(dateValue: string): string {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleString();
}

export default function ApplicationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();

  const detailQuery = useQuery({
    queryKey: ['my-application-detail', id, user.id],
    enabled: Boolean(id) && Boolean(user.id),
    queryFn: async (): Promise<ApplicationDetail> => {
      console.log('[MY_APPLICATION_DETAIL] Fetching id:', id);
      const { data, error } = await supabase
        .from('applications')
        .select('id, type, state, loan_type, amount, monthly_income, occupation, status, created_at')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.log('[MY_APPLICATION_DETAIL] Fetch failed:', error.message);

        if (!shouldUseLoanApplicationsFallback(error.message)) {
          throw new Error(error.message);
        }

        const { data: legacyData, error: legacyError } = await supabase
          .from('loan_applications')
          .select('id, mode, state, loan_type, amount, monthly_income, occupation, status, created_at')
          .eq('id', id)
          .eq('user_id', user.id)
          .single();

        if (legacyError) {
          console.log('[MY_APPLICATION_DETAIL] Legacy fetch failed:', legacyError.message);
          throw new Error(legacyError.message);
        }

        return mapLegacyDetail(legacyData as LegacyApplicationDetail);
      }

      return data as ApplicationDetail;
    },
  });

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Application Detail' }} />

      {detailQuery.isLoading ? (
        <View style={styles.centerWrap} testID="application-detail-loading">
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : detailQuery.isError || !detailQuery.data ? (
        <View style={styles.centerWrap} testID="application-detail-error">
          <CircleAlert size={24} color={Colors.danger} />
          <Text style={styles.errorTitle}>Unable to load application</Text>
          <Text style={styles.errorSubtitle}>{detailQuery.error instanceof Error ? detailQuery.error.message : 'Please try again.'}</Text>
        </View>
      ) : (
        <View style={styles.content} testID="application-detail-content">
          <DetailRow label="Status" value={detailQuery.data.status} />
          <DetailRow label={t('loanType')} value={t(detailQuery.data.loan_type) || detailQuery.data.loan_type} />
          <DetailRow label={t('amount')} value={`RM ${Number(detailQuery.data.amount).toLocaleString()}`} />
          <DetailRow label={t('state')} value={detailQuery.data.state} />
          <DetailRow label="Application Type" value={detailQuery.data.type === 'premium' ? 'Premium' : 'Basic'} />
          <DetailRow label={t('monthlyIncome')} value={detailQuery.data.monthly_income ? `RM ${Number(detailQuery.data.monthly_income).toLocaleString()}` : '-'} />
          <DetailRow label={t('occupation')} value={detailQuery.data.occupation ?? '-'} />
          <DetailRow label="Submitted At" value={formatDate(detailQuery.data.created_at)} />
        </View>
      )}
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  errorSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  content: {
    margin: 16,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 16,
    gap: 14,
  },
  row: {
    gap: 6,
  },
  rowLabel: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  rowValue: {
    fontSize: 16,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
});
