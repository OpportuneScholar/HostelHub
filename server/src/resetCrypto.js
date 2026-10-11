import crypto from 'crypto';

export const OTP_TTL_MS = 10 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_ATTEMPTS = 5;

export const newOtp = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
// Only a keyed hash of the code is stored.
export const hmac = (secret, value) => crypto.createHmac('sha256', secret).update(value).digest('hex');
export const safeEqual = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
