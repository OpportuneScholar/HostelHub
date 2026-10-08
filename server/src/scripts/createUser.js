// Usage: npm run create-user -- GUARD "Name" email password   (role: WARDEN or GUARD)
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from '../models/index.js';
import { connectDb } from '../db.js';

const [role, name, email, password] = process.argv.slice(2);
if (!['WARDEN', 'GUARD'].includes(role) || !name || !email || !password || password.length < 8) {
  console.error('Usage: npm run create-user -- WARDEN|GUARD "Name" email "Password (8+ chars)"'); process.exit(1);
}
try {
  await connectDb();
  await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12), role });
  console.log(`${role} created: ${email}`);
} catch (e) {
  console.error(e.code === 11000 ? 'That email already exists' : 'Failed: ' + e.message); process.exitCode = 1;
} finally { await mongoose.disconnect(); }
