import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Animated,
  Platform,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Search,
  ChevronRight,
  ShieldCheck,
  MapPin,
  ChevronDown,
  Check,
  X,
  Navigation,
  Crosshair,
  Radar,
  BadgeCheck,
  Building2,
  LockKeyhole,
  FilePlus2,
  Calculator,
  ShieldAlert,
} from 'lucide-react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useLanguage } from '@/contexts/LanguageContext';
import { Agent, malaysianDistricts } from '@/mocks/agents';
import { supabase } from '@/lib/supabase';
import { resolveAvatarUrl } from '@/lib/avatar';
import { loanCategories } from '@/mocks/categories';
import AgentCard from '@/components/AgentCard';
import CategoryCard from '@/components/CategoryCard';
import Colors from '@/constants/colors';

const SUPPORTED_STATES = ['Johor', 'Selangor', 'Kuala Lumpur', 'Penang'] as const;

function normalizeState(state: string | null | undefined): string {
  const value = (state ?? '').trim().toLowerCase();

  if (value === 'kuala lumpur' || value === 'kl' || value === 'wilayah persekutuan kuala lumpur') {
    return 'Kuala Lumpur';
  }

  if (value === 'selangor') {
    return 'Selangor';
  }

  if (value === 'johor') {
    return 'Johor';
  }

  if (value === 'penang' || value === 'pulau pinang') {
    return 'Penang';
  }

  return state?.trim() ?? '';
}

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

type ServerAgentRow = {
  id?: string | number | null;
  agent_id?: string | number | null;
  masked_id?: string | null;
  full_name?: string | null;
  name?: string | null;
  company?: string | null;
  company_name?: string | null;
  verified?: boolean | null;
  is_verified?: boolean | null;
  status?: string | null;
  kyc_status?: string | null;
  rating?: number | string | null;
  review_count?: number | string | null;
  completed_cases_count?: number | string | null;
  success_cases?: number | string | null;
  state?: string | null;
  district?: string | null;
  districts?: string[] | null;
  city?: string | null;
  joined_at?: string | null;
  created_at?: string | null;
  loan_types?: string[] | string | null;
  languages?: string[] | string | null;
  years_experience?: number | string | null;
  partner_banks?: string[] | string | null;
  profile_photo?: string | null;
  profile_photo_url?: string | null;
  avatar?: string | null;
  avatar_url?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  bio?: string | null;
  description?: string | null;
};

function toNumber(value: number | string | null | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
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

function toAgent(row: ServerAgentRow): Agent {
  const statusValue = (row.kyc_status ?? row.status ?? '').toLowerCase();
  const verified = row.verified === true || row.is_verified === true || statusValue === 'approved' || statusValue === 'verified';
  const createdAt = row.created_at ?? row.joined_at ?? null;
  const createdYear = createdAt ? new Date(createdAt).getFullYear() : new Date().getFullYear();
  const yearsExperience = Math.max(0, Math.round(toNumber(row.years_experience, 0)));
  const derivedSince = yearsExperience > 0 ? new Date().getFullYear() - yearsExperience : createdYear;
  const safeName = row.masked_id?.trim() || row.full_name?.trim() || row.name?.trim() || 'Trusted Agent';
  const safeState = normalizeState(row.state);

  return {
    id: String(row.id ?? row.agent_id ?? `${safeName}-${createdAt ?? Date.now()}`),
    name: safeName,
    company: row.company?.trim() || row.company_name?.trim() || 'Independent Agent',
    type: 'individual',
    verified,
    premium: false,
    rating: toNumber(row.rating, 0),
    reviewCount: Math.max(0, Math.round(toNumber(row.review_count, 0))),
    successCases: Math.max(0, Math.round(toNumber(row.completed_cases_count ?? row.success_cases, 0))),
    since: Number.isFinite(derivedSince) ? derivedSince : new Date().getFullYear(),
    state: safeState || 'Kuala Lumpur',
    created_at: createdAt ?? undefined,
    district: row.district?.trim() || row.districts?.[0]?.trim() || row.city?.trim() || 'Unknown District',
    specialties: toStringArray(row.loan_types),
    loanTypes: toStringArray(row.loan_types),
    languages: toStringArray(row.languages),
    districts: row.districts ?? [],
    yearsExperience,
    partnerBanks: toStringArray(row.partner_banks),
    avatar:
      row.profile_photo_url ??
      row.profile_photo ??
      row.avatar_url ??
      row.avatar ??
      `https://api.dicebear.com/9.x/initials/png?seed=${encodeURIComponent(safeName)}`,
    description: {
      ms: row.bio?.trim() || row.description?.trim() || 'Trusted verified loan agent.',
      en: row.bio?.trim() || row.description?.trim() || 'Trusted verified loan agent.',
      zh: row.bio?.trim() || row.description?.trim() || '可信赖的已验证贷款中介。',
    },
    licenseNo: '-',
    licenseType: 'BNM_SSM',
    phone: '',
    whatsapp: '',
    latitude: toNumber(row.latitude, 3.139),
    longitude: toNumber(row.longitude, 101.6869),
  };
}

export default function HomeScreen() {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const [selectedState, setSelectedState] = useState<string>('');
  const [selectedDistrict, setSelectedDistrict] = useState<string>('');
  const [showStatePicker, setShowStatePicker] = useState<boolean>(false);
  const [showDistrictPicker, setShowDistrictPicker] = useState<boolean>(false);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLon, setUserLon] = useState<number | null>(null);
  const [gpsLoading, setGpsLoading] = useState<boolean>(false);
  const [gpsEnabled, setGpsEnabled] = useState<boolean>(false);
  const [selectedLoanFilter, setSelectedLoanFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [resolvedAvatarMap, setResolvedAvatarMap] = useState<Record<string, string>>({});

  const normalizedSearchQuery = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery]);

  const agentsQuery = useQuery({
    queryKey: ['home-verified-agents'],
    queryFn: async (): Promise<ServerAgentRow[]> => {
      console.log('[HomeScreen] Fetching available agents from public.agents_available...');
      const { data, error } = await supabase
        .from('agents_available')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.log('[HomeScreen] Failed to fetch available agents:', error.message, error.code);
        throw new Error(error.message || 'Failed to load available agents');
      }

      console.log('[HomeScreen] Loaded available agents count:', data?.length ?? 0);
      return (data ?? []) as ServerAgentRow[];
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const nearbyAgentsQuery = useQuery({
    queryKey: ['home-nearby-agents', selectedState, selectedDistrict],
    queryFn: async (): Promise<ServerAgentRow[]> => {
      if (!selectedState) {
        return [];
      }

      console.log('[HomeScreen] Fetching nearby agents from public.agents_available with districts filter...', selectedState, selectedDistrict);
      let query = supabase
        .from('agents_available')
        .select('*')
        .eq('state', selectedState);

      if (selectedDistrict) {
        query = query.contains('districts', [selectedDistrict]);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        console.log('[HomeScreen] Failed to fetch nearby agents:', error.message, error.code);
        throw new Error(error.message || 'Failed to load nearby agents');
      }

      console.log('[HomeScreen] Nearby agents loaded:', data?.length ?? 0);
      return (data ?? []) as ServerAgentRow[];
    },
    enabled: Boolean(selectedState),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const verifiedAgentsCountQuery = useQuery({
    queryKey: ['home-verified-agents-count'],
    queryFn: async (): Promise<number> => {
      console.log('[HomeScreen] Fetching available agents count from public.agents_available...');
      const { count, error } = await supabase
        .from('agents_available')
        .select('id', { count: 'exact', head: true });

      if (error) {
        console.log('[HomeScreen] Failed to fetch available agents count:', error.message, error.code);
        throw new Error(error.message || 'Failed to load available agents count');
      }

      const safeCount = count ?? 0;
      console.log('[HomeScreen] Available agents count:', safeCount);
      return safeCount;
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const { refetch: refetchAgents } = agentsQuery;
  const { refetch: refetchNearbyAgents } = nearbyAgentsQuery;
  const { refetch: refetchVerifiedAgentsCount } = verifiedAgentsCountQuery;

  useFocusEffect(
    useCallback(() => {
      console.log('[HomeScreen] Screen focused, refetching verified agents, nearby agents and count...');
      refetchAgents();
      refetchNearbyAgents();
      refetchVerifiedAgentsCount();
    }, [refetchAgents, refetchNearbyAgents, refetchVerifiedAgentsCount])
  );

  useEffect(() => {
    if (agentsQuery.error) {
      const message = agentsQuery.error instanceof Error ? agentsQuery.error.message : 'Unable to load agents';
      Alert.alert('加载失败', message);
    }
  }, [agentsQuery.error]);

  const allAgents = useMemo(() => {
    const rows = agentsQuery.data ?? [];
    return rows.map(toAgent);
  }, [agentsQuery.data]);

  useEffect(() => {
    let isCancelled = false;

    const resolveAgentAvatars = async () => {
      const entries = await Promise.all(
        allAgents.map(async (agent) => {
          const resolved = await resolveAvatarUrl(agent.avatar);
          return [agent.id, resolved] as const;
        }),
      );

      if (isCancelled) {
        return;
      }

      const nextMap: Record<string, string> = {};
      entries.forEach(([agentId, resolvedUrl]) => {
        if (resolvedUrl) {
          nextMap[agentId] = resolvedUrl;
        }
      });

      setResolvedAvatarMap(nextMap);
    };

    void resolveAgentAvatars();

    return () => {
      isCancelled = true;
    };
  }, [allAgents]);

  const agentsWithResolvedAvatar = useMemo(() => {
    return allAgents.map((agent) => ({
      ...agent,
      avatar: resolvedAvatarMap[agent.id] ?? agent.avatar,
    }));
  }, [allAgents, resolvedAvatarMap]);

  const searchableAgents = useMemo(() => {
    if (!normalizedSearchQuery) {
      return agentsWithResolvedAvatar;
    }

    return agentsWithResolvedAvatar.filter((agent) => {
      const searchableText = [
        agent.name,
        agent.company,
        agent.state,
        agent.district,
        ...agent.specialties,
      ]
        .join(' ')
        .toLowerCase();

      return searchableText.includes(normalizedSearchQuery);
    });
  }, [agentsWithResolvedAvatar, normalizedSearchQuery]);

  console.log('[HomeScreen] Search query:', searchQuery, 'Results:', searchableAgents.length);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const handleDetectGPS = useCallback(async () => {
    console.log('[HomeScreen] Detecting GPS location...');
    setGpsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (Platform.OS === 'web') {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            console.log('[HomeScreen] GPS location found:', pos.coords.latitude, pos.coords.longitude);
            setUserLat(pos.coords.latitude);
            setUserLon(pos.coords.longitude);
            setGpsEnabled(true);
            setGpsLoading(false);
          },
          (err) => {
            console.log('[HomeScreen] GPS error:', err.message);
            setUserLat(3.1390);
            setUserLon(101.6869);
            setGpsEnabled(true);
            setGpsLoading(false);
          },
          { enableHighAccuracy: true, timeout: 10000 }
        );
      } else {
        setUserLat(3.1390);
        setUserLon(101.6869);
        setGpsEnabled(true);
        setGpsLoading(false);
      }
    } else {
      try {
        const { default: Location } = await import('expo-location');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          console.log('[HomeScreen] GPS location found:', loc.coords.latitude, loc.coords.longitude);
          setUserLat(loc.coords.latitude);
          setUserLon(loc.coords.longitude);
          setGpsEnabled(true);
        } else {
          console.log('[HomeScreen] GPS permission denied, using default KL coords');
          setUserLat(3.1390);
          setUserLon(101.6869);
          setGpsEnabled(true);
        }
      } catch (e) {
        console.log('[HomeScreen] GPS error:', e);
        setUserLat(3.1390);
        setUserLon(101.6869);
        setGpsEnabled(true);
      }
      setGpsLoading(false);
    }
  }, []);

  const sortedVerifiedAgents = useMemo(() => {
    return searchableAgents
      .filter((agent) => agent.verified)
      .sort((firstAgent, secondAgent) => {
        const firstCreatedAt = new Date(firstAgent.created_at ?? `${firstAgent.since}-01-01`).getTime();
        const secondCreatedAt = new Date(secondAgent.created_at ?? `${secondAgent.since}-01-01`).getTime();
        return secondCreatedAt - firstCreatedAt;
      });
  }, [searchableAgents]);

  const featuredAgents = useMemo(() => {
    if (!selectedState) {
      return sortedVerifiedAgents;
    }

    const normalizedSelectedState = normalizeState(selectedState);
    return sortedVerifiedAgents.filter((agent) => normalizeState(agent.state) === normalizedSelectedState);
  }, [selectedState, sortedVerifiedAgents]);
  const verifiedAgentsCount = verifiedAgentsCountQuery.data ?? 0;
  const averageAgentRating = useMemo(() => {
    if (searchableAgents.length === 0) {
      return 0;
    }
    const totalRating = searchableAgents.reduce((sum, agent) => sum + agent.rating, 0);
    return Number((totalRating / searchableAgents.length).toFixed(1));
  }, [searchableAgents]);
  const partnerBankCount = useMemo(() => {
    const bankSet = new Set<string>();
    searchableAgents.forEach((agent) => {
      agent.partnerBanks.forEach((bank) => bankSet.add(bank));
    });
    return bankSet.size;
  }, [searchableAgents]);


  const availableDistricts = useMemo(() => {
    if (!selectedState) return [];
    const normalizedSelectedState = normalizeState(selectedState);
    return malaysianDistricts[normalizedSelectedState] || [];
  }, [selectedState]);

  const nearbyAgents = useMemo(() => {
    if (!selectedState) return [];

    const baseAgents = (nearbyAgentsQuery.data ?? []).map(toAgent);
    if (!selectedLoanFilter) {
      return baseAgents;
    }

    return baseAgents.filter((agent) => agent.specialties.includes(selectedLoanFilter));
  }, [nearbyAgentsQuery.data, selectedLoanFilter, selectedState]);

  const trustSignals = useMemo(
    () => [
      { key: 'verified', label: t('verifiedAgents'), icon: <BadgeCheck size={16} color={Colors.verified} /> },
      { key: 'banks', label: t('partnerBanks'), icon: <Building2 size={16} color={Colors.accent} /> },
      { key: 'secure', label: t('securePlatform'), icon: <LockKeyhole size={16} color={Colors.primary} /> },
    ],
    [t]
  );

  const quickActions = useMemo(
    () => [
      {
        key: 'applyNow',
        label: t('applyNow'),
        icon: <FilePlus2 size={18} color={Colors.white} />,
        primary: true,
        onPress: () => router.push('/apply'),
      },
      {
        key: 'loanCalculator',
        label: t('loanCalculator'),
        icon: <Calculator size={18} color={Colors.primary} />,
        primary: false,
        onPress: () => router.push('/loan-guide/personalLoan'),
      },
      {
        key: 'safetyTips',
        label: t('safetyTips'),
        icon: <ShieldAlert size={18} color={Colors.primary} />,
        primary: false,
        onPress: () => router.push('/safety'),
      },
    ],
    [router, t]
  );

  const gpsNearbyAgents = useMemo(() => {
    if (!gpsEnabled || userLat == null || userLon == null) return [];
    const withDistance = sortedVerifiedAgents.map((a) => ({
      agent: a,
      distance: getDistanceKm(userLat, userLon, a.latitude, a.longitude),
    }));
    let filtered = withDistance.filter((item) => item.distance <= 20);
    if (selectedLoanFilter) {
      filtered = filtered.filter((item) => item.agent.specialties.includes(selectedLoanFilter));
    }
    filtered.sort((a, b) => a.distance - b.distance);
    return filtered;
  }, [gpsEnabled, sortedVerifiedAgents, userLat, userLon, selectedLoanFilter]);

  const handleSelectState = useCallback((state: string) => {
    setSelectedState(state);
    setSelectedDistrict('');
    setShowStatePicker(false);
    console.log('[HomeScreen] Selected state:', state);
  }, []);

  const handleSelectDistrict = useCallback((district: string) => {
    setSelectedDistrict(district);
    setShowDistrictPicker(false);
    console.log('[HomeScreen] Selected district:', district);
  }, []);

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <LinearGradient
          colors={['#0A1E3D', '#143A6B', '#1C4F8E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.header, { paddingTop: insets.top + 16 }]}
        >
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <View style={styles.headerTop}>
              <View>
                <Text style={styles.logo}>TrustFin</Text>
                <Text style={styles.logoSuffix}>MY</Text>
              </View>
              <View style={styles.verifiedBanner}>
                <ShieldCheck size={14} color={Colors.verified} />
                <Text style={styles.verifiedText}>{t('verified')}</Text>
              </View>
            </View>
            <Text style={styles.welcomeTitle}>{t('welcome')}</Text>
            <Text style={styles.welcomeSubtitle}>{t('welcomeSubtitle')}</Text>
            <View style={styles.searchContainer}>
              <Search size={18} color={Colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder={t('searchPlaceholder')}
                placeholderTextColor={Colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                testID="home-search-input"
              />
            </View>
            <View style={styles.trustBar} testID="trust-bar">
              {trustSignals.map((item) => (
                <View key={item.key} style={styles.trustItem}>
                  {item.icon}
                  <Text style={styles.trustItemText}>{item.label}</Text>
                </View>
              ))}
            </View>
            <View style={styles.heroCtaCard}>
              <View style={styles.heroCtaContent}>
                <Text style={styles.heroCtaTitle}>{t('heroMatchTitle')}</Text>
                <Text style={styles.heroCtaSubtitle}>{t('heroMatchSubtitle')}</Text>
              </View>
              <Pressable
                style={styles.heroCtaButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push('/apply');
                }}
                testID="home-hero-apply-btn"
              >
                <Text style={styles.heroCtaButtonText}>{t('applyNow')}</Text>
                <ChevronRight size={15} color={Colors.white} />
              </Pressable>
            </View>
            <View style={styles.metricsRow} testID="home-trust-metrics">
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{verifiedAgentsCount}</Text>
                <Text style={styles.metricLabel}>{t('verifiedAgents')}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{averageAgentRating.toFixed(1)}</Text>
                <Text style={styles.metricLabel}>{t('rating')}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{partnerBankCount}</Text>
                <Text style={styles.metricLabel}>{t('partnerBanks')}</Text>
              </View>
            </View>
          </Animated.View>
        </LinearGradient>

        <View style={styles.quickActionsSection}>
          <Text style={styles.quickActionsTitle}>{t('quickActions')}</Text>
          <Text style={styles.quickActionsSubtitle}>{t('quickActionsSubtitle')}</Text>
          {quickActions.map((action) => (
            <Pressable
              key={action.key}
              style={[styles.quickActionBtn, action.primary && styles.quickActionBtnPrimary]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                action.onPress();
              }}
              testID={`quick-action-${action.key}`}
            >
              <View style={[styles.quickActionIconWrap, action.primary && styles.quickActionIconWrapPrimary]}>{action.icon}</View>
              <Text style={[styles.quickActionText, action.primary && styles.quickActionTextPrimary]}>{action.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.gpsSection}>
          <View style={styles.gpsTitleRow}>
            <View style={styles.gpsTitleLeft}>
              <Radar size={18} color={Colors.primary} />
              <Text style={styles.gpsSectionTitle}>{t('gpsNearby')}</Text>
            </View>
            <Pressable
              style={[styles.gpsBtn, gpsEnabled && styles.gpsBtnActive]}
              onPress={handleDetectGPS}
              disabled={gpsLoading}
              testID="gps-detect-btn"
            >
              {gpsLoading ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <>
                  <Crosshair size={14} color={gpsEnabled ? Colors.white : Colors.primary} />
                  <Text style={[styles.gpsBtnText, gpsEnabled && styles.gpsBtnTextActive]}>
                    {gpsEnabled ? t('gpsEnabled') : t('useGPS')}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
          <Text style={styles.gpsDesc}>{t('gpsNearbyDesc')}</Text>

          {gpsEnabled && gpsNearbyAgents.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.gpsAgentsRow}
            >
              {gpsNearbyAgents.slice(0, 6).map((item) => (
                <AgentCard
                  key={item.agent.id}
                  agent={item.agent}
                  compact
                  distance={item.distance}
                />
              ))}
            </ScrollView>
          ) : gpsEnabled ? (
            <View style={styles.emptyState}>
              <MapPin size={24} color={Colors.textMuted} />
              <Text style={styles.emptyStateText}>{t('noNearbyAgents')}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('categories')}</Text>
            <View style={styles.popularBadge}>
              <Text style={styles.popularBadgeText}>{t('popular')}</Text>
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoriesRow}
          >
            {loanCategories.map((cat) => (
              <CategoryCard
                key={cat.id}
                translationKey={cat.translationKey}
                icon={cat.icon}
                color={cat.color}
                bgColor={cat.bgColor}
                onPress={() => {
                  console.log('[HomeScreen] Navigate to loan guide:', cat.id);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(`/loan-guide/${cat.id}`);
                }}
              />
            ))}
          </ScrollView>
        </View>

        <View style={styles.loanFilterSection}>
          <Text style={styles.loanFilterLabel}>{t('filterByLoan')}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.loanFilterRow}
          >
            <Pressable
              style={[styles.loanChip, !selectedLoanFilter && styles.loanChipActive]}
              onPress={() => setSelectedLoanFilter('')}
            >
              <Text style={[styles.loanChipText, !selectedLoanFilter && styles.loanChipTextActive]}>
                {t('allLoans')}
              </Text>
            </Pressable>
            {loanCategories.map((cat) => (
              <Pressable
                key={cat.id}
                style={[styles.loanChip, selectedLoanFilter === cat.id && styles.loanChipActive]}
                onPress={() => {
                  setSelectedLoanFilter(selectedLoanFilter === cat.id ? '' : cat.id);
                  Haptics.selectionAsync();
                }}
              >
                <Text style={[styles.loanChipText, selectedLoanFilter === cat.id && styles.loanChipTextActive]}>
                  {t(cat.translationKey)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.statePickerSection}>
          <View style={styles.statePickerHeader}>
            <View style={styles.statePickerLeft}>
              <Navigation size={16} color={Colors.primary} />
              <Text style={styles.statePickerLabel}>{t('yourState')}</Text>
            </View>
          </View>
          <Pressable
            style={styles.statePickerBtn}
            onPress={() => setShowStatePicker(true)}
            testID="state-picker-btn"
          >
            <MapPin size={18} color={selectedState ? Colors.primary : Colors.textMuted} />
            <Text style={[styles.statePickerBtnText, !selectedState && styles.statePickerPlaceholder]}>
              {selectedState || t('selectState')}
            </Text>
            <ChevronDown size={16} color={Colors.textMuted} />
          </Pressable>

          {selectedState ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.stateChipsRow}
            >
              {SUPPORTED_STATES.map((state) => (
                <Pressable
                  key={state}
                  style={[styles.stateChip, selectedState === state && styles.stateChipActive]}
                  onPress={() => {
                    setSelectedState(state);
                    setSelectedDistrict('');
                  }}
                >
                  <Text style={[styles.stateChipText, selectedState === state && styles.stateChipTextActive]}>
                    {state}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </View>

        {selectedState ? (
          <View style={styles.districtPickerSection}>
            <View style={styles.statePickerHeader}>
              <View style={styles.statePickerLeft}>
                <MapPin size={16} color={Colors.primary} />
                <Text style={styles.statePickerLabel}>{t('yourDistrict')}</Text>
              </View>
            </View>
            <Pressable
              style={styles.statePickerBtn}
              onPress={() => setShowDistrictPicker(true)}
              testID="district-picker-btn"
            >
              <MapPin size={18} color={selectedDistrict ? Colors.primary : Colors.textMuted} />
              <Text style={[styles.statePickerBtnText, !selectedDistrict && styles.statePickerPlaceholder]}>
                {selectedDistrict || t('selectDistrict')}
              </Text>
              <ChevronDown size={16} color={Colors.textMuted} />
            </Pressable>

            {selectedDistrict ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.stateChipsRow}
              >
                {availableDistricts.map((district) => (
                  <Pressable
                    key={district}
                    style={[styles.stateChip, selectedDistrict === district && styles.stateChipActive]}
                    onPress={() => setSelectedDistrict(district)}
                  >
                    <Text style={[styles.stateChipText, selectedDistrict === district && styles.stateChipTextActive]}>
                      {district}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
          </View>
        ) : null}

        {selectedState ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('nearbyAgents')}</Text>
              <View style={styles.locationBadges}>
                <View style={styles.stateBadge}>
                  <MapPin size={12} color={Colors.primary} />
                  <Text style={styles.stateBadgeText}>{selectedState}</Text>
                </View>
                {selectedDistrict ? (
                  <View style={[styles.stateBadge, styles.districtBadge]}>
                    <Text style={styles.districtBadgeText}>{selectedDistrict}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            {nearbyAgentsQuery.isLoading ? (
              <View style={styles.emptyState}>
                <ActivityIndicator size="small" color={Colors.primary} />
              </View>
            ) : nearbyAgents.length > 0 ? (
              nearbyAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  distance={
                    userLat != null && userLon != null
                      ? getDistanceKm(userLat, userLon, agent.latitude, agent.longitude)
                      : null
                  }
                />
              ))
            ) : (
              <View style={styles.emptyState}>
                <MapPin size={32} color={Colors.textMuted} />
                <Text style={styles.emptyStateText}>
                  {selectedDistrict ? t('noAgentsInDistrict') : t('noAgentsInState')}
                </Text>
              </View>
            )}
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>{t('featuredAgents')}</Text>
              <Text style={styles.sectionSubtitle}>{t('verifiedAgents')}</Text>
            </View>
            <Pressable
              style={styles.viewAllBtn}
              onPress={() => router.push('/')}
            >
              <Text style={styles.viewAllText}>{t('viewAll')}</Text>
              <ChevronRight size={14} color={Colors.primary} />
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.agentsRow}
          >
            {featuredAgents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} compact />
            ))}
            {agentsQuery.isLoading ? (
              <View style={styles.featuredLoading}>
                <ActivityIndicator size="small" color={Colors.primary} />
              </View>
            ) : null}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('agents')}</Text>
          </View>
          {searchableAgents.slice(0, 3).map((agent) => (
            <View key={agent.id} style={styles.agentCardWrap}>
              <AgentCard agent={agent} />
            </View>
          ))}
          <Pressable
            style={styles.seeMoreBtn}
            onPress={() => router.push('/')}
          >
            <Text style={styles.seeMoreText}>{t('viewAll')} →</Text>
          </Pressable>
        </View>

        <View style={styles.disclaimerSection}>
          <ShieldCheck size={16} color={Colors.textMuted} />
          <Text style={styles.disclaimerText}>{t('disclaimer')}</Text>
        </View>
        <View style={styles.complianceSection}>
          <Text style={styles.complianceText}>{t('bnmCompliance')}</Text>
        </View>
      </ScrollView>

      <Modal visible={showDistrictPicker} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setShowDistrictPicker(false)}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('selectDistrict')}</Text>
              <Pressable onPress={() => setShowDistrictPicker(false)}>
                <X size={20} color={Colors.textSecondary} />
              </Pressable>
            </View>
            <ScrollView>
              <Pressable
                style={[styles.modalOption, !selectedDistrict && styles.modalOptionActive]}
                onPress={() => { setSelectedDistrict(''); setShowDistrictPicker(false); }}
                testID="district-option-all"
              >
                <View style={styles.modalOptionLeft}>
                  <Text style={[styles.modalOptionText, !selectedDistrict && styles.modalOptionTextActive]}>
                    {t('allDistricts')}
                  </Text>
                </View>
                {!selectedDistrict && <Check size={18} color={Colors.primary} />}
              </Pressable>
              {availableDistricts.map((district) => {
                const districtAgentCount = sortedVerifiedAgents.filter((agent) => normalizeState(agent.state) === normalizeState(selectedState) && agent.district === district).length;
                return (
                  <Pressable
                    key={district}
                    style={[styles.modalOption, selectedDistrict === district && styles.modalOptionActive]}
                    onPress={() => handleSelectDistrict(district)}
                    testID={`district-option-${district}`}
                  >
                    <View style={styles.modalOptionLeft}>
                      <Text style={[styles.modalOptionText, selectedDistrict === district && styles.modalOptionTextActive]}>
                        {district}
                      </Text>
                      <Text style={styles.modalOptionCount}>
                        {districtAgentCount} {t('agents').toLowerCase()}
                      </Text>
                    </View>
                    {selectedDistrict === district && <Check size={18} color={Colors.primary} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showStatePicker} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setShowStatePicker(false)}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('selectState')}</Text>
              <Pressable onPress={() => setShowStatePicker(false)}>
                <X size={20} color={Colors.textSecondary} />
              </Pressable>
            </View>
            <ScrollView>
              {SUPPORTED_STATES.map((state) => {
                const agentCount = sortedVerifiedAgents.filter((agent) => normalizeState(agent.state) === state).length;
                return (
                  <Pressable
                    key={state}
                    style={[styles.modalOption, selectedState === state && styles.modalOptionActive]}
                    onPress={() => handleSelectState(state)}
                    testID={`state-option-${state}`}
                  >
                    <View style={styles.modalOptionLeft}>
                      <Text style={[styles.modalOptionText, selectedState === state && styles.modalOptionTextActive]}>
                        {state}
                      </Text>
                      <Text style={styles.modalOptionCount}>
                        {agentCount} {t('agents').toLowerCase()}
                      </Text>
                    </View>
                    {selectedState === state && <Check size={18} color={Colors.primary} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 26,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerTop: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    marginBottom: 16,
  },
  logo: {
    fontSize: 28,
    fontWeight: '800' as const,
    color: Colors.white,
    letterSpacing: -0.5,
  },
  logoSuffix: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.gold,
    letterSpacing: 2,
    marginTop: -4,
  },
  verifiedBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 4,
  },
  verifiedText: {
    fontSize: 11,
    color: Colors.verified,
    fontWeight: '600' as const,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: Colors.white,
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.78)',
    lineHeight: 20,
    marginBottom: 16,
  },
  searchContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: Colors.white,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'web' ? 13 : 11,
    borderWidth: 1,
    borderColor: 'rgba(10, 30, 61, 0.08)',
    gap: 10,
  },
  trustBar: {
    marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  trustItem: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  trustItemText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '700' as const,
    lineHeight: 16,
  },
  metricsRow: {
    marginTop: 14,
    flexDirection: 'row' as const,
    gap: 8,
  },
  metricCard: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center' as const,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: Colors.white,
  },
  metricLabel: {
    fontSize: 10,
    marginTop: 2,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600' as const,
    textAlign: 'center' as const,
  },
  quickActionsSection: {
    marginTop: 16,
    marginHorizontal: 16,
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    ...Platform.select({
      ios: { shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10 },
      android: { elevation: 3 },
      web: { shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10 },
    }),
  },
  quickActionBtn: {
    flex: 1,
    minWidth: 96,
    borderRadius: 12,
    backgroundColor: Colors.inputBg,
    paddingVertical: 13,
    paddingHorizontal: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickActionBtnPrimary: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  quickActionsTitle: {
    width: '100%' as const,
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  quickActionsSubtitle: {
    width: '100%' as const,
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 8,
    lineHeight: 16,
  },
  quickActionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.primary + '14',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  quickActionIconWrapPrimary: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  quickActionText: {
    fontSize: 12,
    color: Colors.textPrimary,
    fontWeight: '700' as const,
    textAlign: 'center' as const,
  },
  quickActionTextPrimary: {
    color: Colors.white,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.textPrimary,
    padding: 0,
  },
  gpsSection: {
    marginTop: 16,
    marginHorizontal: 16,
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 16,
    ...Platform.select({
      ios: { shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 3 },
      web: { shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
    }),
  },
  gpsTitleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 4,
  },
  gpsTitleLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  gpsSectionTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  gpsBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    backgroundColor: Colors.primary + '12',
    borderWidth: 1,
    borderColor: Colors.primary + '26',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  gpsBtnActive: {
    backgroundColor: Colors.primary,
  },
  gpsBtnText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  gpsBtnTextActive: {
    color: Colors.white,
  },
  gpsDesc: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 12,
  },
  gpsAgentsRow: {
    paddingRight: 4,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
    lineHeight: 24,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
    marginTop: 2,
  },
  popularBadge: {
    backgroundColor: '#FF6B35' + '18',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  popularBadgeText: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: '#FF6B35',
  },
  viewAllBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 2,
  },
  viewAllText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600' as const,
  },
  categoriesRow: {
    paddingRight: 20,
    paddingBottom: 2,
  },
  loanFilterSection: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  loanFilterLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  loanFilterRow: {
    gap: 8,
  },
  loanChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: Colors.inputBg,
  },
  loanChipActive: {
    backgroundColor: Colors.primary,
  },
  loanChipText: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: Colors.textSecondary,
  },
  loanChipTextActive: {
    color: Colors.white,
  },
  agentsRow: {
    paddingRight: 20,
    paddingBottom: 2,
  },
  featuredLoading: {
    width: 56,
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: Colors.white,
  },
  agentCardWrap: {
    marginBottom: 16,
  },
  seeMoreBtn: {
    alignItems: 'center' as const,
    paddingVertical: 14,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    marginTop: 8,
  },
  seeMoreText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.white,
  },
  disclaimerSection: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 8,
    marginTop: 28,
    marginHorizontal: 16,
    padding: 16,
    backgroundColor: Colors.inputBg,
    borderRadius: 16,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  complianceSection: {
    alignItems: 'center' as const,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  complianceText: {
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: 'center' as const,
  },
  statePickerSection: {
    marginTop: 16,
    marginHorizontal: 16,
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 16,
    ...Platform.select({
      ios: { shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 3 },
      web: { shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
    }),
  },
  statePickerHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 10,
  },
  statePickerLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  statePickerLabel: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  statePickerBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: Colors.inputBg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  statePickerBtnText: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
    fontWeight: '500' as const,
  },
  statePickerPlaceholder: {
    color: Colors.textMuted,
  },
  stateChipsRow: {
    paddingTop: 12,
    gap: 8,
  },
  stateChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.inputBg,
  },
  stateChipActive: {
    backgroundColor: Colors.primary,
  },
  stateChipText: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: Colors.textSecondary,
  },
  stateChipTextActive: {
    color: Colors.white,
  },
  stateBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: Colors.inputBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  stateBadgeText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  emptyState: {
    alignItems: 'center' as const,
    paddingVertical: 32,
    gap: 10,
  },
  emptyStateText: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center' as const,
  },
  districtPickerSection: {
    marginTop: 10,
    marginHorizontal: 16,
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 16,
    ...Platform.select({
      ios: { shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 3 },
      web: { shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
    }),
  },
  locationBadges: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  districtBadge: {
    backgroundColor: 'rgba(20, 58, 107, 0.08)',
  },
  districtBadgeText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  heroCtaCard: {
    marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  heroCtaContent: {
    gap: 4,
  },
  heroCtaTitle: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '800' as const,
    lineHeight: 20,
  },
  heroCtaSubtitle: {
    color: 'rgba(255,255,255,0.84)',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500' as const,
  },
  heroCtaButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    minHeight: 44,
    paddingHorizontal: 14,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  heroCtaButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end' as const,
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%' as const,
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  modalOption: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  modalOptionActive: {
    backgroundColor: Colors.inputBg,
  },
  modalOptionLeft: {
    flex: 1,
  },
  modalOptionText: {
    fontSize: 15,
    color: Colors.textPrimary,
  },
  modalOptionTextActive: {
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  modalOptionCount: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
