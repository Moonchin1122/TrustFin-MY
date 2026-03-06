import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { Wallet, Car, Home, CreditCard, Briefcase, RefreshCw, GraduationCap, Banknote } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import Colors from '@/constants/colors';

const iconMap: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  Wallet,
  Car,
  Home,
  CreditCard,
  Briefcase,
  RefreshCw,
  GraduationCap,
  Banknote,
};

interface CategoryCardProps {
  translationKey: string;
  icon: string;
  color: string;
  bgColor: string;
  onPress?: () => void;
}

export default React.memo(function CategoryCard({ translationKey, icon, color, bgColor, onPress }: CategoryCardProps) {
  const { t } = useLanguage();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, { toValue: 0.93, useNativeDriver: true }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, { toValue: 1, friction: 3, useNativeDriver: true }).start();
  }, [scaleAnim]);

  const IconComponent = iconMap[icon];

  return (
    <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut} testID={`category-card-${translationKey}`}>
      <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>
        <View style={[styles.iconContainer, { backgroundColor: bgColor }]}>
          {IconComponent && <IconComponent size={30} color={color} />}
        </View>
        <Text style={styles.label} numberOfLines={2}>{t(translationKey)}</Text>
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    alignItems: 'center' as const,
    width: 118,
    marginRight: 16,
    paddingVertical: 6,
  },
  iconContainer: {
    width: 68,
    height: 68,
    borderRadius: 20,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    textAlign: 'center' as const,
  },
});
