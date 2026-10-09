import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { User, PasswordReset } from '../models/index.js';
import { auth, audit } from '../middleware/auth.js';
import { HttpError, wrap } from '../utils.js';
import { cookieOpts } from '../config.js';
import { sendMail, emailEnabled } from '../mailer.js';
import { OTP_TTL_MS, RESEND_COOLDOWN_MS, MAX_ATTEMPTS, newOtp, hmac, safeEqual } from '../resetCrypto.js';

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12); // keeps login timing the same for unknown users

const router = Router();
const safe = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role, rollNumber: u.rollNumber, mustChangePassword: u.mustChangePassword });

// 10 failed attempts per account per IP per 15 minutes. Keyed by account so that users behind a shared proxy IP do not lock each other out.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}|${String(req.body?.identifier || '').trim().toLowerCase()}`,
  message: { message: 'Too many login attempts. Try again in 15 minutes.' },
});

router.post('/login', loginLimiter, wrap(async (req, res) => {
  const { identifier, password, portal } = req.body || {};
  if (typeof identifier !== 'string' || typeof password !== 'string' || !identifier || !password)
    throw new HttpError(400, 'Enter your email or roll number and password');
  const id = identifier.trim();
  const user = await User.findOne({ $or: [{ email: id.toLowerCase() }, { rollNumber: id.toUpperCase() }] }).select('+passwordHash');
  const hashOk = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !hashOk) throw new HttpError(401, 'Invalid email/roll number or password');
  if (!user.isActive) throw new HttpError(403, 'This account has been deactivated. Contact the warden.');
  // The password was correct, so naming the portal problem reveals nothing to a stranger.
  if (portal && user.role !== portal) throw new HttpError(403, 'This account does not belong to the selected portal. Go back and choose the correct one.');
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.cookie('token', token, cookieOpts).json({ user: safe(user) });
}));

router.post('/logout', (req, res) => res.clearCookie('token', { ...cookieOpts, maxAge: undefined }).json({ message: 'Logged out' }));

router.get('/me', auth([], { allowTemp: true }), (req, res) => res.json({ user: safe(req.user) }));

router.post('/change-password', auth([], { allowTemp: true }), wrap(async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body || {};
  if (![currentPassword, newPassword, confirmPassword].every((v) => typeof v === 'string' && v))
    throw new HttpError(400, 'Fill in all password fields');
  if (newPassword !== confirmPassword) throw new HttpError(400, 'New passwords do not match');
  if (newPassword.length < 8) throw new HttpError(400, 'New password must be at least 8 characters');
  if (newPassword === currentPassword) throw new HttpError(400, 'New password must be different from the current one');
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw new HttpError(400, 'Current password is incorrect');
  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.mustChangePassword = false;
  await user.save();
  audit(user._id, 'PASSWORD_CHANGED', user._id);
  res.json({ message: 'Password changed successfully', user: safe(user) });
}));

// ---- Forgot password: request code -> verify code -> set new password ----
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const perAccount = (windowMs, max, message) => rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, message: { message },
  keyGenerator: (req) => `${req.ip}|${String(req.body?.identifier || '').trim().toLowerCase()}` });
const forgotLimiter = perAccount(60 * 60 * 1000, 5, 'Too many reset requests. Please try again later.');
const forgotIpLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many reset requests. Please try again later.' } });
const codeLimiter = perAccount(15 * 60 * 1000, 10, 'Too many attempts. Please try again later.');
const BAD_CODE = 'Invalid or expired code';

const findForReset = async (identifier, portal) => {
  if (typeof identifier !== 'string' || !identifier.trim()) return null;
  const id = identifier.trim();
  const user = await User.findOne({ $or: [{ email: id.toLowerCase() }, { rollNumber: id.toUpperCase() }] });
  if (!user || !user.isActive || (portal && user.role !== portal)) return null;
  return user;
};
// Counts one attempt, then checks the code. Locks the code after MAX_ATTEMPTS wrong tries.
const checkCode = async (user, otp) => {
  const rec = await PasswordReset.findOneAndUpdate({ user: user._id, expiresAt: { $gt: new Date() }, attempts: { $lt: MAX_ATTEMPTS } }, { $inc: { attempts: 1 } }, { new: true });
  return rec && safeEqual(rec.otpHash, hmac(process.env.JWT_SECRET, `${user._id}:${otp}`)) ? rec : null;
};
const cleanOtp = (otp) => { if (typeof otp !== 'string' || !/^\d{6}$/.test(otp.trim())) throw new HttpError(400, 'Enter the 6-digit code'); return otp.trim(); };

// Always answers the same way, whether or not the account exists. The work happens after the reply
// so that response time does not reveal anything either.
router.post('/forgot-password', forgotIpLimiter, forgotLimiter, wrap(async (req, res) => {
  const { identifier, portal } = req.body || {};
  if (typeof identifier !== 'string' || !identifier.trim()) throw new HttpError(400, 'Enter your email or roll number');
  res.json({ message: 'If an account matches, a 6-digit code has been sent to its registered email. It expires in 10 minutes.' });
  try {
    if (!emailEnabled()) return console.warn('Password reset requested but no email provider is configured');
    const user = await findForReset(identifier, portal);
    if (!user) return;
    const last = await PasswordReset.findOne({ user: user._id }).select('createdAt');
    if (last && Date.now() - last.createdAt.getTime() < RESEND_COOLDOWN_MS) return;
    const otp = newOtp(); const now = Date.now();
    await PasswordReset.findOneAndUpdate({ user: user._id },
      { otpHash: hmac(process.env.JWT_SECRET, `${user._id}:${otp}`), attempts: 0, createdAt: new Date(now), expiresAt: new Date(now + OTP_TTL_MS) }, { upsert: true });
    await sendMail({ to: user.email, subject: 'Your HostelHub password reset code',
      text: `Hello ${user.name},\n\nYour HostelHub password reset code is ${otp}.\nIt expires in 10 minutes. If you did not ask for this, ignore this email and your password will stay the same.`,
      html: `<p>Hello ${escapeHtml(user.name)},</p><p>Your HostelHub password reset code is <b style="font-size:20px;letter-spacing:3px">${otp}</b>.</p><p>It expires in 10 minutes. If you did not ask for this, ignore this email and your password will stay the same.</p>` });
  } catch (e) { console.error('Password reset request failed:', e.message); }
}));

router.post('/verify-reset-otp', codeLimiter, wrap(async (req, res) => {
  const { identifier, portal } = req.body || {};
  const otp = cleanOtp(req.body?.otp);
  const user = await findForReset(identifier, portal);
  if (!user || !(await checkCode(user, otp))) throw new HttpError(400, BAD_CODE);
  res.json({ message: 'Code verified' });
}));

router.post('/reset-password', codeLimiter, wrap(async (req, res) => {
  const { identifier, portal, newPassword, confirmPassword } = req.body || {};
  const otp = cleanOtp(req.body?.otp);
  if (typeof newPassword !== 'string' || typeof confirmPassword !== 'string') throw new HttpError(400, 'Fill in all password fields');
  if (newPassword !== confirmPassword) throw new HttpError(400, 'Passwords do not match');
  if (newPassword.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  const user = await findForReset(identifier, portal);
  const rec = user && await checkCode(user, otp);
  // Deleting the code is what makes it single-use, even if two requests arrive together.
  if (!rec || !(await PasswordReset.findOneAndDelete({ _id: rec._id }))) throw new HttpError(400, BAD_CODE);
  const u = await User.findById(user._id).select('+passwordHash');
  u.passwordHash = await bcrypt.hash(newPassword, 12);
  u.mustChangePassword = false;
  u.passwordChangedAt = new Date(); // signs out every older session
  await u.save();
  audit(u._id, 'PASSWORD_RESET_SELF', u._id);
  res.json({ message: 'Password updated. You can now log in.' });
}));

export default router;
