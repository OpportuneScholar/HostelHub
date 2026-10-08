// Usage: npm run check-db   (verifies the MongoDB connection and prints record counts + latest gate entries)
import 'dotenv/config';
import mongoose from 'mongoose';
import * as M from '../models/index.js';
import { connectDb } from '../db.js';

try {
  await connectDb();
  console.log('MongoDB connected. host:', mongoose.connection.host, ' db:', mongoose.connection.name);
  for (const role of ['WARDEN', 'STUDENT', 'GUARD']) console.log(role.padEnd(12), await M.User.countDocuments({ role }));
  for (const n of ['Hostel', 'Block', 'Room', 'Bed', 'LeaveRequest', 'GatePass', 'GateEntry', 'Complaint', 'Fee', 'Notice', 'AuditLog']) console.log(n.padEnd(12), await M[n].countDocuments());
  console.log('Occupied beds', await M.Bed.countDocuments({ student: { $ne: null } }));
  const last = await M.GateEntry.find().sort({ at: -1 }).limit(5).populate('student', 'rollNumber').populate('guard', 'name');
  console.log('Latest gate entries (UTC timestamps):');
  last.forEach((g) => console.log(' ', g.at.toISOString(), g.action, g.student?.rollNumber, 'guard:', g.guard?.name, g.gate));
  console.log('Bed indexes:', (await M.Bed.collection.indexes()).map((i) => i.name).join(', '));
} catch (e) { console.error('DB check failed:', e.message); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
