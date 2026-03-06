import { Tabs } from 'expo-router';
import { Home, FileText, Shield, User, CreditCard, Gift } from 'lucide-react-native';
import React from 'react';
import { Platform } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import Colors from '@/constants/colors';

export default function TabLayout() {
  const { t } = useLanguage();
  const { user } = useAuth();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.tabBarInactive,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: Colors.tabBar,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: 62,
          paddingTop: 8,
          ...Platform.select({
            ios: {
              shadowColor: Colors.shadowColor,
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.06,
              shadowRadius: 10,
            },
            android: { elevation: 10 },
            web: {
              shadowColor: Colors.shadowColor,
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.06,
              shadowRadius: 10,
            },
          }),
        },
        tabBarIconStyle: {
          marginBottom: 0,
        },
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{
          title: t('home'),
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="apply"
        options={{
          href: user.role === 'agent' ? null : undefined,
          title: t('apply'),
          tabBarIcon: ({ color, size }) => <FileText size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="safety"
        options={{
          href: user.role === 'agent' ? null : undefined,
          title: t('safety'),
          tabBarIcon: ({ color, size }) => <Shield size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="leads"
        options={{
          href: user.role === 'agent' ? undefined : null,
          title: t('leadsTab'),
          tabBarIcon: ({ color, size }) => <FileText size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="subscription"
        options={{
          href: user.role === 'agent' ? undefined : null,
          title: t('subscriptionTab'),
          tabBarIcon: ({ color, size }) => <CreditCard size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="referral"
        options={{
          href: user.role === 'agent' ? undefined : null,
          title: t('rewardsTab'),
          tabBarIcon: ({ color, size }) => <Gift size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('profile'),
          tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
