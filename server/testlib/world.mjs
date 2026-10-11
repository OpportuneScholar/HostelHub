// Shared test setup: routers, helpers to call a route like Express would, and a seeded hostel with students.
import * as clockMod from '../src/clock.js';
export const clock = clockMod.clock;
export const routers = {
  hostels: (await import('../src/routes/hostels.js')).default, students: (await import('../src/routes/students.js')).default, student: (await import('../src/routes/student.js')).default,
  admin: (await import('../src/routes/admin.js')).default, gate: (await import('../src/routes/gate.js')).default, outing: (await import('../src/routes/outing.js')).default,
  users: (await import('../src/routes/users.js')).default, system: (await import('../src/routes/system.js')).default,
};
export const M = await import('./models-stub.mjs');
export const { audits } = await import('./auth-stub.mjs');
export const { limiters } = await import('./ratelimit-stub.mjs');
export const WARDEN = { _id: 'warden1', role: 'WARDEN' }, GUARD = { _id: 'guard1', role: 'GUARD' };

// call(router, 'POST /rooms', body, user) -> { status, json, error }
export async function call(router, line, body, user = WARDEN) {
  const [method, url] = line.split(' ');
  const [path, qs] = url.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  for (const r of router.stack) {
    if (r.method !== method) continue;
    const names = [];
    const m = path.match(new RegExp('^' + r.path.replace(/:([A-Za-z]+)/g, (_, n) => (names.push(n), '([^/]+)')) + '$'));
    if (!m) continue;
    const out = { status: 200 };
    const res = { status(c) {
      out.status = c;
      return res;
    }, json(o) {
      out.json = o;
      out.done();
      return res;
    } };
    await new Promise((resolve) => {
      out.done = resolve;
      r.handlers.at(-1)({ body, params: Object.fromEntries(names.map((n, i) => [n, m[i + 1]])), query, user, ip: '1.2.3.4' }, res, (e) => {
        out.error = e;
        resolve();
      });
    });
    return out;
  }
  throw new Error(`no route ${method} ${path}`);
}
export const msg = (o) => (o.error ? o.error.message : o.json?.message || '');
export const code = (o) => (o.error ? o.error.status || 500 : o.status);

export const room = (host, block, number, cap = 2, floor = 1) => call(routers.hostels, 'POST /rooms', { hostelName: host, blockName: block, floor, number, capacity: cap });
const base = (n, roll) => ({ firstName: n, lastName: 'Kumar', rollNumber: roll, email: `${n.toLowerCase()}@c.edu`, phone: '9', course: 'BTech', branch: 'CSE', year: 2, semester: 3, guardianName: 'G', guardianPhone: '8', emergencyContact: '7', address: 'Addr' });
// Registers a student into the first free bed of the given room row.
export async function enroll(name, roll, roomRow) {
  const bedRow = M.Bed.rows.find((b) => b.room === roomRow._id && !b.student && !b.maintenance); const blk = M.Block.rows.find((b) => b._id === roomRow.block);
  const r = await call(routers.students, 'POST /', { ...base(name, roll), hostelId: blk.hostel, blockId: blk._id, floor: roomRow.floor, roomId: roomRow._id, bedId: bedRow._id });
  if (r.error) throw r.error;
  return M.User.rows.find((u) => u.rollNumber === roll);
}
export const at = (iso) => { clock.now = () => new Date(iso); };
export const OPEN_WEEK = (o = {}) => Array.from({ length: 7 }, (_, dow) => ({ dow, open: true, start: '10:00', lastIssue: '17:00', returnBy: '19:00', ...o }));
