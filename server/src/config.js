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
