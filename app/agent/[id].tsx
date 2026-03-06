import React, { useEffect, useMemo, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TextInput, Pressable, Alert, Modal } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { CircleDollarSign, Mail, MapPin, Phone, ShieldCheck, Star } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { resolveAvatarUrl } from '@/lib/avatar';
import { ConsultationRpcError, createConsultation } from '@/lib/consultations';
import { useAuth } from '@/contexts/AuthContext';
import Colors from '@/constants/colors';

type AgentDetails = {
  id?: string | null;
  agent_id?: string | null;
  masked_id?: string | null;
  full_name?: string | null;
  name?: string | null;
  company?: string | null;
  profile_photo?: string | null;
  profile_photo_url?: string | null;
  avatar?: string | null;
  avatar_url?: string | null;
  photo_url?: string | null;
  rating?: number | null;
  verified?: boolean | null;
  is_verified?: boolean | null;
  verified_status?: string | null;
  state?: string | null;
  city?: string | null;
  districts?: string[] | string | null;
  loan_types?: string[] | string | null;
  languages?: string[] | string | null;
  years_experience?: number | string | null;
  bio?: string | null;
};

type ProfileRow = {
  full_name?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
};

type ConsultationFormState = {
  borrowerName: string;
  borrowerPhone: string;
  borrowerEmail: string;
  loanType: string;
  district: string;
  amount: string;
  message: string;
  monthlyIncome: string;
  employmentType: string;
  urgency: string;
};

const initialFormState: ConsultationFormState = {
  borrowerName: '',
  borrowerPhone: '',
  borrowerEmail: '',
  loanType: '',
  district: '',
  amount: '',
  message: '',
  monthlyIncome: '',
  employmentType: '',
  urgency: '',
};

function getAgentName(agent: AgentDetails): string {
  return agent.masked_id?.trim() || agent.full_name?.trim() || agent.name?.trim() || 'Unnamed Agent';
}

function getAgentPhoto(agent: AgentDetails): string | null {
  return agent.avatar_url ?? agent.profile_photo_url ?? agent.profile_photo ?? agent.avatar ?? agent.photo_url ?? null;
}

function getInitial(name: string): string {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return 'M';
  }

  return trimmedName.charAt(0).toUpperCase();
}

function toStringArray(value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  return [];
}

function isVerified(agent: AgentDetails): boolean {
  return agent.verified === true || agent.is_verified === true || agent.verified_status === 'verified';
}

function parseCurrencyInput(value: string): number {
  const normalized = value.replace(/[^\d.]/g, '');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return parsed;
}

function parseOptionalNumber(value: string): number | null {
  const normalized = value.replace(/[^\d.]/g, '');
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export default function AgentDetailScreen() {
  const { id, consult } = useLocalSearchParams<{ id: string; consult?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [isConsultModalVisible, setIsConsultModalVisible] = useState<boolean>(false);
  const [resolvedAvatarUrl, setResolvedAvatarUrl] = useState<string | null>(null);
  const [form, setForm] = useState<ConsultationFormState>(initialFormState);

  const agentQuery = useQuery({
    queryKey: ['agent-detail', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<AgentDetails> => {
      console.log('[AGENT_DETAIL] Fetching agent with id:', id);
      const { data, error } = await supabase
        .from('agents_public')
        .select('*')
        .or(`id.eq.${id},agent_id.eq.${id}`)
        .single();

      if (error) {
        console.log('[AGENT_DETAIL] Supabase error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        throw new Error(error.message);
      }

      return data as AgentDetails;
    },
  });

  const profileQuery = useQuery({
    queryKey: ['consultation-profile-prefill', user.id],
    enabled: Boolean(user.id),
    queryFn: async (): Promise<ProfileRow | null> => {
      console.log('[AGENT_DETAIL] Loading borrower profile prefill for user:', user.id);
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, name, phone, email')
        .eq('id', user.id)
        .maybeSingle<ProfileRow>();

      if (error) {
        console.log('[AGENT_DETAIL] profiles fetch failed, falling back to auth context:', error.message);
        return null;
      }

      return data ?? null;
    },
  });

  const loanTypes = useMemo(() => {
    if (!agentQuery.data) return [];
    return toStringArray(agentQuery.data.loan_types);
  }, [agentQuery.data]);

  const languages = useMemo(() => {
    if (!agentQuery.data) return [];
    return toStringArray(agentQuery.data.languages);
  }, [agentQuery.data]);

  const districts = useMemo(() => {
    if (!agentQuery.data) return [];
    return toStringArray(agentQuery.data.districts);
  }, [agentQuery.data]);

  useEffect(() => {
    let isCancelled = false;

    const run = async () => {
      if (!agentQuery.data) {
        setResolvedAvatarUrl(null);
        return;
      }

      const fallbackPhoto = getAgentPhoto(agentQuery.data);
      const resolved = await resolveAvatarUrl(fallbackPhoto);
      if (!isCancelled) {
        setResolvedAvatarUrl(resolved ?? fallbackPhoto);
      }
    };

    void run();

    return () => {
      isCancelled = true;
    };
  }, [agentQuery.data]);

  useEffect(() => {
    const profile = profileQuery.data;
    setForm((prev) => ({
      ...prev,
      borrowerName: prev.borrowerName || profile?.full_name?.trim() || profile?.name?.trim() || user.name || '',
      borrowerPhone: prev.borrowerPhone || profile?.phone?.trim() || user.phone || '',
      borrowerEmail: prev.borrowerEmail || profile?.email?.trim() || user.email || '',
      loanType: prev.loanType || loanTypes[0] || '',
      district: prev.district || districts[0] || '',
    }));
  }, [districts, loanTypes, profileQuery.data, user.email, user.name, user.phone]);

  useEffect(() => {
    if (consult === '1' && user.id) {
      setIsConsultModalVisible(true);
    }
  }, [consult, user.id]);

  const consultationMutation = useMutation({
    mutationFn: async () => {
      const agentId = String(agentQuery.data?.id ?? agentQuery.data?.agent_id ?? '');
      if (!agentId) {
        throw new Error('代理资料异常，请稍后再试。');
      }
      if (!form.borrowerName.trim()) {
        throw new Error('请填写姓名。');
      }
      if (!form.borrowerPhone.trim()) {
        throw new Error('请填写手机号码。');
      }
      if (!form.borrowerEmail.trim()) {
        throw new Error('请填写邮箱。');
      }
      if (!form.loanType.trim()) {
        throw new Error('请选择贷款类型。');
      }
      if (!form.district.trim()) {
        throw new Error('请选择地区。');
      }
      if (!form.message.trim()) {
        throw new Error('请填写留言。');
      }

      const amount = parseCurrencyInput(form.amount);
      if (amount <= 0) {
        throw new Error('请填写贷款金额 RM。');
      }

      const monthlyIncome = parseOptionalNumber(form.monthlyIncome);
      const nextName = form.borrowerName.trim();
      const nextPhone = form.borrowerPhone.trim();
      const nextEmail = form.borrowerEmail.trim();

      if (user.id) {
        const profilePayload = {
          id: user.id,
          full_name: nextName,
          name: nextName,
          phone: nextPhone,
          email: nextEmail,
          updated_at: new Date().toISOString(),
        };

        const { error: profileError } = await supabase.from('profiles').upsert(profilePayload, { onConflict: 'id' });
        if (profileError) {
          console.log('[AGENT_DETAIL] Failed to persist borrower profile prefill:', profileError.message);
        }
      }

      console.log('[AGENT_DETAIL] Submitting consultation payload:', {
        agentId,
        district: form.district.trim(),
        loanType: form.loanType.trim(),
        borrowerName: nextName,
        borrowerPhone: nextPhone,
        borrowerEmail: nextEmail,
        loanAmount: amount,
        monthlyIncome,
        employmentType: form.employmentType.trim() || null,
        urgency: form.urgency.trim() || null,
      });

      await createConsultation({
        agentId,
        district: form.district.trim(),
        loanType: form.loanType.trim(),
        message: form.message.trim(),
        state: String(agentQuery.data?.state ?? '').trim(),
        borrowerName: nextName,
        borrowerPhone: nextPhone,
        borrowerEmail: nextEmail,
        loanAmount: amount,
        monthlyIncome,
        workType: form.employmentType.trim() || null,
        urgency: form.urgency.trim() || null,
      });
    },
    onSuccess: () => {
      setForm((prev) => ({
        ...prev,
        amount: '',
        message: '',
        monthlyIncome: '',
        employmentType: '',
        urgency: '',
      }));
      setIsConsultModalVisible(false);
      Alert.alert('提交成功', '咨询已发送给代理。');
    },
    onError: (error: Error) => {
      if (error instanceof ConsultationRpcError && error.code === 'agent_lead_quota_exceeded') {
        Alert.alert('名额已满', '该代理本月名额已满，请选择其他代理或下月再试。');
        return;
      }

      Alert.alert('提交失败', error.message || '提交咨询失败，请稍后重试。');
    },
  });

  if (!id) {
    return (
      <View style={styles.centerState} testID="agent-detail-missing-id">
        <Text style={styles.errorTitle}>Agent ID is missing.</Text>
      </View>
    );
  }

  if (agentQuery.isLoading) {
    return (
      <View style={styles.centerState} testID="agent-detail-loading-state">
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.centerText}>Loading agent details...</Text>
      </View>
    );
  }

  if (agentQuery.isError || !agentQuery.data) {
    return (
      <View style={styles.centerState} testID="agent-detail-error-state">
        <Text style={styles.errorTitle}>Unable to load agent details</Text>
        <Text style={styles.centerText}>{agentQuery.error instanceof Error ? agentQuery.error.message : 'Unknown error'}</Text>
      </View>
    );
  }

  const agent = agentQuery.data;
  const verified = isVerified(agent);
  const rating = Number(agent.rating ?? 0);
  const yearsExperience = Math.max(0, Number(agent.years_experience ?? 0));
  const agentName = getAgentName(agent);
  const agentPhoto = resolvedAvatarUrl ?? getAgentPhoto(agent);
  const locationLabel = agent.city ? `${agent.city}, ${agent.state ?? '-'}` : agent.state ?? '-';
  const showConsultHint = consult === '1';

  return (
    <>
      <Stack.Screen
        options={{
          title: '代理详情',
          headerBackTitle: '返回',
          headerTintColor: Colors.textPrimary,
          headerTitleStyle: styles.headerTitle,
          headerShadowVisible: false,
          headerStyle: styles.headerBar,
        }}
      />

      <ScrollView style={styles.container} contentContainerStyle={styles.content} testID="agent-detail-screen">
        <View style={styles.heroCard}>
          <LinearGradient
            colors={[Colors.primaryDark, Colors.primary, Colors.primaryLight]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGlow}
          />

          <View style={styles.headerBlock}>
            {agentPhoto ? (
              <Image source={{ uri: agentPhoto }} style={styles.avatar} contentFit="cover" />
            ) : (
              <LinearGradient
                colors={[Colors.primaryLight, Colors.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatarPlaceholder}
              >
                <Text style={styles.avatarInitial}>{getInitial(agentName)}</Text>
              </LinearGradient>
            )}

            <View style={styles.identityBlock}>
              <Text style={styles.name}>{agentName}</Text>
              {verified ? (
                <View style={styles.verifiedBadge}>
                  <ShieldCheck size={15} color={Colors.verified} />
                  <Text style={styles.verifiedText}>Verified</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaPill}>
              <Star size={14} color={Colors.gold} fill={Colors.gold} />
              <Text style={styles.metaText}>{rating > 0 ? rating.toFixed(1) : '暂无评分'}</Text>
            </View>

            <View style={styles.metaPill}>
              <MapPin size={14} color={Colors.primary} />
              <Text style={styles.metaText}>{locationLabel}</Text>
            </View>
          </View>
        </View>

        {yearsExperience > 0 ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>经验</Text>
            <Text style={styles.sectionValue}>{yearsExperience} 年经验</Text>
          </View>
        ) : null}

        {loanTypes.length > 0 ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Loan Types</Text>
            <View style={styles.tagsWrap}>
              {loanTypes.map((item) => (
                <View key={item} style={styles.tag}>
                  <Text style={styles.tagText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {languages.length > 0 ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Languages</Text>
            <View style={styles.tagsWrap}>
              {languages.map((item) => (
                <View key={item} style={styles.tag}>
                  <Text style={styles.tagText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {districts.length > 0 ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Service Areas</Text>
            <View style={styles.tagsWrap}>
              {districts.map((item) => (
                <View key={item} style={styles.tag}>
                  <Text style={styles.tagText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {agent.bio ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.bioText}>{agent.bio}</Text>
          </View>
        ) : null}

        <View style={[styles.sectionCard, showConsultHint && styles.consultationCardHighlighted]} testID="agent-consultation-card">
          <Text style={styles.consultationTitle}>咨询贷款</Text>
          <Text style={styles.consultationSubtitle}>提交前可补充贷款金额、地区、联系方式和需求，代理将收到更完整的客户资料。</Text>

          {!user.id ? (
            <Pressable style={styles.primaryButton} onPress={() => router.push('/login')} testID="agent-consultation-login-button">
              <Text style={styles.primaryButtonText}>登录后咨询</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.primaryButton} onPress={() => setIsConsultModalVisible(true)} testID="agent-open-consultation-modal-button">
              <Text style={styles.primaryButtonText}>填写咨询表单</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      <Modal visible={isConsultModalVisible} animationType="slide" transparent onRequestClose={() => setIsConsultModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard} testID="agent-consultation-modal">
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>咨询贷款</Text>
              <Pressable onPress={() => setIsConsultModalVisible(false)} testID="agent-consultation-modal-close">
                <Text style={styles.modalClose}>关闭</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
              <FieldLabel icon={Phone} label="姓名" />
              <TextInput
                style={styles.input}
                value={form.borrowerName}
                onChangeText={(value) => setForm((prev) => ({ ...prev, borrowerName: value }))}
                placeholder="请输入姓名"
                placeholderTextColor={Colors.textMuted}
                testID="consultation-borrower-name-input"
              />

              <FieldLabel icon={Phone} label="手机" />
              <TextInput
                style={styles.input}
                value={form.borrowerPhone}
                onChangeText={(value) => setForm((prev) => ({ ...prev, borrowerPhone: value }))}
                placeholder="请输入手机号码"
                placeholderTextColor={Colors.textMuted}
                keyboardType="phone-pad"
                testID="consultation-borrower-phone-input"
              />

              <FieldLabel icon={Mail} label="邮箱" />
              <TextInput
                style={styles.input}
                value={form.borrowerEmail}
                onChangeText={(value) => setForm((prev) => ({ ...prev, borrowerEmail: value }))}
                placeholder="请输入邮箱"
                placeholderTextColor={Colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                testID="consultation-borrower-email-input"
              />

              <FieldLabel icon={CircleDollarSign} label="贷款类型" />
              {loanTypes.length > 0 ? (
                <View style={styles.chipsWrap}>
                  {loanTypes.map((item) => {
                    const active = form.loanType === item;
                    return (
                      <Pressable
                        key={item}
                        style={[styles.choiceChip, active && styles.choiceChipActive]}
                        onPress={() => setForm((prev) => ({ ...prev, loanType: item }))}
                        testID={`consultation-loan-${item}`}
                      >
                        <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>{item}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <TextInput
                  style={styles.input}
                  value={form.loanType}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, loanType: value }))}
                  placeholder="请输入贷款类型"
                  placeholderTextColor={Colors.textMuted}
                  testID="consultation-loan-input"
                />
              )}

              <FieldLabel icon={MapPin} label="地区" />
              {districts.length > 0 ? (
                <View style={styles.chipsWrap}>
                  {districts.map((item) => {
                    const active = form.district === item;
                    return (
                      <Pressable
                        key={item}
                        style={[styles.choiceChip, active && styles.choiceChipActive]}
                        onPress={() => setForm((prev) => ({ ...prev, district: item }))}
                        testID={`consultation-district-${item}`}
                      >
                        <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>{item}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <TextInput
                  style={styles.input}
                  value={form.district}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, district: value }))}
                  placeholder="请输入地区"
                  placeholderTextColor={Colors.textMuted}
                  testID="consultation-district-input"
                />
              )}

              <FieldLabel icon={CircleDollarSign} label="贷款金额 RM" />
              <TextInput
                style={styles.input}
                value={form.amount}
                onChangeText={(value) => setForm((prev) => ({ ...prev, amount: value }))}
                placeholder="例如 300000"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
                testID="consultation-amount-input"
              />

              <FieldLabel icon={CircleDollarSign} label="月收入（可选）" />
              <TextInput
                style={styles.input}
                value={form.monthlyIncome}
                onChangeText={(value) => setForm((prev) => ({ ...prev, monthlyIncome: value }))}
                placeholder="例如 8000"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
                testID="consultation-monthly-income-input"
              />

              <FieldLabel icon={Phone} label="工作类型（可选）" />
              <TextInput
                style={styles.input}
                value={form.employmentType}
                onChangeText={(value) => setForm((prev) => ({ ...prev, employmentType: value }))}
                placeholder="例如 全职 / 自雇 / 公务员"
                placeholderTextColor={Colors.textMuted}
                testID="consultation-employment-type-input"
              />

              <FieldLabel icon={Star} label="紧急程度（可选）" />
              <TextInput
                style={styles.input}
                value={form.urgency}
                onChangeText={(value) => setForm((prev) => ({ ...prev, urgency: value }))}
                placeholder="例如 本周内 / 本月 / 不着急"
                placeholderTextColor={Colors.textMuted}
                testID="consultation-urgency-input"
              />

              <FieldLabel icon={Mail} label="留言" />
              <TextInput
                style={[styles.input, styles.messageInput]}
                value={form.message}
                onChangeText={(value) => setForm((prev) => ({ ...prev, message: value }))}
                placeholder="请说明贷款用途、目前情况、想解决的问题..."
                placeholderTextColor={Colors.textMuted}
                multiline
                textAlignVertical="top"
                testID="consultation-message-input"
              />

              <Pressable
                style={[styles.primaryButton, consultationMutation.isPending && styles.primaryButtonDisabled]}
                onPress={() => consultationMutation.mutate()}
                disabled={consultationMutation.isPending}
                testID="agent-consultation-submit-button"
              >
                <Text style={styles.primaryButtonText}>{consultationMutation.isPending ? '提交中...' : '提交咨询'}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function FieldLabel({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
}) {
  return (
    <View style={styles.fieldLabelRow}>
      <Icon size={14} color={Colors.primary} />
      <Text style={styles.fieldLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerBar: {
    backgroundColor: Colors.background,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 14,
  },
  heroCard: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: Colors.white,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
    shadowColor: Colors.shadowColor,
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  heroGlow: {
    position: 'absolute',
    top: -90,
    right: -70,
    width: 220,
    height: 220,
    borderRadius: 110,
    opacity: 0.14,
  },
  headerBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.inputBg,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.white,
  },
  identityBlock: {
    flex: 1,
    gap: 10,
  },
  name: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.4,
  },
  verifiedBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.badgeBg,
  },
  verifiedText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.verified,
  },
  metaRow: {
    marginTop: 18,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  metaText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  sectionCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '800',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sectionValue: {
    fontSize: 16,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tagText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  bioText: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  consultationCardHighlighted: {
    borderColor: Colors.primary,
    shadowOpacity: 0.12,
  },
  consultationTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  consultationSubtitle: {
    marginTop: 6,
    marginBottom: 14,
    fontSize: 13,
    lineHeight: 20,
    color: Colors.textSecondary,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  choiceChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  choiceChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  choiceChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  choiceChipTextActive: {
    color: Colors.white,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.inputBg,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  messageInput: {
    minHeight: 120,
  },
  primaryButton: {
    marginTop: 4,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.white,
  },
  centerState: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  centerText: {
    textAlign: 'center',
    color: Colors.textSecondary,
    fontSize: 14,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  modalCard: {
    maxHeight: '92%',
    backgroundColor: Colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: Colors.border,
    marginBottom: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  modalClose: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
  },
  modalContent: {
    paddingBottom: 24,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textSecondary,
  },
});
