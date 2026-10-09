import mongoose from 'mongoose';
const { Schema, model } = mongoose;
const ref = (m, extra = {}) => ({ type: Schema.Types.ObjectId, ref: m, ...extra });
const str = (extra = {}) => ({ type: String, trim: true, ...extra });

export const User = model('User', new Schema({
  name: str({ required: true }),
  email: str({ required: true, unique: true, lowercase: true }),
  rollNumber: str({ unique: true, sparse: true, uppercase: true }),
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['WARDEN', 'STUDENT', 'GUARD'], required: true },
  mustChangePassword: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  passwordChangedAt: Date, // sessions issued before this are rejected (set on password resets)
}, { timestamps: true }));

export const StudentProfile = model('StudentProfile', new Schema({
  user: ref('User', { required: true, unique: true }),
  firstName: str({ required: true }), lastName: str({ required: true }),
  rollNumber: str({ required: true, unique: true, uppercase: true }),
  email: str({ required: true, lowercase: true }),
  enrollmentNumber: str(), phone: str({ required: true }),
  course: str({ required: true, index: true }), branch: str({ required: true }),
  year: { type: Number, required: true, index: true }, semester: { type: Number, required: true },
  guardianName: str({ required: true }), guardianPhone: str({ required: true }),
  emergencyContact: str({ required: true }), address: str({ required: true }),
  joiningDate: { type: Date, default: Date.now },
}, { timestamps: true }));

export const Hostel = model('Hostel', new Schema({ name: str({ required: true, unique: true }) }));
export const Block = model('Block', new Schema({
  hostel: ref('Hostel', { required: true }), name: str({ required: true }),
}).index({ hostel: 1, name: 1 }, { unique: true }));
export const Room = model('Room', new Schema({
  block: ref('Block', { required: true }), floor: { type: Number, default: 0 },
  number: str({ required: true, unique: true, uppercase: true }),
  capacity: { type: Number, required: true, min: 1, max: 10 },
}));

// student is null when free. The partial unique index means one student can hold only one bed.
export const Bed = model('Bed', new Schema({
  room: ref('Room', { required: true, index: true }),
  label: str({ required: true, unique: true, uppercase: true }),
  student: ref('User', { default: null }), maintenance: { type: Boolean, default: false },
}).index({ student: 1 }, { unique: true, partialFilterExpression: { student: { $type: 'objectId' } } }));

export const AuditLog = model('AuditLog', new Schema({
  actor: ref('User', { required: true }), action: str({ required: true, index: true }),
  target: ref('User'), details: Schema.Types.Mixed, at: { type: Date, default: Date.now, index: true },
}));

const oneOf = (vals, def) => ({ type: String, enum: vals, ...(def && { default: def }) });

export const LeaveRequest = model('LeaveRequest', new Schema({
  student: ref('User', { required: true, index: true }),
  type: oneOf(['LEAVE', 'OUTING']), reason: str({ required: true }), destination: str({ required: true }),
  departAt: { type: Date, required: true }, returnBy: { type: Date, required: true }, emergencyContact: str(),
  status: { ...oneOf(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'], 'PENDING'), index: true },
  decidedBy: ref('User'), decidedAt: Date, remark: str(),
}, { timestamps: true }));

// passId is random and is the only thing the QR code carries.
export const GatePass = model('GatePass', new Schema({
  passId: str({ required: true, unique: true }), leave: ref('LeaveRequest', { required: true }),
  student: ref('User', { required: true, index: true }), type: oneOf(['LEAVE', 'OUTING']),
  validFrom: { type: Date, required: true }, validTo: { type: Date, required: true },
  status: oneOf(['ACTIVE', 'CANCELLED'], 'ACTIVE'),
  state: oneOf(['NONE', 'OUT', 'IN'], 'NONE'), // gate movement so far
}, { timestamps: true }));

export const GateEntry = model('GateEntry', new Schema({
  student: ref('User', { required: true, index: true }), pass: ref('GatePass', { required: true }),
  action: oneOf(['OUT', 'IN']), guard: ref('User', { required: true }), gate: str({ default: 'Main Gate' }),
  at: { type: Date, default: Date.now, index: true },
}));

export const Complaint = model('Complaint', new Schema({
  student: ref('User', { required: true, index: true }),
  category: oneOf(['Room', 'Electricity', 'Water', 'Cleaning', 'Food', 'Internet', 'Maintenance', 'Security', 'Other']),
  subject: str({ required: true }), description: str({ required: true }),
  priority: oneOf(['LOW', 'MEDIUM', 'HIGH'], 'MEDIUM'),
  status: { ...oneOf(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'], 'OPEN'), index: true },
  response: str(), updatedBy: ref('User'),
}, { timestamps: true }));

export const Fee = model('Fee', new Schema({
  student: ref('User', { required: true, index: true }), type: str({ required: true }),
  amount: { type: Number, required: true, min: 0 }, dueDate: { type: Date, required: true },
  status: oneOf(['PENDING', 'PAID'], 'PENDING'), reference: str(), paidAt: Date,
}, { timestamps: true }));

export const Notice = model('Notice', new Schema({
  title: str({ required: true }), description: str({ required: true }), category: str({ default: 'General' }),
  priority: oneOf(['NORMAL', 'IMPORTANT'], 'NORMAL'),
  publishAt: { type: Date, default: Date.now }, expiresAt: { type: Date, required: true },
  createdBy: ref('User'),
}));

// One active reset code per user. Only a keyed hash of the code is stored. MongoDB removes expired rows itself.
export const PasswordReset = model('PasswordReset', new Schema({
  user: ref('User', { required: true, unique: true }),
  otpHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
}).index({ expiresAt: 1 }, { expireAfterSeconds: 0 }));
