import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User, StudentProfile, Bed } from '../models/index.js';
import { auth, audit } from '../middleware/auth.js';
import { HttpError, wrap, tempPassword, escapeRegex } from '../utils.js';

const router = Router();
router.use(auth(['WARDEN']));

const REQUIRED = ['firstName', 'lastName', 'rollNumber', 'email', 'phone', 'course', 'branch', 'year', 'semester',
  'roomNumber', 'bedNumber', 'guardianName', 'guardianPhone', 'emergencyContact', 'address'];

const findBed = async (roomNumber, bedNumber) => {
  const bed = await Bed.findOne({ label: `${String(roomNumber).trim()}-${String(bedNumber).trim()}`.toUpperCase() }).populate('room');
  if (!bed) throw new HttpError(404, 'That room or bed does not exist');
  return bed;
};
// Atomic: only succeeds if nobody else holds the bed, so two students can never share one.
const claimBed = async (bedId, userId) => {
  const bed = await Bed.findOneAndUpdate({ _id: bedId, student: null, maintenance: { $ne: true } }, { student: userId });
  if (!bed) throw new HttpError(409, 'That bed is occupied or under maintenance');
};

router.post('/', wrap(async (req, res) => {
  const b = req.body || {};
  const missing = REQUIRED.filter((k) => b[k] === undefined || String(b[k]).trim() === '');
  if (missing.length) throw new HttpError(400, `Missing fields: ${missing.join(', ')}`);
  const bed = await findBed(b.roomNumber, b.bedNumber);
  const passwordHash = await bcrypt.hash(tempPassword(b.firstName, bed.room.number), 12);
  const user = await User.create({
    name: `${b.firstName} ${b.lastName}`.trim(), email: b.email, rollNumber: b.rollNumber,
    passwordHash, role: 'STUDENT', mustChangePassword: true,
  });
  let profile;
  try {
    await claimBed(bed._id, user._id);
    const { roomNumber, bedNumber, ...fields } = b;
    profile = await StudentProfile.create({ ...fields, user: user._id });
  } catch (err) { // undo partial work
    await Bed.updateOne({ _id: bed._id, student: user._id }, { student: null });
    await User.deleteOne({ _id: user._id });
    throw err;
  }
  audit(req.user._id, 'STUDENT_REGISTERED', user._id, { bed: bed.label });
  res.status(201).json({ message: 'Student registered successfully', student: profile });
}));

router.get('/', wrap(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 20);
  const { q, course, year } = req.query;
  const filter = {};
  if (course) filter.course = String(course);
  if (year) filter.year = Number(year);
  if (q) { const r = new RegExp(escapeRegex(q), 'i'); filter.$or = [{ firstName: r }, { lastName: r }, { rollNumber: r }, { email: r }]; }
  const [items, total] = await Promise.all([
    StudentProfile.find(filter).sort({ rollNumber: 1 }).skip((page - 1) * limit).limit(limit).populate('user', 'isActive'),
    StudentProfile.countDocuments(filter),
  ]);
  const beds = await Bed.find({ student: { $in: items.map((i) => i.user._id) } }).populate({ path: 'room', populate: { path: 'block', populate: 'hostel' } });
  const info = Object.fromEntries(beds.map((b) => [String(b.student), { bed: b.label, room: b.room.number, hostel: `${b.room.block.hostel.name} / ${b.room.block.name}` }]));
  res.json({ items: items.map((i) => ({ ...i.toObject(), ...(info[String(i.user._id)] || { bed: null, room: null, hostel: null }) })), total, page, pages: Math.ceil(total / limit) });
}));

const EDITABLE = ['phone', 'course', 'branch', 'year', 'semester', 'guardianName', 'guardianPhone', 'emergencyContact', 'address', 'enrollmentNumber'];
router.patch('/:id/profile', wrap(async (req, res) => {
  const upd = {};
  for (const k of EDITABLE) if (req.body?.[k] !== undefined && String(req.body[k]).trim() !== '') upd[k] = req.body[k];
  if (!Object.keys(upd).length) throw new HttpError(400, 'Nothing to update');
  const p = await StudentProfile.findOneAndUpdate({ user: req.params.id }, upd, { new: true, runValidators: true });
  if (!p) throw new HttpError(404, 'Student not found');
  audit(req.user._id, 'STUDENT_EDITED', p.user, { fields: Object.keys(upd) });
  res.json({ message: 'Student updated', student: p });
}));

router.patch('/:id/active', wrap(async (req, res) => {
  const { isActive } = req.body || {};
  if (typeof isActive !== 'boolean') throw new HttpError(400, 'isActive must be true or false');
  const user = await User.findOneAndUpdate({ _id: req.params.id, role: 'STUDENT' }, { isActive });
  if (!user) throw new HttpError(404, 'Student not found');
  audit(req.user._id, isActive ? 'STUDENT_REACTIVATED' : 'STUDENT_DEACTIVATED', user._id);
  res.json({ message: isActive ? 'Student reactivated' : 'Student deactivated' });
}));

// Password goes back to FirstName + room digits. It is never returned in the response.
router.post('/:id/reset-password', wrap(async (req, res) => {
  const [profile, bed] = await Promise.all([
    StudentProfile.findOne({ user: req.params.id }),
    Bed.findOne({ student: req.params.id }).populate('room'),
  ]);
  if (!profile) throw new HttpError(404, 'Student not found');
  if (!bed) throw new HttpError(400, 'Assign a room before resetting the password');
  await User.updateOne({ _id: req.params.id }, { passwordHash: await bcrypt.hash(tempPassword(profile.firstName, bed.room.number), 12), mustChangePassword: true, passwordChangedAt: new Date() });
  audit(req.user._id, 'PASSWORD_RESET', profile.user);
  res.json({ message: 'Password reset. The student must change it at next login.' });
}));

router.post('/:id/change-room', wrap(async (req, res) => {
  const { roomNumber, bedNumber } = req.body || {};
  if (!roomNumber || !bedNumber) throw new HttpError(400, 'Room number and bed number are required');
  const newBed = await findBed(roomNumber, bedNumber);
  const oldBed = await Bed.findOne({ student: req.params.id });
  if (oldBed && oldBed._id.equals(newBed._id)) throw new HttpError(400, 'Student is already in that bed');
  if (!(await User.exists({ _id: req.params.id, role: 'STUDENT' }))) throw new HttpError(404, 'Student not found');
  if (oldBed) await Bed.updateOne({ _id: oldBed._id }, { student: null });
  try { await claimBed(newBed._id, req.params.id); }
  catch (err) { if (oldBed) await Bed.updateOne({ _id: oldBed._id, student: null }, { student: req.params.id }); throw err; }
  audit(req.user._id, 'ROOM_CHANGED', req.params.id, { from: oldBed?.label, to: newBed.label });
  res.json({ message: 'Room changed successfully' });
}));

export default router;
