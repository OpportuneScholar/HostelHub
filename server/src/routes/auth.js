import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { User } from '../models/index.js';
import { auth, audit } from '../middleware/auth.js';
import { HttpError, wrap } from '../utils.js';
import { cookieOpts } from '../config.js';

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
  const ok = user && hashOk && (!portal || user.role === portal);
  if (!ok) throw new HttpError(401, 'Invalid email/roll number or password');
  if (!user.isActive) throw new HttpError(403, 'This account has been deactivated. Contact the warden.');
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

export default router;
