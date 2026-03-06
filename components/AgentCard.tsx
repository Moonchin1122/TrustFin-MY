import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Platform, Linking, Alert } from 'react-native';
import { Image } from 'expo-image';
import { Star, ShieldCheck, Crown, MapPin, CheckCircle, FileCheck, ArrowRight, BriefcaseBusiness, Landmark, MessageCircle } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { Agent } from '@/mocks/agents';
import Colors from '@/constants/colors';

interface AgentCardProps {
  agent: Agent;
  onPress?: () => void;
  compact?: boolean;
  distance?: number | null;
}

export default React.memo(function AgentCard({ agent, onPress, compact, distance }: AgentCardProps) {
  const { t, language } = useLanguage();
  const router = useRouter();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 4,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const navigateToAgent = useCallback(() => {
    if (onPress) {
      onPress();
      return;
    }
    console.log('[AgentCard] Navigating to agent profile:', agent.id);
    router.push(`/agent/${agent.id}`);
  }, [onPress, agent.id, router]);

  const hasWhatsapp = Boolean(agent.whatsapp?.trim());

  const handleWhatsAppPress = useCallback(async () => {
    if (!hasWhatsapp) {
      Alert.alert('Unavailable', 'Contact will be available after application submission.');
      return;
    }

    const message = encodeURIComponent(`Hi ${agent.name}, I found you on TrustFin and would like to discuss a loan application.`);
    const whatsappUrl = `https://wa.me/${agent.whatsapp}?text=${message}`;

    try {
      console.log('[AgentCard] Opening WhatsApp URL:', whatsappUrl);
      const canOpen = await Linking.canOpenURL(whatsappUrl);
      if (!canOpen) {
        Alert.alert('WhatsApp Unavailable', 'Unable to open WhatsApp right now. Please try again later.');
        return;
      }
      await Linking.openURL(whatsappUrl);
    } catch (error) {
      console.log('[AgentCard] Failed to open WhatsApp:', error);
      Alert.alert('Connection Error', 'Unable to open WhatsApp. Please try again.');
    }
  }, [agent.name, agent.whatsapp, hasWhatsapp]);

  const handleApplyPress = useCallback(() => {
    console.log('[AgentCard] Redirecting to consultation flow for agent:', agent.id);
    router.push(`/agent/${agent.id}?consult=1`);
  }, [agent.id, router]);

  const badgeLabel = agent.premium ? t('premiumPartner') : agent.type === 'company' ? t('company') : t('individual');
  const badgeColor = agent.premium ? Colors.gold : agent.type === 'company' ? Colors.primaryLight : Colors.success;
  const licenseLabel = agent.licenseType === 'BNM_SSM' ? 'BNM & SSM' : agent.licenseType;
  const experienceYears = agent.yearsExperience != null ? Math.max(0, agent.yearsExperience) : Math.max(1, new Date().getFullYear() - agent.since);

  if (compact) {
    return (
      <Pressable onPress={navigateToAgent} onPressIn={handlePressIn} onPressOut={handlePressOut} testID={`agent-card-compact-${agent.id}`}>
        <Animated.View style={[styles.compactCard, { transform: [{ scale: scaleAnim }] }]}> 
          {agent.premium && <View style={styles.premiumStripe} />}
          <Image source={{ uri: agent.avatar }} style={styles.compactAvatar} contentFit="cover" />
          <View style={styles.compactInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.compactName} numberOfLines={1}>{agent.name}</Text>
              {agent.verified && <ShieldCheck size={14} color={Colors.verified} />}
            </View>
            <Text style={styles.compactCompany} numberOfLines={1}>{agent.company}</Text>
            <View style={styles.ratingRow}>
              <Star size={12} color={Colors.gold} fill={Colors.gold} />
              <Text style={styles.ratingText}>{agent.rating}</Text>
              <Text style={styles.dotSep}>·</Text>
              <Text style={styles.metaText}>{agent.successCases} {t('successCases').toLowerCase()}</Text>
            </View>
            {distance != null && (
              <Text style={styles.distanceText}>{distance.toFixed(1)} {t('kmAway')}</Text>
            )}
          </View>
        </Animated.View>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={navigateToAgent} onPressIn={handlePressIn} onPressOut={handlePressOut} testID={`agent-card-${agent.id}`}>
      <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}> 
        {agent.premium && <View style={styles.premiumBorder} />}

        <View style={styles.cardHeader}>
          <Image source={{ uri: agent.avatar }} style={styles.avatar} contentFit="cover" />
          <View style={styles.headerInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{agent.name}</Text>
              {agent.verified && <ShieldCheck size={16} color={Colors.verified} />}
              {agent.premium && <Crown size={16} color={Colors.gold} />}
            </View>
            <Text style={styles.company} numberOfLines={1}>{agent.company}</Text>
            <View style={[styles.typeBadge, { backgroundColor: `${badgeColor}1A` }]}>
              <Text style={[styles.typeBadgeText, { color: badgeColor }]}>{badgeLabel}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.description} numberOfLines={2}>{agent.description[language]}</Text>

        <View style={styles.comparisonRow}>
          <View style={styles.comparisonItem}>
            <Star size={14} color={Colors.gold} fill={Colors.gold} />
            <Text style={styles.comparisonValue}>{agent.rating}</Text>
            <Text style={styles.comparisonLabel}>({agent.reviewCount})</Text>
          </View>
          <View style={styles.comparisonItem}>
            <BriefcaseBusiness size={14} color={Colors.primaryLight} />
            <Text style={styles.comparisonValue}>{experienceYears}年经验</Text>
            <Text style={styles.comparisonLabel}>{t('since')} {agent.since}</Text>
          </View>
          <View style={styles.comparisonItem}>
            <MapPin size={14} color={Colors.textSecondary} />
            <Text style={styles.comparisonValue} numberOfLines={1}>{agent.state}</Text>
          </View>
        </View>

        <View style={styles.licenseRow}>
          <FileCheck size={13} color={Colors.verified} />
          <Text style={styles.licenseText}>{licenseLabel}: {agent.licenseNo}</Text>
          {agent.verified && (
            <View style={styles.verifiedBadge}>
              <CheckCircle size={12} color={Colors.verified} />
              <Text style={styles.verifiedText}>{t('verified')}</Text>
            </View>
          )}
        </View>

        {distance != null && (
          <View style={styles.distanceBadge}>
            <MapPin size={12} color={Colors.primary} />
            <Text style={styles.distanceBadgeText}>{distance.toFixed(1)} {t('kmAway')}</Text>
          </View>
        )}

        {agent.loanTypes && agent.loanTypes.length > 0 ? (
          <View style={styles.partnerHeader}>
            <Landmark size={14} color={Colors.primaryLight} />
            <Text style={styles.partnerTitle}>Loan Types</Text>
          </View>
        ) : null}
        {agent.loanTypes && agent.loanTypes.length > 0 ? (
          <View style={styles.banksRow}>
            {agent.loanTypes.slice(0, 4).map((loan) => (
              <View key={loan} style={styles.bankChip}>
                <Text style={styles.bankChipText}>{loan}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {agent.languages && agent.languages.length > 0 ? (
          <View style={styles.partnerHeader}>
            <Landmark size={14} color={Colors.primaryLight} />
            <Text style={styles.partnerTitle}>Languages</Text>
          </View>
        ) : null}
        {agent.languages && agent.languages.length > 0 ? (
          <View style={styles.banksRow}>
            {agent.languages.slice(0, 4).map((lang) => (
              <View key={lang} style={styles.bankChip}>
                <Text style={styles.bankChipText}>{lang}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {agent.districts && agent.districts.length > 0 ? (
          <View style={styles.partnerHeader}>
            <Landmark size={14} color={Colors.primaryLight} />
            <Text style={styles.partnerTitle}>Service Areas</Text>
          </View>
        ) : null}
        {agent.districts && agent.districts.length > 0 ? (
          <View style={styles.banksRow}>
            {agent.districts.slice(0, 4).map((district) => (
              <View key={district} style={styles.bankChip}>
                <Text style={styles.bankChipText}>{district}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.ctaRow}>
          {hasWhatsapp ? (
            <Pressable style={styles.primaryCta} onPress={handleWhatsAppPress} testID={`agent-whatsapp-${agent.id}`}>
              <MessageCircle size={14} color={Colors.white} />
              <Text style={styles.primaryCtaText}>{t('whatsappAgent')}</Text>
            </Pressable>
          ) : null}
          <Pressable style={[styles.secondaryCta, !hasWhatsapp && styles.secondaryCtaFull]} onPress={handleApplyPress} testID={`agent-apply-${agent.id}`}>
            <Text style={styles.secondaryCtaText}>{t('applyForLoan')}</Text>
            <ArrowRight size={14} color={Colors.primary} />
          </Pressable>
        </View>
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 16,
    ...Platform.select({
      ios: {
        shadowColor: Colors.shadowColor,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
      web: {
        shadowColor: Colors.shadowColor,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      },
    }),
    overflow: 'hidden' as const,
  },
  premiumBorder: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: Colors.gold,
  },
  cardHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.inputBg,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  nameRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  name: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  company: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  typeBadge: {
    alignSelf: 'flex-start' as const,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700' as const,
  },
  description: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginTop: 12,
  },
  comparisonRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: 12,
    backgroundColor: Colors.inputBg,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 10,
  },
  comparisonItem: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  comparisonValue: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    maxWidth: 60,
  },
  comparisonLabel: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  licenseRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginTop: 10,
    flexWrap: 'wrap' as const,
  },
  licenseText: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.verified,
  },
  verifiedBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    backgroundColor: Colors.badgeBg,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  verifiedText: {
    fontSize: 10,
    color: Colors.verified,
    fontWeight: '700' as const,
  },
  distanceBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    marginTop: 8,
    backgroundColor: `${Colors.primary}10`,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    alignSelf: 'flex-start' as const,
  },
  distanceBadgeText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  partnerHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginTop: 12,
  },
  partnerTitle: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.primaryLight,
  },
  banksRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
    marginTop: 8,
  },
  bankChip: {
    backgroundColor: Colors.inputBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  bankChipText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  ctaRow: {
    marginTop: 14,
    flexDirection: 'row' as const,
    gap: 8,
  },
  primaryCta: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexDirection: 'row' as const,
    gap: 6,
    flex: 1,
  },
  primaryCtaText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '700' as const,
  },
  secondaryCta: {
    borderColor: Colors.primary,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 10,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexDirection: 'row' as const,
    gap: 6,
    flex: 1,
    backgroundColor: Colors.white,
  },
  secondaryCtaText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  secondaryCtaFull: {
    flex: 1,
  },
  compactCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 12,
    width: 200,
    marginRight: 12,
    overflow: 'hidden' as const,
    ...Platform.select({
      ios: {
        shadowColor: Colors.shadowColor,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
      web: {
        shadowColor: Colors.shadowColor,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
    }),
  },
  premiumStripe: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: Colors.gold,
  },
  compactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.inputBg,
    marginBottom: 8,
  },
  compactInfo: {
    flex: 1,
  },
  compactName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  compactCompany: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  ratingRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    marginTop: 6,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
  },
  dotSep: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  metaText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  distanceText: {
    fontSize: 11,
    fontWeight: '500' as const,
    color: Colors.primary,
    marginTop: 4,
  },
});
