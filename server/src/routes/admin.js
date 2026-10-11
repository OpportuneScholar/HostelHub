import { Router } from 'express';
import { User, Room, Bed, LeaveRequest, GatePass, GateEntry, Complaint, Fee, Notice, AuditLog } from '../models/index.js';
import { auth, audit } from '../middleware/auth.js';
import { HttpError, wrap, escapeRegex } from '../utils.js';
import { withOverdue } from './student.js';
import { issuePass, passView } from '../passes.js';
import { loadSettings } from '../settings.js';
import { zonedToUtc, localParts, isYmd, addDays } from '../outing.js';
import { clock } from '../clock.js';

const router = Router();
router.use(auth(['WARDEN']));
const pg = (req) => {
  const limit = Math.min(50, +req.query.limit || 20);
  return { limit, skip: (Math.max(1, +req.query.page || 1) - 1) * limit };
};

router.get('/dashboard', wrap(async (req, res) => {
  const { timezone } = await loadSettings();
  const day = zonedToUtc(localParts(clock.now(), timezone).ymd, '00:00', timezone);
  const [students, total, occupied, leave, passes, complaints, outToday, inToday, rooms, pendingFees, maint, outNow] = await Promise.all([
    User.countDocuments({ role: 'STUDENT', isActive: true }), Bed.countDocuments(), Bed.countDocuments({ student: { $ne: null } }),
    LeaveRequest.countDocuments({ status: 'PENDING' }), GatePass.countDocuments({ status: 'ACTIVE', state: { $ne: 'IN' }, validTo: { $gte: new Date() } }),
    Complaint.countDocuments({ status: { $in: ['OPEN', 'IN_PROGRESS'] } }),
    GateEntry.countDocuments({ at: { $gte: day }, action: 'OUT' }), GateEntry.countDocuments({ at: { $gte: day }, action: 'IN' }),
    Room.countDocuments(), Fee.countDocuments({ status: 'PENDING' }), Bed.countDocuments({ maintenance: true, student: null }), GatePass.countDocuments({ state: 'OUT' }),
  ]);
  res.json({ outNow, totalRooms: rooms, pendingFees, students, totalBeds: total, occupiedBeds: occupied, availableBeds: total - occupied - maint, maintenanceBeds: maint,
    pendingLeave: leave, activePasses: passes, openComplaints: complaints, todayOut: outToday, todayIn: inToday });
}));

router.get('/leave', wrap(async (req, res) => {
  const f = req.query.status ? { status: String(req.query.status) } : {};
  const { limit, skip } = pg(req);
  res.json({ items: await LeaveRequest.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('student', 'name rollNumber') });
}));
router.patch('/leave/:id', wrap(async (req, res) => {
  const { decision, remark } = req.body || {};
  if (!['APPROVED', 'REJECTED'].includes(decision)) throw new HttpError(400, 'Decision must be APPROVED or REJECTED');
  const leave = await LeaveRequest.findOneAndUpdate({ _id: req.params.id, status: 'PENDING', returnBy: { $gte: new Date() } },
    { status: decision, remark, decidedBy: req.user._id, decidedAt: new Date() }, { new: true });
  if (!leave) throw new HttpError(409, 'Request is no longer pending');
  let pass = null;
  if (decision === 'APPROVED') pass = await issuePass({ student: leave.student, source: 'LEAVE', type: leave.type, leave: leave._id, validFrom: leave.departAt, validTo: leave.returnBy, destination: leave.destination, reason: leave.reason, issuedBy: req.user._id });
  audit(req.user._id, `LEAVE_${decision}`, leave.student, { leave: leave._id });
  res.json({ message: `Request ${decision.toLowerCase()}`, leave, pass });
}));

router.get('/passes', wrap(async (req, res) => {
  const { limit, skip } = pg(req);
  const s = await loadSettings();
  const now = clock.now();
  const f = {};
  if (req.query.q) {
    const r = new RegExp(escapeRegex(String(req.query.q)), 'i');
    f.student = { $in: await User.find({ $or: [{ name: r }, { rollNumber: r }] }).distinct('_id') };
  }
  if (req.query.date) {
    if (!isYmd(String(req.query.date))) throw new HttpError(400, 'Invalid date');
    const d = String(req.query.date);
    f.validFrom = { $lt: zonedToUtc(addDays(d, 1), '00:00', s.timezone) };
    f.validTo = { $gte: zonedToUtc(d, '00:00', s.timezone) };
  }
  const states = { NOT_EXITED: { status: 'ACTIVE', state: 'NONE', validTo: { $gte: now } }, OUT: { state: 'OUT' }, RETURNED: { state: 'IN' }, EXPIRED: { status: 'ACTIVE', state: 'NONE', validTo: { $lt: now } }, CANCELLED: { status: 'CANCELLED' } };
  if (req.query.state) {
    if (!states[req.query.state]) throw new HttpError(400, 'Unknown state');
    Object.assign(f, states[req.query.state]);
  }
  if (['AUTO', 'LEAVE', 'OVERRIDE'].includes(req.query.source)) f.source = req.query.source;
  const items = await GatePass.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('student', 'name rollNumber');
  res.json({ items: items.map((p) => passView(p, now, s.timezone)), timezone: s.timezone });
}));

router.get('/gate-activity', wrap(async (req, res) => {
  const f = {};
  const { date, action, guard, q } = req.query;
  const { timezone } = await loadSettings();
  const ymd = date ? String(date) : localParts(clock.now(), timezone).ymd;
  if (!isYmd(ymd)) throw new HttpError(400, 'Invalid date');
  f.at = { $gte: zonedToUtc(ymd, '00:00', timezone), $lt: zonedToUtc(addDays(ymd, 1), '00:00', timezone) };
  if (['IN', 'OUT'].includes(action)) f.action = action;
  if (guard) f.guard = String(guard);
  if (q) {
    const r = new RegExp(escapeRegex(q), 'i');
    f.student = { $in: await User.find({ $or: [{ name: r }, { rollNumber: r }] }).distinct('_id') };
  }
  const { limit, skip } = pg(req);
  res.json({ items: await GateEntry.find(f).sort({ at: -1 }).skip(skip).limit(limit).populate('student', 'name rollNumber').populate('guard', 'name').populate('pass', 'passId type source snapshot outAt inAt validFrom validTo') });
}));

router.get('/complaints', wrap(async (req, res) => {
  const f = req.query.status ? { status: String(req.query.status) } : {};
  const { limit, skip } = pg(req);
  res.json({ items: await Complaint.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('student', 'name rollNumber') });
}));
router.patch('/complaints/:id', wrap(async (req, res) => {
  const { status, response } = req.body || {};
  if (!['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(status)) throw new HttpError(400, 'Invalid status');
  const c = await Complaint.findByIdAndUpdate(req.params.id, { status, response, updatedBy: req.user._id }, { new: true });
  if (!c) throw new HttpError(404, 'Complaint not found');
  audit(req.user._id, 'COMPLAINT_STATUS', c.student, { complaint: c._id, status });
  res.json({ message: 'Complaint updated', complaint: c });
}));

router.post('/fees', wrap(async (req, res) => {
  const { rollNumber, type, amount, dueDate } = req.body || {};
  const stu = rollNumber && await User.findOne({ rollNumber: String(rollNumber).trim().toUpperCase(), role: 'STUDENT' });
  if (!stu) throw new HttpError(404, 'No student with that roll number');
  const student = stu._id;
  if (!type || !(amount >= 0) || isNaN(new Date(dueDate))) throw new HttpError(400, 'Student, fee type, amount and due date are required');
  res.status(201).json({ message: 'Fee added', fee: await Fee.create({ student, type, amount, dueDate }) });
}));
router.get('/fees', wrap(async (req, res) => {
  const { limit, skip } = pg(req);
  res.json({ items: (await Fee.find(req.query.student ? { student: String(req.query.student) } : {}).sort({ dueDate: -1 }).skip(skip).limit(limit).populate('student', 'name rollNumber')).map(withOverdue) });
}));
router.patch('/fees/:id/paid', wrap(async (req, res) => {
  const { reference } = req.body || {};
  if (!reference) throw new HttpError(400, 'Enter the payment reference to mark this as paid');
  const fee = await Fee.findByIdAndUpdate(req.params.id, { status: 'PAID', reference, paidAt: new Date() }, { new: true });
  if (!fee) throw new HttpError(404, 'Fee not found');
  audit(req.user._id, 'FEE_MARKED_PAID', fee.student, { fee: fee._id });
  res.json({ message: 'Fee marked as paid', fee });
}));

router.post('/notices', wrap(async (req, res) => {
  const { title, description, category, priority, publishAt, expiresAt } = req.body || {};
  if (!title || !description || isNaN(new Date(expiresAt))) throw new HttpError(400, 'Title, description and expiry date are required');
  res.status(201).json({ message: 'Notice published', notice: await Notice.create({ title, description, category, priority, publishAt, expiresAt, createdBy: req.user._id }) });
}));
router.get('/notices', wrap(async (req, res) => res.json({ items: await Notice.find().sort({ publishAt: -1 }).limit(50) })));
router.patch('/notices/:id', wrap(async (req, res) => {
  const upd = {};
  for (const k of ['title', 'description', 'category', 'priority', 'expiresAt']) if (req.body?.[k]) upd[k] = req.body[k];
  const n = await Notice.findByIdAndUpdate(req.params.id, upd, { new: true, runValidators: true });
  if (!n) throw new HttpError(404, 'Notice not found');
  res.json({ message: 'Notice updated', notice: n });
}));
router.delete('/notices/:id', wrap(async (req, res) => {
  await Notice.deleteOne({ _id: req.params.id });
  res.json({ message: 'Notice deleted' });
}));

router.get('/audit', wrap(async (req, res) => res.json({ items: await AuditLog.find().sort({ at: -1 }).limit(100).populate('actor target', 'name role') })));

export default router;
