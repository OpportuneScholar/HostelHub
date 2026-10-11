import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb } from '../db.js';
import { Room, Bed } from '../models/index.js';

const ROOM_IDS = [
  '6ac865d5372fbf72bd9a03d9',
  '6ac86600372fbf72bd9a03fb'
];

try {
  await connectDb();

  const ids = ROOM_IDS.map(id => new mongoose.Types.ObjectId(id));
  const rooms = await Room.find({ _id: { $in: ids } }).lean();

  if (rooms.length !== 2) {
    throw new Error(`Expected 2 rooms; found ${rooms.length}. Nothing deleted.`);
  }

  const beds = await Bed.find({ room: { $in: ids } }).lean();
  const occupied = beds.filter(b => b.student != null);

  console.log('Rooms to delete:', rooms.map(r => r.number));
  console.log('Related beds:', beds.length);
  console.log('Occupied beds:', occupied.length);

  if (occupied.length || beds.length !== 6) {
    throw new Error('Safety check failed. Nothing deleted.');
  }

  await Bed.deleteMany({ room: { $in: ids }, student: null });
  await Room.deleteMany({ _id: { $in: ids } });

  console.log('Deleted both rooms and their empty beds.');
} catch (err) {
  console.error('Cleanup stopped:', err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
