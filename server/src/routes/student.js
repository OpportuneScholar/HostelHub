import { Router } from 'express';
import { StudentProfile, Bed, LeaveRequest, GatePass, GateEntry, Complaint, Fee, Notice } from '../models/index.js';
import { auth, audit } from '../middleware/auth.js';
import { HttpError, wrap } from '../utils.js';
import { loadSettings } from '../settings.js';
import { evaluateOuting, generationStatus, upcoming, localParts, zonedToUtc } from '../outing.js';
import { issuePass, passView } from '../passes.js';
import { clock } from '../clock.js';

const router = Router();
router.use(auth(['STUDENT']));
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
router.patch('/profile', wrap(async (req, res) => {
  const upd = {};
  for (const k of ['phone', 'address', 'emergencyContact']) if (typeof req.body?.[k] === 'string' && req.body[k].trim()) upd[k] = req.body[k].trim();
  if (!Object.keys(upd).length) throw new HttpError(400, 'Nothing to update');
  res.json({ message: 'Profile updated', profile: await StudentProfile.findOneAndUpdate({ user: me(req) }, upd, { new: true }) });
}));

router.post('/leave', wrap(async (req, res) => {
  const { type, reason, destination, departAt, returnBy, emergencyContact } = req.body || {};
  const d = new Date(departAt), r = new Date(returnBy);
  if (type === 'OUTING') throw new HttpError(400, 'Outing passes are issued automatically: use Outing Pass. Leave requests need the warden\'s approval.');
  if (type !== 'LEAVE' || !reason || !destination || isNaN(d) || isNaN(r)) throw new HttpError(400, 'Fill in all required fields');
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

router.post('/complaints', wrap(async (req, res) => {
  const { category, subject, description, priority } = req.body || {};
  if (!category || !subject || !description) throw new HttpError(400, 'Category, subject and description are required');
  const c = await Complaint.create({ student: me(req), category, subject, description, priority });
  res.status(201).json({ message: 'Complaint submitted', complaint: c });
}));
router.get('/complaints', wrap(async (req, res) => res.json({ items: await Complaint.find({ student: me(req) }).sort({ createdAt: -1 }).limit(50) })));
router.get('/fees', wrap(async (req, res) => res.json({ items: (await Fee.find({ student: me(req) }).sort({ dueDate: -1 })).map(withOverdue) })));
router.get('/notices', wrap(async (req, res) => res.json({ items: await activeNotices() })));

router.get('/outing/status', wrap(async (req, res) => {
  const s = await loadSettings();
  const now = clock.now();
  const g = generationStatus(s, now);
  const open = await GatePass.findOne({ student: me(req), autoOpen: true });
  res.json({ timezone: s.timezone, configured: s.configured, today: g.today, time: g.time, open: g.open, reason: g.reason, schedule: g.schedule, rules: s.rules,
    upcoming: upcoming(s, now, 7), hasRoom: !!(await Bed.findOne({ student: me(req) })), openPass: open ? passView(open, now, s.timezone) : null });
}));

router.post('/outing', wrap(async (req, res) => {
  const b = req.body || {};
  const uid = me(req);
  const destination = String(b.destination || '').trim(), reason = String(b.reason || '').trim();
  if (!destination || !reason) throw new HttpError(400, 'Destination and reason are required');
  if (destination.length > 100 || reason.length > 300) throw new HttpError(400, 'Destination or reason is too long');
  const s = await loadSettings();
  const now = clock.now();
  const ev = evaluateOuting(s, now, { date: b.date || undefined, departTime: b.departTime || undefined, returnTime: b.returnTime || undefined });
  if (!ev.ok) throw new HttpError(ev.code === 'INVALID' || ev.code === 'TIME' ? 400 : 403, ev.reason);
  if (!(await Bed.findOne({ student: uid }))) throw new HttpError(403, 'You need an allotted room before you can get an outing pass. Contact the warden.');
  if (s.rules.blockOverdueFees && await Fee.exists({ student: uid, status: 'PENDING', dueDate: { $lt: now } })) throw new HttpError(403, 'You have overdue hostel fees. Clear them to get an outing pass.');
  await GatePass.updateMany({ student: uid, autoOpen: true, state: 'NONE', validTo: { $lt: now } }, { autoOpen: false });
  const open = await GatePass.findOne({ student: uid, autoOpen: true });
  if (open) throw new HttpError(409, open.state === 'OUT' ? 'You are marked OUT on an earlier pass. Return first, then ask for a new pass.' : 'You already have an open outing pass. Use it or cancel it first.');
  const clash = await GatePass.findOne({ student: uid, status: 'ACTIVE', state: { $ne: 'IN' }, validTo: { $gt: ev.validFrom }, validFrom: { $lt: ev.validTo } });
  if (clash) throw new HttpError(409, 'You already have an active pass that overlaps this time.');
  const dayStart = zonedToUtc(localParts(now, s.timezone).ymd, '00:00', s.timezone);
  if ((await GatePass.countDocuments({ student: uid, source: 'AUTO', createdAt: { $gte: dayStart } })) >= s.rules.maxPassesPerDay) throw new HttpError(409, `You have reached today's limit of ${s.rules.maxPassesPerDay} outing pass(es).`);
  const pass = await issuePass({ student: uid, source: 'AUTO', type: 'OUTING', validFrom: ev.validFrom, validTo: ev.validTo, destination, reason, issuedBy: uid, autoOpen: true });
  audit(uid, 'OUTING_PASS_ISSUED', uid, { pass: pass._id });
  res.status(201).json({ message: 'Outing pass generated', pass: passView(pass, now, s.timezone) });
}));

router.get('/passes', wrap(async (req, res) => {
  const s = await loadSettings();
  const now = clock.now();
  res.json({ items: (await GatePass.find({ student: me(req) }).sort({ createdAt: -1 }).limit(30)).map((p) => passView(p, now, s.timezone)) });
}));
router.patch('/passes/:id/cancel', wrap(async (req, res) => {
  const p = await GatePass.findOneAndUpdate({ _id: req.params.id, student: me(req), source: 'AUTO', status: 'ACTIVE', state: 'NONE' }, { status: 'CANCELLED', autoOpen: false, codeActive: false });
  if (!p) throw new HttpError(400, 'This pass cannot be cancelled (it is already used, cancelled or not an outing pass).');
  audit(me(req), 'OUTING_PASS_CANCELLED', me(req), { pass: p._id });
  res.json({ message: 'Pass cancelled' });
}));

export default router;
