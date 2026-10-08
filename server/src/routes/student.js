import { Router } from 'express';
import { StudentProfile, Bed, LeaveRequest, GatePass, GateEntry, Complaint, Fee, Notice } from '../models/index.js';
import { auth, audit } from '../middleware/auth.js';
import { HttpError, wrap } from '../utils.js';

const router = Router();
router.use(auth(['STUDENT'])); // every query below is scoped to req.user._id, so students only see their own data
const me = (req) => req.user._id;

export const activeNotices = () => {
  const now = new Date();
  return Notice.find({ publishAt: { $lte: now }, expiresAt: { $gte: now } }).sort({ priority: 1, publishAt: -1 }).limit(20);
};
export const withOverdue = (f) => ({ ...f.toObject(), status: f.status === 'PENDING' && f.dueDate < new Date() ? 'OVERDUE' : f.status });

const myRoom = async (req) => (await Bed.findOne({ student: me(req) }).populate({ path: 'room', populate: { path: 'block', populate: 'hostel' } }));

router.get('/dashboard', wrap(async (req, res) => {
  const [profile, bed, pending, recent, notices] = await Promise.all([
    StudentProfile.findOne({ user: me(req) }), myRoom(req),
    LeaveRequest.countDocuments({ student: me(req), status: 'PENDING' }),
    GateEntry.find({ student: me(req) }).sort({ at: -1 }).limit(5),
    activeNotices(),
  ]);
  const last = recent[0];
  res.json({ profile, bed, pendingRequests: pending, recentGateActivity: recent, notices,
    currentStatus: last ? (last.action === 'OUT' ? 'Outside' : 'In hostel') : 'In hostel' });
}));

router.get('/profile', wrap(async (req, res) => res.json({ profile: await StudentProfile.findOne({ user: me(req) }), bed: await myRoom(req) })));
// Students may edit only these fields. Room, roll number, course etc. stay with the warden.
router.patch('/profile', wrap(async (req, res) => {
  const upd = {};
  for (const k of ['phone', 'address', 'emergencyContact']) if (typeof req.body?.[k] === 'string' && req.body[k].trim()) upd[k] = req.body[k].trim();
  if (!Object.keys(upd).length) throw new HttpError(400, 'Nothing to update');
  res.json({ message: 'Profile updated', profile: await StudentProfile.findOneAndUpdate({ user: me(req) }, upd, { new: true }) });
}));

router.post('/leave', wrap(async (req, res) => {
  const { type, reason, destination, departAt, returnBy, emergencyContact } = req.body || {};
  const d = new Date(departAt), r = new Date(returnBy);
  if (!['LEAVE', 'OUTING'].includes(type) || !reason || !destination || isNaN(d) || isNaN(r)) throw new HttpError(400, 'Fill in all required fields');
  if (r <= d) throw new HttpError(400, 'Return time must be after departure time');
  if (r < new Date()) throw new HttpError(400, 'Return time is already in the past');
  const leave = await LeaveRequest.create({ student: me(req), type, reason, destination, departAt: d, returnBy: r, emergencyContact });
  res.status(201).json({ message: 'Request submitted', leave });
}));
router.get('/leave', wrap(async (req, res) => {
  await LeaveRequest.updateMany({ student: me(req), status: 'PENDING', returnBy: { $lt: new Date() } }, { status: 'EXPIRED' });
  res.json({ items: await LeaveRequest.find({ student: me(req) }).sort({ createdAt: -1 }).limit(50) });
}));
router.patch('/leave/:id/cancel', wrap(async (req, res) => {
  const gp = await GatePass.findOne({ leave: req.params.id, student: me(req) });
  if (gp && gp.state !== 'NONE') throw new HttpError(400, 'You are already out on this pass and cannot cancel it');
  const leave = await LeaveRequest.findOneAndUpdate({ _id: req.params.id, student: me(req), status: { $in: ['PENDING', 'APPROVED'] } }, { status: 'CANCELLED' });
  if (!leave) throw new HttpError(400, 'This request cannot be cancelled');
  await GatePass.updateOne({ leave: leave._id }, { status: 'CANCELLED' });
  res.json({ message: 'Request cancelled' });
}));

router.get('/activity', wrap(async (req, res) => res.json({ items: await GateEntry.find({ student: me(req) }).sort({ at: -1 }).limit(50).populate('pass', 'passId type') })));
router.get('/passes', wrap(async (req, res) => res.json({ items: await GatePass.find({ student: me(req) }).sort({ createdAt: -1 }).limit(20) })));

router.post('/complaints', wrap(async (req, res) => {
  const { category, subject, description, priority } = req.body || {};
  if (!category || !subject || !description) throw new HttpError(400, 'Category, subject and description are required');
  const c = await Complaint.create({ student: me(req), category, subject, description, priority });
  res.status(201).json({ message: 'Complaint submitted', complaint: c });
}));
router.get('/complaints', wrap(async (req, res) => res.json({ items: await Complaint.find({ student: me(req) }).sort({ createdAt: -1 }).limit(50) })));
router.get('/fees', wrap(async (req, res) => res.json({ items: (await Fee.find({ student: me(req) }).sort({ dueDate: -1 })).map(withOverdue) })));
router.get('/notices', wrap(async (req, res) => res.json({ items: await activeNotices() })));

export default router;
