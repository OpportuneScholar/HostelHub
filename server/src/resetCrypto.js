import crypto from 'crypto';

export const OTP_TTL_MS = 10 * 60 * 1000;      // a code works for 10 minutes
export const RESEND_COOLDOWN_MS = 60 * 1000;   // at most one new code per minute per account
export const MAX_ATTEMPTS = 5;                 // wrong guesses allowed per code

export const newOtp = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
// Only this keyed hash is stored. Without JWT_SECRET a stolen database cannot be used to read or forge codes.
export const hmac = (secret, value) => crypto.createHmac('sha256', secret).update(value).digest('hex');
export const safeEqual = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
