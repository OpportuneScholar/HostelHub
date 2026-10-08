import { Router } from 'express';
import { Hostel, Block, Room, Bed } from '../models/index.js';
import { auth, audit } from '../middleware/auth.js';
import { HttpError, wrap } from '../utils.js';

const router = Router();
router.use(auth(['WARDEN']));

// Creates the hostel/block if needed, then the room and its beds (B-205-1, B-205-2 ...)
router.post('/rooms', wrap(async (req, res) => {
  const { hostelName, blockName, floor = 0, number, capacity } = req.body || {};
  if (!hostelName || !blockName || !number || !(capacity >= 1)) throw new HttpError(400, 'Hostel, block, room number and capacity are required');
  const hostel = await Hostel.findOneAndUpdate({ name: hostelName.trim() }, { name: hostelName.trim() }, { upsert: true, new: true });
  const block = await Block.findOneAndUpdate({ hostel: hostel._id, name: blockName.trim() }, { hostel: hostel._id, name: blockName.trim() }, { upsert: true, new: true });
  const room = await Room.create({ block: block._id, floor, number, capacity });
  await Bed.insertMany(Array.from({ length: capacity }, (_, i) => ({ room: room._id, label: `${room.number}-${i + 1}` })));
  audit(req.user._id, 'ROOM_CREATED', null, { room: room.number, capacity });
  res.status(201).json({ message: 'Room created', room });
}));

router.get('/rooms', wrap(async (req, res) => {
  const rooms = await Room.find().sort({ number: 1 }).limit(300).populate({ path: 'block', populate: 'hostel' });
  const beds = await Bed.find({ room: { $in: rooms.map((r) => r._id) } }).select('room student');
  const occ = {}; beds.forEach((b) => { if (b.student) occ[b.room] = (occ[b.room] || 0) + 1; });
  res.json({ items: rooms.map((r) => ({ ...r.toObject(), occupied: occ[r._id] || 0 })) });
}));

router.get('/tree', wrap(async (req, res) => {
  const [hostels, blocks, rooms, beds] = await Promise.all([Hostel.find().sort({ name: 1 }).lean(), Block.find().sort({ name: 1 }).lean(), Room.find().sort({ number: 1 }).lean(),
    Bed.find().populate('student', 'name').sort({ label: 1 }).lean()]);
  const by = (list, key, fn) => list.reduce((m, x) => { (m[x[key]] ||= []).push(fn(x)); return m; }, {});
  const bedsBy = by(beds, 'room', (b) => ({ _id: b._id, label: b.label, student: b.student?.name || null, status: b.student ? 'OCCUPIED' : b.maintenance ? 'MAINTENANCE' : 'AVAILABLE' }));
  const roomsBy = by(rooms, 'block', (r) => ({ _id: r._id, number: r.number, floor: r.floor, beds: bedsBy[r._id] || [] }));
  const blocksBy = by(blocks, 'hostel', (b) => ({ _id: b._id, name: b.name, rooms: roomsBy[b._id] || [] }));
  res.json({ items: hostels.map((h) => ({ _id: h._id, name: h.name, blocks: blocksBy[h._id] || [] })) });
}));

router.patch('/beds/:id/maintenance', wrap(async (req, res) => {
  if (typeof req.body?.maintenance !== 'boolean') throw new HttpError(400, 'maintenance must be true or false');
  const bed = await Bed.findOneAndUpdate({ _id: req.params.id, student: null }, { maintenance: req.body.maintenance });
  if (!bed) throw new HttpError(409, 'Occupied beds cannot be changed. Move the student first.');
  audit(req.user._id, req.body.maintenance ? 'BED_MAINTENANCE_ON' : 'BED_MAINTENANCE_OFF', null, { bed: bed.label });
  res.json({ message: req.body.maintenance ? 'Bed marked under maintenance' : 'Bed is available again' });
}));

router.get('/summary', wrap(async (req, res) => {
  const [total, occupied, maint] = await Promise.all([Bed.countDocuments(), Bed.countDocuments({ student: { $ne: null } }), Bed.countDocuments({ maintenance: true, student: null })]);
  res.json({ totalBeds: total, occupiedBeds: occupied, maintenanceBeds: maint, availableBeds: total - occupied - maint });
}));

export default router;
