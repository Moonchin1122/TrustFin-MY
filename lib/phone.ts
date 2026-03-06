export interface MalaysiaPhoneNormalizationResult {
  normalized: string | null;
  error: string | null;
}

const PHONE_ALLOWED_REGEX = /^\+?\d+$/;

export function sanitizeMalaysiaPhoneInput(value: string): string {
  return value.replace(/[\s-]/g, '').replace(/(?!^)\+/g, '').replace(/[^\d+]/g, '');
}

export function normalizeMalaysiaPhone(value: string): MalaysiaPhoneNormalizationResult {
  const cleaned = sanitizeMalaysiaPhoneInput(value.trim());

  if (!cleaned) {
    return { normalized: null, error: 'Phone number is required.' };
  }

  if (!PHONE_ALLOWED_REGEX.test(cleaned)) {
    return { normalized: null, error: 'Use a valid Malaysia phone number.' };
  }

  if (cleaned.startsWith('+') && !cleaned.startsWith('+60')) {
    return { normalized: null, error: 'Phone must start with +60.' };
  }

  let normalized = '';
  if (cleaned.startsWith('+60')) {
    normalized = cleaned;
  } else if (cleaned.startsWith('60')) {
    normalized = `+${cleaned}`;
  } else if (cleaned.startsWith('0')) {
    normalized = `+60${cleaned.slice(1)}`;
  } else {
    normalized = `+60${cleaned}`;
  }

  const digitsAfterCountryCode = normalized.slice(3);
  if (!/^\d+$/.test(digitsAfterCountryCode)) {
    return { normalized: null, error: 'Use digits only for phone number.' };
  }

  if (digitsAfterCountryCode.length < 10 || digitsAfterCountryCode.length > 12) {
    return { normalized: null, error: 'Phone must have 10-12 digits after +60.' };
  }

  return { normalized, error: null };
}
