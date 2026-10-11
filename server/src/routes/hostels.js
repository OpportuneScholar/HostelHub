import { Router } from 'express';
import { Hostel, Block, Room, Bed, GatePass } from '../models/index.js';
import { auth, audit } from '../middleware/auth.js';
import { HttpError, wrap, escapeRegex } from '../utils.js';
import { parseRoom, planBeds } from '../roomLogic.js';

const router = Router();
router.use(auth(['WARDEN']));

const findHostel = (name) => Hostel.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
const getBlock = async (hostelName, blockName) => {
  let hostel = await findHostel(hostelName);
  if (hostel?.archived) throw new HttpError(409, `${hostel.name} is archived. Un-archive it before adding rooms.`);
  if (!hostel) { try { hostel = await Hostel.create({ name: hostelName }); } catch (e) { hostel = e.code === 11000 ? await findHostel(hostelName) : (() => { throw e; })(); } }
  return Block.findOneAndUpdate({ hostel: hostel._id, name: blockName }, { hostel: hostel._id, name: blockName }, { upsert: true, new: true });
};
const pruneEmpty = async (blockId) => {
  if (!blockId || await Room.exists({ block: blockId })) return;
  const block = await Block.findByIdAndDelete(blockId);
  if (block && !(await Block.exists({ hostel: block.hostel }))) await Hostel.deleteOne({ _id: block.hostel });
};

// Room numbers only have to be unique inside one block.
const numberTaken = async (d, exceptId) => {
  const hostel = await findHostel(d.hostelName);
  const block = hostel && await Block.findOne({ hostel: hostel._id, name: d.blockName });
  if (!block) return false;
  return !!(await Room.findOne(exceptId ? { block: block._id, number: d.number, _id: { $ne: exceptId } } : { block: block._id, number: d.number }));
};
const dupMessage = (d) => `Room ${d.number} already exists in ${d.hostelName}, block ${d.blockName}`;

router.post('/rooms', wrap(async (req, res) => {
  const d = parseRoom(req.body);
  if (await numberTaken(d)) throw new HttpError(409, dupMessage(d));
  const block = await getBlock(d.hostelName, d.blockName);
  let room;
  try {
    room = await Room.create({ block: block._id, floor: d.floor, number: d.number, capacity: d.capacity });
    await Bed.insertMany(Array.from({ length: d.capacity }, (_, i) => ({ room: room._id, label: `${room.number}-${i + 1}` })));
  } catch (e) {
    if (room) {
      await Bed.deleteMany({ room: room._id });
      await Room.deleteOne({ _id: room._id });
    }
    await pruneEmpty(block._id);
    throw e;
  }
  audit(req.user._id, 'ROOM_CREATED', null, { room: room.number, capacity: d.capacity });
  res.status(201).json({ message: 'Room created', room });
}));

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
  catch (e) {
    await pruneEmpty(block._id);
    throw e;
  }
  if (d.number !== room.number) for (const b of plan.keep) await Bed.updateOne({ _id: b._id }, { label: `${d.number}-${b.idx}` });
  if (plan.remove.length) {
    // student: null in the filter skips a bed that was taken a moment ago.
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

router.delete('/rooms/:id', wrap(async (req, res) => {
  const room = await Room.findById(req.params.id);
  if (!room) throw new HttpError(404, 'Room not found');
  const occupied = await Bed.countDocuments({ room: room._id, student: { $ne: null } });
  if (occupied) throw new HttpError(409, `Room ${room.number} has ${occupied} occupied bed(s) and cannot be deleted. Move the student(s) to another room first.`);
  await Bed.deleteMany({ room: room._id, student: null });
  const left = await Bed.countDocuments({ room: room._id });
  if (left) {
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
  const occ = {};
  beds.forEach((b) => { if (b.student) occ[b.room] = (occ[b.room] || 0) + 1; });
  res.json({ items: rooms.map((r) => ({ ...r.toObject(), occupied: occ[r._id] || 0 })) });
}));

router.get('/tree', wrap(async (req, res) => {
  const [hostels, blocks, rooms, beds] = await Promise.all([Hostel.find().sort({ name: 1 }).lean(), Block.find().sort({ name: 1 }).lean(), Room.find().sort({ number: 1 }).lean(),
    Bed.find().populate('student', 'name').sort({ label: 1 }).lean()]);
  const by = (list, key, fn) => list.reduce((m, x) => {
    (m[x[key]] ||= []).push(fn(x));
    return m;
  }, {});
  const bedsBy = by(beds, 'room', (b) => ({ _id: b._id, label: b.label, student: b.student?.name || null, status: b.student ? 'OCCUPIED' : b.maintenance ? 'MAINTENANCE' : 'AVAILABLE' }));
  const roomsBy = by(rooms, 'block', (r) => ({ _id: r._id, number: r.number, floor: r.floor, beds: bedsBy[r._id] || [] }));
  const blocksBy = by(blocks, 'hostel', (b) => ({ _id: b._id, name: b.name, rooms: roomsBy[b._id] || [] }));
  res.json({ items: hostels.map((h) => ({ _id: h._id, name: h.name, type: h.type || 'MIXED', description: h.description || '', archived: !!h.archived, blocks: blocksBy[h._id] || [] })) });
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

const parseHostel = (b = {}) => {
  const name = String(b.name ?? '').trim(), type = b.type ?? 'MIXED', description = String(b.description ?? '').trim();
  if (name.length < 2 || name.length > 60) throw new HttpError(400, 'Hostel name must be 2 to 60 characters');
  if (!['BOYS', 'GIRLS', 'MIXED'].includes(type)) throw new HttpError(400, 'Hostel type must be Boys, Girls or Mixed');
  if (description.length > 200) throw new HttpError(400, 'Description is too long (max 200 characters)');
  return { name, type, description };
};
const nameTaken = async (name, exceptId) => { const h = await findHostel(name); return h && String(h._id) !== String(exceptId || '') ? h : null; };
const usage = async (hostelId) => {
  const blocks = await Block.find({ hostel: hostelId });
  const rooms = blocks.length ? await Room.find({ block: { $in: blocks.map((b) => b._id) } }) : [];
  const beds = rooms.length ? await Bed.find({ room: { $in: rooms.map((r) => r._id) } }) : [];
  return { blocks: blocks.length, rooms: rooms.length, beds: beds.length, occupied: beds.filter((b) => b.student).length };
};
const describeUsage = (u) => `${u.blocks} block(s), ${u.rooms} room(s) and ${u.beds} bed(s) (${u.occupied} occupied)`;

router.post('/', wrap(async (req, res) => {
  const d = parseHostel(req.body);
  if (await nameTaken(d.name)) throw new HttpError(409, `A hostel named "${d.name}" already exists`);
  const hostel = await Hostel.create(d);
  audit(req.user._id, 'HOSTEL_CREATED', null, d);
  res.status(201).json({ message: 'Hostel added', hostel });
}));
router.patch('/:id', wrap(async (req, res) => {
  const hostel = await Hostel.findById(req.params.id);
  if (!hostel) throw new HttpError(404, 'Hostel not found');
  const d = parseHostel(req.body);
  if (await nameTaken(d.name, hostel._id)) throw new HttpError(409, `A hostel named "${d.name}" already exists`);
  await Hostel.updateOne({ _id: hostel._id }, d);
  audit(req.user._id, 'HOSTEL_EDITED', null, { before: { name: hostel.name, type: hostel.type }, after: d });
  res.json({ message: 'Hostel updated' });
}));
router.patch('/:id/archive', wrap(async (req, res) => {
  if (typeof req.body?.archived !== 'boolean') throw new HttpError(400, 'archived must be true or false');
  const hostel = await Hostel.findById(req.params.id);
  if (!hostel) throw new HttpError(404, 'Hostel not found');
  if (req.body.archived) { const u = await usage(hostel._id); if (u.occupied) throw new HttpError(409, `${hostel.name} still has ${u.occupied} student(s) allotted. Move them to another hostel first (Students > Change room).`); }
  await Hostel.updateOne({ _id: hostel._id }, { archived: req.body.archived });
  audit(req.user._id, req.body.archived ? 'HOSTEL_ARCHIVED' : 'HOSTEL_UNARCHIVED', null, { hostel: hostel.name });
  res.json({ message: req.body.archived ? 'Hostel archived' : 'Hostel is active again' });
}));
router.delete('/:id', wrap(async (req, res) => {
  const hostel = await Hostel.findById(req.params.id);
  if (!hostel) throw new HttpError(404, 'Hostel not found');
  const u = await usage(hostel._id);
  if (u.blocks) throw new HttpError(409, `${hostel.name} still has ${describeUsage(u)}. ${u.occupied ? 'Move the students out (Students > Change room), then ' : ''}delete its rooms on the Rooms & Beds page first. ${u.occupied ? '' : 'Or archive the hostel to keep the records.'}`.trim());
  if (await GatePass.exists({ 'snapshot.hostelId': String(hostel._id) })) throw new HttpError(409, `${hostel.name} appears in gate-pass history, so it cannot be deleted. Archive it instead.`);
  const removed = await Hostel.findByIdAndDelete(hostel._id);
  if (await Block.exists({ hostel: hostel._id })) {
    await Hostel.create(removed.toObject ? removed.toObject() : removed);
    throw new HttpError(409, 'A block was added while deleting. The hostel was kept.');
  }
  audit(req.user._id, 'HOSTEL_DELETED', null, { hostel: hostel.name });
  res.json({ message: `Hostel ${hostel.name} deleted` });
}));

const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
const need = (v, name) => { if (!v) throw new HttpError(400, `${name} is required`); return String(v); };
const FREE = { student: null, maintenance: { $ne: true } };

router.get('/available/hostels', wrap(async (req, res) => {
  res.json({ items: (await Hostel.find({ archived: { $ne: true } })).map((h) => ({ _id: h._id, name: h.name })).sort((a, b) => natural(a.name, b.name)) });
}));
router.get('/available/blocks', wrap(async (req, res) => {
  res.json({ items: (await Block.find({ hostel: need(req.query.hostel, 'hostel') })).map((b) => ({ _id: b._id, name: b.name })).sort((a, b) => natural(a.name, b.name)) });
}));
router.get('/available/floors', wrap(async (req, res) => {
  const rooms = await Room.find({ block: need(req.query.block, 'block') });
  res.json({ items: [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b) });
}));
router.get('/available/rooms', wrap(async (req, res) => {
  const floor = Number(need(req.query.floor, 'floor'));
  if (!Number.isInteger(floor)) throw new HttpError(400, 'Invalid floor');
  const rooms = await Room.find({ block: need(req.query.block, 'block'), floor });
  const beds = await Bed.find({ room: { $in: rooms.map((r) => r._id) }, ...FREE });
  const free = {};
  beds.forEach((b) => { free[String(b.room)] = (free[String(b.room)] || 0) + 1; });
  res.json({ items: rooms.filter((r) => free[String(r._id)]).map((r) => ({ _id: r._id, number: r.number, floor: r.floor, availableBeds: free[String(r._id)] })).sort((a, b) => natural(a.number, b.number)) });
}));
router.get('/available/beds', wrap(async (req, res) => {
  const beds = await Bed.find({ room: need(req.query.room, 'room'), ...FREE });
  res.json({ items: beds.map((b) => ({ _id: b._id, label: b.label, number: Number(b.label.slice(b.label.lastIndexOf('-') + 1)) })).sort((a, b) => a.number - b.number) });
}));

export default router;
