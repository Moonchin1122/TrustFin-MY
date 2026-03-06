import React, { useState, useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PostgrestSingleResponse } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FileText, Zap, ChevronDown, Check, X, ShieldCheck, Star, BadgeCheck } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useLanguage } from '@/contexts/LanguageContext';
import { malaysianStates } from '@/mocks/agents';
import { loanCategories } from '@/mocks/categories';
import Colors from '@/constants/colors';
import { normalizeMalaysiaPhone, sanitizeMalaysiaPhoneInput } from '@/lib/phone';

type FormMode = 'select' | 'basic' | 'premium';
type SubmitStatus = 'default' | 'loading' | 'success' | 'error';

type SupabaseErrorLike = {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string;
};

function normalizeUnknownToString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

type BasicField = keyof BasicForm;
type PremiumField = keyof PremiumForm;
type FormErrors = Partial<Record<BasicField | PremiumField, string>>;

const STEP_TOTAL = 3;
const NUMERIC_REGEX = /^\d*$/;
const SUBMIT_TIMEOUT_MS = 12000;
const SUBMIT_DEBOUNCE_MS = 2000;
const LAST_SUBMITTED_PHONE_KEY = 'last_submitted_phone';

const REQUIRED_BASIC_FIELDS: BasicField[] = ['fullName', 'phone', 'state', 'loanType', 'amount'];
const REQUIRED_PREMIUM_FIELDS: PremiumField[] = ['fullName', 'phone', 'state', 'loanType', 'amount', 'monthlyIncome', 'occupation'];

const LOAN_NUMERIC_FIELDS: (BasicField | PremiumField)[] = ['amount', 'monthlyIncome', 'yearsEmployed', 'existingLoans'];

function sanitizeNumericInput(value: string): string {
  return value.replace(/[^\d]/g, '');
}


function getCurrentStep(form: BasicForm | PremiumForm, mode: FormMode): number {
  const hasBasic = Boolean(form.fullName && form.phone && form.state && form.loanType && form.amount);
  if (!hasBasic) return 1;
  if (mode === 'basic') return 3;

  const premium = form as PremiumForm;
  const hasPremium = Boolean(premium.monthlyIncome && premium.occupation);
  if (!hasPremium) return 2;

  return 3;
}

function validateForm(mode: FormMode, form: BasicForm | PremiumForm): FormErrors {
  const errors: FormErrors = {};

  if (mode === 'premium') {
    const premiumForm = form as PremiumForm;

    REQUIRED_PREMIUM_FIELDS.forEach((field) => {
      const value = String(premiumForm[field] ?? '').trim();
      if (!value) {
        errors[field] = 'This field is required';
      }
    });

    LOAN_NUMERIC_FIELDS.forEach((field) => {
      const value = String(premiumForm[field] ?? '').trim();
      if (value && !NUMERIC_REGEX.test(value)) {
        errors[field] = 'Only numeric input is allowed';
      }
    });

    if (premiumForm.phone) {
      const phoneResult = normalizeMalaysiaPhone(premiumForm.phone);
      if (!phoneResult.normalized) {
        errors.phone = phoneResult.error ?? 'Use valid MY phone format, e.g. +60123456789';
      }
    }

    return errors;
  }

  const basicForm = form as BasicForm;

  REQUIRED_BASIC_FIELDS.forEach((field) => {
    const value = String(basicForm[field] ?? '').trim();
    if (!value) {
      errors[field] = 'This field is required';
    }
  });

  (['amount'] as const).forEach((field) => {
    const value = String(basicForm[field] ?? '').trim();
    if (value && !NUMERIC_REGEX.test(value)) {
      errors[field] = 'Only numeric input is allowed';
    }
  });

  if (basicForm.phone) {
    const phoneResult = normalizeMalaysiaPhone(basicForm.phone);
    if (!phoneResult.normalized) {
      errors.phone = phoneResult.error ?? 'Use valid MY phone format, e.g. +60123456789';
    }
  }

  return errors;
}

function getFirstErrorMessage(errors: FormErrors): string {
  const firstError = Object.values(errors)[0];
  return firstError ?? 'Please complete all required fields correctly.';
}

function getButtonLabel(status: SubmitStatus): string {
  if (status === 'loading') return 'Submitting...';
  if (status === 'success') return 'Submitted';
  if (status === 'error') return 'Try Again';
  return 'Submit Application';
}

function getButtonStyle(status: SubmitStatus): { backgroundColor: string; textColor: string } {
  if (status === 'success') return { backgroundColor: Colors.success, textColor: Colors.white };
  if (status === 'error') return { backgroundColor: '#D14343', textColor: Colors.white };
  if (status === 'loading') return { backgroundColor: '#184A99', textColor: Colors.white };
  return { backgroundColor: Colors.primary, textColor: Colors.white };
}

function parseSupabaseError(error: unknown): SupabaseErrorLike {
  if (!error || typeof error !== 'object') {
    return {
      message: normalizeUnknownToString(error),
    };
  }

  const candidate = error as Record<string, unknown>;
  return {
    message: normalizeUnknownToString(candidate.message) ?? normalizeUnknownToString(error),
    details: normalizeUnknownToString(candidate.details) ?? null,
    hint: normalizeUnknownToString(candidate.hint) ?? null,
    code: normalizeUnknownToString(candidate.code),
  };
}

function buildSubmissionErrorMessage(error: unknown): string {
  const fallbackMessage = 'Submission failed. Please try again.';
  const parsedError = parseSupabaseError(error);
  const baseMessage = parsedError.message ?? (error instanceof Error ? error.message : fallbackMessage);

  if (parsedError.code === 'PGRST205') {
    const schemaMessage = "Database table is not available in API schema cache. In Supabase SQL Editor run: NOTIFY pgrst, 'reload schema'; then retry.";
    if (!__DEV__) {
      return schemaMessage;
    }
    return `${schemaMessage}\n${parsedError.details ?? ''}\ncode:${parsedError.code ?? ''}`.trim();
  }

  if (isPermissionError(baseMessage)) {
    return 'Permission denied. Please login again.';
  }

  if (!__DEV__) {
    return baseMessage;
  }

  const debugDetails = [
    parsedError.details ? `details: ${parsedError.details}` : '',
    parsedError.hint ? `hint: ${parsedError.hint}` : '',
    parsedError.code ? `code: ${parsedError.code}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return debugDetails ? `${baseMessage}\n${debugDetails}` : baseMessage;
}

function getStepTitle(step: number): string {
  if (step === 1) return 'Personal details';
  if (step === 2) return 'Financial profile';
  return 'Review & submit';
}

interface SubmitPayload {
  user_id?: string;
  type: 'basic' | 'premium';
  full_name: string;
  phone: string;
  state: string;
  loan_type: string;
  amount: number;
  monthly_income?: number;
  occupation?: string;
  status: 'submitted';
}

interface InsertedApplicationRow {
  id: string;
}

async function insertApplication(payload: SubmitPayload): Promise<InsertedApplicationRow> {
  const result = await withTimeout<PostgrestSingleResponse<InsertedApplicationRow>>(
    supabase
      .from('applications')
      .insert(payload)
      .select()
      .single(),
    SUBMIT_TIMEOUT_MS,
  );

  if (result.error) {
    const parsedError = parseSupabaseError(result.error);
    console.error('[APPLY] Supabase insert failed:', {
      message: parsedError.message,
      details: parsedError.details,
      hint: parsedError.hint,
      code: parsedError.code,
    });
    throw result.error;
  }

  if (__DEV__) {
    console.log('[APPLY] insert success table: applications');
  }

  return result.data as InsertedApplicationRow;
}

interface BasicForm {
  fullName: string;
  phone: string;
  state: string;
  loanType: string;
  amount: string;
}

interface PremiumForm extends BasicForm {
  monthlyIncome: string;
  occupation: string;
  yearsEmployed: string;
  hasCtos: boolean;
  existingLoans: string;
  plannedTimeline: string;
}

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Network is unstable, please try again.'));
    }, timeoutMs);

    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function parsePositiveNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Please enter a valid amount greater than 0.');
  }
  return parsed;
}


function maskPhoneForLog(phone: string): string {
  if (phone.length <= 4) {
    return '***';
  }
  return `${phone.slice(0, 3)}***${phone.slice(-2)}`;
}

function isPermissionError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('row-level security') || normalized.includes('permission denied') || normalized.includes('not allowed') || normalized.includes('forbidden');
}

function calculateLeadScore(form: PremiumForm): number {
  let score = 0;
  const income = parseInt(form.monthlyIncome, 10) || 0;
  if (income >= 8000) score += 30;
  else if (income >= 5000) score += 20;
  else if (income >= 3000) score += 10;

  const years = parseInt(form.yearsEmployed, 10) || 0;
  if (years >= 5) score += 20;
  else if (years >= 3) score += 15;
  else if (years >= 1) score += 10;

  if (!form.hasCtos) score += 25;

  const loans = parseInt(form.existingLoans, 10) || 0;
  if (loans === 0) score += 15;
  else if (loans <= 2) score += 10;

  if (form.plannedTimeline === 'within1Month') score += 10;
  else if (form.plannedTimeline === 'within3Months') score += 5;

  return Math.min(score, 100);
}

function getScoreGrade(score: number): { key: string; color: string } {
  if (score >= 80) return { key: 'gold', color: Colors.gold };
  if (score >= 60) return { key: 'silver', color: Colors.silver };
  return { key: 'basic', color: Colors.textMuted };
}

export default function ApplyScreen() {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [mode, setMode] = useState<FormMode>('select');
  const [leadScore, setLeadScore] = useState<number>(0);
  const [showStatePicker, setShowStatePicker] = useState<boolean>(false);
  const [showLoanPicker, setShowLoanPicker] = useState<boolean>(false);
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('default');
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);
  const [showErrorModal, setShowErrorModal] = useState<boolean>(false);
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string>('');
  const [submitErrorRaw, setSubmitErrorRaw] = useState<SupabaseErrorLike | null>(null);
  const [lastSubmitPayload, setLastSubmitPayload] = useState<SubmitPayload | null>(null);
  const successAnim = useRef(new Animated.Value(0)).current;
  const scoreAnim = useRef(new Animated.Value(0)).current;
  const lastSubmitPressAtRef = useRef<number>(0);

  const handleSubmissionSuccess = useCallback((applicationId?: string) => {
    console.log('[APPLY] Application submitted successfully:', applicationId ?? 'unknown-id');
    setSubmitStatus('default');
    setFormErrors({});
    setSubmitErrorMessage('');
    setSubmitErrorRaw(null);
    setLastSubmitPayload(null);
    setBasicForm({ fullName: '', phone: '', state: '', loanType: '', amount: '' });
    setPremiumForm({ fullName: '', phone: '', state: '', loanType: '', amount: '', monthlyIncome: '', occupation: '', yearsEmployed: '', hasCtos: false, existingLoans: '', plannedTimeline: '' });
    setShowSuccessModal(true);
    Animated.parallel([
      Animated.timing(successAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(scoreAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
    ]).start();
  }, [scoreAnim, successAnim]);

  const { mutateAsync: submitApplication, isPending: isSubmitting } = useMutation({
    mutationFn: async (payload: SubmitPayload) => {
      try {
        const inserted = await insertApplication(payload);
        return inserted;
      } catch (error: unknown) {
        const parsed = parseSupabaseError(error);
        if (__DEV__) {
          console.log('[APPLY] Supabase insert error:', {
            message: parsed.message,
            details: parsed.details,
            hint: parsed.hint,
            code: parsed.code,
          });
        }
        throw error;
      }
    },
  });

  const [basicForm, setBasicForm] = useState<BasicForm>({
    fullName: '',
    phone: '',
    state: '',
    loanType: '',
    amount: '',
  });

  const [premiumForm, setPremiumForm] = useState<PremiumForm>({
    fullName: '',
    phone: '',
    state: '',
    loanType: '',
    amount: '',
    monthlyIncome: '',
    occupation: '',
    yearsEmployed: '',
    hasCtos: false,
    existingLoans: '',
    plannedTimeline: '',
  });

  const submitWithPayload = useCallback(async (payload: SubmitPayload) => {
    if (isSubmitting) {
      return;
    }

    setShowErrorModal(false);
    setSubmitStatus('loading');
    setLastSubmitPayload(payload);

    try {
      const {
        data: { session },
      } = await withTimeout(supabase.auth.getSession(), SUBMIT_TIMEOUT_MS);

      const payloadWithUser: SubmitPayload = {
        ...payload,
        user_id: session?.user?.id,
      };

      if (__DEV__) {
        console.log('session:', !!session, session?.user?.id);
        console.log('[APPLY] submitting payload:', {
          ...payloadWithUser,
          phone: maskPhoneForLog(payloadWithUser.phone),
        });
      }

      const inserted = await submitApplication(payloadWithUser);
      await AsyncStorage.setItem(LAST_SUBMITTED_PHONE_KEY, payloadWithUser.phone);
      console.log('[APPLY] Stored last submitted phone for My Applications filter');
      handleSubmissionSuccess(inserted?.id);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: unknown) {
      const parsedError = parseSupabaseError(error);
      const finalMessage = buildSubmissionErrorMessage(error);

      if (__DEV__) {
        console.log('[APPLY] submit flow error:', {
          message: parsedError.message,
          details: parsedError.details,
          hint: parsedError.hint,
          code: parsedError.code,
        });
      }

      setSubmitStatus('error');
      setSubmitErrorRaw(parsedError);
      setSubmitErrorMessage(finalMessage);
      setShowErrorModal(true);
    }
  }, [handleSubmissionSuccess, isSubmitting, submitApplication]);

  const handleBasicSubmit = useCallback(() => {
    if (isSubmitting) {
      return;
    }

    const now = Date.now();
    const elapsed = now - lastSubmitPressAtRef.current;
    if (elapsed < SUBMIT_DEBOUNCE_MS) {
      console.log('[APPLY] Ignored submit tap due to debounce:', elapsed);
      return;
    }

    const errors = validateForm('basic', basicForm);
    setFormErrors(errors);

    if (Object.keys(errors).length > 0) {
      setSubmitStatus('error');
      setSubmitErrorMessage(getFirstErrorMessage(errors));
      setShowErrorModal(true);
      return;
    }

    let parsedAmount = 0;
    try {
      parsedAmount = parsePositiveNumber(basicForm.amount);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Please enter a valid amount greater than 0.';
      setSubmitStatus('error');
      setSubmitErrorMessage(message);
      setShowErrorModal(true);
      return;
    }

    lastSubmitPressAtRef.current = Date.now();

    const normalizedPhone = normalizeMalaysiaPhone(basicForm.phone);
    if (!normalizedPhone.normalized) {
      setSubmitStatus('error');
      setSubmitErrorMessage(normalizedPhone.error ?? 'Use valid MY phone format, e.g. +60123456789');
      setShowErrorModal(true);
      return;
    }

    const payload: SubmitPayload = {
      type: 'basic',
      full_name: basicForm.fullName.trim(),
      phone: normalizedPhone.normalized,
      state: basicForm.state.trim(),
      loan_type: basicForm.loanType.trim(),
      amount: parsedAmount,
      status: 'submitted',
    };

    void submitWithPayload(payload);
  }, [basicForm, isSubmitting, submitWithPayload]);

  const handlePremiumSubmit = useCallback(() => {
    if (isSubmitting) {
      return;
    }

    const now = Date.now();
    const elapsed = now - lastSubmitPressAtRef.current;
    if (elapsed < SUBMIT_DEBOUNCE_MS) {
      console.log('[APPLY] Ignored submit tap due to debounce:', elapsed);
      return;
    }

    const errors = validateForm('premium', premiumForm);
    setFormErrors(errors);

    if (Object.keys(errors).length > 0) {
      setSubmitStatus('error');
      setSubmitErrorMessage(getFirstErrorMessage(errors));
      setShowErrorModal(true);
      return;
    }

    const score = calculateLeadScore(premiumForm);
    setLeadScore(score);

    let parsedAmount = 0;
    let parsedMonthlyIncome = 0;

    try {
      parsedAmount = parsePositiveNumber(premiumForm.amount);
      parsedMonthlyIncome = parsePositiveNumber(premiumForm.monthlyIncome);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Please enter valid numeric values.';
      setSubmitStatus('error');
      setSubmitErrorMessage(message);
      setShowErrorModal(true);
      return;
    }

    lastSubmitPressAtRef.current = Date.now();

    const normalizedPhone = normalizeMalaysiaPhone(premiumForm.phone);
    if (!normalizedPhone.normalized) {
      setSubmitStatus('error');
      setSubmitErrorMessage(normalizedPhone.error ?? 'Use valid MY phone format, e.g. +60123456789');
      setShowErrorModal(true);
      return;
    }

    const payload: SubmitPayload = {
      type: 'premium',
      full_name: premiumForm.fullName.trim(),
      phone: normalizedPhone.normalized,
      state: premiumForm.state.trim(),
      loan_type: premiumForm.loanType.trim(),
      amount: parsedAmount,
      monthly_income: parsedMonthlyIncome,
      occupation: premiumForm.occupation.trim(),
      status: 'submitted',
    };

    void submitWithPayload(payload);
  }, [premiumForm, isSubmitting, submitWithPayload]);

  const resetForm = useCallback(() => {
    setMode('select');
    setLeadScore(0);
    setSubmitStatus('default');
    setFormErrors({});
    setShowSuccessModal(false);
    setShowErrorModal(false);
    setSubmitErrorMessage('');
    setSubmitErrorRaw(null);
    setLastSubmitPayload(null);
    successAnim.setValue(0);
    scoreAnim.setValue(0);
    setBasicForm({ fullName: '', phone: '', state: '', loanType: '', amount: '' });
    setPremiumForm({ fullName: '', phone: '', state: '', loanType: '', amount: '', monthlyIncome: '', occupation: '', yearsEmployed: '', hasCtos: false, existingLoans: '', plannedTimeline: '' });
  }, [successAnim, scoreAnim]);

  const currentForm = mode === 'premium' ? premiumForm : basicForm;
  const currentStep = getCurrentStep(currentForm, mode);
  const buttonState = isSubmitting ? 'loading' : submitStatus;
  const buttonStyle = getButtonStyle(buttonState);

  const clearFieldError = useCallback((key: BasicField | PremiumField) => {
    setFormErrors((prev) => ({ ...prev, [key]: undefined }));
    if (submitStatus === 'error') {
      setSubmitStatus('default');
    }
  }, [submitStatus]);

  const setBasicField = useCallback((key: BasicField, value: string) => {
    setBasicForm((prev) => ({ ...prev, [key]: value }));
    clearFieldError(key);
  }, [clearFieldError]);

  const setPremiumField = useCallback((key: PremiumField, value: string | boolean) => {
    setPremiumForm((prev) => ({ ...prev, [key]: value }));
    clearFieldError(key);
  }, [clearFieldError]);

  const setCurrentForm = useCallback((key: BasicField, value: string) => {
    if (mode === 'premium') {
      setPremiumField(key, value);
      return;
    }

    setBasicField(key, value);
  }, [mode, setBasicField, setPremiumField]);

  const grade = getScoreGrade(leadScore);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}> 
      {mode === 'select' ? (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.selectContainer}>
          <Text style={styles.pageTitle}>{t('applyNow')}</Text>
          <Text style={styles.pageSubtitle}>{t('welcomeSubtitle')}</Text>

          <Pressable style={styles.modeCard} onPress={() => setMode('basic')}>
            <View style={styles.modeIconContainer}>
              <FileText size={28} color={Colors.primary} />
            </View>
            <View style={styles.modeInfo}>
              <Text style={styles.modeTitle}>{t('basicLead')}</Text>
              <Text style={styles.modeDesc}>{t('basicLeadDesc')}</Text>
            </View>
          </Pressable>

          <Pressable style={[styles.modeCard, styles.premiumModeCard]} onPress={() => setMode('premium')}>
            <View style={styles.premiumStripe} />
            <View style={[styles.modeIconContainer, { backgroundColor: Colors.goldLight }]}>
              <Zap size={28} color={Colors.gold} />
            </View>
            <View style={styles.modeInfo}>
              <Text style={styles.modeTitle}>{t('premiumLead')}</Text>
              <Text style={styles.modeDesc}>{t('premiumLeadDesc')}</Text>
            </View>
          </Pressable>
        </ScrollView>
      </View>
    ) : (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.formHeader}>
        <Pressable onPress={resetForm}>
          <X size={22} color={Colors.textSecondary} />
        </Pressable>
        <Text style={styles.formTitle}>{mode === 'premium' ? t('premiumLead') : t('basicLead')}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.formContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.trustStrip} testID="apply-trust-strip">
          <View style={styles.trustStripItem}>
            <ShieldCheck size={14} color={Colors.verified} />
            <Text style={styles.trustStripText}>{t('securePlatform')}</Text>
          </View>
          <View style={styles.trustStripItem}>
            <BadgeCheck size={14} color={Colors.primary} />
            <Text style={styles.trustStripText}>{t('verifiedAgents')}</Text>
          </View>
          <View style={styles.trustStripItem}>
            <Star size={14} color={Colors.gold} fill={Colors.gold} />
            <Text style={styles.trustStripText}>{t('rating')}</Text>
          </View>
        </View>

        <View style={styles.stepCard}>
          <View style={styles.stepHeaderRow}>
            <Text style={styles.stepLabel}>Step {currentStep} of {STEP_TOTAL}</Text>
            <Text style={styles.stepTitle}>{getStepTitle(currentStep)}</Text>
          </View>
          <View style={styles.stepTrack}>
            <View style={[styles.stepFill, { width: `${(currentStep / STEP_TOTAL) * 100}%` }]} />
          </View>
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('fullName')} *</Text>
          <TextInput
            style={[styles.input, formErrors.fullName && styles.inputError]}
            value={currentForm.fullName}
            onChangeText={(v) => setCurrentForm('fullName', v)}
            placeholder={t('fullName')}
            placeholderTextColor={Colors.textMuted}
            testID="apply-full-name-input"
          />
          {formErrors.fullName ? <Text style={styles.errorText}>{formErrors.fullName}</Text> : null}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('phone')} *</Text>
          <TextInput
            style={[styles.input, formErrors.phone && styles.inputError]}
            value={currentForm.phone}
            onChangeText={(v) => {
              setCurrentForm('phone', sanitizeMalaysiaPhoneInput(v));
            }}
            placeholder="+60123456789"
            placeholderTextColor={Colors.textMuted}
            keyboardType="phone-pad"
            testID="apply-phone-input"
          />
          {formErrors.phone ? <Text style={styles.errorText}>{formErrors.phone}</Text> : null}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('state')} *</Text>
          <Pressable style={[styles.pickerBtn, formErrors.state && styles.inputError]} onPress={() => setShowStatePicker(true)} testID="apply-state-picker">
            <Text style={[styles.pickerBtnText, !currentForm.state && styles.pickerPlaceholder]}>
              {currentForm.state || t('selectState')}
            </Text>
            <ChevronDown size={16} color={Colors.textMuted} />
          </Pressable>
          {formErrors.state ? <Text style={styles.errorText}>{formErrors.state}</Text> : null}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('loanType')} *</Text>
          <Pressable style={[styles.pickerBtn, formErrors.loanType && styles.inputError]} onPress={() => setShowLoanPicker(true)} testID="apply-loan-type-picker">
            <Text style={[styles.pickerBtnText, !currentForm.loanType && styles.pickerPlaceholder]}>
              {currentForm.loanType ? t(currentForm.loanType) : t('selectLoanType')}
            </Text>
            <ChevronDown size={16} color={Colors.textMuted} />
          </Pressable>
          {formErrors.loanType ? <Text style={styles.errorText}>{formErrors.loanType}</Text> : null}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('amount')} *</Text>
          <TextInput
            style={[styles.input, formErrors.amount && styles.inputError]}
            value={currentForm.amount}
            onChangeText={(v) => setCurrentForm('amount', sanitizeNumericInput(v))}
            placeholder="50000"
            placeholderTextColor={Colors.textMuted}
            keyboardType="numeric"
            testID="apply-amount-input"
          />
          {formErrors.amount ? <Text style={styles.errorText}>{formErrors.amount}</Text> : null}
        </View>

        {mode === 'premium' && (
          <>
            <View style={styles.divider} />
            <Text style={styles.premiumSectionTitle}>{t('premiumLead')}</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('monthlyIncome')} *</Text>
              <TextInput
                style={[styles.input, formErrors.monthlyIncome && styles.inputError]}
                value={premiumForm.monthlyIncome}
                onChangeText={(v) => setPremiumField('monthlyIncome', sanitizeNumericInput(v))}
                placeholder="5000"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
                testID="apply-monthly-income-input"
              />
              {formErrors.monthlyIncome ? <Text style={styles.errorText}>{formErrors.monthlyIncome}</Text> : null}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('occupation')} *</Text>
              <TextInput
                style={[styles.input, formErrors.occupation && styles.inputError]}
                value={premiumForm.occupation}
                onChangeText={(v) => setPremiumField('occupation', v)}
                placeholder={t('occupation')}
                placeholderTextColor={Colors.textMuted}
                testID="apply-occupation-input"
              />
              {formErrors.occupation ? <Text style={styles.errorText}>{formErrors.occupation}</Text> : null}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('yearsEmployed')}</Text>
              <TextInput
                style={[styles.input, formErrors.yearsEmployed && styles.inputError]}
                value={premiumForm.yearsEmployed}
                onChangeText={(v) => setPremiumField('yearsEmployed', sanitizeNumericInput(v))}
                placeholder="3"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
                testID="apply-years-employed-input"
              />
              {formErrors.yearsEmployed ? <Text style={styles.errorText}>{formErrors.yearsEmployed}</Text> : null}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('hasCtos')}</Text>
              <View style={styles.toggleRow}>
                <Pressable
                  style={[styles.toggleBtn, !premiumForm.hasCtos && styles.toggleBtnActive]}
                  onPress={() => setPremiumField('hasCtos', false)}
                >
                  <Text style={[styles.toggleBtnText, !premiumForm.hasCtos && styles.toggleBtnTextActive]}>{t('no')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.toggleBtn, premiumForm.hasCtos && styles.toggleBtnActive]}
                  onPress={() => setPremiumField('hasCtos', true)}
                >
                  <Text style={[styles.toggleBtnText, premiumForm.hasCtos && styles.toggleBtnTextActive]}>{t('yes')}</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('existingLoans')}</Text>
              <TextInput
                style={[styles.input, formErrors.existingLoans && styles.inputError]}
                value={premiumForm.existingLoans}
                onChangeText={(v) => setPremiumField('existingLoans', sanitizeNumericInput(v))}
                placeholder="0"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
                testID="apply-existing-loans-input"
              />
              {formErrors.existingLoans ? <Text style={styles.errorText}>{formErrors.existingLoans}</Text> : null}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('plannedTimeline')}</Text>
              <View style={styles.timelineRow}>
                {(['within1Month', 'within3Months', 'moreThan3Months'] as const).map((tl) => (
                  <Pressable
                    key={tl}
                    style={[styles.timelineChip, premiumForm.plannedTimeline === tl && styles.timelineChipActive]}
                    onPress={() => setPremiumField('plannedTimeline', tl)}
                  >
                    <Text style={[styles.timelineChipText, premiumForm.plannedTimeline === tl && styles.timelineChipTextActive]}>
                      {t(tl)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </>
        )}

        <Pressable
          style={[
            styles.submitBtn,
            mode === 'premium' && styles.premiumSubmitBtn,
            { backgroundColor: buttonStyle.backgroundColor },
            buttonState === 'loading' && styles.submitBtnLoading,
          ]}
          onPress={mode === 'premium' ? handlePremiumSubmit : handleBasicSubmit}
          disabled={buttonState === 'loading'}
          testID="apply-submit-button"
        >
          <Text style={[styles.submitBtnText, { color: buttonStyle.textColor }]}>{getButtonLabel(buttonState)}</Text>
        </Pressable>
      </ScrollView>

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
              {malaysianStates.map((state) => (
                <Pressable
                  key={state}
                  style={[styles.modalOption, currentForm.state === state && styles.modalOptionActive]}
                  onPress={() => {
                    setCurrentForm('state', state);
                    setShowStatePicker(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, currentForm.state === state && styles.modalOptionTextActive]}>
                    {state}
                  </Text>
                  {currentForm.state === state && <Check size={18} color={Colors.primary} />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showLoanPicker} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setShowLoanPicker(false)}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('selectLoanType')}</Text>
              <Pressable onPress={() => setShowLoanPicker(false)}>
                <X size={20} color={Colors.textSecondary} />
              </Pressable>
            </View>
            <ScrollView>
              {loanCategories.map((cat) => (
                <Pressable
                  key={cat.id}
                  style={[styles.modalOption, currentForm.loanType === cat.id && styles.modalOptionActive]}
                  onPress={() => {
                    setCurrentForm('loanType', cat.id);
                    setShowLoanPicker(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, currentForm.loanType === cat.id && styles.modalOptionTextActive]}>
                    {t(cat.translationKey)}
                  </Text>
                  {currentForm.loanType === cat.id && <Check size={18} color={Colors.primary} />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showSuccessModal} transparent animationType="fade">
        <View style={styles.feedbackOverlay}>
          <View style={styles.feedbackCard}>
            <View style={styles.successIcon}>
              <Check size={30} color={Colors.white} />
            </View>
            <Text style={styles.successTitle}>Application Submitted</Text>
            <Text style={styles.successSubtitle}>Submitted successfully. A verified agent will contact you soon.</Text>
            {mode === 'premium' && leadScore > 0 ? (
              <View style={styles.scoreCard}>
                <Text style={styles.scoreLabel}>Lead Score</Text>
                <Text style={[styles.scoreValue, { color: grade.color }]}>{leadScore}</Text>
              </View>
            ) : null}
            <Pressable
              style={styles.submitBtn}
              onPress={() => {
                setShowSuccessModal(false);
                router.push('/my-applications' as never);
              }}
              testID="apply-success-go-my-applications"
            >
              <Text style={styles.submitBtnText}>View My Applications</Text>
            </Pressable>
            <Pressable
              style={styles.feedbackDismissBtn}
              onPress={() => setShowSuccessModal(false)}
              testID="apply-success-close"
            >
              <Text style={styles.feedbackDismissText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showErrorModal} transparent animationType="fade">
        <View style={styles.feedbackOverlay}>
          <View style={styles.feedbackCard}>
            <View style={styles.errorIconWrap}>
              <X size={24} color={Colors.white} />
            </View>
            <Text style={styles.successTitle}>Submission Failed</Text>
            <Text style={styles.successSubtitle}>{submitErrorMessage || 'Please try again.'}</Text>
            {__DEV__ && submitErrorRaw ? (
              <Text style={styles.errorDebugText}>
                {`message: ${submitErrorRaw.message ?? ''}\ndetails: ${submitErrorRaw.details ?? ''}\nhint: ${submitErrorRaw.hint ?? ''}\ncode: ${submitErrorRaw.code ?? ''}`}
              </Text>
            ) : null}
            <Pressable
              style={[styles.submitBtn, styles.errorRetryBtn]}
              onPress={() => {
                if (lastSubmitPayload && !isSubmitting) {
                  void submitWithPayload(lastSubmitPayload);
                }
              }}
              disabled={isSubmitting || !lastSubmitPayload}
              testID="apply-error-retry"
            >
              {isSubmitting ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.submitBtnText}>Retry</Text>}
            </Pressable>
            <Pressable
              style={styles.feedbackDismissBtn}
              onPress={() => setShowErrorModal(false)}
              testID="apply-error-dismiss"
            >
              <Text style={styles.feedbackDismissText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  selectContainer: {
    padding: 20,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '800' as const,
    color: Colors.textPrimary,
    marginBottom: 6,
    marginTop: 8,
  },
  pageSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 28,
  },
  modeCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 20,
    marginBottom: 14,
    overflow: 'hidden' as const,
    ...Platform.select({
      ios: { shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 3 },
      web: { shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
    }),
  },
  premiumModeCard: {
    borderWidth: 1,
    borderColor: Colors.goldLight,
  },
  premiumStripe: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: Colors.gold,
  },
  modeIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.inputBg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: 16,
  },
  modeInfo: {
    flex: 1,
  },
  modeTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  modeDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  formHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  formTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  formContainer: {
    padding: 20,
    paddingBottom: 40,
    gap: 16,
  },
  trustStrip: {
    flexDirection: 'row' as const,
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 8,
    ...Platform.select({
      ios: { shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
      web: { shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
    }),
  },
  trustStripItem: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 5,
  },
  trustStripText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '700' as const,
  },
  stepCard: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 16,
    marginBottom: 4,
    ...Platform.select({
      ios: { shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 10 },
      android: { elevation: 2 },
      web: { shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 10 },
    }),
  },
  stepHeaderRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 10,
  },
  stepLabel: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  stepTitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  stepTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: Colors.inputBg,
    overflow: 'hidden' as const,
  },
  stepFill: {
    height: '100%' as const,
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  inputGroup: {
    marginBottom: 0,
    gap: 8,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  inputError: {
    borderColor: '#D14343',
  },
  errorText: {
    fontSize: 12,
    color: '#D14343',
    fontWeight: '500' as const,
  },
  pickerBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  pickerBtnText: {
    fontSize: 15,
    color: Colors.textPrimary,
  },
  pickerPlaceholder: {
    color: Colors.textMuted,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 20,
  },
  premiumSectionTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.gold,
    marginBottom: 16,
  },
  toggleRow: {
    flexDirection: 'row' as const,
    gap: 10,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.inputBg,
    alignItems: 'center' as const,
  },
  toggleBtnActive: {
    backgroundColor: Colors.primary,
  },
  toggleBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  toggleBtnTextActive: {
    color: Colors.white,
  },
  timelineRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  timelineChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.inputBg,
  },
  timelineChipActive: {
    backgroundColor: Colors.primary,
  },
  timelineChipText: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: Colors.textSecondary,
  },
  timelineChipTextActive: {
    color: Colors.white,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center' as const,
    marginTop: 8,
    ...Platform.select({
      ios: { shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8 },
      android: { elevation: 4 },
      web: { shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8 },
    }),
  },
  submitBtnLoading: {
    opacity: 0.75,
  },
  premiumSubmitBtn: {
    backgroundColor: Colors.gold,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.white,
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 40,
  },
  successContent: {
    alignItems: 'center' as const,
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.success,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    textAlign: 'center' as const,
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center' as const,
    marginBottom: 24,
  },
  scoreCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center' as const,
    width: '100%' as const,
    marginBottom: 24,
    ...Platform.select({
      ios: { shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 3 },
      web: { shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
    }),
  },
  scoreLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  scoreValue: {
    fontSize: 48,
    fontWeight: '800' as const,
    marginBottom: 12,
  },
  scoreBar: {
    width: '100%' as const,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.inputBg,
    marginBottom: 12,
    overflow: 'hidden' as const,
  },
  scoreBarFill: {
    height: '100%' as const,
    borderRadius: 4,
  },
  gradeBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  gradeText: {
    fontSize: 14,
    fontWeight: '700' as const,
  },
  resetBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
    alignItems: 'center' as const,
  },
  resetBtnText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.white,
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
    paddingBottom: 30,
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
  modalOptionText: {
    fontSize: 15,
    color: Colors.textPrimary,
  },
  modalOptionTextActive: {
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  feedbackOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 20,
  },
  feedbackCard: {
    width: '100%' as const,
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center' as const,
  },
  errorIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#D14343',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 16,
  },
  errorRetryBtn: {
    backgroundColor: '#D14343',
    width: '100%' as const,
  },
  feedbackDismissBtn: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  feedbackDismissText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  errorDebugText: {
    marginTop: 12,
    width: '100%' as const,
    backgroundColor: '#F5F7FA',
    borderRadius: 10,
    padding: 10,
    fontSize: 12,
    lineHeight: 18,
    color: Colors.textSecondary,
  },
});
