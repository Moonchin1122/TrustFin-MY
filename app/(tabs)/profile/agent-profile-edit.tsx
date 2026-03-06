import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Stack } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Camera, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { resolveAvatarUrl } from '@/lib/avatar';
import { malaysianDistricts } from '@/mocks/agents';
import Colors from '@/constants/colors';

type AgentProfileRow = {
  id: string;
  avatar_url?: string | null;
  loan_types?: string[] | null;
  districts?: string[] | null;
  languages?: string[] | null;
  years_experience?: number | null;
  bio?: string | null;
  company?: string | null;
  state?: string | null;
};

const stateOptions = ['Johor', 'Selangor', 'Kuala Lumpur', 'Penang'] as const;
const loanTypeOptions = ['personalLoan', 'homeLoan', 'carLoan', 'businessLoan', 'refinancing', 'creditCard'] as const;
const languageOptions = ['English', '中文', 'Bahasa Melayu'] as const;

function Chip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable style={[styles.chip, selected && styles.chipActive]} onPress={onPress} testID={testID}>
      <Text style={[styles.chipText, selected && styles.chipTextActive]}>{label}</Text>
      {selected ? <Check size={12} color={Colors.white} /> : null}
    </Pressable>
  );
}

export default function AgentProfileEditScreen() {
  const { user, isLoggedIn, saveUser } = useAuth();
  const queryClient = useQueryClient();
  const [avatarPath, setAvatarPath] = useState<string>('');
  const [avatarDisplayUrl, setAvatarDisplayUrl] = useState<string>('');
  const [loanTypes, setLoanTypes] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [yearsExperience, setYearsExperience] = useState<string>('0');
  const [bio, setBio] = useState<string>('');
  const [company, setCompany] = useState<string>('');
  const [state, setState] = useState<string>('Kuala Lumpur');

  const canEdit = isLoggedIn && user.role === 'agent' && Boolean(user.id);

  const profileQuery = useQuery({
    queryKey: ['agent-profile-maintenance', user.id],
    enabled: canEdit,
    queryFn: async (): Promise<AgentProfileRow | null> => {
      console.log('[AGENT_PROFILE_EDIT] Fetching profile for user:', user.id);
      const { data, error } = await supabase
        .from('agents')
        .select('id, avatar_url, loan_types, districts, languages, years_experience, bio, company, state')
        .eq('id', user.id)
        .maybeSingle<AgentProfileRow>();

      if (error) {
        console.log('[AGENT_PROFILE_EDIT] Fetch failed:', error.message);
        throw new Error(error.message);
      }

      return data;
    },
  });

  useEffect(() => {
    const row = profileQuery.data;
    if (!row) {
      return;
    }

    setAvatarPath(row.avatar_url ?? user.avatar ?? '');
    setLoanTypes(row.loan_types ?? []);
    setDistricts(row.districts ?? []);
    setLanguages(row.languages ?? []);
    setYearsExperience(String(Math.max(0, Number(row.years_experience ?? 0))));
    setBio(row.bio ?? '');
    setCompany(row.company ?? '');
    setState(row.state ?? user.state ?? 'Kuala Lumpur');
  }, [profileQuery.data, user.avatar, user.state]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!avatarPath) {
        setAvatarDisplayUrl('');
        return;
      }

      const resolved = await resolveAvatarUrl(avatarPath);
      if (!cancelled) {
        setAvatarDisplayUrl(resolved ?? avatarPath);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [avatarPath]);

  const availableDistricts = useMemo(() => {
    return malaysianDistricts[state] ?? [];
  }, [state]);

  useEffect(() => {
    setDistricts((prev) => prev.filter((item) => availableDistricts.includes(item)));
  }, [availableDistricts]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const parsedYears = Math.max(0, Number(yearsExperience || '0'));
      console.log('[AGENT_PROFILE_EDIT] Saving profile payload for:', user.id);

      const payload = {
        avatar_url: avatarPath || null,
        loan_types: loanTypes,
        districts,
        languages,
        years_experience: Number.isFinite(parsedYears) ? parsedYears : 0,
        bio: bio.trim() || null,
        company: company.trim() || null,
        state,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('agents').update(payload).eq('id', user.id);
      if (error) {
        console.log('[AGENT_PROFILE_EDIT] Save failed:', error.message);
        throw new Error(error.message);
      }

      await saveUser({
        ...user,
        avatar: avatarPath || user.avatar,
        state,
        district: districts[0] ?? user.district,
      });

      return true;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agent-profile-maintenance', user.id] });
      await queryClient.invalidateQueries({ queryKey: ['home-verified-agents'] });
      await queryClient.invalidateQueries({ queryKey: ['home-nearby-agents'] });
      Alert.alert('已保存', '中介资料已更新。');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('保存失败', message);
    },
  });

  const toggleItem = useCallback((current: string[], value: string, setValue: (next: string[]) => void) => {
    if (current.includes(value)) {
      setValue(current.filter((item) => item !== value));
      return;
    }
    setValue([...current, value]);
  }, []);

  const uploadAvatarMutation = useMutation({
    mutationFn: async () => {
      if (!user.id) {
        throw new Error('Agent account is required.');
      }

      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Please allow photo access first.');
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]) {
        throw new Error('Image selection cancelled.');
      }

      const selectedAsset = result.assets[0];
      const storagePath = `agents/${user.id}/avatar.jpg`;
      const response = await fetch(selectedAsset.uri);
      const blob = await response.blob();

      const { data, error } = await supabase.storage.from('avatars').upload(storagePath, blob, {
        contentType: selectedAsset.mimeType ?? 'image/jpeg',
        upsert: true,
      });

      if (error || !data?.path) {
        throw new Error(error?.message ?? 'Failed to upload avatar');
      }

      return data.path;
    },
    onSuccess: async (path) => {
      setAvatarPath(path);
      const resolved = await resolveAvatarUrl(path);
      setAvatarDisplayUrl(resolved ?? path);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Upload failed';
      if (message !== 'Image selection cancelled.') {
        Alert.alert('上传失败', message);
      }
    },
  });

  if (!canEdit) {
    return (
      <View style={styles.centerState} testID="agent-profile-edit-forbidden">
        <Text style={styles.centerTitle}>请先登录中介账号</Text>
      </View>
    );
  }

  if (profileQuery.isLoading) {
    return (
      <View style={styles.centerState} testID="agent-profile-edit-loading">
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (profileQuery.isError) {
    return (
      <View style={styles.centerState} testID="agent-profile-edit-error">
        <Text style={styles.centerTitle}>加载资料失败</Text>
        <Text style={styles.centerSubtitle}>{profileQuery.error instanceof Error ? profileQuery.error.message : 'Unknown error'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: '中介资料维护' }} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} testID="agent-profile-edit-screen">
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>头像</Text>
          <Pressable
            style={styles.avatarButton}
            onPress={() => uploadAvatarMutation.mutate()}
            testID="agent-profile-avatar-upload"
          >
            {avatarDisplayUrl ? (
              <Image source={{ uri: avatarDisplayUrl }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Camera size={24} color={Colors.white} />
              </View>
            )}
            <Text style={styles.avatarText}>{uploadAvatarMutation.isPending ? '上传中...' : '上传头像'}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>州</Text>
          <View style={styles.chipsWrap}>
            {stateOptions.map((item) => (
              <Chip
                key={item}
                label={item}
                selected={state === item}
                onPress={() => {
                  setState(item);
                  Haptics.selectionAsync();
                }}
                testID={`agent-state-${item}`}
              />
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>可处理贷款</Text>
          <View style={styles.chipsWrap}>
            {loanTypeOptions.map((item) => (
              <Chip
                key={item}
                label={item}
                selected={loanTypes.includes(item)}
                onPress={() => toggleItem(loanTypes, item, setLoanTypes)}
                testID={`agent-loan-${item}`}
              />
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>服务地区</Text>
          <View style={styles.chipsWrap}>
            {availableDistricts.map((item) => (
              <Chip
                key={item}
                label={item}
                selected={districts.includes(item)}
                onPress={() => toggleItem(districts, item, setDistricts)}
                testID={`agent-district-${item}`}
              />
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>语言</Text>
          <View style={styles.chipsWrap}>
            {languageOptions.map((item) => (
              <Chip
                key={item}
                label={item}
                selected={languages.includes(item)}
                onPress={() => toggleItem(languages, item, setLanguages)}
                testID={`agent-language-${item}`}
              />
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>经验年数</Text>
          <TextInput
            style={styles.input}
            value={yearsExperience}
            onChangeText={setYearsExperience}
            keyboardType="number-pad"
            placeholder="例如 6"
            testID="agent-years-experience-input"
          />

          <Text style={styles.sectionTitle}>公司</Text>
          <TextInput
            style={styles.input}
            value={company}
            onChangeText={setCompany}
            placeholder="公司名称"
            testID="agent-company-input"
          />

          <Text style={styles.sectionTitle}>简介</Text>
          <TextInput
            style={[styles.input, styles.bioInput]}
            multiline
            value={bio}
            onChangeText={setBio}
            placeholder="填写你的专业经验和服务亮点"
            textAlignVertical="top"
            testID="agent-bio-input"
          />
        </View>

        <Pressable
          style={[styles.saveButton, saveMutation.isPending && styles.saveButtonDisabled]}
          onPress={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          testID="agent-profile-save"
        >
          {saveMutation.isPending ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.saveText}>保存资料</Text>}
        </Pressable>
      </ScrollView>
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
    paddingBottom: 28,
    gap: 12,
  },
  card: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: Colors.white,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: 10,
    backgroundColor: Colors.inputBg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  bioInput: {
    minHeight: 96,
  },
  saveButton: {
    marginTop: 2,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  avatarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.inputBg,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
  },
  centerState: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  centerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  centerSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
