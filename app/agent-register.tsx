import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Animated,
  ScrollView,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowRight,
  ArrowLeft,
  Building2,
  UserCheck,
  Camera,
  FileCheck,
  CheckCircle,
  ScanFace,
  ShieldCheck,
  AlertTriangle,
  CreditCard,
  FileText,
  Users,
  ChevronDown,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import Colors from '@/constants/colors';
import { normalizeMalaysiaPhone, sanitizeMalaysiaPhoneInput } from '@/lib/phone';
import { malaysianDistricts } from '@/mocks/agents';

type AgentType = 'individual' | 'company';
type KycStep = 'type' | 'info' | 'documents' | 'face';

interface DocumentItem {
  id: string;
  titleKey: string;
  descKey: string;
  icon: React.ReactNode;
  uploaded: boolean;
}

const STATES = [
  'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan',
  'Pahang', 'Perak', 'Perlis', 'Pulau Pinang', 'Sabah',
  'Sarawak', 'Selangor', 'Terengganu', 'Kuala Lumpur', 'Putrajaya', 'Labuan',
];

const DOC_COLUMN_MAP: Record<string, string> = {
  mykad_front: 'ic_front_url',
  mykad_back: 'ic_back_url',
  license: 'license_url',
  selfie: 'selfie_url',
};

const REVERSE_COLUMN_MAP: Record<string, string> = {
  ic_front_url: 'mykad_front',
  ic_back_url: 'mykad_back',
  license_url: 'license',
  selfie_url: 'selfie',
};

export default function AgentRegisterScreen() {
  const { t } = useLanguage();
  const { user, saveUser } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [agentType, setAgentType] = useState<AgentType>('individual');
  const [kycStep, setKycStep] = useState<KycStep>('type');
  const [agentName, setAgentName] = useState<string>(user.name || '');
  const [agentPhone, setAgentPhone] = useState<string>(user.phone?.replace('+60', '') || '');
  const [agentEmail, setAgentEmail] = useState<string>(user.email || '');
  const [agentState, setAgentState] = useState<string>('');
  const [agentDistricts, setAgentDistricts] = useState<string[]>([]);
  const [licenseNo, setLicenseNo] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>('');
  const [showStateDropdown, setShowStateDropdown] = useState<boolean>(false);
  const [faceScanDone, setFaceScanDone] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [kycRejectReason, setKycRejectReason] = useState<string | null>(null);
  const [kycStatus, setKycStatus] = useState<string | null>(null);
  const [loadingKyc, setLoadingKyc] = useState<boolean>(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const faceScanAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const getIndividualDocs = useCallback((): DocumentItem[] => [
    { id: 'mykad_front', titleKey: 'uploadMyKad', descKey: 'uploadMyKadDesc', icon: <CreditCard size={22} color={Colors.primary} />, uploaded: false },
    { id: 'mykad_back', titleKey: 'uploadAgentCode', descKey: 'uploadAgentCodeDesc', icon: <FileCheck size={22} color={Colors.primary} />, uploaded: false },
    { id: 'license', titleKey: 'uploadBankProof', descKey: 'uploadBankProofDesc', icon: <Building2 size={22} color={Colors.primary} />, uploaded: false },
    { id: 'selfie', titleKey: 'uploadSelfie', descKey: 'uploadSelfieDesc', icon: <Camera size={22} color={Colors.primary} />, uploaded: false },
  ], []);

  const getCompanyDocs = useCallback((): DocumentItem[] => [
    { id: 'mykad_front', titleKey: 'uploadSSM', descKey: 'uploadSSMDesc', icon: <FileText size={22} color={Colors.primary} />, uploaded: false },
    { id: 'mykad_back', titleKey: 'companyBankAccount', descKey: 'companyBankAccountDesc', icon: <Building2 size={22} color={Colors.primary} />, uploaded: false },
    { id: 'license', titleKey: 'directorList', descKey: 'directorListDesc', icon: <Users size={22} color={Colors.primary} />, uploaded: false },
    { id: 'selfie', titleKey: 'uploadSelfie', descKey: 'uploadSelfieDesc', icon: <Camera size={22} color={Colors.primary} />, uploaded: false },
  ], []);

  const [uploadedDocs, setUploadedDocs] = useState<Record<string, boolean>>({});
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);

  const docs = agentType === 'individual' ? getIndividualDocs() : getCompanyDocs();

  const uploadedCount = docs.filter((d) => uploadedDocs[d.id]).length;
  const totalDocs = docs.length;
  const kycProgress = Math.round((uploadedCount / totalDocs) * 100);
  const allDocsReady = uploadedCount === totalDocs;

  useEffect(() => {
    if (!user.id) return;
    setLoadingKyc(true);
    console.log('[KYC-PROGRESS] Fetching kyc_submissions for agent:', user.id);
    supabase
      .from('kyc_submissions')
      .select('id, ic_front_url, ic_back_url, license_url, selfie_url, status, reject_reason')
      .eq('agent_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.log('[KYC-PROGRESS] No existing submission or error:', error.message);
        }
        if (data) {
          console.log('[KYC-PROGRESS] Found submission:', JSON.stringify(data));
          const existing: Record<string, boolean> = {};
          Object.entries(REVERSE_COLUMN_MAP).forEach(([col, docId]) => {
            const val = (data as Record<string, string | null>)[col];
            if (val && val.trim() !== '') {
              existing[docId] = true;
            }
          });
          setUploadedDocs((prev) => ({ ...prev, ...existing }));
          setKycStatus(data.status ?? null);
          setKycRejectReason(data.reject_reason ?? null);
          setSubmissionId((data as { id?: string }).id ?? null);
        }
        setLoadingKyc(false);
      });
  }, [user.id]);

  const animateTransition = useCallback((callback: () => void) => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -20, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      callback();
      slideAnim.setValue(20);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    });
  }, [fadeAnim, slideAnim]);

  const ensureSubmissionId = useCallback(async (): Promise<string> => {
    if (!user.id) {
      throw new Error('You must be logged in to upload documents.');
    }

    if (submissionId) {
      return submissionId;
    }

    console.log('[KYC-UPLOAD] Ensuring kyc_submissions row exists for agent:', user.id);
    const { data: existingRow, error: selectError } = await supabase
      .from('kyc_submissions')
      .select('id')
      .eq('agent_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (selectError) {
      console.log('[KYC-UPLOAD] ensureSubmissionId select error:', selectError.message);
      throw selectError;
    }

    if (existingRow?.id) {
      setSubmissionId(existingRow.id);
      return existingRow.id;
    }

    const phoneRes = normalizeMalaysiaPhone(agentPhone);
    const insertPayload: Record<string, string | null> = {
      agent_id: user.id,
      status: 'pending',
      full_name: agentName.trim() || null,
      phone: phoneRes.normalized || null,
      email: agentEmail.trim() || null,
      state: agentState || null,
      license_no: licenseNo.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { data: insertedRow, error: insertError } = await supabase
      .from('kyc_submissions')
      .insert(insertPayload)
      .select('id')
      .single();

    if (insertError || !insertedRow?.id) {
      console.log('[KYC-UPLOAD] ensureSubmissionId insert error:', insertError?.message ?? 'missing inserted id');
      throw insertError ?? new Error('Failed to create KYC submission row.');
    }

    setSubmissionId(insertedRow.id);
    return insertedRow.id;
  }, [submissionId, user.id, agentName, agentPhone, agentEmail, agentState, licenseNo]);

  const handleUploadDoc = useCallback(async (docId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (!user.id) {
      Alert.alert('Error', 'You must be logged in to upload documents.');
      return;
    }

    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant photo library access to upload documents.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]) {
        console.log('[KYC-UPLOAD] User cancelled image picker for', docId);
        return;
      }

      setUploadingDoc(docId);
      const asset = result.assets[0];
      const ensuredSubmissionId = await ensureSubmissionId();
      const filenameFromAsset = asset.fileName?.trim() || asset.uri.split('/').pop()?.split('?')[0]?.trim() || `${docId}.jpg`;
      const safeFilename = filenameFromAsset.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `agents/${user.id}/${ensuredSubmissionId}/${docId}/${safeFilename}`;

      console.log('[KYC-UPLOAD] Uploading', docId, 'to', storagePath, 'with submissionId:', ensuredSubmissionId);

      let uploadBody: FormData | Blob;

      if (Platform.OS === 'web') {
        const response = await fetch(asset.uri);
        uploadBody = await response.blob();
      } else {
        const formData = new FormData();
        formData.append('file', {
          uri: asset.uri,
          name: safeFilename,
          type: asset.mimeType || 'image/jpeg',
        } as any);
        uploadBody = formData;
      }

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('KYC')
        .upload(storagePath, uploadBody, {
          contentType: asset.mimeType || 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        console.log('[KYC-UPLOAD] Storage upload error for', docId, ':', uploadError.message);
        Alert.alert('Upload Error', uploadError.message);
        setUploadingDoc(null);
        return;
      }

      const uploadedPath = uploadData?.path;
      if (!uploadedPath) {
        console.log('[KYC-UPLOAD] Missing upload path in response for', docId);
        Alert.alert('Upload Error', 'Upload completed but file path is missing. Please retry.');
        setUploadingDoc(null);
        return;
      }

      console.log('[KYC-UPLOAD] Uploaded successfully:', uploadedPath);

      const column = DOC_COLUMN_MAP[docId];
      if (!column) {
        console.log('[KYC-UPLOAD] Unknown doc_type, skipping kyc_submissions write:', docId);
      } else {
        const updatePayload: Record<string, string> = {
          [column]: uploadedPath,
          status: 'pending',
          updated_at: new Date().toISOString(),
        };
        console.log('[KYC-UPLOAD] Updating kyc_submissions column:', column, 'for submission:', ensuredSubmissionId);

        const { error: updateError } = await supabase
          .from('kyc_submissions')
          .update(updatePayload)
          .eq('id', ensuredSubmissionId);

        if (updateError) {
          console.log('[KYC-UPLOAD] kyc_submissions update error:', updateError.message);
          Alert.alert('Upload Error', `Failed to save ${docId} path to submission.`);
          setUploadingDoc(null);
          return;
        }

        console.log('[KYC-UPLOAD] kyc_submissions column', column, 'updated for', docId, 'submission:', ensuredSubmissionId);
      }

      setUploadedDocs((prev) => ({ ...prev, [docId]: true }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      console.log('[KYC-UPLOAD] Error uploading', docId, ':', err);
      Alert.alert('Upload Failed', err?.message ?? String(err));
    } finally {
      setUploadingDoc(null);
    }
  }, [user.id, ensureSubmissionId]);

  const startFaceScan = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    ).start();

    Animated.timing(faceScanAnim, { toValue: 1, duration: 2500, useNativeDriver: false }).start(() => {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
      setFaceScanDone(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    });
  }, [faceScanAnim, pulseAnim]);

  const handleSubmit = useCallback(async () => {
    if (!agentName.trim() || !agentPhone.trim() || !agentState || agentDistricts.length === 0) {
      Alert.alert('', t('fillAllFields'));
      return;
    }

    const phoneResult = normalizeMalaysiaPhone(agentPhone);
    if (!phoneResult.normalized) {
      Alert.alert('', phoneResult.error ?? t('invalidPhone'));
      return;
    }

    if (!user.id) {
      Alert.alert('Error', 'You must be logged in to register as an agent.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsLoading(true);

    try {
      const docIds = Object.keys(uploadedDocs).filter((k) => uploadedDocs[k]);
      const allDocsUploaded = docs.every((d) => uploadedDocs[d.id]);

      console.log('[AGENT-REGISTER] Upserting agent row for user:', user.id);
      const { error: agentError } = await supabase
        .from('agents')
        .upsert({
          id: user.id,
          name: agentName.trim(),
          full_name: agentName.trim(),
          phone: phoneResult.normalized,
          email: agentEmail.trim() || null,
          company: agentType === 'company' ? companyName.trim() : null,
          company_name: agentType === 'company' ? companyName.trim() : null,
          license_no: licenseNo.trim() || null,
          state: agentState,
          districts: agentDistricts,
          agent_type: agentType,
          verified: false,
          kyc_status: allDocsUploaded ? 'pending' : 'incomplete',
          kyc_submitted_at: allDocsUploaded ? new Date().toISOString() : null,
        }, { onConflict: 'id' });

      if (agentError) {
        console.log('[AGENT-REGISTER] agents upsert error:', agentError.message, agentError.details);
        throw agentError;
      }
      console.log('[AGENT-REGISTER] Agent row upserted successfully, docs uploaded:', docIds.length);

      const updatedUser = {
        ...user,
        name: agentName.trim(),
        phone: phoneResult.normalized,
        email: agentEmail.trim(),
        role: 'agent' as const,
        isVerified: false,
        agentType,
        kycStatus: 'pending' as const,
        companyName: agentType === 'company' ? companyName : undefined,
        licenseNo: licenseNo || undefined,
        state: agentState,
        district: agentDistricts[0] ?? undefined,
      };

      await saveUser(updatedUser);
      console.log('[AGENT-REGISTER] Local user profile saved');

      setIsLoading(false);
      Alert.alert(
        t('registrationSubmitted'),
        t('registrationPending'),
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (err: any) {
      console.log('[AGENT-REGISTER] Submit error:', err);
      setIsLoading(false);
      const status = err?.status ?? err?.statusCode ?? '';
      const msg = err?.message ?? String(err);
      Alert.alert('Registration Error', status ? `[${status}] ${msg}` : msg);
    }
  }, [agentName, agentPhone, agentEmail, agentState, agentDistricts, agentType, companyName, licenseNo, user, saveUser, t, router, uploadedDocs, docs]);

  const handleNext = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (kycStep === 'type') {
      animateTransition(() => setKycStep('info'));
    } else if (kycStep === 'info') {
      if (!agentName.trim() || !agentPhone.trim() || !agentState || agentDistricts.length === 0) {
        Alert.alert('', t('fillAllFields'));
        return;
      }
      const phoneResult = normalizeMalaysiaPhone(agentPhone);
      if (!phoneResult.normalized) {
        Alert.alert('', phoneResult.error ?? t('invalidPhone'));
        return;
      }
      animateTransition(() => setKycStep('documents'));
    } else if (kycStep === 'documents') {
      animateTransition(() => setKycStep('face'));
    }
  }, [kycStep, agentName, agentPhone, agentState, agentDistricts.length, t, animateTransition]);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (kycStep === 'face') {
      animateTransition(() => setKycStep('documents'));
    } else if (kycStep === 'documents') {
      animateTransition(() => setKycStep('info'));
    } else if (kycStep === 'info') {
      animateTransition(() => setKycStep('type'));
    } else {
      router.back();
    }
  }, [kycStep, router, animateTransition]);

  const stepIndex = kycStep === 'type' ? 1 : kycStep === 'info' ? 2 : kycStep === 'documents' ? 3 : 4;

  const renderProgressBar = () => (
    <View style={styles.progressContainer}>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${(stepIndex / 4) * 100}%` }]} />
      </View>
      <Text style={styles.progressText}>
        {t(`step${stepIndex}of4`)}
      </Text>
    </View>
  );

  const renderTypeStep = () => (
    <View style={styles.stepContent}>
      <View style={styles.headerSection}>
        <View style={styles.headerIcon}>
          <ShieldCheck size={32} color={Colors.white} />
        </View>
        <Text style={styles.headerTitle}>{t('agentRegister')}</Text>
        <Text style={styles.headerSubtitle}>{t('agentRegisterSubtitle')}</Text>
      </View>

      <Text style={styles.sectionTitle}>{t('agentType')}</Text>

      <Pressable
        style={[styles.typeCard, agentType === 'individual' && styles.typeCardActive]}
        onPress={() => { setAgentType('individual'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        testID="type-individual"
      >
        <View style={[styles.typeIconBg, { backgroundColor: '#E3F2FD' }]}>
          <UserCheck size={28} color="#1565C0" />
        </View>
        <View style={styles.typeInfo}>
          <Text style={styles.typeName}>{t('individualAgent')}</Text>
          <Text style={styles.typeDesc}>{t('individualAgentDesc')}</Text>
        </View>
        <View style={[styles.radioOuter, agentType === 'individual' && styles.radioOuterActive]}>
          {agentType === 'individual' && <View style={styles.radioInner} />}
        </View>
      </Pressable>

      <Pressable
        style={[styles.typeCard, agentType === 'company' && styles.typeCardActive]}
        onPress={() => { setAgentType('company'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        testID="type-company"
      >
        <View style={[styles.typeIconBg, { backgroundColor: '#FFF3E0' }]}>
          <Building2 size={28} color="#E65100" />
        </View>
        <View style={styles.typeInfo}>
          <Text style={styles.typeName}>{t('companyAgent')}</Text>
          <Text style={styles.typeDesc}>{t('companyAgentDesc')}</Text>
        </View>
        <View style={[styles.radioOuter, agentType === 'company' && styles.radioOuterActive]}>
          {agentType === 'company' && <View style={styles.radioInner} />}
        </View>
      </Pressable>
    </View>
  );

  const renderInfoStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.sectionTitle}>{t('personalInfo')}</Text>

      {agentType === 'company' && (
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('companyInfo')} *</Text>
          <TextInput
            style={styles.input}
            placeholder={t('agentName')}
            placeholderTextColor={Colors.textMuted}
            value={companyName}
            onChangeText={setCompanyName}
          />
        </View>
      )}

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{t('fullName')} *</Text>
        <TextInput
          style={styles.input}
          placeholder={t('fullName')}
          placeholderTextColor={Colors.textMuted}
          value={agentName}
          onChangeText={setAgentName}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{t('agentPhone')} *</Text>
        <View style={styles.phoneRow}>
          <View style={styles.countryCode}>
            <Text style={styles.countryCodeText}>+60</Text>
          </View>
          <TextInput
            style={styles.phoneInput}
            placeholder="12 345 6789"
            placeholderTextColor={Colors.textMuted}
            keyboardType="phone-pad"
            value={agentPhone}
            onChangeText={(value) => setAgentPhone(sanitizeMalaysiaPhoneInput(value))}
          />
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{t('agentEmail')}</Text>
        <TextInput
          style={styles.input}
          placeholder="agent@example.com"
          placeholderTextColor={Colors.textMuted}
          keyboardType="email-address"
          autoCapitalize="none"
          value={agentEmail}
          onChangeText={setAgentEmail}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{t('licenseNo')}</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. BNM/XXXXXXX"
          placeholderTextColor={Colors.textMuted}
          value={licenseNo}
          onChangeText={setLicenseNo}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{t('agentState')} *</Text>
        <Pressable
          style={styles.dropdown}
          onPress={() => setShowStateDropdown(!showStateDropdown)}
        >
          <Text style={[styles.dropdownText, !agentState && { color: Colors.textMuted }]}>
            {agentState || t('selectState')}
          </Text>
          <ChevronDown size={18} color={Colors.textMuted} />
        </Pressable>
        {showStateDropdown && (
          <View style={styles.dropdownList}>
            <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
              {STATES.map((s) => (
                <Pressable
                  key={s}
                  style={[styles.dropdownItem, agentState === s && styles.dropdownItemActive]}
                  onPress={() => {
                    setAgentState(s);
                    setAgentDistricts([]);
                    setShowStateDropdown(false);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text style={[styles.dropdownItemText, agentState === s && styles.dropdownItemTextActive]}>
                    {s}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {agentState ? (
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Service Districts *</Text>
          <View style={styles.districtsWrap}>
            {(malaysianDistricts[agentState] ?? []).map((district) => {
              const selected = agentDistricts.includes(district);
              return (
                <Pressable
                  key={district}
                  style={[styles.districtChip, selected && styles.districtChipActive]}
                  onPress={() => {
                    setAgentDistricts((prev) => {
                      if (prev.includes(district)) {
                        const next = prev.filter((item) => item !== district);
                        console.log('[AGENT-REGISTER] Removed district:', district, 'remaining:', next);
                        return next;
                      }
                      const next = [...prev, district];
                      console.log('[AGENT-REGISTER] Added district:', district, 'current:', next);
                      return next;
                    });
                    Haptics.selectionAsync();
                  }}
                  testID={`district-chip-${district}`}
                >
                  <Text style={[styles.districtChipText, selected && styles.districtChipTextActive]}>{district}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );

  const handleSubmitForReview = useCallback(async () => {
    if (!user.id) return;

    if (!agentName.trim() || !agentPhone.trim() || !agentState || agentDistricts.length === 0) {
      Alert.alert('', t('fillAllFields'));
      return;
    }

    const phoneResult = normalizeMalaysiaPhone(agentPhone);
    if (!phoneResult.normalized) {
      Alert.alert('', phoneResult.error ?? t('invalidPhone'));
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsLoading(true);
    try {
      console.log('[KYC-SUBMIT] Upserting agent row for user:', user.id);
      const { error: agentErr } = await supabase
        .from('agents')
        .upsert({
          id: user.id,
          name: agentName.trim(),
          full_name: agentName.trim(),
          phone: phoneResult.normalized,
          email: agentEmail.trim() || null,
          company: agentType === 'company' ? companyName.trim() : null,
          company_name: agentType === 'company' ? companyName.trim() : null,
          license_no: licenseNo.trim() || null,
          state: agentState,
          districts: agentDistricts,
          agent_type: agentType,
          verified: false,
          kyc_status: 'pending',
          kyc_submitted_at: new Date().toISOString(),
        }, { onConflict: 'id' });
      if (agentErr) {
        console.log('[KYC-SUBMIT] agents upsert error:', agentErr.message);
        throw agentErr;
      }

      console.log('[KYC-SUBMIT] Updating kyc_submissions with personal info for agent:', user.id);
      const { error: kycErr } = await supabase
        .from('kyc_submissions')
        .update({
          status: 'pending',
          full_name: agentName.trim(),
          phone: phoneResult.normalized,
          email: agentEmail.trim() || null,
          state: agentState,
          districts: agentDistricts,
          license_no: licenseNo.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('agent_id', user.id);
      if (kycErr) {
        console.log('[KYC-SUBMIT] kyc_submissions update error:', kycErr.message);
      }

      setKycStatus('pending');
      setKycRejectReason(null);

      const updatedUser = {
        ...user,
        name: agentName.trim(),
        phone: phoneResult.normalized,
        email: agentEmail.trim(),
        role: 'agent' as const,
        isVerified: false,
        agentType,
        kycStatus: 'pending' as const,
        companyName: agentType === 'company' ? companyName : undefined,
        licenseNo: licenseNo || undefined,
        state: agentState,
        district: agentDistricts[0] ?? undefined,
      };
      await saveUser(updatedUser);
      console.log('[KYC-SUBMIT] Local user profile saved');

      Alert.alert('Submitted', 'Your KYC documents have been submitted for review.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      console.log('[KYC-SUBMIT] Error:', err);
      Alert.alert('Error', err?.message ?? String(err));
    } finally {
      setIsLoading(false);
    }
  }, [user, saveUser, router, agentName, agentPhone, agentEmail, agentState, agentDistricts, agentType, companyName, licenseNo, t]);

  const renderDocumentsStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.sectionTitle}>{t('documentUpload')}</Text>
      <Text style={styles.sectionSubtitle}>{t('kycDesc')}</Text>

      {kycStatus === 'rejected' && kycRejectReason && (
        <View style={styles.rejectBanner}>
          <View style={styles.rejectBannerHeader}>
            <AlertTriangle size={18} color="#DC2626" />
            <Text style={styles.rejectBannerTitle}>KYC Rejected</Text>
          </View>
          <Text style={styles.rejectBannerReason}>Reason: {kycRejectReason}</Text>
          <Text style={styles.rejectBannerHint}>Please re-upload the required documents and submit again.</Text>
        </View>
      )}

      <View style={styles.kycProgressCard}>
        <View style={styles.kycProgressHeader}>
          <Text style={styles.kycProgressTitle}>Upload Progress</Text>
          <Text style={[
            styles.kycProgressCount,
            allDocsReady && { color: Colors.success },
          ]}>
            {uploadedCount}/{totalDocs} docs
          </Text>
        </View>
        <View style={styles.kycProgressBarBg}>
          <Animated.View
            style={[
              styles.kycProgressBarFill,
              { width: `${kycProgress}%` },
              allDocsReady && { backgroundColor: Colors.success },
            ]}
          />
        </View>
        <Text style={styles.kycProgressPercent}>{kycProgress}% complete</Text>
      </View>

      {loadingKyc ? (
        <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 20 }} />
      ) : (
        docs.map((doc) => {
          const isUploading = uploadingDoc === doc.id;
          const isUploaded = uploadedDocs[doc.id];
          return (
            <Pressable
              key={doc.id}
              style={[styles.docCard, isUploaded && styles.docCardUploaded]}
              onPress={() => !isUploading && handleUploadDoc(doc.id)}
              disabled={isUploading}
            >
              <View style={[styles.docIconBg, isUploaded && { backgroundColor: '#E8F5E9' }]}>
                {isUploading ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : isUploaded ? (
                  <CheckCircle size={22} color={Colors.success} />
                ) : (
                  doc.icon
                )}
              </View>
              <View style={styles.docInfo}>
                <Text style={styles.docTitle}>{t(doc.titleKey)}</Text>
                <Text style={styles.docDesc}>
                  {isUploading ? 'Uploading...' : t(doc.descKey)}
                </Text>
              </View>
              {isUploaded ? (
                <View style={styles.uploadedBadge}>
                  <Text style={styles.uploadedBadgeText}>{t('uploaded')}</Text>
                </View>
              ) : isUploading ? null : (
                <View style={styles.missingBadge}>
                  <Text style={styles.missingBadgeText}>Missing</Text>
                </View>
              )}
            </Pressable>
          );
        })
      )}
    </View>
  );

  const renderFaceStep = () => {
    const scanProgress = faceScanAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['0%', '100%'],
    });

    return (
      <View style={styles.stepContent}>
        <Text style={styles.sectionTitle}>{t('faceVerification')}</Text>
        <Text style={styles.sectionSubtitle}>{t('faceVerificationDesc')}</Text>

        <View style={styles.faceContainer}>
          <Animated.View style={[styles.faceCircle, { transform: [{ scale: pulseAnim }] }]}>
            {faceScanDone ? (
              <CheckCircle size={56} color={Colors.success} />
            ) : (
              <ScanFace size={56} color={Colors.primary} />
            )}
          </Animated.View>

          <Text style={styles.faceScanText}>
            {faceScanDone ? t('faceScanComplete') : t('faceScanInstructions')}
          </Text>

          {!faceScanDone && (
            <View style={styles.scanProgressContainer}>
              <View style={styles.scanProgressBg}>
                <Animated.View style={[styles.scanProgressFill, { width: scanProgress }]} />
              </View>
            </View>
          )}

          {!faceScanDone && (
            <Pressable style={styles.scanBtn} onPress={startFaceScan}>
              <Camera size={20} color={Colors.white} />
              <Text style={styles.scanBtnText}>{t('startFaceScan')}</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.securityNote}>
          <ShieldCheck size={16} color={Colors.success} />
          <Text style={styles.securityNoteText}>
            {t('kycDesc')}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={handleBack} style={styles.navBtn} testID="agent-back-btn">
          <ArrowLeft size={22} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.topTitle}>{t('agentRegister')}</Text>
        <View style={{ width: 38 }} />
      </View>

      {renderProgressBar()}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            {kycStep === 'type' && renderTypeStep()}
            {kycStep === 'info' && renderInfoStep()}
            {kycStep === 'documents' && renderDocumentsStep()}
            {kycStep === 'face' && renderFaceStep()}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        {kycStep === 'documents' && allDocsReady ? (
          <Pressable
            style={[styles.submitReviewBtn, isLoading && styles.btnDisabled]}
            onPress={handleSubmitForReview}
            disabled={isLoading}
            testID="submit-review-btn"
          >
            <ShieldCheck size={20} color={Colors.white} />
            <Text style={styles.submitReviewBtnText}>
              {isLoading ? '...' : 'Submit for Review'}
            </Text>
          </Pressable>
        ) : kycStep !== 'face' ? (
          <Pressable style={styles.nextBtn} onPress={handleNext} testID="next-step-btn">
            <Text style={styles.nextBtnText}>{t('next')}</Text>
            <ArrowRight size={18} color={Colors.white} />
          </Pressable>
        ) : (
          <Pressable
            style={[styles.submitBtn, isLoading && styles.btnDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
            testID="submit-agent-btn"
          >
            <ShieldCheck size={20} color={Colors.white} />
            <Text style={styles.submitBtnText}>
              {isLoading ? '...' : t('submitRegistration')}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  navBtn: {
    padding: 8,
  },
  topTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  progressContainer: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  progressBar: {
    height: 4,
    backgroundColor: Colors.inputBg,
    borderRadius: 2,
    overflow: 'hidden' as const,
  },
  progressFill: {
    height: '100%' as const,
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textMuted,
    marginTop: 8,
    textAlign: 'right' as const,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  stepContent: {},
  headerSection: {
    alignItems: 'center' as const,
    marginBottom: 28,
  },
  headerIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center' as const,
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 18,
    lineHeight: 18,
  },
  typeCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    gap: 14,
  },
  typeCardActive: {
    borderColor: Colors.primary,
    backgroundColor: '#F0F4FA',
  },
  typeIconBg: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  typeInfo: {
    flex: 1,
  },
  typeName: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    marginBottom: 3,
  },
  typeDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.inputBorder,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  radioOuterActive: {
    borderColor: Colors.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    marginBottom: 6,
    marginLeft: 2,
  },
  input: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  phoneRow: {
    flexDirection: 'row' as const,
    gap: 10,
  },
  countryCode: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    justifyContent: 'center' as const,
  },
  countryCodeText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
  },
  phoneInput: {
    flex: 1,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  dropdown: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dropdownText: {
    fontSize: 15,
    color: Colors.textPrimary,
  },
  dropdownList: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: 12,
    marginTop: 4,
    overflow: 'hidden' as const,
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  dropdownItemActive: {
    backgroundColor: Colors.inputBg,
  },
  dropdownItemText: {
    fontSize: 14,
    color: Colors.textPrimary,
  },
  dropdownItemTextActive: {
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  districtsWrap: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 8,
  },
  districtChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D8E2F0',
    backgroundColor: '#F8FAFD',
  },
  districtChipActive: {
    borderColor: Colors.primary,
    backgroundColor: '#E8F1FF',
  },
  districtChipText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  districtChipTextActive: {
    color: Colors.primary,
  },
  docCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  docCardUploaded: {
    borderColor: Colors.success,
    backgroundColor: '#FAFFFE',
  },
  docIconBg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.inputBg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  docInfo: {
    flex: 1,
  },
  docTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  docDesc: {
    fontSize: 11,
    color: Colors.textMuted,
    lineHeight: 16,
  },
  uploadedBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  uploadedBadgeText: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.success,
  },
  faceContainer: {
    alignItems: 'center' as const,
    paddingVertical: 32,
  },
  faceCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: Colors.inputBg,
    borderWidth: 3,
    borderColor: Colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 24,
  },
  faceScanText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
    textAlign: 'center' as const,
    marginBottom: 20,
  },
  scanProgressContainer: {
    width: '80%' as const,
    marginBottom: 24,
  },
  scanProgressBg: {
    height: 6,
    backgroundColor: Colors.inputBg,
    borderRadius: 3,
    overflow: 'hidden' as const,
  },
  scanProgressFill: {
    height: '100%' as const,
    backgroundColor: Colors.success,
    borderRadius: 3,
  },
  scanBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  scanBtnText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.white,
  },
  securityNote: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    backgroundColor: '#E8F5E9',
    padding: 14,
    borderRadius: 12,
    marginTop: 12,
  },
  securityNoteText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  nextBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
  },
  nextBtnText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.white,
  },
  submitBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    backgroundColor: Colors.success,
    paddingVertical: 16,
    borderRadius: 14,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.white,
  },
  rejectBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    gap: 6,
  },
  rejectBannerHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  rejectBannerTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#DC2626',
  },
  rejectBannerReason: {
    fontSize: 13,
    color: '#991B1B',
    lineHeight: 19,
    paddingLeft: 26,
  },
  rejectBannerHint: {
    fontSize: 12,
    color: '#B91C1C',
    paddingLeft: 26,
    lineHeight: 17,
  },
  kycProgressCard: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  kycProgressHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 10,
  },
  kycProgressTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
  },
  kycProgressCount: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  kycProgressBarBg: {
    height: 8,
    backgroundColor: Colors.inputBg,
    borderRadius: 4,
    overflow: 'hidden' as const,
  },
  kycProgressBarFill: {
    height: '100%' as const,
    backgroundColor: Colors.primary,
    borderRadius: 4,
  },
  kycProgressPercent: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 6,
    textAlign: 'right' as const,
  },
  missingBadge: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  missingBadgeText: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.warning,
  },
  submitReviewBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    backgroundColor: Colors.success,
    paddingVertical: 16,
    borderRadius: 14,
  },
  submitReviewBtnText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.white,
  },
});
