import { Router } from 'express';
import { GatePass, GateEntry, Bed } from '../models/index.js';
import { auth, audit } from '../middleware/auth.js';
import { HttpError, wrap } from '../utils.js';

const router = Router();
router.use(auth(['GUARD']));

const load = async (passId) => {
  const pass = typeof passId === 'string' && await GatePass.findOne({ passId: passId.trim() }).populate('student', 'name rollNumber');
  if (!pass) throw new HttpError(404, 'Invalid pass');
  return pass;
};
const hhmm = (d) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
// Guards only get what they need at the gate: name, roll, room, pass type, validity.
const describe = async (p) => ({
  student: p.student.name, rollNumber: p.student.rollNumber, room: (await Bed.findOne({ student: p.student._id }))?.label || '-',
  passId: p.passId, type: p.type, validFrom: p.validFrom, validTo: p.validTo, state: p.state,
});
const checkValid = (p) => {
  const now = new Date();
  if (p.status !== 'ACTIVE') throw new HttpError(400, 'Pass cancelled');
  if (now > p.validTo) throw new HttpError(400, 'Pass expired');
  if (now < p.validFrom) throw new HttpError(400, 'Pass is not valid yet');
};

router.post('/verify', wrap(async (req, res) => {
  const pass = await load(req.body?.passId);
  if (pass.state === 'NONE') checkValid(pass); // a student already outside must still be able to come IN
  res.json({ message: 'Pass verified.', pass: await describe(pass) });
}));

router.post('/mark', wrap(async (req, res) => {
  const { passId, action, gate } = req.body || {};
  if (!['IN', 'OUT'].includes(action)) throw new HttpError(400, 'Action must be IN or OUT');
  const pass = await load(passId);
  const from = action === 'OUT' ? 'NONE' : 'OUT';
  if (action === 'OUT') checkValid(pass);
  // Conditional update: two guards scanning at once cannot both succeed.
  const updated = await GatePass.findOneAndUpdate({ _id: pass._id, state: from }, { state: action });
  if (!updated) {
    if (pass.state === 'OUT') throw new HttpError(409, action === 'OUT' ? 'Student already marked OUT' : 'Try again');
    if (pass.state === 'IN') throw new HttpError(409, action === 'IN' ? 'Student already marked IN' : 'This pass has already been used');
    throw new HttpError(409, 'Student has not been marked OUT');
  }
  const entry = await GateEntry.create({ student: pass.student._id, pass: pass._id, action, guard: req.user._id, gate: gate || 'Main Gate' });
  audit(req.user._id, `GATE_${action}`, pass.student._id, { pass: pass._id });
  res.json({ message: `Student marked ${action} at ${hhmm(entry.at)}.`, at: entry.at });
}));

export default router;
