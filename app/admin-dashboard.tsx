import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  Linking,
  Platform,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Users,
  Search,
  LogOut,
  Eye,
  Shield,
  ShieldCheck,
  X,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  CreditCard,
  Flag,
  BarChart3,
  BadgeCheck,
  Ban,
  ChevronRight,
  RefreshCw,
  Clock,
  Image as ImageIcon,
  Download,
  ZoomIn,
  MessageSquare,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import { addAgentCredits } from '@/lib/credits';

type TabType = 'overview' | 'users' | 'applications' | 'agents' | 'kyc' | 'subscriptions' | 'reports';

interface DashboardStats {
  totalUsers: number;
  totalApplications: number;
  totalAgents: number;
  totalSubscriptions: number;
  totalReports: number;
}

interface ApplicationRow {
  id: string;
  full_name: string;
  phone: string;
  loan_type: string;
  loan_amount: string;
  state: string;
  status: string;
  mode: string;
  monthly_income?: string;
  occupation?: string;
  years_employed?: string;
  has_ctos?: boolean;
  existing_loans?: string;
  planned_timeline?: string;
  lead_score?: number;
  created_at: string;
}

interface AgentRow {
  id: string;
  name?: string;
  full_name?: string;
  phone?: string;
  email?: string;
  state?: string;
  district?: string;
  company?: string;
  company_name?: string;
  license_no?: string;
  verified: boolean;
  agent_type?: string;
  kyc_status?: string;
  rating?: number;
  created_at: string;
}

interface SubscriptionRow {
  id: string;
  agent_id: string;
  plan: string;
  price: number;
  lead_limit: number;
  leads_used: number;
  start_date: string;
  end_date: string;
  status: string;
}

interface ReportRow {
  id: string;
  reporter_id: string;
  reported_id: string;
  reason: string;
  description: string;
  status: string;
  created_at: string;
}

interface UserRow {
  id: string;
  name: string;
  phone: string;
  email: string;
  role: string;
  is_verified: boolean;
  agent_type?: string;
  kyc_status?: string;
  state?: string;
  is_online: boolean;
  last_active_at?: string;
  created_at: string;
  updated_at: string;
}

interface KycSubmissionRow {
  id: string;
  agent_id: string;
  full_name?: string;
  phone?: string;
  email?: string;
  state?: string;
  license_no?: string;
  ic_front_url?: string;
  ic_back_url?: string;
  license_url?: string;
  selfie_url?: string;
  status: string;
  reject_reason?: string;
  updated_at?: string;
  created_at?: string;
}

interface KycDocItem {
  label: string;
  path: string | null;
  docType: string;
}

interface KycAgentGroup {
  agent_id: string;
  agent_name: string;
  agent_phone: string;
  agent_email: string;
  agent_state: string;
  agent_license: string;
  submission: KycSubmissionRow;
  docs: KycDocItem[];
  status: string;
  reject_reason?: string;
}

type AdminOverviewRow = {
  total_users?: number | null;
  total_applications?: number | null;
  total_agents?: number | null;
  total_subscriptions?: number | null;
  total_reports?: number | null;
  totalUsers?: number | null;
  totalApplications?: number | null;
  totalAgents?: number | null;
  totalSubscriptions?: number | null;
  totalReports?: number | null;
};

async function fetchStats(): Promise<DashboardStats> {
  console.log('[ADMIN] Fetching overview from Supabase admin_overview...');
  const { data, error } = await supabase.from('admin_overview').select('*').single<AdminOverviewRow>();

  if (error) {
    throw new Error(error.message);
  }

  return {
    totalUsers: data?.total_users ?? data?.totalUsers ?? 0,
    totalApplications: data?.total_applications ?? data?.totalApplications ?? 0,
    totalAgents: data?.total_agents ?? data?.totalAgents ?? 0,
    totalSubscriptions: data?.total_subscriptions ?? data?.totalSubscriptions ?? 0,
    totalReports: data?.total_reports ?? data?.totalReports ?? 0,
  };
}

async function fetchApplications(search: string, statusFilter: string): Promise<ApplicationRow[]> {
  console.log('[ADMIN] Fetching applications from Supabase, search:', search, 'status:', statusFilter);
  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  let rows = (data ?? []) as ApplicationRow[];

  if (statusFilter) {
    rows = rows.filter((row) => row.status === statusFilter);
  }

  if (search) {
    const s = search.toLowerCase();
    rows = rows.filter((row) => {
      const name = row.full_name?.toLowerCase() ?? '';
      const phone = row.phone?.toLowerCase() ?? '';
      return name.includes(s) || phone.includes(s);
    });
  }

  return rows;
}

function mapUserToAgentRow(user: UserRow): AgentRow {
  return {
    id: user.id,
    name: user.name,
    full_name: user.name,
    phone: user.phone,
    email: user.email,
    state: user.state,
    district: undefined,
    company: user.agent_type,
    company_name: user.agent_type,
    license_no: undefined,
    verified: user.is_verified,
    agent_type: user.agent_type,
    kyc_status: user.kyc_status,
    rating: undefined,
    created_at: user.created_at,
  };
}

async function fetchAgents(search: string): Promise<AgentRow[]> {
  console.log('[ADMIN] Fetching agents from Supabase, search:', search);
  let data: AgentRow[] | null = null;

  const orderedQuery = await supabase
    .from('agents')
    .select('*')
    .order('created_at', { ascending: false });

  if (orderedQuery.error) {
    console.log('[ADMIN] agents ordered query failed, retrying without created_at ordering:', {
      message: orderedQuery.error.message,
      code: orderedQuery.error.code,
      details: orderedQuery.error.details,
    });

    const fallbackQuery = await supabase.from('agents').select('*');

    if (fallbackQuery.error) {
      console.log('[ADMIN] agents fallback query failed:', {
        message: fallbackQuery.error.message,
        code: fallbackQuery.error.code,
        details: fallbackQuery.error.details,
      });
      throw new Error(fallbackQuery.error.message);
    }

    data = (fallbackQuery.data ?? []) as AgentRow[];
  } else {
    data = (orderedQuery.data ?? []) as AgentRow[];
  }

  let rows = data ?? [];

  if (rows.length === 0) {
    console.log('[ADMIN] agents table returned 0 rows, falling back to users(role=agent)...');
    const usersFallback = await supabase
      .from('users')
      .select('*')
      .eq('role', 'agent')
      .order('created_at', { ascending: false });

    if (usersFallback.error) {
      console.log('[ADMIN] users fallback for agents failed:', usersFallback.error.message);
    } else {
      rows = ((usersFallback.data ?? []) as UserRow[]).map(mapUserToAgentRow);
      console.log('[ADMIN] users fallback produced agents rows:', rows.length);
    }
  }

  if (search) {
    const s = search.toLowerCase();
    rows = rows.filter((row) => {
      const name = row.name?.toLowerCase() ?? '';
      const fullName = row.full_name?.toLowerCase() ?? '';
      const phone = row.phone?.toLowerCase() ?? '';
      return name.includes(s) || fullName.includes(s) || phone.includes(s);
    });
  }

  console.log('[ADMIN] agents rows loaded:', rows.length);
  return rows;
}

async function fetchSubscriptions(): Promise<SubscriptionRow[]> {
  console.log('[ADMIN] Fetching subscriptions from Supabase...');
  const { data, error } = await supabase
    .from('agent_subscriptions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as SubscriptionRow[];
}

async function fetchReports(): Promise<ReportRow[]> {
  console.log('[ADMIN] Fetching reports from Supabase...');
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ReportRow[];
}

async function fetchUsers(search: string, roleFilter: string): Promise<UserRow[]> {
  console.log('[ADMIN] Fetching users from Supabase, search:', search, 'role:', roleFilter);
  let data: UserRow[] | null = null;

  const orderedQuery = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });

  if (orderedQuery.error) {
    console.log('[ADMIN] users ordered query failed, retrying without created_at ordering:', {
      message: orderedQuery.error.message,
      code: orderedQuery.error.code,
      details: orderedQuery.error.details,
    });

    const fallbackQuery = await supabase.from('users').select('*');

    if (fallbackQuery.error) {
      console.log('[ADMIN] users fallback query failed:', {
        message: fallbackQuery.error.message,
        code: fallbackQuery.error.code,
        details: fallbackQuery.error.details,
      });
      throw new Error(fallbackQuery.error.message);
    }

    data = (fallbackQuery.data ?? []) as UserRow[];
  } else {
    data = (orderedQuery.data ?? []) as UserRow[];
  }

  let rows = data ?? [];

  if (roleFilter) {
    rows = rows.filter((row) => row.role === roleFilter);
  }

  if (search) {
    const s = search.toLowerCase();
    rows = rows.filter((row) => {
      const name = row.name?.toLowerCase() ?? '';
      const phone = row.phone?.toLowerCase() ?? '';
      const email = row.email?.toLowerCase() ?? '';
      return name.includes(s) || phone.includes(s) || email.includes(s);
    });
  }

  console.log('[ADMIN] users rows loaded:', rows.length);
  return rows;
}

async function fetchKycSubmissions(statusFilter?: string): Promise<KycSubmissionRow[]> {
  console.log('[ADMIN] Fetching KYC submissions from Supabase, filter:', statusFilter);
  let data: KycSubmissionRow[] | null = null;

  const orderedQuery = await supabase
    .from('kyc_submissions')
    .select('*')
    .order('created_at', { ascending: false });

  if (orderedQuery.error) {
    console.log('[ADMIN] kyc_submissions ordered query failed, retrying without created_at ordering:', {
      message: orderedQuery.error.message,
      code: orderedQuery.error.code,
      details: orderedQuery.error.details,
    });

    const fallbackQuery = await supabase.from('kyc_submissions').select('*');

    if (fallbackQuery.error) {
      console.log('[ADMIN] kyc_submissions fallback query failed:', {
        message: fallbackQuery.error.message,
        code: fallbackQuery.error.code,
        details: fallbackQuery.error.details,
      });
      throw new Error(fallbackQuery.error.message);
    }

    data = (fallbackQuery.data ?? []) as KycSubmissionRow[];
  } else {
    data = (orderedQuery.data ?? []) as KycSubmissionRow[];
  }

  let rows = data ?? [];

  if (rows.length === 0) {
    console.log('[ADMIN] kyc_submissions returned 0 rows, falling back to agents with kyc_status...');
    const agentFallback = await supabase
      .from('agents')
      .select('id, full_name, name, phone, email, state, license_no, kyc_status, updated_at, created_at')
      .in('kyc_status', ['pending', 'approved', 'rejected']);

    if (agentFallback.error) {
      console.log('[ADMIN] agents fallback for kyc failed:', agentFallback.error.message);
    } else {
      const fallbackRows = (agentFallback.data ?? []) as {
        id: string;
        full_name?: string | null;
        name?: string | null;
        phone?: string | null;
        email?: string | null;
        state?: string | null;
        license_no?: string | null;
        kyc_status?: string | null;
        updated_at?: string | null;
        created_at?: string | null;
      }[];

      rows = fallbackRows.map((agent) => ({
        id: `fallback-${agent.id}`,
        agent_id: agent.id,
        full_name: agent.full_name ?? agent.name ?? undefined,
        phone: agent.phone ?? undefined,
        email: agent.email ?? undefined,
        state: agent.state ?? undefined,
        license_no: agent.license_no ?? undefined,
        ic_front_url: undefined,
        ic_back_url: undefined,
        license_url: undefined,
        selfie_url: undefined,
        status: agent.kyc_status ?? 'pending',
        reject_reason: undefined,
        updated_at: agent.updated_at ?? undefined,
        created_at: agent.created_at ?? undefined,
      }));

      console.log('[ADMIN] agents fallback produced kyc rows:', rows.length);
    }
  }

  if (statusFilter) {
    rows = rows.filter((row) => row.status === statusFilter);
  }

  console.log('[ADMIN] kyc submissions rows loaded:', rows.length);
  return rows;
}

function normalizeKycStoragePath(rawPath: string): string {
  const trimmed = rawPath.trim();

  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      const full = `${parsed.pathname}${parsed.search}`;
      const bucketPattern = /(?:^|\/)KYC\/([^?]+)/i;
      const matched = full.match(bucketPattern);

      if (matched?.[1]) {
        return decodeURIComponent(matched[1]).replace(/^\/+/, '');
      }

      const pathname = parsed.pathname.replace(/^\/+/, '');
      return decodeURIComponent(pathname);
    } catch {
      return trimmed;
    }
  }

  let normalized = trimmed.replace(/^\/+/, '');
  normalized = normalized.replace(/^KYC\//i, '');

  return normalized;
}

async function getAdminSignedUrl(filePath: string): Promise<{ url: string | null; error: string | null }> {
  const normalizedPath = normalizeKycStoragePath(filePath);
  console.log('[ADMIN] Getting signed URL for raw path:', filePath, 'normalized:', normalizedPath, 'bucket:', 'KYC');

  if (!normalizedPath) {
    return { url: null, error: 'Storage path is empty.' };
  }

  try {
    const { data, error } = await supabase.storage
      .from('KYC')
      .createSignedUrl(normalizedPath, 60);

    if (!error && data?.signedUrl) {
      return { url: data.signedUrl, error: null };
    }

    const publicData = supabase.storage.from('KYC').getPublicUrl(normalizedPath);
    if (publicData?.data?.publicUrl) {
      console.log('[ADMIN] Signed URL failed, fallback to public URL for path:', normalizedPath, 'error:', error?.message ?? 'none');
      return { url: publicData.data.publicUrl, error: null };
    }

    return { url: null, error: `Storage error: ${error?.message ?? 'Unable to generate preview URL'}` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.log('[ADMIN] getAdminSignedUrl exception:', msg);
    return { url: null, error: msg };
  }
}

export default function AdminDashboardScreen() {
  const { logout, isAdmin } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [appSearch, setAppSearch] = useState<string>('');
  const [appStatusFilter, setAppStatusFilter] = useState<string>('');
  const [agentSearch, setAgentSearch] = useState<string>('');
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [kycStatusFilter, setKycStatusFilter] = useState<string>('');
  const [userSearch, setUserSearch] = useState<string>('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('');

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const kycChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    console.log('[REALTIME] Setting up applications-live channel...');
    const channel = supabase
      .channel('applications-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'applications' },
        (payload) => {
          console.log('[REALTIME] applications-live', payload.eventType, (payload.new as Record<string, unknown>)?.id, (payload.old as Record<string, unknown>)?.id);
          queryClient.invalidateQueries({ queryKey: ['admin', 'applications'] });
          queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
          queryClient.invalidateQueries({ queryKey: ['admin', 'status-counts'] });
        }
      )
      .subscribe((status) => {
        console.log('[REALTIME] applications subscription status:', status);
      });

    channelRef.current = channel;

    return () => {
      console.log('[REALTIME] Cleaning up applications-live channel');
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [queryClient]);

  useEffect(() => {
    console.log('[REALTIME] Setting up kyc-submissions-live channel...');
    const kycChannel = supabase
      .channel('kyc-submissions-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kyc_submissions' },
        (payload) => {
          console.log('[REALTIME] kyc-submissions-live', payload.eventType, (payload.new as Record<string, unknown>)?.id);
          queryClient.invalidateQueries({ queryKey: ['admin', 'kyc-submissions'] });
          queryClient.invalidateQueries({ queryKey: ['admin', 'agents'] });
          queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agents' },
        (payload) => {
          console.log('[REALTIME] agents update', payload.eventType, (payload.new as Record<string, unknown>)?.id);
          queryClient.invalidateQueries({ queryKey: ['admin', 'agents'] });
          queryClient.invalidateQueries({ queryKey: ['admin', 'kyc-submissions'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users' },
        (payload) => {
          console.log('[REALTIME] users update', payload.eventType, (payload.new as Record<string, unknown>)?.id);
          queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
          queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
        }
      )
      .subscribe((status) => {
        console.log('[REALTIME] kyc-submissions subscription status:', status);
      });

    kycChannelRef.current = kycChannel;

    return () => {
      console.log('[REALTIME] Cleaning up kyc-submissions-live channel');
      if (kycChannelRef.current) {
        supabase.removeChannel(kycChannelRef.current);
        kycChannelRef.current = null;
      }
    };
  }, [queryClient]);

  const statsQuery = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: fetchStats,
    refetchInterval: 30000,
  });

  const statusCountsQuery = useQuery({
    queryKey: ['admin', 'status-counts'],
    queryFn: async () => {
      console.log('[ADMIN] Fetching status counts via admin backend...');
      const rows = await fetchApplications('', '');
      const counts = { pending: 0, reviewing: 0, approved: 0, rejected: 0 };
      rows.forEach((row) => {
        const s = row.status as keyof typeof counts;
        if (s in counts) counts[s]++;
      });
      console.log('[ADMIN] Status counts:', counts);
      return counts;
    },
  });

  const appsQuery = useQuery({
    queryKey: ['admin', 'applications', appSearch, appStatusFilter],
    queryFn: () => fetchApplications(appSearch, appStatusFilter),
    enabled: activeTab === 'applications' || activeTab === 'overview',
  });

  const agentsQuery = useQuery({
    queryKey: ['admin', 'agents', agentSearch],
    queryFn: () => fetchAgents(agentSearch),
    enabled: activeTab === 'agents' || activeTab === 'overview',
  });

  const subsQuery = useQuery({
    queryKey: ['admin', 'subscriptions'],
    queryFn: fetchSubscriptions,
    enabled: activeTab === 'subscriptions' || activeTab === 'overview',
  });

  const reportsQuery = useQuery({
    queryKey: ['admin', 'reports'],
    queryFn: fetchReports,
    enabled: activeTab === 'reports' || activeTab === 'overview',
  });

  const kycQuery = useQuery({
    queryKey: ['admin', 'kyc-submissions', kycStatusFilter],
    queryFn: () => fetchKycSubmissions(kycStatusFilter || undefined),
    enabled: activeTab === 'kyc' || activeTab === 'overview',
  });

  const usersQuery = useQuery({
    queryKey: ['admin', 'users', userSearch, userRoleFilter],
    queryFn: () => fetchUsers(userSearch, userRoleFilter),
    enabled: activeTab === 'users' || activeTab === 'overview',
  });

  const kycGroups = useMemo((): KycAgentGroup[] => {
    const subs = kycQuery.data ?? [];
    const agents = agentsQuery.data ?? [];
    return subs.map((sub) => {
      const agent = agents.find((a) => a.id === sub.agent_id);
      const docs: KycDocItem[] = [
        { label: 'IC Front (MyKad)', path: sub.ic_front_url ?? null, docType: 'mykad_front' },
        { label: 'IC Back (MyKad)', path: sub.ic_back_url ?? null, docType: 'mykad_back' },
        { label: 'License', path: sub.license_url ?? null, docType: 'license' },
        { label: 'Selfie', path: sub.selfie_url ?? null, docType: 'selfie' },
      ];
      return {
        agent_id: sub.agent_id,
        agent_name: sub.full_name || agent?.full_name || agent?.name || 'Unknown',
        agent_phone: sub.phone || agent?.phone || '-',
        agent_email: sub.email || agent?.email || '-',
        agent_state: sub.state || agent?.state || '-',
        agent_license: sub.license_no || agent?.license_no || '-',
        submission: sub,
        docs,
        status: sub.status || 'pending',
        reject_reason: sub.reject_reason,
      };
    });
  }, [kycQuery.data, agentsQuery.data]);

  const [rejectModalVisible, setRejectModalVisible] = useState<boolean>(false);
  const [rejectModalReason, setRejectModalReason] = useState<string>('');
  const [rejectModalTarget, setRejectModalTarget] = useState<{ agentId: string; submissionId: string } | null>(null);

  const openRejectModal = useCallback((agentId: string, submissionId: string) => {
    setRejectModalTarget({ agentId, submissionId });
    setRejectModalReason('');
    setRejectModalVisible(true);
  }, []);

  const approveKycMutation = useMutation({
    mutationFn: async ({ agentId, submissionId }: { agentId: string; submissionId: string }) => {
      console.log('[ADMIN] Approving KYC for agent:', agentId, 'submission:', submissionId);

      const { error: kycError } = await supabase
        .from('kyc_submissions')
        .update({
          status: 'approved',
          reject_reason: null,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', submissionId);
      if (kycError) {
        console.log('[ADMIN] KYC approve error:', JSON.stringify(kycError));
        throw new Error(`KYC update failed: ${kycError.message} (code: ${kycError.code})`);
      }

      const { error: agentError } = await supabase
        .from('agents')
        .update({
          verified: true,
          kyc_status: 'approved',
          status: 'approved',
          reject_reason: null,
        })
        .eq('id', agentId);
      if (agentError) {
        console.log('[ADMIN] Agent approve error:', JSON.stringify(agentError));
        throw new Error(`Agent update failed: ${agentError.message} (code: ${agentError.code})`);
      }

      console.log('[ADMIN] KYC approved successfully for agent:', agentId);

      try {
        const { data: agentData } = await supabase
          .from('agents')
          .select('referred_by_agent_id')
          .eq('id', agentId)
          .single();

        if (agentData?.referred_by_agent_id) {
          console.log('[ADMIN] Agent has referrer:', agentData.referred_by_agent_id, '- awarding referral bonus');
          const creditResult = await addAgentCredits(
            agentData.referred_by_agent_id,
            20,
            'referral_kyc_bonus',
            agentId,
            `KYC approved for referred agent ${agentId.slice(0, 8)}`
          );
          if (creditResult.success) {
            console.log('[ADMIN] Referral bonus awarded to:', agentData.referred_by_agent_id);
          } else {
            console.log('[ADMIN] Referral bonus may already exist (idempotent):', creditResult.error);
          }
        }
      } catch (creditErr) {
        console.log('[ADMIN] Non-blocking referral credit error:', creditErr);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'kyc-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'agents'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: Error) => {
      console.log('[ADMIN] Approve mutation error:', error.message);
      Alert.alert('Approve Error', error.message);
    },
  });

  const rejectKycMutation = useMutation({
    mutationFn: async ({ agentId, submissionId, reason }: { agentId: string; submissionId: string; reason: string }) => {
      console.log('[ADMIN] Rejecting KYC for agent:', agentId, 'reason:', reason);

      const { error: kycError } = await supabase
        .from('kyc_submissions')
        .update({
          status: 'rejected',
          reject_reason: reason,
          rejected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', submissionId);
      if (kycError) {
        console.log('[ADMIN] KYC reject error:', JSON.stringify(kycError));
        throw new Error(`KYC update failed: ${kycError.message} (code: ${kycError.code})`);
      }

      const { error: agentError } = await supabase
        .from('agents')
        .update({
          verified: false,
          kyc_status: 'rejected',
          status: 'rejected',
          reject_reason: reason,
        })
        .eq('id', agentId);
      if (agentError) {
        console.log('[ADMIN] Agent reject error:', JSON.stringify(agentError));
        throw new Error(`Agent update failed: ${agentError.message} (code: ${agentError.code})`);
      }

      console.log('[ADMIN] KYC rejected successfully for agent:', agentId);
    },
    onSuccess: () => {
      setRejectModalVisible(false);
      setRejectModalTarget(null);
      setRejectModalReason('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'kyc-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'agents'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: Error) => {
      console.log('[ADMIN] Reject mutation error:', error.message);
      Alert.alert('Reject Error', error.message);
    },
  });

  const rejectKyc = rejectKycMutation.mutate;

  const handleRejectModalConfirm = useCallback(() => {
    if (!rejectModalReason.trim()) {
      Alert.alert('Required', 'Please enter a rejection reason.');
      return;
    }
    if (!rejectModalTarget) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    rejectKyc({
      agentId: rejectModalTarget.agentId,
      submissionId: rejectModalTarget.submissionId,
      reason: rejectModalReason.trim(),
    });
  }, [rejectModalReason, rejectModalTarget, rejectKyc]);

  const updateAppStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      console.log('[ADMIN] Updating application status:', id, '->', status);
      const { error } = await supabase
        .from('applications')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'applications'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message);
    },
  });

  const toggleAgentVerifiedMutation = useMutation({
    mutationFn: async ({ id, verified }: { id: string; verified: boolean }) => {
      console.log('[ADMIN] Toggling agent verified:', id, '->', verified);
      const now = new Date().toISOString();

      const { data: updatedAgents, error: agentError } = await supabase
        .from('agents')
        .update({
          verified,
          kyc_status: verified ? 'approved' : 'pending',
          status: verified ? 'approved' : 'pending',
          reject_reason: null,
          updated_at: now,
        })
        .eq('id', id)
        .select('id');

      if (agentError) {
        console.log('[ADMIN] agents verify update error:', agentError.message);
        throw new Error(agentError.message);
      }

      if ((updatedAgents ?? []).length > 0) {
        console.log('[ADMIN] Agent verified state updated in agents table:', id);
        return;
      }

      console.log('[ADMIN] No agents row updated, falling back to users table for id:', id);

      const { data: updatedUsers, error: userError } = await supabase
        .from('users')
        .update({
          is_verified: verified,
          kyc_status: verified ? 'approved' : 'pending',
          updated_at: now,
        })
        .eq('id', id)
        .eq('role', 'agent')
        .select('id');

      if (userError) {
        console.log('[ADMIN] users verify fallback update error:', userError.message);
        throw new Error(userError.message);
      }

      if ((updatedUsers ?? []).length === 0) {
        throw new Error('Agent not found in agents/users table.');
      }

      console.log('[ADMIN] Agent verified state updated in users table fallback:', id);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'agents'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'kyc-submissions'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Success', variables.verified ? 'Agent verified successfully.' : 'Agent verification revoked.');
    },
    onError: (error: Error) => {
      console.log('[ADMIN] Toggle verify mutation error:', error.message);
      Alert.alert('Verify Agent Failed', error.message);
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await queryClient.invalidateQueries({ queryKey: ['admin'] });
    setRefreshing(false);
  }, [queryClient]);

  const handleLogout = useCallback(() => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          logout();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.replace('/');
        },
      },
    ]);
  }, [logout, router]);

  if (!isAdmin) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.accessDenied}>
          <Shield size={48} color="#EF4444" />
          <Text style={styles.accessDeniedTitle}>Access Denied</Text>
          <Text style={styles.accessDeniedText}>You do not have admin privileges.</Text>
          <Pressable style={styles.backBtn} onPress={() => router.replace('/')}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const stats = statsQuery.data;
  const isLoading = statsQuery.isLoading;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.adminBadge}>
            <Shield size={14} color="#3B82F6" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Dashboard</Text>
            <Text style={styles.headerSubtitle}>TrustFin Admin</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.headerIconBtn} onPress={onRefresh} testID="refresh-btn">
            <RefreshCw size={18} color="#94A3B8" />
          </Pressable>
          <Pressable style={styles.headerIconBtn} onPress={handleLogout} testID="logout-btn">
            <LogOut size={18} color="#EF4444" />
          </Pressable>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabBarContent}
        style={styles.tabBar}
      >
        {([
          { key: 'overview', label: 'Overview', icon: BarChart3 },
          { key: 'users', label: 'Users', icon: Users },
          { key: 'applications', label: 'Cases', icon: FileText },
          { key: 'agents', label: 'Agents', icon: Users },
          { key: 'kyc', label: 'KYC', icon: ShieldCheck },
          { key: 'subscriptions', label: 'Subs', icon: CreditCard },
          { key: 'reports', label: 'Reports', icon: Flag },
        ] as { key: TabType; label: string; icon: typeof BarChart3 }[]).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => { setActiveTab(tab.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Icon size={15} color={isActive ? '#3B82F6' : '#64748B'} />
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
        }
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.loadingText}>Loading dashboard...</Text>
          </View>
        ) : (
          <>
            {activeTab === 'overview' && stats && (
              <OverviewTab stats={stats} statusCounts={statusCountsQuery.data ?? { pending: 0, reviewing: 0, approved: 0, rejected: 0 }} />
            )}
            {activeTab === 'users' && (
              <UsersTab
                users={usersQuery.data ?? []}
                isLoading={usersQuery.isLoading}
                searchQuery={userSearch}
                onSearchChange={setUserSearch}
                roleFilter={userRoleFilter}
                onRoleFilterChange={setUserRoleFilter}
              />
            )}
            {activeTab === 'applications' && (
              <ApplicationsTab
                applications={appsQuery.data ?? []}
                isLoading={appsQuery.isLoading}
                searchQuery={appSearch}
                onSearchChange={setAppSearch}
                filterStatus={appStatusFilter}
                onFilterStatusChange={setAppStatusFilter}
                onUpdateStatus={(id, status) => updateAppStatusMutation.mutate({ id, status })}
                isUpdating={updateAppStatusMutation.isPending}
              />
            )}
            {activeTab === 'agents' && (
              <AgentsTab
                agents={agentsQuery.data ?? []}
                isLoading={agentsQuery.isLoading}
                searchQuery={agentSearch}
                onSearchChange={setAgentSearch}
                onToggleVerified={(id, verified) => toggleAgentVerifiedMutation.mutate({ id, verified })}
                isUpdating={toggleAgentVerifiedMutation.isPending}
              />
            )}
            {activeTab === 'kyc' && (
              <KycTab
                groups={kycGroups}
                isLoading={kycQuery.isLoading}
                onApprove={(agentId, submissionId) => approveKycMutation.mutate({ agentId, submissionId })}
                onReject={openRejectModal}
                isUpdating={approveKycMutation.isPending || rejectKycMutation.isPending}
                statusFilter={kycStatusFilter}
                onStatusFilterChange={setKycStatusFilter}
              />
            )}
            {activeTab === 'subscriptions' && (
              <SubscriptionsTab
                subscriptions={subsQuery.data ?? []}
                isLoading={subsQuery.isLoading}
              />
            )}
            {activeTab === 'reports' && (
              <ReportsTab
                reports={reportsQuery.data ?? []}
                isLoading={reportsQuery.isLoading}
              />
            )}
          </>
        )}
      </ScrollView>

      <Modal
        visible={rejectModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => { setRejectModalVisible(false); setRejectModalTarget(null); }}
      >
        <Pressable
          style={styles.rejectModalOverlay}
          onPress={() => { setRejectModalVisible(false); setRejectModalTarget(null); }}
        >
          <Pressable style={styles.rejectModalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.rejectModalHeader}>
              <XCircle size={24} color="#EF4444" />
              <Text style={styles.rejectModalTitle}>Reject KYC</Text>
            </View>
            <Text style={styles.rejectModalDesc}>
              Please provide a reason for rejecting this KYC submission. The agent will see this reason.
            </Text>
            <TextInput
              style={styles.rejectModalInput}
              placeholder="Enter rejection reason..."
              placeholderTextColor="#64748B"
              value={rejectModalReason}
              onChangeText={setRejectModalReason}
              multiline
              numberOfLines={4}
              autoFocus
              testID="reject-modal-reason-input"
            />
            <View style={styles.rejectModalActions}>
              <Pressable
                style={styles.rejectModalCancelBtn}
                onPress={() => { setRejectModalVisible(false); setRejectModalTarget(null); setRejectModalReason(''); }}
              >
                <Text style={styles.rejectModalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.rejectModalConfirmBtn, !rejectModalReason.trim() && { opacity: 0.5 }]}
                onPress={handleRejectModalConfirm}
                disabled={rejectKycMutation.isPending || !rejectModalReason.trim()}
              >
                {rejectKycMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.rejectModalConfirmText}>Confirm Reject</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

interface StatusCounts {
  pending: number;
  reviewing: number;
  approved: number;
  rejected: number;
}

const OverviewTab = React.memo(function OverviewTab({ stats, statusCounts }: { stats: DashboardStats; statusCounts: StatusCounts }) {
  return (
    <View style={styles.tabContent}>
      <View style={styles.statsGrid}>
        <StatCard
          icon={<Users size={22} color="#8B5CF6" />}
          label="Users"
          value={stats.totalUsers.toString()}
          bgColor="#2E1065"
          accentColor="#8B5CF6"
        />
        <StatCard
          icon={<FileText size={22} color="#3B82F6" />}
          label="Applications"
          value={stats.totalApplications.toString()}
          bgColor="#172554"
          accentColor="#3B82F6"
        />
        <StatCard
          icon={<Users size={22} color="#10B981" />}
          label="Agents"
          value={stats.totalAgents.toString()}
          bgColor="#052E16"
          accentColor="#10B981"
        />
        <StatCard
          icon={<CreditCard size={22} color="#F59E0B" />}
          label="Subscriptions"
          value={stats.totalSubscriptions.toString()}
          bgColor="#422006"
          accentColor="#F59E0B"
        />
        <StatCard
          icon={<Flag size={22} color="#EF4444" />}
          label="Reports"
          value={stats.totalReports.toString()}
          bgColor="#450A0A"
          accentColor="#EF4444"
        />
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionCardTitle}>Application Status</Text>
        <View style={styles.miniStatsRow}>
          <MiniStat label="Pending" value={statusCounts.pending} color="#F59E0B" />
          <MiniStat label="Reviewing" value={statusCounts.reviewing} color="#3B82F6" />
          <MiniStat label="Approved" value={statusCounts.approved} color="#10B981" />
          <MiniStat label="Rejected" value={statusCounts.rejected} color="#EF4444" />
        </View>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionCardTitle}>Quick Summary</Text>
        <View style={styles.summaryRow}>
          <View style={[styles.summaryDot, { backgroundColor: '#8B5CF6' }]} />
          <Text style={styles.summaryText}>
            {stats.totalUsers} registered users
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <View style={styles.summaryDot} />
          <Text style={styles.summaryText}>
            {stats.totalApplications} total loan applications
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <View style={[styles.summaryDot, { backgroundColor: '#10B981' }]} />
          <Text style={styles.summaryText}>
            {stats.totalAgents} registered agents
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <View style={[styles.summaryDot, { backgroundColor: '#F59E0B' }]} />
          <Text style={styles.summaryText}>
            {stats.totalSubscriptions} active subscriptions
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <View style={[styles.summaryDot, { backgroundColor: '#EF4444' }]} />
          <Text style={styles.summaryText}>
            {stats.totalReports} reports filed
          </Text>
        </View>
      </View>
    </View>
  );
});

const StatCard = React.memo(function StatCard({
  icon,
  label,
  value,
  bgColor,
  accentColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  bgColor: string;
  accentColor: string;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: bgColor, borderColor: accentColor + '30' }]}>
      <View style={styles.statCardTop}>
        {icon}
      </View>
      <Text style={[styles.statCardValue, { color: accentColor }]}>{value}</Text>
      <Text style={styles.statCardLabel}>{label}</Text>
    </View>
  );
});

const ApplicationsTab = React.memo(function ApplicationsTab({
  applications,
  isLoading,
  searchQuery,
  onSearchChange,
  filterStatus,
  onFilterStatusChange,
  onUpdateStatus,
  isUpdating,
}: {
  applications: ApplicationRow[];
  isLoading: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filterStatus: string;
  onFilterStatusChange: (s: string) => void;
  onUpdateStatus: (id: string, status: string) => void;
  isUpdating: boolean;
}) {
  const statusCounts = useMemo(() => {
    const counts = { pending: 0, reviewing: 0, approved: 0, rejected: 0 };
    applications.forEach((a) => {
      const s = a.status as keyof typeof counts;
      if (s in counts) counts[s]++;
    });
    return counts;
  }, [applications]);

  return (
    <View style={styles.tabContent}>
      <View style={styles.miniStatsRow}>
        <MiniStat label="Pending" value={statusCounts.pending} color="#F59E0B" />
        <MiniStat label="Reviewing" value={statusCounts.reviewing} color="#3B82F6" />
        <MiniStat label="Approved" value={statusCounts.approved} color="#10B981" />
        <MiniStat label="Rejected" value={statusCounts.rejected} color="#EF4444" />
      </View>

      <View style={styles.searchBar}>
        <Search size={18} color="#64748B" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or phone..."
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={onSearchChange}
          testID="app-search-input"
        />
        {searchQuery ? (
          <Pressable onPress={() => onSearchChange('')}>
            <X size={16} color="#94A3B8" />
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersScroll}>
        {['', 'pending', 'reviewing', 'approved', 'rejected'].map((s) => (
          <Pressable
            key={s}
            style={[styles.filterChip, filterStatus === s && styles.filterChipActive]}
            onPress={() => onFilterStatusChange(s)}
          >
            <Text style={[styles.filterChipText, filterStatus === s && styles.filterChipTextActive]}>
              {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {isLoading ? (
        <ActivityIndicator size="small" color="#3B82F6" style={{ marginTop: 20 }} />
      ) : (
        <View style={styles.listContainer}>
          <Text style={styles.listCount}>{applications.length} cases</Text>
          {applications.map((app) => (
            <ApplicationCard
              key={app.id}
              app={app}
              onUpdateStatus={onUpdateStatus}
              isUpdating={isUpdating}
            />
          ))}
          {applications.length === 0 && (
            <Text style={styles.emptyText}>No applications found</Text>
          )}
        </View>
      )}
    </View>
  );
});

const MiniStat = React.memo(function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.miniStat, { borderLeftColor: color }]}>
      <Text style={[styles.miniStatValue, { color }]}>{value}</Text>
      <Text style={styles.miniStatLabel}>{label}</Text>
    </View>
  );
});

const ApplicationCard = React.memo(function ApplicationCard({
  app,
  onUpdateStatus,
  isUpdating,
}: {
  app: ApplicationRow;
  onUpdateStatus: (id: string, status: string) => void;
  isUpdating: boolean;
}) {
  const [expanded, setExpanded] = useState<boolean>(false);

  const statusConfig = useMemo(() => {
    switch (app.status) {
      case 'approved': return { bg: '#052E16', text: '#10B981', icon: CheckCircle };
      case 'rejected': return { bg: '#450A0A', text: '#EF4444', icon: XCircle };
      case 'reviewing': return { bg: '#172554', text: '#3B82F6', icon: Eye };
      default: return { bg: '#422006', text: '#F59E0B', icon: AlertCircle };
    }
  }, [app.status]);

  const StatusIcon = statusConfig.icon;

  return (
    <Pressable style={styles.card} onPress={() => setExpanded(!expanded)}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View style={[styles.statusDot, { backgroundColor: statusConfig.text }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>{app.full_name || 'Unknown'}</Text>
            <Text style={styles.cardSubtitle}>{app.loan_type} · RM {app.loan_amount}</Text>
          </View>
        </View>
        <View style={styles.cardHeaderRight}>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
            <StatusIcon size={11} color={statusConfig.text} />
            <Text style={[styles.statusBadgeText, { color: statusConfig.text }]}>{app.status}</Text>
          </View>
          <ChevronRight size={14} color="#475569" style={expanded ? { transform: [{ rotate: '90deg' }] } : undefined} />
        </View>
      </View>

      {expanded && (
        <View style={styles.cardDetails}>
          <DetailRow label="Phone" value={app.phone || '-'} />
          <DetailRow label="State" value={app.state || '-'} />
          <DetailRow label="Mode" value={app.mode === 'premium' ? 'Premium' : 'Basic'} />
          {app.monthly_income && <DetailRow label="Income" value={`RM ${app.monthly_income}`} />}
          {app.occupation && <DetailRow label="Occupation" value={app.occupation} />}
          {app.lead_score != null && <DetailRow label="Lead Score" value={app.lead_score.toString()} />}
          <DetailRow label="Submitted" value={new Date(app.created_at).toLocaleString()} />

          <View style={styles.statusActions}>
            <Text style={styles.statusActionsLabel}>Update Status:</Text>
            <View style={styles.statusBtnsRow}>
              {(['pending', 'reviewing', 'approved', 'rejected'] as const).map((s) => {
                const colors: Record<string, { bg: string; text: string }> = {
                  pending: { bg: '#422006', text: '#F59E0B' },
                  reviewing: { bg: '#172554', text: '#3B82F6' },
                  approved: { bg: '#052E16', text: '#10B981' },
                  rejected: { bg: '#450A0A', text: '#EF4444' },
                };
                const c = colors[s];
                return (
                  <Pressable
                    key={s}
                    style={[styles.statusBtn, { backgroundColor: c.bg }, app.status === s && styles.statusBtnSelected]}
                    onPress={() => {
                      if (app.status !== s) {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        onUpdateStatus(app.id, s);
                      }
                    }}
                    disabled={isUpdating || app.status === s}
                  >
                    <Text style={[styles.statusBtnText, { color: c.text }]}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      )}
    </Pressable>
  );
});

const AgentsTab = React.memo(function AgentsTab({
  agents,
  isLoading,
  searchQuery,
  onSearchChange,
  onToggleVerified,
  isUpdating,
}: {
  agents: AgentRow[];
  isLoading: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onToggleVerified: (id: string, verified: boolean) => void;
  isUpdating: boolean;
}) {
  const verifiedCount = useMemo(() => agents.filter(a => a.verified).length, [agents]);

  return (
    <View style={styles.tabContent}>
      <View style={styles.miniStatsRow}>
        <MiniStat label="Total" value={agents.length} color="#3B82F6" />
        <MiniStat label="Verified" value={verifiedCount} color="#10B981" />
        <MiniStat label="Unverified" value={agents.length - verifiedCount} color="#F59E0B" />
      </View>

      <View style={styles.searchBar}>
        <Search size={18} color="#64748B" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or phone..."
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={onSearchChange}
          testID="agent-search-input"
        />
        {searchQuery ? (
          <Pressable onPress={() => onSearchChange('')}>
            <X size={16} color="#94A3B8" />
          </Pressable>
        ) : null}
      </View>

      {isLoading ? (
        <ActivityIndicator size="small" color="#3B82F6" style={{ marginTop: 20 }} />
      ) : (
        <View style={styles.listContainer}>
          <Text style={styles.listCount}>{agents.length} agents</Text>
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onToggleVerified={onToggleVerified}
              isUpdating={isUpdating}
            />
          ))}
          {agents.length === 0 && (
            <Text style={styles.emptyText}>No agents found</Text>
          )}
        </View>
      )}
    </View>
  );
});

const AgentCard = React.memo(function AgentCard({
  agent,
  onToggleVerified,
  isUpdating,
}: {
  agent: AgentRow;
  onToggleVerified: (id: string, verified: boolean) => void;
  isUpdating: boolean;
}) {
  const [expanded, setExpanded] = useState<boolean>(false);

  return (
    <Pressable style={styles.card} onPress={() => setExpanded(!expanded)}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View style={[styles.statusDot, { backgroundColor: agent.verified ? '#10B981' : '#F59E0B' }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>{agent.full_name || agent.name || 'Unknown'}</Text>
            <Text style={styles.cardSubtitle}>{agent.state || 'N/A'} · {agent.agent_type || 'individual'}</Text>
          </View>
        </View>
        <View style={styles.cardHeaderRight}>
          <View style={[styles.statusBadge, { backgroundColor: agent.verified ? '#052E16' : '#422006' }]}>
            {agent.verified ? (
              <BadgeCheck size={11} color="#10B981" />
            ) : (
              <Clock size={11} color="#F59E0B" />
            )}
            <Text style={[styles.statusBadgeText, { color: agent.verified ? '#10B981' : '#F59E0B' }]}>
              {agent.verified ? 'Verified' : 'Pending'}
            </Text>
          </View>
          <ChevronRight size={14} color="#475569" style={expanded ? { transform: [{ rotate: '90deg' }] } : undefined} />
        </View>
      </View>

      {expanded && (
        <View style={styles.cardDetails}>
          <DetailRow label="Phone" value={agent.phone || '-'} />
          <DetailRow label="Email" value={agent.email || '-'} />
          <DetailRow label="Company" value={agent.company_name || agent.company || '-'} />
          <DetailRow label="License" value={agent.license_no || '-'} />
          <DetailRow label="District" value={agent.district || '-'} />
          <DetailRow label="Rating" value={agent.rating?.toString() || '0'} />
          <DetailRow label="Joined" value={new Date(agent.created_at).toLocaleDateString()} />

          <Pressable
            style={[
              styles.verifyBtn,
              { backgroundColor: agent.verified ? '#450A0A' : '#052E16' },
            ]}
            onPress={(event) => {
              event.stopPropagation();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onToggleVerified(agent.id, !agent.verified);
            }}
            disabled={isUpdating}
            testID={`verify-agent-btn-${agent.id}`}
          >
            {agent.verified ? (
              <>
                <Ban size={14} color="#EF4444" />
                <Text style={[styles.verifyBtnText, { color: '#EF4444' }]}>Revoke Verification</Text>
              </>
            ) : (
              <>
                <BadgeCheck size={14} color="#10B981" />
                <Text style={[styles.verifyBtnText, { color: '#10B981' }]}>Verify Agent</Text>
              </>
            )}
          </Pressable>
        </View>
      )}
    </Pressable>
  );
});

const SubscriptionsTab = React.memo(function SubscriptionsTab({
  subscriptions,
  isLoading,
}: {
  subscriptions: SubscriptionRow[];
  isLoading: boolean;
}) {
  const planCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    subscriptions.forEach((s) => {
      counts[s.plan] = (counts[s.plan] || 0) + 1;
    });
    return counts;
  }, [subscriptions]);

  return (
    <View style={styles.tabContent}>
      <View style={styles.miniStatsRow}>
        <MiniStat label="Total" value={subscriptions.length} color="#3B82F6" />
        <MiniStat label="Basic" value={planCounts['basic'] || 0} color="#64748B" />
        <MiniStat label="Pro" value={planCounts['pro'] || 0} color="#F59E0B" />
        <MiniStat label="Elite" value={planCounts['elite'] || 0} color="#8B5CF6" />
      </View>

      {isLoading ? (
        <ActivityIndicator size="small" color="#3B82F6" style={{ marginTop: 20 }} />
      ) : (
        <View style={styles.listContainer}>
          <Text style={styles.listCount}>{subscriptions.length} subscriptions</Text>
          {subscriptions.map((sub) => (
            <SubscriptionCard key={sub.id} sub={sub} />
          ))}
          {subscriptions.length === 0 && (
            <Text style={styles.emptyText}>No subscriptions found</Text>
          )}
        </View>
      )}
    </View>
  );
});

const SubscriptionCard = React.memo(function SubscriptionCard({ sub }: { sub: SubscriptionRow }) {
  const planColor = useMemo(() => {
    switch (sub.plan) {
      case 'elite': return '#8B5CF6';
      case 'pro': return '#F59E0B';
      default: return '#64748B';
    }
  }, [sub.plan]);

  const isActive = sub.status === 'active';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View style={[styles.statusDot, { backgroundColor: isActive ? '#10B981' : '#64748B' }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Agent: {sub.agent_id.slice(0, 8)}...</Text>
            <Text style={styles.cardSubtitle}>RM {sub.price} · {sub.leads_used}/{sub.lead_limit === -1 ? '∞' : sub.lead_limit} leads</Text>
          </View>
        </View>
        <View style={styles.cardHeaderRight}>
          <View style={[styles.statusBadge, { backgroundColor: planColor + '20' }]}>
            <CreditCard size={11} color={planColor} />
            <Text style={[styles.statusBadgeText, { color: planColor }]}>
              {sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1)}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.cardFooterText}>
          {new Date(sub.start_date).toLocaleDateString()} — {new Date(sub.end_date).toLocaleDateString()}
        </Text>
        <View style={[styles.statusDotSmall, { backgroundColor: isActive ? '#10B981' : '#64748B' }]} />
        <Text style={[styles.cardFooterStatus, { color: isActive ? '#10B981' : '#64748B' }]}>
          {sub.status}
        </Text>
      </View>
    </View>
  );
});

const ReportsTab = React.memo(function ReportsTab({
  reports,
  isLoading,
}: {
  reports: ReportRow[];
  isLoading: boolean;
}) {
  return (
    <View style={styles.tabContent}>
      {isLoading ? (
        <ActivityIndicator size="small" color="#3B82F6" style={{ marginTop: 20 }} />
      ) : (
        <View style={styles.listContainer}>
          <Text style={styles.listCount}>{reports.length} reports</Text>
          {reports.map((report) => (
            <ReportCard key={report.id} report={report} />
          ))}
          {reports.length === 0 && (
            <Text style={styles.emptyText}>No reports found</Text>
          )}
        </View>
      )}
    </View>
  );
});

const ReportCard = React.memo(function ReportCard({ report }: { report: ReportRow }) {
  const statusColor = report.status === 'resolved' ? '#10B981' : report.status === 'dismissed' ? '#64748B' : '#F59E0B';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Flag size={16} color="#EF4444" />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>{report.reason || 'No reason'}</Text>
            <Text style={styles.cardSubtitle} numberOfLines={2}>{report.description || '-'}</Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
          <Text style={[styles.statusBadgeText, { color: statusColor }]}>{report.status || 'pending'}</Text>
        </View>
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.cardFooterText}>
          Reporter: {report.reporter_id?.slice(0, 8) || '-'}... → {report.reported_id?.slice(0, 8) || '-'}...
        </Text>
        <Text style={styles.cardFooterText}>
          {report.created_at ? new Date(report.created_at).toLocaleDateString() : '-'}
        </Text>
      </View>
    </View>
  );
});

const DetailRow = React.memo(function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
});

const UsersTab = React.memo(function UsersTab({
  users,
  isLoading,
  searchQuery,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
}: {
  users: UserRow[];
  isLoading: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  roleFilter: string;
  onRoleFilterChange: (r: string) => void;
}) {
  const roleCounts = useMemo(() => {
    const counts = { borrower: 0, agent: 0, admin: 0, guest: 0 };
    users.forEach((u) => {
      const r = u.role as keyof typeof counts;
      if (r in counts) counts[r]++;
    });
    return counts;
  }, [users]);

  const onlineCount = useMemo(() => users.filter(u => u.is_online).length, [users]);

  return (
    <View style={styles.tabContent}>
      <View style={styles.miniStatsRow}>
        <MiniStat label="Total" value={users.length} color="#3B82F6" />
        <MiniStat label="Borrowers" value={roleCounts.borrower} color="#10B981" />
        <MiniStat label="Agents" value={roleCounts.agent} color="#F59E0B" />
        <MiniStat label="Online" value={onlineCount} color="#8B5CF6" />
      </View>

      <View style={styles.searchBar}>
        <Search size={18} color="#64748B" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, phone or email..."
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={onSearchChange}
          testID="user-search-input"
        />
        {searchQuery ? (
          <Pressable onPress={() => onSearchChange('')}>
            <X size={16} color="#94A3B8" />
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersScroll}>
        {['', 'borrower', 'agent', 'admin'].map((r) => (
          <Pressable
            key={r}
            style={[styles.filterChip, roleFilter === r && styles.filterChipActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onRoleFilterChange(r);
            }}
          >
            <Text style={[styles.filterChipText, roleFilter === r && styles.filterChipTextActive]}>
              {r === '' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {isLoading ? (
        <ActivityIndicator size="small" color="#3B82F6" style={{ marginTop: 20 }} />
      ) : (
        <View style={styles.listContainer}>
          <Text style={styles.listCount}>{users.length} users</Text>
          {users.map((u) => (
            <UserCard key={u.id} user={u} />
          ))}
          {users.length === 0 && (
            <Text style={styles.emptyText}>No users found</Text>
          )}
        </View>
      )}
    </View>
  );
});

const UserCard = React.memo(function UserCard({ user }: { user: UserRow }) {
  const [expanded, setExpanded] = useState<boolean>(false);

  const roleColors: Record<string, { bg: string; text: string }> = {
    admin: { bg: '#450A0A', text: '#EF4444' },
    agent: { bg: '#422006', text: '#F59E0B' },
    borrower: { bg: '#052E16', text: '#10B981' },
    guest: { bg: '#1E293B', text: '#64748B' },
  };
  const rc = roleColors[user.role] ?? roleColors.guest;

  return (
    <Pressable style={styles.card} onPress={() => setExpanded(!expanded)}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View style={[styles.statusDot, { backgroundColor: user.is_online ? '#10B981' : '#475569' }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>{user.name || 'Unnamed'}</Text>
            <Text style={styles.cardSubtitle}>{user.phone || user.email || 'No contact'}</Text>
          </View>
        </View>
        <View style={styles.cardHeaderRight}>
          <View style={[styles.statusBadge, { backgroundColor: rc.bg }]}>
            <Text style={[styles.statusBadgeText, { color: rc.text }]}>{user.role}</Text>
          </View>
          <ChevronRight size={14} color="#475569" style={expanded ? { transform: [{ rotate: '90deg' }] } : undefined} />
        </View>
      </View>

      {expanded && (
        <View style={styles.cardDetails}>
          <DetailRow label="ID" value={user.id.slice(0, 20) + (user.id.length > 20 ? '...' : '')} />
          <DetailRow label="Name" value={user.name || '-'} />
          <DetailRow label="Phone" value={user.phone || '-'} />
          <DetailRow label="Email" value={user.email || '-'} />
          <DetailRow label="Role" value={user.role} />
          <DetailRow label="Verified" value={user.is_verified ? 'Yes' : 'No'} />
          <DetailRow label="State" value={user.state || '-'} />
          <DetailRow label="KYC Status" value={user.kyc_status || '-'} />
          <DetailRow label="Online" value={user.is_online ? 'Yes' : 'No'} />
          <DetailRow label="Last Active" value={user.last_active_at ? new Date(user.last_active_at).toLocaleString() : '-'} />
          <DetailRow label="Registered" value={new Date(user.created_at).toLocaleString()} />
        </View>
      )}
    </Pressable>
  );
});

const KycTab = React.memo(function KycTab({
  groups,
  isLoading,
  onApprove,
  onReject,
  isUpdating,
  statusFilter,
  onStatusFilterChange,
}: {
  groups: KycAgentGroup[];
  isLoading: boolean;
  onApprove: (agentId: string, submissionId: string) => void;
  onReject: (agentId: string, submissionId: string) => void;
  isUpdating: boolean;
  statusFilter: string;
  onStatusFilterChange: (s: string) => void;
}) {
  const pendingCount = useMemo(() => groups.filter((g) => g.status === 'pending').length, [groups]);
  const approvedCount = useMemo(() => groups.filter((g) => g.status === 'approved').length, [groups]);
  const rejectedCount = useMemo(() => groups.filter((g) => g.status === 'rejected').length, [groups]);

  return (
    <View style={styles.tabContent}>
      <View style={styles.miniStatsRow}>
        <MiniStat label="Total" value={groups.length} color="#3B82F6" />
        <MiniStat label="Pending" value={pendingCount} color="#F59E0B" />
        <MiniStat label="Approved" value={approvedCount} color="#10B981" />
        <MiniStat label="Rejected" value={rejectedCount} color="#EF4444" />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersScroll}>
        {['', 'pending', 'approved', 'rejected'].map((s) => (
          <Pressable
            key={s}
            style={[styles.filterChip, statusFilter === s && styles.filterChipActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onStatusFilterChange(s);
            }}
          >
            <Text style={[styles.filterChipText, statusFilter === s && styles.filterChipTextActive]}>
              {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {isLoading ? (
        <ActivityIndicator size="small" color="#3B82F6" style={{ marginTop: 20 }} />
      ) : (
        <View style={styles.listContainer}>
          <Text style={styles.listCount}>{groups.length} submissions</Text>
          {groups.map((group) => (
            <KycAgentCard
              key={group.submission.id}
              group={group}
              onApprove={onApprove}
              onReject={onReject}
              isUpdating={isUpdating}
            />
          ))}
          {groups.length === 0 && (
            <View style={styles.emptyContainer}>
              <ShieldCheck size={40} color="#334155" />
              <Text style={styles.emptyText}>No KYC submissions found</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
});

const KycAgentCard = React.memo(function KycAgentCard({
  group,
  onApprove,
  onReject,
  isUpdating,
}: {
  group: KycAgentGroup;
  onApprove: (agentId: string, submissionId: string) => void;
  onReject: (agentId: string, submissionId: string) => void;
  isUpdating: boolean;
}) {
  const [expanded, setExpanded] = useState<boolean>(false);

  const statusColors: Record<string, { bg: string; text: string }> = {
    approved: { bg: '#052E16', text: '#10B981' },
    rejected: { bg: '#450A0A', text: '#EF4444' },
    pending: { bg: '#422006', text: '#F59E0B' },
  };
  const sc = statusColors[group.status] ?? statusColors.pending;
  const uploadedCount = group.docs.filter((d) => !!d.path).length;

  return (
    <Pressable style={styles.card} onPress={() => setExpanded(!expanded)}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View style={[styles.statusDot, { backgroundColor: sc.text }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>{group.agent_name}</Text>
            <Text style={styles.cardSubtitle}>{group.agent_phone} · {uploadedCount}/4 docs</Text>
          </View>
        </View>
        <View style={styles.cardHeaderRight}>
          <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
            <Text style={[styles.statusBadgeText, { color: sc.text }]}>{group.status}</Text>
          </View>
          <ChevronRight size={14} color="#475569" style={expanded ? { transform: [{ rotate: '90deg' }] } : undefined} />
        </View>
      </View>

      {expanded && (
        <View style={styles.cardDetails}>
          <View style={styles.kycInfoSection}>
            <Text style={styles.kycInfoTitle}>Agent Details</Text>
            <DetailRow label="Full Name" value={group.agent_name} />
            <DetailRow label="Phone" value={group.agent_phone} />
            <DetailRow label="Email" value={group.agent_email} />
            <DetailRow label="State" value={group.agent_state} />
            <DetailRow label="License No" value={group.agent_license} />
            <DetailRow label="Submitted" value={group.submission.created_at ? new Date(group.submission.created_at).toLocaleString() : '-'} />
            {group.submission.updated_at && (
              <DetailRow label="Updated" value={new Date(group.submission.updated_at).toLocaleString()} />
            )}
          </View>

          {group.reject_reason && group.status === 'rejected' && (
            <View style={styles.rejectReasonBanner}>
              <MessageSquare size={14} color="#EF4444" />
              <View style={{ flex: 1 }}>
                <Text style={styles.rejectReasonLabel}>Rejection Reason</Text>
                <Text style={styles.rejectReasonText}>{group.reject_reason}</Text>
              </View>
            </View>
          )}

          <View style={styles.kycDocsSection}>
            <Text style={styles.kycInfoTitle}>Documents ({uploadedCount}/4)</Text>
            {group.docs.map((doc) => (
              <KycDocRow
                key={doc.docType}
                label={doc.label}
                filePath={doc.path}
              />
            ))}
          </View>

          {group.status === 'pending' && (
            <View style={styles.kycBulkActions}>
              <Pressable
                style={[styles.kycBulkBtn, { backgroundColor: '#052E16' }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  Alert.alert(
                    'Approve KYC',
                    `Approve all docs and verify agent ${group.agent_name}?`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Approve', onPress: () => onApprove(group.agent_id, group.submission.id) },
                    ]
                  );
                }}
                disabled={isUpdating}
              >
                <BadgeCheck size={14} color="#10B981" />
                <Text style={[styles.kycBulkBtnText, { color: '#10B981' }]}>Approve</Text>
              </Pressable>
              <Pressable
                style={[styles.kycBulkBtn, { backgroundColor: '#450A0A' }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onReject(group.agent_id, group.submission.id);
                }}
                disabled={isUpdating}
              >
                <Ban size={14} color="#EF4444" />
                <Text style={[styles.kycBulkBtnText, { color: '#EF4444' }]}>Reject</Text>
              </Pressable>
            </View>
          )}

          {group.status !== 'pending' && (
            <View style={styles.kycStatusBanner}>
              {group.status === 'approved' ? (
                <><CheckCircle size={16} color="#10B981" /><Text style={[styles.kycStatusBannerText, { color: '#10B981' }]}>KYC Approved - Agent Verified</Text></>
              ) : (
                <><XCircle size={16} color="#EF4444" /><Text style={[styles.kycStatusBannerText, { color: '#EF4444' }]}>KYC Rejected</Text></>
              )}
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
});

const KycDocRow = React.memo(function KycDocRow({
  label,
  filePath,
}: {
  label: string;
  filePath: string | null;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState<boolean>(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [fullscreenVisible, setFullscreenVisible] = useState<boolean>(false);
  const [imageLoadError, setImageLoadError] = useState<boolean>(false);

  const isLikelyImage = useMemo(() => {
    if (!filePath) {
      return false;
    }

    const lower = filePath.toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif', '.bmp'].some((ext) => lower.includes(ext));
  }, [filePath]);

  const showImagePreview = !!imageUrl && !imageLoadError;

  const handleViewDoc = useCallback(async () => {
    if (imageUrl) {
      setImageUrl(null);
      setUrlError(null);
      setImageLoadError(false);
      return;
    }
    if (!filePath) {
      Alert.alert('No File', 'No document uploaded for this field yet.');
      return;
    }
    setLoadingUrl(true);
    setUrlError(null);
    const requestedPath = filePath.trim();
    console.log('[KYC-VIEW] Requesting signed URL for:', requestedPath);
    const result = await getAdminSignedUrl(requestedPath);
    setLoadingUrl(false);
    if (result.url) {
      setImageLoadError(false);
      setImageUrl(result.url);
    } else {
      const errMsg = result.error || 'Unknown error generating signed URL';
      console.log('[KYC-VIEW] Failed to get signed URL:', errMsg);
      setUrlError(errMsg);
      Alert.alert('Signed URL Error', `Failed to load document: ${errMsg}\n\nPath: ${filePath}`);
    }
  }, [imageUrl, filePath]);

  const handleDownload = useCallback(async () => {
    if (!imageUrl) return;
    try {
      if (Platform.OS === 'web') {
        window.open(imageUrl, '_blank');
      } else {
        await Linking.openURL(imageUrl);
      }
    } catch (e) {
      console.log('[KYC-VIEW] Download/open error:', e);
      Alert.alert('Error', 'Could not open document.');
    }
  }, [imageUrl]);

  const hasFile = !!filePath;

  return (
    <View style={styles.kycDocRow}>
      <View style={styles.kycDocHeader}>
        <View style={styles.kycDocLeft}>
          <ImageIcon size={14} color={hasFile ? '#10B981' : '#475569'} />
          <Text style={styles.kycDocType}>{label}</Text>
        </View>
        <View style={[styles.kycDocStatusBadge, { backgroundColor: hasFile ? '#10B98120' : '#47556920' }]}>
          <Text style={[styles.kycDocStatusText, { color: hasFile ? '#10B981' : '#475569' }]}>
            {hasFile ? 'Uploaded' : 'Missing'}
          </Text>
        </View>
      </View>

      {filePath && (
        <View style={styles.kycDocMeta}>
          <Text style={styles.kycDocMetaText} numberOfLines={1}>
            {filePath}
          </Text>
        </View>
      )}

      {urlError && (
        <View style={styles.kycDocErrorRow}>
          <AlertCircle size={12} color="#EF4444" />
          <Text style={styles.kycDocErrorText} numberOfLines={2}>{urlError}</Text>
        </View>
      )}

      {hasFile && (
        <View style={styles.kycDocActions}>
          <Pressable style={styles.kycViewBtn} onPress={handleViewDoc} disabled={loadingUrl}>
                        {loadingUrl ? (
              <ActivityIndicator size="small" color="#3B82F6" />
            ) : (
              <>
                <Eye size={12} color="#3B82F6" />
                <Text style={styles.kycViewBtnText}>{imageUrl ? 'Hide' : 'Preview'}</Text>
              </>
            )}
          </Pressable>
          {imageUrl && (
            <>
              <Pressable style={[styles.kycViewBtn, { backgroundColor: '#052E16' }]} onPress={handleDownload}>
                <Download size={12} color="#10B981" />
                <Text style={[styles.kycViewBtnText, { color: '#10B981' }]}>Open</Text>
              </Pressable>
              <Pressable style={[styles.kycViewBtn, { backgroundColor: '#1E293B' }]} onPress={() => setFullscreenVisible(true)}>
                <ZoomIn size={12} color="#F59E0B" />
                <Text style={[styles.kycViewBtnText, { color: '#F59E0B' }]}>Fullscreen</Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      {imageUrl && (
        <Pressable
          style={styles.kycImageContainer}
          onPress={() => {
            if (showImagePreview) {
              setFullscreenVisible(true);
            } else {
              handleDownload();
            }
          }}
        >
          {isLikelyImage ? (
            <ExpoImage
              source={{ uri: imageUrl }}
              style={styles.kycImage}
              contentFit="contain"
              onError={(event) => {
                const message = event.error ?? 'Unable to render image preview';
                console.log('[KYC-VIEW] ExpoImage render error:', message, 'url:', imageUrl);
                setImageLoadError(true);
                setUrlError(`Preview unavailable: ${message}`);
              }}
            />
          ) : (
            <View style={styles.kycFileFallback}>
              <FileText size={26} color="#94A3B8" />
              <Text style={styles.kycFileFallbackTitle}>This file cannot be shown inline</Text>
              <Text style={styles.kycFileFallbackText}>Tap to open the original file</Text>
            </View>
          )}

          {imageLoadError && (
            <View style={styles.kycFileFallback}>
              <AlertCircle size={26} color="#F59E0B" />
              <Text style={styles.kycFileFallbackTitle}>Preview failed to load</Text>
              <Text style={styles.kycFileFallbackText}>Tap to open this file in browser</Text>
            </View>
          )}
        </Pressable>
      )}

      {showImagePreview && (
        <Modal
          visible={fullscreenVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setFullscreenVisible(false)}
        >
          <Pressable style={styles.fullscreenOverlay} onPress={() => setFullscreenVisible(false)}>
            <View style={styles.fullscreenHeader}>
              <Text style={styles.fullscreenTitle}>{label}</Text>
              <Pressable onPress={() => setFullscreenVisible(false)} style={styles.fullscreenCloseBtn}>
                <X size={20} color="#F8FAFC" />
              </Pressable>
            </View>
            <ExpoImage
              source={{ uri: imageUrl }}
              style={styles.fullscreenImage}
              contentFit="contain"
            />
            <View style={styles.fullscreenActions}>
              <Pressable style={styles.fullscreenActionBtn} onPress={handleDownload}>
                <Download size={16} color="#F8FAFC" />
                <Text style={styles.fullscreenActionText}>Open in Browser</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  headerLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  adminBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#1E3A5F',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#F8FAFC',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row' as const,
    gap: 8,
  },
  headerIconBtn: {
    padding: 10,
    backgroundColor: '#1E293B',
    borderRadius: 10,
  },
  tabBar: {
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    maxHeight: 52,
  },
  tabBarContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
  },
  tab: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  tabActive: {
    backgroundColor: '#1E293B',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: '#64748B',
  },
  tabTextActive: {
    color: '#3B82F6',
    fontWeight: '600' as const,
  },
  scrollContent: {
    padding: 16,
  },
  loadingContainer: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
  },
  tabContent: {
    gap: 16,
  },
  statsGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
  },
  statCard: {
    width: '48%' as const,
    borderRadius: 16,
    padding: 18,
    gap: 8,
    borderWidth: 1,
  },
  statCardTop: {
    marginBottom: 4,
  },
  statCardValue: {
    fontSize: 32,
    fontWeight: '800' as const,
  },
  statCardLabel: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: '#94A3B8',
  },
  sectionCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 12,
  },
  sectionCardTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#F8FAFC',
  },
  summaryRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  summaryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3B82F6',
  },
  summaryText: {
    fontSize: 14,
    color: '#CBD5E1',
  },
  miniStatsRow: {
    flexDirection: 'row' as const,
    gap: 8,
  },
  miniStat: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 3,
    gap: 2,
  },
  miniStatValue: {
    fontSize: 20,
    fontWeight: '800' as const,
  },
  miniStatLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500' as const,
  },
  searchBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    color: '#F8FAFC',
  },
  filtersScroll: {
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterChipActive: {
    backgroundColor: '#172554',
    borderColor: '#3B82F6',
  },
  filterChipText: {
    fontSize: 13,
    color: '#94A3B8',
  },
  filterChipTextActive: {
    color: '#3B82F6',
    fontWeight: '600' as const,
  },
  listContainer: {
    gap: 8,
  },
  listCount: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 4,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  cardHeaderLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    flex: 1,
  },
  cardHeaderRight: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#F8FAFC',
    maxWidth: 180,
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  statusBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
  cardDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    gap: 6,
  },
  cardFooter: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  cardFooterText: {
    fontSize: 11,
    color: '#475569',
  },
  cardFooterStatus: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
  statusDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  detailRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
  },
  detailLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  detailValue: {
    fontSize: 12,
    color: '#CBD5E1',
    fontWeight: '500' as const,
  },
  statusActions: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    gap: 8,
  },
  statusActionsLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600' as const,
  },
  statusBtnsRow: {
    flexDirection: 'row' as const,
    gap: 6,
    flexWrap: 'wrap' as const,
  },
  statusBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  statusBtnSelected: {
    opacity: 0.5,
  },
  statusBtnText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  verifyBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 10,
  },
  verifyBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  emptyText: {
    textAlign: 'center' as const,
    color: '#475569',
    fontSize: 14,
    paddingVertical: 30,
  },
  kycBulkActions: {
    flexDirection: 'row' as const,
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  kycBulkBtn: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  kycBulkBtnText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  kycDocRow: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  kycDocHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  kycDocLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  kycDocType: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#CBD5E1',
    textTransform: 'capitalize' as const,
  },
  kycDocStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  kycDocStatusText: {
    fontSize: 10,
    fontWeight: '600' as const,
  },
  kycDocMeta: {
    gap: 2,
  },
  kycDocMetaText: {
    fontSize: 11,
    color: '#475569',
  },
  kycDocActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    flexWrap: 'wrap' as const,
  },
  kycViewBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#172554',
    borderRadius: 6,
  },
  kycViewBtnText: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: '#3B82F6',
  },
  kycActionBtn: {
    padding: 6,
    borderRadius: 6,
  },
  kycImageContainer: {
    borderRadius: 8,
    overflow: 'hidden' as const,
    backgroundColor: '#1E293B',
    marginTop: 4,
  },
  kycImage: {
    width: '100%' as const,
    height: 200,
    borderRadius: 8,
  },
  kycFileFallback: {
    height: 200,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    paddingHorizontal: 16,
  },
  kycFileFallbackTitle: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: '#CBD5E1',
  },
  kycFileFallbackText: {
    fontSize: 12,
    color: '#64748B',
  },
  kycInfoSection: {
    gap: 4,
    marginBottom: 8,
  },
  kycInfoTitle: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: '#94A3B8',
    marginBottom: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  kycDocsSection: {
    gap: 6,
    marginTop: 4,
  },
  kycDocErrorRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    backgroundColor: '#450A0A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  kycDocErrorText: {
    fontSize: 11,
    color: '#FCA5A5',
    flex: 1,
  },
  rejectReasonBanner: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 10,
    backgroundColor: '#450A0A',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#7F1D1D',
  },
  rejectReasonLabel: {
    fontSize: 11,
    color: '#FCA5A5',
    fontWeight: '600' as const,
    marginBottom: 2,
  },
  rejectReasonText: {
    fontSize: 13,
    color: '#FECACA',
    lineHeight: 18,
  },
  rejectFormContainer: {
    flex: 1,
    gap: 8,
  },
  rejectFormLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#EF4444',
  },
  rejectReasonInput: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#7F1D1D',
    padding: 12,
    fontSize: 13,
    color: '#F8FAFC',
    minHeight: 70,
    textAlignVertical: 'top' as const,
  },
  rejectFormActions: {
    flexDirection: 'row' as const,
    gap: 8,
  },
  rejectFormBtn: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 10,
    borderRadius: 8,
  },
  rejectFormBtnText: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  kycStatusBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    paddingVertical: 12,
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
  },
  kycStatusBannerText: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  emptyContainer: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 40,
    gap: 12,
  },
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  fullscreenHeader: {
    position: 'absolute' as const,
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 20,
    zIndex: 10,
  },
  fullscreenTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#F8FAFC',
  },
  fullscreenCloseBtn: {
    padding: 8,
    backgroundColor: '#1E293B',
    borderRadius: 20,
  },
  fullscreenImage: {
    width: Dimensions.get('window').width - 32,
    height: Dimensions.get('window').height * 0.65,
  },
  fullscreenActions: {
    position: 'absolute' as const,
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: 'center' as const,
  },
  fullscreenActionBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    backgroundColor: '#1E293B',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  fullscreenActionText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#F8FAFC',
  },
  rejectModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 24,
  },
  rejectModalContent: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 24,
    width: '100%' as const,
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 16,
  },
  rejectModalHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  rejectModalTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#F8FAFC',
  },
  rejectModalDesc: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 19,
  },
  rejectModalInput: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#7F1D1D',
    padding: 14,
    fontSize: 14,
    color: '#F8FAFC',
    minHeight: 100,
    textAlignVertical: 'top' as const,
  },
  rejectModalActions: {
    flexDirection: 'row' as const,
    gap: 10,
    marginTop: 4,
  },
  rejectModalCancelBtn: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#334155',
  },
  rejectModalCancelText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#94A3B8',
  },
  rejectModalConfirmBtn: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#DC2626',
  },
  rejectModalConfirmText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#FFFFFF',
  },
  accessDenied: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 12,
    padding: 20,
  },
  accessDeniedTitle: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: '#F8FAFC',
    marginTop: 8,
  },
  accessDeniedText: {
    fontSize: 14,
    color: '#64748B',
  },
  backBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  backBtnText: {
    color: '#3B82F6',
    fontWeight: '600' as const,
    fontSize: 15,
  },
});
