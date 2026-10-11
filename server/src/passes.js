import crypto from 'crypto';
import { GatePass, StudentProfile, Bed, Room, Block, Hostel } from './models/index.js';
import { HttpError } from './utils.js';
import { derivePass } from './outing.js';
import { clock } from './clock.js';

export async function snapshotFor(userId) {
  const profile = await StudentProfile.findOne({ user: userId });
  const bed = await Bed.findOne({ student: userId });
  const room = bed && await Room.findById(bed.room); const block = room && await Block.findById(room.block); const hostel = block && await Hostel.findById(block.hostel);
  return { name: profile ? `${profile.firstName} ${profile.lastName}` : undefined, rollNumber: profile?.rollNumber, course: profile?.course, branch: profile?.branch, year: profile?.year, semester: profile?.semester,
    hostelId: hostel ? String(hostel._id) : undefined, hostel: hostel?.name, block: block?.name, floor: room?.floor, room: room?.number, bed: bed?.label };
}

// A colliding code is rejected by the partial unique index, so draw another one.
export async function issuePass({ student, source, type, validFrom, validTo, leave, destination, reason, issuedBy, autoOpen = false }) {
  await GatePass.updateMany({ codeActive: true, state: 'NONE', validTo: { $lt: new Date(clock.now().getTime() - 864e5) } }, { codeActive: false });
  const snapshot = await snapshotFor(student);
  for (let i = 0; i < 10; i++) {
    try {
      return await GatePass.create({ passId: crypto.randomBytes(16).toString('hex'), code: String(crypto.randomInt(100000, 1000000)), codeActive: true, source, type, leave, student, destination, reason, issuedBy, validFrom, validTo, autoOpen, snapshot });
    } catch (e) {
      const text = `${e.message} ${JSON.stringify(e.keyPattern || {})}`;
      if (e.code !== 11000) throw e;
      if (/student_open_auto_unique/.test(text) || (e.keyPattern && e.keyPattern.student)) throw new HttpError(409, 'You already have an open outing pass. Use it or cancel it first.');
      if (!/code/.test(text)) throw e;
    }
  }
  throw new HttpError(503, 'Could not generate a unique pass code. Please try again.');
}

export function passView(p, now = clock.now(), tz) {
  const o = p.toObject ? p.toObject() : p; const s = o.snapshot || {}; const stu = o.student && typeof o.student === 'object' && o.student.name ? o.student : null;
  return { _id: o._id, passId: o.passId, code: o.code || null, source: o.source || 'LEAVE', type: o.type, leave: o.leave ? String(o.leave) : null, student: stu ? stu._id : o.student,
    name: s.name || stu?.name || null, rollNumber: s.rollNumber || stu?.rollNumber || null, course: s.course, branch: s.branch, year: s.year, semester: s.semester,
    hostel: s.hostel, block: s.block, floor: s.floor, room: s.room, bed: s.bed, destination: o.destination, reason: o.reason,
    issuedAt: o.createdAt, validFrom: o.validFrom, validTo: o.validTo, outAt: o.outAt, inAt: o.inAt, state: o.state, ...derivePass(o, now), tz };
}
