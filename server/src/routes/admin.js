import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { User, Room, StudentProfile, Bed, LeaveRequest, GatePass, GateEntry, Complaint, Fee, Notice, AuditLog } from '../models/index.js';
import { auth, audit } from '../middleware/auth.js';
import { HttpError, wrap, escapeRegex } from '../utils.js';
import { withOverdue } from './student.js';

const router = Router();
router.use(auth(['WARDEN']));
const pg = (req) => { const limit = Math.min(50, +req.query.limit || 20); return { limit, skip: (Math.max(1, +req.query.page || 1) - 1) * limit }; };

router.get('/dashboard', wrap(async (req, res) => {
  const day = new Date(); day.setHours(0, 0, 0, 0);
  const [students, total, occupied, leave, passes, complaints, outToday, inToday, rooms, pendingFees, maint] = await Promise.all([
    User.countDocuments({ role: 'STUDENT', isActive: true }), Bed.countDocuments(), Bed.countDocuments({ student: { $ne: null } }),
    LeaveRequest.countDocuments({ status: 'PENDING' }), GatePass.countDocuments({ status: 'ACTIVE', state: { $ne: 'IN' }, validTo: { $gte: new Date() } }),
    Complaint.countDocuments({ status: { $in: ['OPEN', 'IN_PROGRESS'] } }),
    GateEntry.countDocuments({ at: { $gte: day }, action: 'OUT' }), GateEntry.countDocuments({ at: { $gte: day }, action: 'IN' }),
    Room.countDocuments(), Fee.countDocuments({ status: 'PENDING' }), Bed.countDocuments({ maintenance: true, student: null }),
  ]);
  res.json({ totalRooms: rooms, pendingFees, students, totalBeds: total, occupiedBeds: occupied, availableBeds: total - occupied - maint, maintenanceBeds: maint,
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
  if (decision === 'APPROVED') pass = await GatePass.create({ passId: crypto.randomBytes(16).toString('hex'), leave: leave._id,
    student: leave.student, type: leave.type, validFrom: leave.departAt, validTo: leave.returnBy });
  audit(req.user._id, `LEAVE_${decision}`, leave.student, { leave: leave._id });
  res.json({ message: `Request ${decision.toLowerCase()}`, leave, pass });
}));

router.get('/passes', wrap(async (req, res) => {
  const { limit, skip } = pg(req);
  res.json({ items: await GatePass.find().sort({ createdAt: -1 }).skip(skip).limit(limit).populate('student', 'name rollNumber') });
}));

router.get('/gate-activity', wrap(async (req, res) => {
  const f = {}; const { date, action, guard, q } = req.query;
  const day = date ? new Date(`${date}T00:00:00`) : new Date();
  if (isNaN(day)) throw new HttpError(400, 'Invalid date');
  day.setHours(0, 0, 0, 0);
  f.at = { $gte: day, $lt: new Date(day.getTime() + 864e5) };
  if (['IN', 'OUT'].includes(action)) f.action = action;
  if (guard) f.guard = String(guard);
  if (q) { const r = new RegExp(escapeRegex(q), 'i'); f.student = { $in: await User.find({ $or: [{ name: r }, { rollNumber: r }] }).distinct('_id') }; }
  const { limit, skip } = pg(req);
  res.json({ items: await GateEntry.find(f).sort({ at: -1 }).skip(skip).limit(limit).populate('student', 'name rollNumber').populate('guard', 'name').populate('pass', 'passId type') });
}));

router.get('/complaints', wrap(async (req, res) => {
  const f = req.query.status ? { status: String(req.query.status) } : {}; const { limit, skip } = pg(req);
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
  const upd = {}; for (const k of ['title', 'description', 'category', 'priority', 'expiresAt']) if (req.body?.[k]) upd[k] = req.body[k];
  const n = await Notice.findByIdAndUpdate(req.params.id, upd, { new: true, runValidators: true });
  if (!n) throw new HttpError(404, 'Notice not found');
  res.json({ message: 'Notice updated', notice: n });
}));
router.delete('/notices/:id', wrap(async (req, res) => { await Notice.deleteOne({ _id: req.params.id }); res.json({ message: 'Notice deleted' }); }));

router.post('/guards', wrap(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password || password.length < 8) throw new HttpError(400, 'Name, email and a password of 8+ characters are required');
  const g = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12), role: 'GUARD' });
  audit(req.user._id, 'GUARD_CREATED', g._id);
  res.status(201).json({ message: 'Guard account created' });
}));
router.get('/audit', wrap(async (req, res) => res.json({ items: await AuditLog.find().sort({ at: -1 }).limit(100).populate('actor target', 'name role') })));

export default router;
