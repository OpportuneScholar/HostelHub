import 'dotenv/config';

const env = process.env;
export const isProd = env.NODE_ENV === 'production';

const missing = ['MONGODB_URI', 'JWT_SECRET', ...(isProd ? ['CLIENT_URL'] : [])].filter((k) => !env[k]);
if (missing.length) { console.error(`Missing environment variables: ${missing.join(', ')}`); process.exit(1); }
if (isProd && env.JWT_SECRET.length < 32) { console.error('JWT_SECRET must be at least 32 characters in production'); process.exit(1); }

// CLIENT_URL may hold several comma-separated origins. Trailing slashes are removed because browsers never send them.
export const clientOrigins = (env.CLIENT_URL || 'http://localhost:5173').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
if (isProd) clientOrigins.filter((o) => !o.startsWith('https://')).forEach((o) => console.warn(`Warning: CLIENT_URL origin ${o} is not https`));
if (!isProd && clientOrigins.some((o) => o.startsWith('https://') && !o.includes('localhost')))
  console.warn('Warning: NODE_ENV is not "production" but CLIENT_URL is https. Cross-site login cookies will not work until NODE_ENV=production.');

// Frontend and API are on different domains in production: the cookie must be SameSite=None and Secure.
export const cookieOpts = { httpOnly: true, secure: isProd, sameSite: isProd ? 'none' : 'lax', maxAge: 8 * 3600 * 1000, path: '/' };
export const PORT = Number(env.PORT) || 5000;

// Password reset email. Providers: resend (HTTPS API, works on hosts that block SMTP), smtp, console (development only), none.
let provider = (env.EMAIL_PROVIDER || 'none').toLowerCase();
const needs = { resend: ['RESEND_API_KEY', 'EMAIL_FROM'], smtp: ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM'], console: [], none: [] };
if (!Object.hasOwn(needs, provider)) { console.error('EMAIL_PROVIDER must be one of: resend, smtp, console, none'); process.exit(1); }
if (provider === 'console' && isProd) { console.error('EMAIL_PROVIDER=console is for development only'); process.exit(1); }
const missingMail = needs[provider].filter((k) => !env[k]);
if (missingMail.length) { console.error(`Email provider "${provider}" is missing: ${missingMail.join(', ')}. Password reset emails are disabled.`); provider = 'none'; }
if (provider === 'none') console.warn('Warning: no email provider configured, so "Forgot password" cannot send emails.');
export const emailConfig = {
  provider, from: env.EMAIL_FROM, resendKey: env.RESEND_API_KEY,
  smtp: { host: env.SMTP_HOST, port: Number(env.SMTP_PORT) || 587, secure: env.SMTP_SECURE === 'true', user: env.SMTP_USER, pass: env.SMTP_PASS },
};
