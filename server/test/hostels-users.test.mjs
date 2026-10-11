import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { routers as R, call, M, audits, msg, code, room, enroll, WARDEN } from '../testlib/world.mjs';

describe('hostel management', () => {
  let north, studentRoom;
  test('add a hostel; duplicate names (any capitals) and bad input are refused', async () => {
    const r = await call(R.hostels, 'POST /', { name: 'North Hostel', type: 'BOYS', description: 'Near the gate' });
    assert.equal(code(r), 201);
    north = r.json.hostel;
    assert.equal(code(await call(R.hostels, 'POST /', { name: 'north hostel' })), 409);
    assert.equal(code(await call(R.hostels, 'POST /', { name: 'X' })), 400);
    assert.equal(code(await call(R.hostels, 'POST /', { name: 'Okay Hostel', type: 'ROBOTS' })), 400);
  });
  test('edit a hostel; renaming to an existing name is refused; its own name is fine', async () => {
    await call(R.hostels, 'POST /', { name: 'South Hostel', type: 'GIRLS' });
    assert.equal(code(await call(R.hostels, `PATCH /${north._id}`, { name: 'North Block Hostel', type: 'MIXED' })), 200); assert.equal(M.Hostel.rows.find((h) => h._id === north._id).name, 'North Block Hostel');
    assert.equal(code(await call(R.hostels, `PATCH /${north._id}`, { name: 'south hostel' })), 409); assert.equal(code(await call(R.hostels, `PATCH /${north._id}`, { name: 'North Block Hostel', type: 'BOYS' })), 200);
    assert.equal(code(await call(R.hostels, 'PATCH /nope', { name: 'Whatever' })), 404);
  });
  test('delete is refused while the hostel has blocks, rooms or beds, and says what to do first', async () => {
    studentRoom = (await room('North Block Hostel', 'A', '101', 2)).json.room;
    const r = await call(R.hostels, `DELETE /${north._id}`); assert.equal(code(r), 409); assert.match(msg(r), /1 block\(s\), 1 room\(s\) and 2 bed\(s\) \(0 occupied\)/); assert.match(msg(r), /Rooms & Beds/);
    assert.ok(M.Hostel.rows.some((h) => h._id === north._id) && M.Bed.rows.length >= 2); // nothing was cascade-deleted
  });
  test('with students living in it: delete and archive both refuse and point to Change room', async () => {
    await enroll('Rahul', '23CS1', studentRoom);
    const d = await call(R.hostels, `DELETE /${north._id}`); assert.equal(code(d), 409); assert.match(msg(d), /1 occupied/); assert.match(msg(d), /Change room/);
    const a = await call(R.hostels, `PATCH /${north._id}/archive`, { archived: true }); assert.equal(code(a), 409); assert.match(msg(a), /1 student\(s\) still|still has 1 student/);
    assert.equal(M.User.rows.length, 1);
    assert.equal(M.Bed.rows.filter((b) => b.student).length, 1);
  });
  test('an archived hostel is hidden from dropdowns and takes no new rooms; it can be restored', async () => {
    const south = M.Hostel.rows.find((h) => h.name === 'South Hostel'); assert.equal(code(await call(R.hostels, `PATCH /${south._id}/archive`, { archived: true })), 200);
    assert.ok(!(await call(R.hostels, 'GET /available/hostels')).json.items.some((h) => h.name === 'South Hostel'));
    const add = await room('South Hostel', 'A', '1');
    assert.equal(code(add), 409);
    assert.match(msg(add), /archived/);
    assert.equal(code(await call(R.hostels, `PATCH /${south._id}/archive`, { archived: false })), 200); assert.equal(code(await room('South Hostel', 'A', '1')), 201);
    assert.ok(audits.some((a) => a[1] === 'HOSTEL_ARCHIVED') && audits.some((a) => a[1] === 'HOSTEL_UNARCHIVED'));
  });
  test('a hostel that appears in gate-pass history is archived, never deleted', async () => {
    const h = (await call(R.hostels, 'POST /', { name: 'Old Hostel' })).json.hostel;
    await M.GatePass.create({ passId: 'p-old', student: 's', validFrom: new Date(), validTo: new Date(), snapshot: { hostelId: String(h._id), hostel: 'Old Hostel' } });
    const r = await call(R.hostels, `DELETE /${h._id}`); assert.equal(code(r), 409); assert.match(msg(r), /gate-pass history.*Archive/);
  });
  test('an empty hostel with no history is deleted, and the deletion is audited', async () => {
    const h = (await call(R.hostels, 'POST /', { name: 'Empty Hostel' })).json.hostel; assert.equal(code(await call(R.hostels, `DELETE /${h._id}`)), 200);
    assert.ok(!M.Hostel.rows.some((x) => x._id === h._id));
    assert.ok(audits.some((a) => a[1] === 'HOSTEL_DELETED'));
    assert.equal(code(await call(R.hostels, `DELETE /${h._id}`)), 404);
  });
});

describe('user management', () => {
  before(() => { M.User.rows.push({ _id: 'warden1', name: 'Warden One', email: 'w1@x.edu', role: 'WARDEN', isActive: true, passwordHash: 'hash(secret)' }, { _id: 'warden2', name: 'Warden Two', email: 'w2@x.edu', role: 'WARDEN', isActive: true, passwordHash: 'hash(secret)' }); });
  let guardId;
  test('creating a guard makes a real GUARD user with a hashed temporary password shown once', async () => {
    const r = await call(R.users, 'POST /guards', { name: 'Gate Guard', email: 'Guard@X.edu', role: 'WARDEN' });
    assert.equal(code(r), 201);
    assert.equal(r.json.user.role, 'GUARD');
    assert.equal(r.json.credentials.identifier, 'guard@x.edu');
    const tp = r.json.credentials.temporaryPassword;
    assert.match(tp, /^[A-HJ-NP-Za-km-z2-9]{10}$/);
    const row = M.User.rows.find((u) => u.email === 'guard@x.edu');
    assert.equal(row.role, 'GUARD');
    assert.equal(row.passwordHash, `hash(${tp})`); assert.notEqual(row.passwordHash, tp); assert.equal(row.mustChangePassword, true);
    assert.ok(!JSON.stringify(r.json).includes('passwordHash') && !JSON.stringify(r.json).includes(row.passwordHash)); guardId = row._id; assert.ok(audits.some((a) => a[1] === 'USER_CREATED'));
  });
  test('invalid or duplicate guard details are refused', async () => {
    assert.equal(code(await call(R.users, 'POST /guards', { name: 'G', email: 'g@x.edu' })), 400);
    assert.equal(code(await call(R.users, 'POST /guards', { name: 'Good Name', email: 'not-an-email' })), 400);
    assert.equal(code(await call(R.users, 'POST /guards', { name: 'Gate Guard', email: 'guard@x.edu' })), 500); // the stand-in raises the raw duplicate error; the real server maps it to 409
    assert.equal((await call(R.users, 'POST /guards', { name: 'Gate Guard', email: 'guard@x.edu' })).error.code, 11000);
  });
  test('list, filter by role, search; password hashes are never returned', async () => {
    const all = await call(R.users, 'GET /'); assert.ok(all.json.total >= 4); assert.ok(!JSON.stringify(all.json).includes('passwordHash') && !JSON.stringify(all.json).includes('hash('));
    assert.deepEqual((await call(R.users, 'GET /?role=GUARD')).json.items.map((u) => u.role), ['GUARD']);
    assert.equal((await call(R.users, 'GET /?role=WARDEN')).json.total, 2);
    assert.equal((await call(R.users, 'GET /?q=gate')).json.items.length, 1);
    assert.equal(code(await call(R.users, 'GET /?role=ADMIN')), 400);
    assert.equal((await call(R.users, 'GET /?status=inactive')).json.total, 0);
  });
  test('editing: guards yes, own warden profile yes, other wardens and students no', async () => {
    assert.equal(code(await call(R.users, `PATCH /${guardId}`, { name: 'Night Guard' })), 200); assert.equal(M.User.rows.find((u) => u._id === guardId).name, 'Night Guard');
    assert.equal(code(await call(R.users, 'PATCH /warden2', { name: 'Hijack' })), 403);
    assert.equal(code(await call(R.users, 'PATCH /warden1', { name: 'Warden Uno' })), 200);
    const s = M.User.rows.find((u) => u.role === 'STUDENT'); assert.equal(code(await call(R.users, `PATCH /${s._id}`, { name: 'Changed' })), 400); assert.equal(code(await call(R.users, `PATCH /${guardId}`, { role: 'WARDEN' })), 400); // role cannot be edited
  });
  test('deactivation: not yourself, and never the last active warden', async () => {
    assert.equal(code(await call(R.users, 'PATCH /warden1/active', { isActive: false })), 409);
    assert.equal(code(await call(R.users, `PATCH /${guardId}/active`, { isActive: false })), 200); assert.equal(M.User.rows.find((u) => u._id === guardId).isActive, false); assert.equal((await call(R.users, 'GET /?status=inactive')).json.total, 1);
    assert.equal(code(await call(R.users, `PATCH /${guardId}/active`, { isActive: true })), 200);
    assert.equal(code(await call(R.users, 'PATCH /warden2/active', { isActive: false })), 200); // warden1 still active
    const last = await call(R.users, 'PATCH /warden1/active', { isActive: false }, { _id: 'someone-else', role: 'WARDEN' });
    assert.equal(code(last), 409);
    assert.match(msg(last), /last active warden/);
    assert.equal(M.User.rows.find((u) => u._id === 'warden1').isActive, true);
    assert.equal(code(await call(R.users, 'PATCH /warden2/active', { isActive: 'no' })), 400);
  });
  test('password reset: guards get a new one-time password; wardens and students are refused', async () => {
    const old = M.User.rows.find((u) => u._id === guardId).passwordHash; const r = await call(R.users, `POST /${guardId}/reset-password`); assert.equal(code(r), 200);
    const row = M.User.rows.find((u) => u._id === guardId);
    assert.notEqual(row.passwordHash, old);
    assert.equal(row.passwordHash, `hash(${r.json.credentials.temporaryPassword})`); assert.equal(row.mustChangePassword, true); assert.ok(row.passwordChangedAt);
    assert.equal(code(await call(R.users, 'POST /warden2/reset-password')), 403); assert.equal(code(await call(R.users, `POST /${M.User.rows.find((u) => u.role === 'STUDENT')._id}/reset-password`)), 400); assert.equal(code(await call(R.users, 'POST /nope/reset-password')), 404);
    assert.ok(audits.some((a) => a[1] === 'PASSWORD_RESET'));
  });
  test('there is no way to create a warden through the API', () => {
    const posts = R.users.stack.filter((r) => r.method === 'POST').map((r) => r.path);
    assert.deepEqual(posts, ['/guards', '/:id/reset-password']);
    assert.ok(!R.users.stack.some((r) => r.method === 'PUT'));
  });
});
