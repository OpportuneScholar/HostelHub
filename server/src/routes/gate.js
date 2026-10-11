import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { GatePass, GateEntry, User, Bed } from '../models/index.js';
import { auth, audit } from '../middleware/auth.js';
import { HttpError, wrap } from '../utils.js';
import { gateCheck, fmtClock } from '../outing.js';
import { loadSettings } from '../settings.js';
import { passView } from '../passes.js';
import { clock } from '../clock.js';

const router = Router();
router.use(auth(['GUARD']));

// Only failed lookups count, so six-digit codes cannot be guessed (15 misses per 10 minutes).
const missLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true,
  keyGenerator: (req) => String(req.user?._id || req.ip), message: { message: 'Too many wrong codes. Wait a few minutes and try again.' } });

const plain = (p) => (p.toObject ? p.toObject() : p);
const find = async ({ passId, code }) => {
  const c = typeof code === 'string' ? code.trim() : '';
  if (c) {
    if (!/^\d{6}$/.test(c)) throw new HttpError(400, 'The code must be 6 digits');
    const pass = (await GatePass.find({ code: c }).sort({ createdAt: -1 }).limit(1))[0];
    if (!pass) throw new HttpError(404, 'No pass matches that code');
    return pass;
  }
  if (typeof passId !== 'string' || !passId.trim()) throw new HttpError(400, 'Enter the 6-digit code or scan the QR code');
  const pass = await GatePass.findOne({ passId: passId.trim() });
  if (!pass) throw new HttpError(404, 'Invalid pass');
  return pass;
};
const describe = async (pass, now) => {
  const tz = (await loadSettings()).timezone;
  let v = passView(pass, now, tz);
  if (!v.name) {
    const u = await User.findById(pass.student);
    const bed = await Bed.findOne({ student: pass.student });
    v = { ...v, name: u?.name, rollNumber: u?.rollNumber, room: v.room || bed?.label };
  }
  const g = gateCheck(plain(pass), now);
  return { ...v, returnDeadline: v.validTo, problem: g.problem, canOut: g.canOut, canIn: g.canIn };
};

router.post('/verify', missLimiter, wrap(async (req, res) => {
  const now = clock.now();
  const pass = await find(req.body || {});
  const v = await describe(pass, now);
  res.json({ message: v.problem || 'Pass verified.', pass: v });
}));

router.post('/mark', wrap(async (req, res) => {
  const { passId, action, gate } = req.body || {};
  if (!['IN', 'OUT'].includes(action)) throw new HttpError(400, 'Action must be IN or OUT');
  const pass = await GatePass.findOne({ passId: String(passId || '').trim() });
  if (!pass) throw new HttpError(404, 'Invalid pass');
  const now = clock.now();
  const o = plain(pass);
  const g = gateCheck(o, now);
  if (action === 'OUT') {
    if (o.state === 'OUT') throw new HttpError(409, 'Student already marked OUT');
    if (o.state === 'IN') throw new HttpError(409, 'This pass has already been used');
    if (g.problem) throw new HttpError(400, g.problem);
  } else {
    if (o.state === 'NONE') throw new HttpError(409, 'Student has not been marked OUT');
    if (o.state === 'IN') throw new HttpError(409, 'Student already marked IN');
  }
  // Conditional update: concurrent scans and just-cancelled passes cannot go OUT.
  const changed = await GatePass.findOneAndUpdate(action === 'OUT' ? { _id: pass._id, state: 'NONE', status: 'ACTIVE' } : { _id: pass._id, state: 'OUT' },
    action === 'OUT' ? { state: 'OUT', outAt: now } : { state: 'IN', inAt: now, autoOpen: false, codeActive: false });
  if (!changed) throw new HttpError(409, 'The pass changed while you were checking it. Verify it again.');
  try { await GateEntry.create({ student: pass.student, pass: pass._id, action, guard: req.user._id, gate: String(gate || 'Main Gate').slice(0, 40), at: now }); }
  catch (e) {
    await GatePass.updateOne({ _id: pass._id }, action === 'OUT' ? { state: 'NONE', outAt: null } : { state: 'OUT', inAt: null });
    throw e;
  }
  audit(req.user._id, `GATE_${action}`, pass.student, { pass: pass._id });
  res.json({ message: `Student marked ${action} at ${fmtClock(now, (await loadSettings()).timezone)}.`, at: now });
}));

export default router;
