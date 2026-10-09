import { isProd, clientOrigins, PORT } from './config.js';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { connectDb } from './db.js';
import { HttpError } from './utils.js';
import authRoutes from './routes/auth.js';
import studentRoutes from './routes/students.js';
import hostelRoutes from './routes/hostels.js';
import studentSelf from './routes/student.js';
import adminRoutes from './routes/admin.js';
import gateRoutes from './routes/gate.js';
import { Room, Bed } from './models/index.js';

const app = express();
app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1); // number of proxies in front of the app (Render = 1)
app.use(helmet());
app.use(cors({ origin: clientOrigins, credentials: true, maxAge: 600 }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.get('/', (req, res) => res.json({ name: 'HostelHub API' }));
app.get('/api/health', (req, res) => {
  const up = mongoose.connection.readyState === 1;
  res.status(up ? 200 : 503).json({ ok: up, db: up ? 'connected' : 'disconnected', uptime: Math.round(process.uptime()) });
});

// For every API call: never cache, and for anything that changes data require our own header and an allowed Origin.
// The cookie is SameSite=None, so this stops other websites from making a logged-in user's browser send changes.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin && !clientOrigins.includes(origin)) return res.status(403).json({ message: 'Request not allowed from this origin' });
  if (req.get('x-requested-with') !== 'HostelHub') return res.status(403).json({ message: 'Request not allowed' });
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/hostels', hostelRoutes);
app.use('/api/student', studentSelf);
app.use('/api/admin', adminRoutes);
app.use('/api/gate', gateRoutes);
app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));

app.use((err, req, res, next) => {
  if (err.code === 11000) {
    const keys = Object.keys(err.keyPattern || {});
    const has = (...k) => k.every((x) => keys.includes(x));
    const msg = has('block', 'number') ? 'A room with this number already exists in this block'
      : has('room', 'label') ? 'That bed already exists in this room'
      : keys.length === 1 && (keys[0] === 'number' || keys[0] === 'label') ? 'The database still has the old campus-wide room rule. Ask the administrator to run: npm run migrate-indexes -- --apply'
      : `A record with this ${{ email: 'email', rollNumber: 'roll number' }[keys[0]] || keys[0] || 'value'} already exists`;
    return res.status(409).json({ message: msg });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid request body' });
  if (err.type === 'entity.too.large') return res.status(413).json({ message: 'Request is too large' });
  if (err.name === 'ValidationError') return res.status(400).json({ message: 'Invalid form data' });
  if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid ID' });
  if (err instanceof HttpError) return res.status(err.status).json({ message: err.message, code: err.code });
  console.error(err); // details stay in server logs only
  res.status(500).json({ message: 'Something went wrong. Please try again.' });
});

mongoose.connection.on('error', (e) => console.error('MongoDB error:', e.message));
mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected (the driver will retry)'));
mongoose.connection.on('reconnected', () => console.log('MongoDB reconnected'));

// Old databases have unique indexes on room number and bed label across the whole campus. They must be replaced once.
const oldOne = (list, field) => list.some((i) => i.unique && Object.keys(i.key).length === 1 && i.key[field] === 1);
const warnOldIndexes = () => Promise.all([Room.collection.indexes(), Bed.collection.indexes()])
  .then(([r, b]) => { if (oldOne(r, 'number') || oldOne(b, 'label')) console.warn('Old campus-wide unique indexes found on rooms/beds. Run once: npm run migrate-indexes -- --apply'); })
  .catch(() => {}); // collections do not exist yet on a fresh database

let server;
connectDb()
  .then(() => { server = app.listen(PORT, () => console.log(`HostelHub API listening on port ${PORT} (${isProd ? 'production' : 'development'})`)); warnOldIndexes(); })
  .catch((e) => { console.error('MongoDB connection failed:', e.message); process.exit(1); });

const shutdown = () => {
  setTimeout(() => process.exit(1), 10000).unref();
  if (!server) return process.exit(0);
  server.close(() => mongoose.connection.close().then(() => process.exit(0)));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('unhandledRejection', (r) => console.error('Unhandled rejection:', r));
