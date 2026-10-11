import { Router } from 'express';
import crypto from 'crypto';
import { User, OutingSettings } from '../models/index.js';
import { auth, audit } from '../middleware/auth.js';
import { HttpError, wrap } from '../utils.js';
import { loadSettings } from '../settings.js';
import { parseSettings, parseSpecial, generationStatus, upcoming } from '../outing.js';
import { issuePass, passView } from '../passes.js';
import { clock } from '../clock.js';

const router = Router();
router.use(auth(['WARDEN']));

const wrapRule = (fn) => { try { return fn(); } catch (e) { throw e.status ? new HttpError(e.status, e.message) : e; } };
const persist = (s, userId) => {
  const { configured, ...doc } = s;
  return OutingSettings.findOneAndUpdate({ key: 'outing' }, { ...doc, key: 'outing', updatedBy: userId }, { upsert: true, new: true });
};
const summary = (s) => ({ timezone: s.timezone, closure: s.closure, weekly: s.weekly, rules: s.rules });
const view = async () => {
  const settings = await loadSettings();
  const now = clock.now();
  return { settings, now, today: generationStatus(settings, now), upcoming: upcoming(settings, now, 14) };
};

router.get('/settings', wrap(async (req, res) => res.json(await view())));

router.put('/settings', wrap(async (req, res) => {
  const cur = await loadSettings();
  const next = wrapRule(() => parseSettings(req.body, cur));
  await persist(next, req.user._id);
  audit(req.user._id, 'OUTING_SETTINGS_CHANGED', null, { before: summary(cur), after: summary(next) });
  res.json({ message: 'Outing schedule saved', ...(await view()) });
}));

router.post('/special', wrap(async (req, res) => {
  const cur = await loadSettings();
  const rule = { ...wrapRule(() => parseSpecial(req.body, cur.timezone, clock.now())), id: crypto.randomUUID() };
  await persist({ ...cur, specialDates: [...cur.specialDates, rule] }, req.user._id);
  audit(req.user._id, 'SPECIAL_DATE_ADDED', null, rule);
  res.status(201).json({ message: 'Special date added', ...(await view()) });
}));
router.patch('/special/:id', wrap(async (req, res) => {
  const cur = await loadSettings();
  const i = cur.specialDates.findIndex((r) => r.id === req.params.id);
  if (i < 0) throw new HttpError(404, 'Special date not found');
  const rule = { ...wrapRule(() => parseSpecial(req.body, cur.timezone, clock.now())), id: req.params.id };
  const list = [...cur.specialDates];
  list[i] = rule;
  await persist({ ...cur, specialDates: list }, req.user._id);
  audit(req.user._id, 'SPECIAL_DATE_EDITED', null, { before: cur.specialDates[i], after: rule });
  res.json({ message: 'Special date updated', ...(await view()) });
}));
router.delete('/special/:id', wrap(async (req, res) => {
  const cur = await loadSettings();
  const old = cur.specialDates.find((r) => r.id === req.params.id);
  if (!old) throw new HttpError(404, 'Special date not found');
  await persist({ ...cur, specialDates: cur.specialDates.filter((r) => r.id !== req.params.id) }, req.user._id);
  audit(req.user._id, 'SPECIAL_DATE_DELETED', null, old);
  res.json({ message: 'Special date deleted', ...(await view()) });
}));

router.post('/override', wrap(async (req, res) => {
  const { rollNumber, destination, reason, departAt, returnBy } = req.body || {};
  const from = new Date(departAt), to = new Date(returnBy), now = clock.now();
  if (!rollNumber || !destination || String(reason || '').trim().length < 5) throw new HttpError(400, 'Roll number, destination and a reason (at least 5 characters) are required');
  if (isNaN(from) || isNaN(to) || to <= from || to <= now) throw new HttpError(400, 'Choose a valid departure and a return time in the future');
  if (to - from > 864e5) throw new HttpError(400, 'An exceptional outing pass can last at most 24 hours. Use a leave request for longer.');
  const stu = await User.findOne({ rollNumber: String(rollNumber).trim().toUpperCase(), role: 'STUDENT', isActive: true });
  if (!stu) throw new HttpError(404, 'No active student with that roll number');
  const pass = await issuePass({ student: stu._id, source: 'OVERRIDE', type: 'OUTING', validFrom: from, validTo: to, destination: String(destination).trim(), reason: String(reason).trim(), issuedBy: req.user._id });
  audit(req.user._id, 'OUTING_OVERRIDE', stu._id, { pass: pass._id, reason: String(reason).trim(), validFrom: from, validTo: to });
  res.status(201).json({ message: 'Exceptional pass issued', pass: passView(pass, now, (await loadSettings()).timezone) });
}));

export default router;
