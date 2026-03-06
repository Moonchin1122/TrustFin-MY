import React, { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { FileText, CircleAlert, X } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import Colors from '@/constants/colors';
import { normalizeMalaysiaPhone } from '@/lib/phone';

type ApplicationStatus = 'submitted' | 'assigned' | 'contacted' | 'closed' | string;

interface ApplicationItem {
  id: string;
  loan_type: string | null;
  amount: number | string | null;
  state: string | null;
  status: ApplicationStatus | null;
  created_at: string | null;
  phone: string | null;
  [key: string]: unknown;
}

interface ApplicationsQueryResult {
  data: ApplicationItem[];
  lastSubmittedPhone: string | null;
}

const LAST_SUBMITTED_PHONE_KEY = 'last_submitted_phone';

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  submitted: { bg: '#EFF6FF', text: '#1D4ED8', label: 'Submitted' },
  assigned: { bg: '#FEF3C7', text: '#B45309', label: 'Assigned' },
  contacted: { bg: '#E0F2FE', text: '#0369A1', label: 'Contacted' },
  closed: { bg: '#EAF7EF', text: '#1F8A4D', label: 'Closed' },
};

function normalizePhone(value: string | null | undefined): string {
  const result = normalizeMalaysiaPhone(value ?? '');
  return result.normalized ?? '';
}

function formatCurrency(amount: number | string | null): string {
  const numeric = typeof amount === 'string' ? Number(amount) : amount;
  if (typeof numeric !== 'number' || !Number.isFinite(numeric)) {
    return 'RM 0';
  }
  return `RM ${numeric.toLocaleString()}`;
}

function formatDate(dateValue: string | null): string {
  if (!dateValue) {
    return '-';
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString();
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '-';
  }

  if (typeof value === 'string') {
    return value || '-';
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default function MyApplicationsScreen() {
  const { t } = useLanguage();
  const [selectedApplication, setSelectedApplication] = useState<ApplicationItem | null>(null);

  const applicationsQuery = useQuery({
    queryKey: ['my-applications-list-v2'],
    queryFn: async (): Promise<ApplicationsQueryResult> => {
      const lastSubmittedPhoneRaw = await AsyncStorage.getItem(LAST_SUBMITTED_PHONE_KEY);
      const lastSubmittedPhone = normalizePhone(lastSubmittedPhoneRaw);

      console.log('[MY_APPLICATIONS] Fetching applications with last submitted phone:', lastSubmittedPhone || 'none');

      const { data, error } = await supabase
        .from('applications')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.log('[MY_APPLICATIONS] Fetch failed:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        throw new Error(error.message);
      }

      const rows = (data ?? []) as ApplicationItem[];
      const filteredRows = __DEV__ || !lastSubmittedPhone
        ? rows
        : rows.filter((item) => normalizePhone(typeof item.phone === 'string' ? item.phone : null) === lastSubmittedPhone);

      console.log('[MY_APPLICATIONS] Fetch success count:', rows.length, 'Filtered count:', filteredRows.length, 'DEV mode:', __DEV__);

      return {
        data: filteredRows,
        lastSubmittedPhone,
      };
    },
  });

  const { refetch } = applicationsQuery;

  const onRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const applications = useMemo(() => applicationsQuery.data?.data ?? [], [applicationsQuery.data?.data]);

  const renderApplication = ({ item }: { item: ApplicationItem }) => {
    const statusKey = (item.status ?? 'submitted').toString().toLowerCase();
    const statusStyle = STATUS_STYLES[statusKey] ?? {
      bg: '#EEF2FF',
      text: '#1E3A8A',
      label: item.status ? String(item.status) : 'Submitted',
    };

    return (
      <Pressable
        style={styles.card}
        onPress={() => setSelectedApplication(item)}
        testID={`my-application-item-${item.id}`}
      >
        <View style={styles.cardTopRow}>
          <Text style={styles.loanType}>{item.loan_type ? t(item.loan_type) || item.loan_type : '-'}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusText, { color: statusStyle.text }]}>{statusStyle.label}</Text>
          </View>
        </View>

        <Text style={styles.metaText}>{formatCurrency(item.amount)}</Text>
        <Text style={styles.subtleText}>State: {item.state ?? '-'}</Text>
        <Text style={styles.subtleText}>Submitted: {formatDate(item.created_at)}</Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('myApplications') }} />

      {applicationsQuery.isError ? (
        <View style={styles.centerState} testID="my-applications-error-state">
          <CircleAlert size={24} color={Colors.danger} />
          <Text style={styles.emptyTitle}>Unable to load applications</Text>
          <Text style={styles.emptySubtitle}>{applicationsQuery.error instanceof Error ? applicationsQuery.error.message : 'Please try again.'}</Text>
        </View>
      ) : applications.length === 0 && !applicationsQuery.isLoading ? (
        <View style={styles.centerState} testID="my-applications-empty-state">
          <FileText size={24} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No applications found</Text>
          <Text style={styles.emptySubtitle}>
            {__DEV__
              ? 'No rows in applications table yet.'
              : applicationsQuery.data?.lastSubmittedPhone
                ? 'No applications matched your last submitted phone.'
                : 'Submit one application first to set your phone filter.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={applications}
          keyExtractor={(item) => item.id}
          renderItem={renderApplication}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          testID="my-applications-list"
          refreshControl={
            <RefreshControl
              refreshing={applicationsQuery.isFetching && !applicationsQuery.isLoading}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
              testID="my-applications-refresh-control"
            />
          }
        />
      )}

      <Modal
        transparent
        visible={Boolean(selectedApplication)}
        animationType="slide"
        onRequestClose={() => setSelectedApplication(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard} testID="my-application-detail-modal">
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Application Details</Text>
              <Pressable onPress={() => setSelectedApplication(null)} testID="my-application-detail-close">
                <X size={20} color={Colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
              {Object.entries(selectedApplication ?? {}).map(([key, value]) => (
                <View key={key} style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{key}</Text>
                  <Text style={styles.detailValue}>{formatValue(value)}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  listContent: {
    padding: 16,
    paddingBottom: 28,
    gap: 12,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
    gap: 8,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  loanType: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    flex: 1,
  },
  metaText: {
    fontSize: 15,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  subtleText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    gap: 8,
  },
  emptyTitle: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '82%',
    minHeight: '50%',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 22,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  modalContent: {
    paddingVertical: 6,
    gap: 12,
  },
  detailRow: {
    backgroundColor: '#F7FAFD',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 6,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: 15,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
});
