import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/index.js';
import { auth, audit } from '../middleware/auth.js';
import { HttpError, wrap, escapeRegex, securePassword } from '../utils.js';

const router = Router();
router.use(auth(['WARDEN']));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const safe = (u) => ({ _id: u._id, name: u.name, email: u.email, rollNumber: u.rollNumber, role: u.role, isActive: u.isActive, mustChangePassword: !!u.mustChangePassword, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt });
const loadUser = async (id) => {
  const u = await User.findById(id);
  if (!u) throw new HttpError(404, 'User not found');
  return u;
};
const cleanName = (v) => { const n = String(v ?? '').trim(); if (n.length < 2 || n.length > 80) throw new HttpError(400, 'Name must be 2 to 80 characters'); return n; };
const cleanEmail = (v) => {
  const e = String(v ?? '').trim().toLowerCase();
  if (!EMAIL.test(e) || e.length > 120) throw new HttpError(400, 'Enter a valid email address');
  return e;
};

router.get('/', wrap(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 20);
  const f = {};
  if (req.query.role) {
    if (!['WARDEN', 'STUDENT', 'GUARD'].includes(req.query.role)) throw new HttpError(400, 'Unknown role');
    f.role = req.query.role;
  }
  if (req.query.status === 'active') f.isActive = true;
  if (req.query.status === 'inactive') f.isActive = false;
  if (req.query.q) {
    const r = new RegExp(escapeRegex(String(req.query.q)), 'i');
    f.$or = [{ name: r }, { email: r }, { rollNumber: r }];
  }
  const [items, total] = await Promise.all([User.find(f).sort({ name: 1 }).skip((page - 1) * limit).limit(limit), User.countDocuments(f)]);
  res.json({ items: items.map(safe), total, page, pages: Math.ceil(total / limit) });
}));

router.post('/guards', wrap(async (req, res) => {
  const name = cleanName(req.body?.name), email = cleanEmail(req.body?.email);
  const temporaryPassword = securePassword(10);
  const user = await User.create({ name, email, passwordHash: await bcrypt.hash(temporaryPassword, 12), role: 'GUARD', mustChangePassword: true });
  audit(req.user._id, 'USER_CREATED', user._id, { role: 'GUARD', email });
  res.status(201).json({ message: 'Guard account created', user: safe(user), credentials: { identifier: email, temporaryPassword } });
}));

router.patch('/:id', wrap(async (req, res) => {
  const t = await loadUser(req.params.id);
  if (t.role === 'STUDENT') throw new HttpError(400, 'Student details are edited on the Students page.');
  if (t.role === 'WARDEN' && String(t._id) !== String(req.user._id)) throw new HttpError(403, 'You can only edit your own warden profile.');
  const upd = {};
  if (req.body?.name !== undefined) upd.name = cleanName(req.body.name);
  if (req.body?.email !== undefined) upd.email = cleanEmail(req.body.email);
  if (!Object.keys(upd).length) throw new HttpError(400, 'Nothing to update');
  await User.updateOne({ _id: t._id }, upd);
  audit(req.user._id, 'USER_EDITED', t._id, { fields: Object.keys(upd) });
  res.json({ message: 'User updated', user: safe({ ...(t.toObject ? t.toObject() : t), ...upd }) });
}));

router.patch('/:id/active', wrap(async (req, res) => {
  const { isActive } = req.body || {};
  if (typeof isActive !== 'boolean') throw new HttpError(400, 'isActive must be true or false');
  const t = await loadUser(req.params.id);
  if (!isActive && String(t._id) === String(req.user._id)) throw new HttpError(409, 'You cannot deactivate your own account.');
  const wardens = () => User.countDocuments({ role: 'WARDEN', isActive: true });
  if (!isActive && t.role === 'WARDEN' && t.isActive && (await wardens()) <= 1) throw new HttpError(409, 'This is the last active warden account and cannot be deactivated.');
  await User.updateOne({ _id: t._id }, { isActive });
  if (!isActive && t.role === 'WARDEN' && (await wardens()) === 0) { // two wardens deactivating each other at once
    await User.updateOne({ _id: t._id }, { isActive: true });
    throw new HttpError(409, 'This is the last active warden account and cannot be deactivated.');
  }
  audit(req.user._id, isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', t._id, { role: t.role });
  res.json({ message: isActive ? 'Account activated' : 'Account deactivated' });
}));

router.post('/:id/reset-password', wrap(async (req, res) => {
  const t = await loadUser(req.params.id);
  if (t.role === 'WARDEN') throw new HttpError(403, 'A warden password cannot be reset by another warden. Use "Forgot password" or ask the server administrator.');
  if (t.role === 'STUDENT') throw new HttpError(400, 'Reset student passwords on the Students page.');
  const temporaryPassword = securePassword(10);
  await User.updateOne({ _id: t._id }, { passwordHash: await bcrypt.hash(temporaryPassword, 12), mustChangePassword: true, passwordChangedAt: new Date() });
  audit(req.user._id, 'PASSWORD_RESET', t._id, { role: t.role });
  res.json({ message: 'Password reset', credentials: { identifier: t.email, temporaryPassword } });
}));

export default router;
