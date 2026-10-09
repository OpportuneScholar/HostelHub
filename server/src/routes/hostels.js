import { Router } from 'express';
import { Hostel, Block, Room, Bed } from '../models/index.js';
import { auth, audit } from '../middleware/auth.js';
import { HttpError, wrap } from '../utils.js';
import { parseRoom, planBeds } from '../roomLogic.js';

const router = Router();
router.use(auth(['WARDEN']));

const getBlock = async (hostelName, blockName) => {
  const hostel = await Hostel.findOneAndUpdate({ name: hostelName }, { name: hostelName }, { upsert: true, new: true });
  return Block.findOneAndUpdate({ hostel: hostel._id, name: blockName }, { hostel: hostel._id, name: blockName }, { upsert: true, new: true });
};
// After a room moves away or is deleted, remove a block (and hostel) that has nothing left in it.
const pruneEmpty = async (blockId) => {
  if (!blockId || await Room.exists({ block: blockId })) return;
  const block = await Block.findByIdAndDelete(blockId);
  if (block && !(await Block.exists({ hostel: block.hostel }))) await Hostel.deleteOne({ _id: block.hostel });
};

// Room numbers only have to be unique inside one block (Room 101 can exist in every hostel).
const numberTaken = async (d, exceptId) => {
  const hostel = await Hostel.findOne({ name: d.hostelName });
  const block = hostel && await Block.findOne({ hostel: hostel._id, name: d.blockName });
  if (!block) return false;
  return !!(await Room.findOne(exceptId ? { block: block._id, number: d.number, _id: { $ne: exceptId } } : { block: block._id, number: d.number }));
};
const dupMessage = (d) => `Room ${d.number} already exists in ${d.hostelName}, block ${d.blockName}`;

// Creates the hostel/block if needed, then the room and its beds (B-205-1, B-205-2 ...)
router.post('/rooms', wrap(async (req, res) => {
  const d = parseRoom(req.body);
  if (await numberTaken(d)) throw new HttpError(409, dupMessage(d));
  const block = await getBlock(d.hostelName, d.blockName);
  let room;
  try {
    room = await Room.create({ block: block._id, floor: d.floor, number: d.number, capacity: d.capacity });
    await Bed.insertMany(Array.from({ length: d.capacity }, (_, i) => ({ room: room._id, label: `${room.number}-${i + 1}` })));
  } catch (e) { // do not leave a half-built room behind
    if (room) { await Bed.deleteMany({ room: room._id }); await Room.deleteOne({ _id: room._id }); }
    await pruneEmpty(block._id);
    throw e;
  }
  audit(req.user._id, 'ROOM_CREATED', null, { room: room.number, capacity: d.capacity });
  res.status(201).json({ message: 'Room created', room });
}));

// Edit hostel, block, floor, room number and number of beds. Occupied beds are never removed.
router.patch('/rooms/:id', wrap(async (req, res) => {
  const d = parseRoom(req.body);
  const room = await Room.findById(req.params.id);
  if (!room) throw new HttpError(404, 'Room not found');
  if (await numberTaken(d, room._id)) throw new HttpError(409, dupMessage(d));
  const plan = planBeds(await Bed.find({ room: room._id }), d.capacity);
  if (plan.occupied > d.capacity) throw new HttpError(409, `This room has ${plan.occupied} occupied bed(s), so it needs at least ${plan.occupied} beds. Move students out first.`);
  if (plan.blocked.length) throw new HttpError(409, `Bed ${plan.blocked.map((b) => b.label).join(', ')} is occupied. Move the student to a lower-numbered bed or another room before reducing the number of beds.`);

  const before = { number: room.number, floor: room.floor, capacity: room.capacity };
  const oldBlock = room.block;
  const block = await getBlock(d.hostelName, d.blockName);
  try { await Room.updateOne({ _id: room._id }, { block: block._id, floor: d.floor, number: d.number, capacity: d.capacity }); }
  catch (e) { await pruneEmpty(block._id); throw e; }
  if (d.number !== room.number) for (const b of plan.keep) await Bed.updateOne({ _id: b._id }, { label: `${d.number}-${b.idx}` });
  if (plan.remove.length) {
    // student: null in the filter means a bed taken a moment ago is skipped, never deleted
    const r = await Bed.deleteMany({ _id: { $in: plan.remove.map((b) => b._id) }, student: null });
    if (r.deletedCount !== plan.remove.length) {
      await Room.updateOne({ _id: room._id }, { capacity: await Bed.countDocuments({ room: room._id }) });
      throw new HttpError(409, 'A bed was allocated while you were editing. Review the room and try again.');
    }
  }
  if (plan.add.length) await Bed.insertMany(plan.add.map((i) => ({ room: room._id, label: `${d.number}-${i}` })));
  if (String(block._id) !== String(oldBlock)) await pruneEmpty(oldBlock);
  audit(req.user._id, 'ROOM_EDITED', null, { before, after: { number: d.number, floor: d.floor, capacity: d.capacity, hostel: d.hostelName, block: d.blockName } });
  res.json({ message: 'Room updated', room: await Room.findById(room._id) });
}));

// Permanently deletes a room and its (empty) beds. Refused while any bed is occupied.
router.delete('/rooms/:id', wrap(async (req, res) => {
  const room = await Room.findById(req.params.id);
  if (!room) throw new HttpError(404, 'Room not found');
  const occupied = await Bed.countDocuments({ room: room._id, student: { $ne: null } });
  if (occupied) throw new HttpError(409, `Room ${room.number} has ${occupied} occupied bed(s) and cannot be deleted. Move the student(s) to another room first.`);
  await Bed.deleteMany({ room: room._id, student: null });
  const left = await Bed.countDocuments({ room: room._id });
  if (left) { // someone was allocated a bed in the meantime
    await Room.updateOne({ _id: room._id }, { capacity: left });
    throw new HttpError(409, `Room ${room.number} was not deleted because a bed was just allocated. Review the room and try again.`);
  }
  await Room.deleteOne({ _id: room._id });
  await pruneEmpty(room.block);
  audit(req.user._id, 'ROOM_DELETED', null, { room: room.number });
  res.json({ message: `Room ${room.number} deleted` });
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

// ---- Options for the cascading Hostel > Block > Floor > Room > Bed dropdowns (real database rows only) ----
const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
const need = (v, name) => { if (!v) throw new HttpError(400, `${name} is required`); return String(v); };
const FREE = { student: null, maintenance: { $ne: true } }; // a bed that can be given to a student

router.get('/available/hostels', wrap(async (req, res) => {
  res.json({ items: (await Hostel.find()).map((h) => ({ _id: h._id, name: h.name })).sort((a, b) => natural(a.name, b.name)) });
}));
router.get('/available/blocks', wrap(async (req, res) => {
  res.json({ items: (await Block.find({ hostel: need(req.query.hostel, 'hostel') })).map((b) => ({ _id: b._id, name: b.name })).sort((a, b) => natural(a.name, b.name)) });
}));
router.get('/available/floors', wrap(async (req, res) => {
  const rooms = await Room.find({ block: need(req.query.block, 'block') });
  res.json({ items: [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b) });
}));
// Only rooms on this floor that still have at least one free bed.
router.get('/available/rooms', wrap(async (req, res) => {
  const floor = Number(need(req.query.floor, 'floor'));
  if (!Number.isInteger(floor)) throw new HttpError(400, 'Invalid floor');
  const rooms = await Room.find({ block: need(req.query.block, 'block'), floor });
  const beds = await Bed.find({ room: { $in: rooms.map((r) => r._id) }, ...FREE });
  const free = {}; beds.forEach((b) => { free[String(b.room)] = (free[String(b.room)] || 0) + 1; });
  res.json({ items: rooms.filter((r) => free[String(r._id)]).map((r) => ({ _id: r._id, number: r.number, floor: r.floor, availableBeds: free[String(r._id)] })).sort((a, b) => natural(a.number, b.number)) });
}));
router.get('/available/beds', wrap(async (req, res) => {
  const beds = await Bed.find({ room: need(req.query.room, 'room'), ...FREE });
  res.json({ items: beds.map((b) => ({ _id: b._id, label: b.label, number: Number(b.label.slice(b.label.lastIndexOf('-') + 1)) })).sort((a, b) => a.number - b.number) });
}));

export default router;
