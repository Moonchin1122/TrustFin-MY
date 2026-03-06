interface OtpEntry {
  code: string;
  phone: string;
  expiresAt: number;
  attempts: number;
  verified: boolean;
}

const otpStore: Map<string, OtpEntry> = new Map();

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RATE_LIMIT_MS = 60 * 1000;

const rateLimitStore: Map<string, number> = new Map();

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function cleanExpired() {
  const now = Date.now();
  for (const [key] of otpStore.entries()) {
    const entry = otpStore.get(key);
    if (entry && now > entry.expiresAt) {
      otpStore.delete(key);
    }
  }
}

export const otpService = {
  createOtp(phone: string): { code: string; isDevMode: boolean } {
    cleanExpired();

    const lastSent = rateLimitStore.get(phone);
    if (lastSent && Date.now() - lastSent < RATE_LIMIT_MS) {
      throw new Error("OTP_RATE_LIMITED");
    }

    const code = generateOtp();
    const entry: OtpEntry = {
      code,
      phone,
      expiresAt: Date.now() + OTP_EXPIRY_MS,
      attempts: 0,
      verified: false,
    };

    otpStore.set(phone, entry);
    rateLimitStore.set(phone, Date.now());

    const hasSmsProvider = !!(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER
    );

    console.log(`[OTP] Generated for ${phone}: ${code} (SMS provider: ${hasSmsProvider ? "configured" : "DEV MODE"})`);

    return { code, isDevMode: !hasSmsProvider };
  },

  verifyOtp(phone: string, code: string): { success: boolean; message: string } {
    cleanExpired();

    const entry = otpStore.get(phone);
    if (!entry) {
      return { success: false, message: "OTP_NOT_FOUND" };
    }

    if (Date.now() > entry.expiresAt) {
      otpStore.delete(phone);
      return { success: false, message: "OTP_EXPIRED" };
    }

    if (entry.attempts >= MAX_ATTEMPTS) {
      otpStore.delete(phone);
      return { success: false, message: "OTP_MAX_ATTEMPTS" };
    }

    entry.attempts++;

    if (entry.code !== code) {
      return { success: false, message: "OTP_INVALID" };
    }

    entry.verified = true;
    otpStore.delete(phone);
    return { success: true, message: "OTP_VERIFIED" };
  },
};
