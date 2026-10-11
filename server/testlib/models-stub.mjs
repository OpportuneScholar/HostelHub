import { clock } from '../src/clock.js';
// In-memory stand-ins for the Mongoose models. Unique indexes mirror the real schemas (including the partial ones).
let seq = 0;
const newId = () => 'id' + (++seq);
const eq = (a, b) => String(a ?? null) === String(b ?? null);
const get = (doc, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), doc);
const cmp = (v, op) => v !== undefined && v !== null && op(v);
const match = (doc, f) => Object.entries(f).every(([k, v]) => {
  if (k === '$or') return v.some((x) => match(doc, x));
  const d = get(doc, k);
  if (v instanceof RegExp) return typeof d === 'string' && v.test(d);
  if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
    if ('$ne' in v && eq(d, v.$ne)) return false; if ('$in' in v && !v.$in.some((x) => eq(x, d))) return false;
    if ('$lt' in v && !cmp(d, (x) => x < v.$lt)) return false; if ('$lte' in v && !cmp(d, (x) => x <= v.$lte)) return false;
    if ('$gt' in v && !cmp(d, (x) => x > v.$gt)) return false; if ('$gte' in v && !cmp(d, (x) => x >= v.$gte)) return false;
    return true;
  }
  return eq(d, v);
});
class Query {
  constructor(rows) { this.rows = rows; }
  sort(spec) { const [[k, dir]] = Object.entries(spec); this.rows = [...this.rows].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (dir < 0 ? -1 : 1)); return this; }
  skip(n) {
    this.rows = this.rows.slice(n);
    return this;
  } limit(n) {
    this.rows = this.rows.slice(0, n);
    return this;
  }
  select() { return this; } populate() { return this; } lean() { return this; }
  distinct(f) { return Promise.resolve([...new Set(this.rows.map((r) => r[f]))]); }
  then(a, b) { return Promise.resolve(this.rows).then(a, b); }
}
function make(uniques = [], defaults = {}) {
  const rows = [];
  const clash = (doc, ignore) => { for (const u of uniques) {
    if (u.when && !u.when(doc)) continue; if (u.fields.some((f) => doc[f] === undefined || doc[f] === null)) continue;
    if (rows.some((r) => r !== ignore && (!u.when || u.when(r)) && u.fields.every((f) => eq(r[f], doc[f])))) {
      const e = new Error(`E11000 duplicate key index: ${u.name || u.fields.map((f) => f + '_1').join('_')}`); e.code = 11000; e.keyPattern = Object.fromEntries(u.fields.map((f) => [f, 1])); throw e; } } };
  const M = { rows,
    async create(d) {
      const row = { _id: newId(), createdAt: clock.now(), ...defaults, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) };
      clash(row);
      rows.push(row);
      return { ...row };
    },
    async insertMany(a) { for (const d of a) await M.create(d); },
    async findById(i) {
      const r = rows.find((x) => x._id === String(i));
      return r ? { ...r } : null;
    },
    async findOne(f) {
      const r = rows.find((x) => match(x, f));
      return r ? { ...r } : null;
    },
    find(f = {}) { return new Query(rows.filter((r) => match(r, f)).map((r) => ({ ...r }))); },
    async exists(f) { return rows.some((r) => match(r, f)) ? { _id: 1 } : null; },
    async countDocuments(f = {}) { return rows.filter((r) => match(r, f)).length; },
    async updateOne(f, u) {
      const r = rows.find((x) => match(x, f));
      if (!r) return { matchedCount: 0 };
      clash({ ...r, ...u }, r);
      Object.assign(r, u);
      return { matchedCount: 1 };
    },
    async updateMany(f, u) {
      let n = 0;
      for (const r of rows) if (match(r, f)) {
        Object.assign(r, u);
        n++;
      } return { modifiedCount: n };
    },
    async deleteOne(f) {
      const i = rows.findIndex((r) => match(r, f));
      if (i >= 0) rows.splice(i, 1);
      return { deletedCount: i >= 0 ? 1 : 0 };
    },
    async deleteMany(f) {
      let n = 0;
      for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i], f)) {
        rows.splice(i, 1);
        n++;
      } return { deletedCount: n };
    },
    async findByIdAndDelete(i) { const k = rows.findIndex((r) => r._id === String(i)); return k < 0 ? null : rows.splice(k, 1)[0]; },
    async findOneAndUpdate(f, u, o = {}) { const r = rows.find((x) => match(x, f));
      if (!r && o.upsert) { const row = { _id: newId(), createdAt: clock.now(), ...f, ...u }; clash(row); rows.push(row); return { ...row }; }
      if (!r) return null;
      const old = { ...r };
      clash({ ...r, ...u }, r);
      Object.assign(r, u);
      return o.new ? { ...r } : old;
      },
  };
  return M;
}
const U = (...fields) => ({ fields });
export const Hostel = make([U('name')], { archived: false, type: 'MIXED' }); export const Block = make([U('hostel', 'name')]);
export const Room = make([U('block', 'number')]);
export const Bed = make([U('room', 'label'), { fields: ['student'] }], { student: null, maintenance: false });
export const User = make([U('email'), U('rollNumber')], { isActive: true, mustChangePassword: false }); export const StudentProfile = make([U('rollNumber'), U('user')]);
export const GatePass = make([U('passId'), { fields: ['code'], when: (d) => d.codeActive === true, name: 'code_active_unique' }, { fields: ['student'], when: (d) => d.autoOpen === true, name: 'student_open_auto_unique' }], { status: 'ACTIVE', state: 'NONE', codeActive: false, autoOpen: false, source: 'LEAVE' });
export const GateEntry = make([], { gate: 'Main Gate' }); export const LeaveRequest = make([], { status: 'PENDING' }); export const Fee = make([], { status: 'PENDING' }); export const Complaint = make(); export const Notice = make(); export const AuditLog = make(); export const OutingSettings = make([U('key')]);
