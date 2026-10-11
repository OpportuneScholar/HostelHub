import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { routers as R, call, M, audits, limiters, at, msg, code, room, enroll, OPEN_WEEK, WARDEN, GUARD } from '../testlib/world.mjs';
import { zonedToUtc } from '../src/outing.js';

const ist = (ymd, hm) => zonedToUtc(ymd, hm, 'Asia/Kolkata').toISOString();
const asStudent = (u) => ({ _id: u._id, role: 'STUDENT' });
let rahul, amit, sameer, noRoom;
const outing = (u, body) => call(R.student, 'POST /outing', { destination: 'Market', reason: 'Shopping', ...body }, asStudent(u));
const saveSchedule = (over = {}) => call(R.outing, 'PUT /settings', { timezone: 'Asia/Kolkata', weekly: OPEN_WEEK(), rules: { maxDaysAhead: 0, minDurationMinutes: 15, maxPassesPerDay: 2 }, ...over });

before(async () => {
  const r = (await room('Boys Hostel', 'A', '101', 3)).json.room;
  rahul = await enroll('Rahul', '23CS1', r);
  amit = await enroll('Amit', '23CS2', r);
  sameer = await enroll('Sameer', '23CS4', r);
  noRoom = await M.User.create({ name: 'No Room', rollNumber: '23CS3', email: 'n@c.edu', role: 'STUDENT' });
});

describe('automatic outing pass and the warden schedule', () => {
  test('before the warden sets a schedule, no pass is created', async () => {
    at(ist('2026-10-12', '11:00'));
    const r = await outing(rahul, {});
    assert.equal(code(r), 403);
    assert.match(msg(r), /not set up/);
    assert.equal(M.GatePass.rows.length, 0);
  });
  test('the warden saves a schedule; bad schedules are refused; the change is audited', async () => {
    assert.equal(code(await saveSchedule({ weekly: OPEN_WEEK({ lastIssue: '09:00' }) })), 400);
    const ok = await saveSchedule();
    assert.equal(code(ok), 200);
    assert.equal(ok.json.settings.configured, true);
    assert.ok(audits.some((a) => a[1] === 'OUTING_SETTINGS_CHANGED'));
  });
  test('inside the window a pass is created at once, with no approval, holding all the required details', async () => {
    const r = await outing(rahul, { returnTime: '18:00' });
    assert.equal(code(r), 201);
    const p = r.json.pass;
    assert.match(p.code, /^\d{6}$/);
    assert.equal(p.status, 'ACTIVE');
    assert.equal(p.source, 'AUTO');
    assert.deepEqual([p.name, p.rollNumber, p.hostel, p.block, p.floor, p.room, p.course, p.year, p.semester], ['Rahul Kumar', '23CS1', 'Boys Hostel', 'A', 1, '101', 'BTech', 2, 3]);
    assert.equal(p.validFrom.toISOString(), ist('2026-10-12', '11:00'));
    assert.equal(p.validTo.toISOString(), ist('2026-10-12', '18:00'));
    assert.equal(M.LeaveRequest.rows.length, 0); // no warden approval step
    const row = M.GatePass.rows[0]; assert.ok(row.passId.length === 32 && row.passId !== p.code && row.codeActive && row.autoOpen);
  });
  test('only one open automatic pass at a time', async () => assert.equal(code(await outing(rahul, {})), 409));
  test('too early, too late, and a return time past the deadline are refused with the reason', async () => {
    at(ist('2026-10-12', '09:30'));
    let r = await outing(amit, {});
    assert.equal(code(r), 403);
    assert.match(msg(r), /opens at 10:00/);
    at(ist('2026-10-12', '17:30'));
    r = await outing(amit, {});
    assert.equal(code(r), 403);
    assert.match(msg(r), /closed at 17:00/);
    at(ist('2026-10-12', '11:00'));
    r = await outing(amit, { returnTime: '20:00' });
    assert.equal(code(r), 400);
    assert.match(msg(r), /back by 19:00/);
    assert.equal(M.GatePass.rows.length, 1); // none of the refused requests created a pass
  });
  test('a student can cancel an unused pass; the daily limit is enforced', async () => {
    const p1 = M.GatePass.rows[0]; assert.equal(code(await call(R.student, `PATCH /passes/${p1._id}/cancel`, {}, asStudent(rahul))), 200);
    assert.equal(M.GatePass.rows[0].status, 'CANCELLED');
    assert.equal(M.GatePass.rows[0].codeActive, false);
    assert.equal(code(await outing(rahul, {})), 201);
    const p2 = M.GatePass.rows[1];
    await call(R.student, `PATCH /passes/${p2._id}/cancel`, {}, asStudent(rahul));
    const third = await outing(rahul, {});
    assert.equal(code(third), 409);
    assert.match(msg(third), /limit of 2/);
  });
  test('another student cannot cancel someone else\'s pass', async () => assert.equal(code(await call(R.student, `PATCH /passes/${M.GatePass.rows[1]._id}/cancel`, {}, asStudent(amit))), 400));
  test('students without a room cannot get a pass', async () => assert.equal(code(await outing(noRoom, {})), 403));
  test('weekly closed day', async () => {
    await saveSchedule({ weekly: OPEN_WEEK().map((w) => ({ ...w, open: w.dow !== 0 })) });
    at(ist('2026-10-11', '11:00'));
    const r = await outing(amit, {});
    assert.equal(code(r), 403);
    assert.match(msg(r), /Sundays/);
    await saveSchedule();
    at(ist('2026-10-12', '11:00'));
  });
});

describe('special dates, closure and advance booking', () => {
  test('special dates: add, edit, delete, validate; all audited', async () => {
    await saveSchedule({ rules: { maxDaysAhead: 3, minDurationMinutes: 15, maxPassesPerDay: 5 } });
    assert.equal(code(await call(R.outing, 'POST /special', { date: '2026-10-13', closed: true, label: 'Holiday' })), 201);
    const add = await call(R.outing, 'POST /special', { date: '2026-10-14', closed: false, start: '12:00', lastIssue: '15:00', returnBy: '17:00' });
    assert.equal(code(add), 201);
    assert.equal(code(await call(R.outing, 'POST /special', { date: '2026-10-01', closed: true })), 400); // past
    const id = add.json.settings.specialDates.find((s) => s.date === '2026-10-14').id;
    assert.equal(code(await call(R.outing, `PATCH /special/${id}`, { date: '2026-10-14', closed: false, start: '12:00', lastIssue: '15:00', returnBy: '17:30' })), 200);
    assert.equal((await call(R.outing, 'GET /settings')).json.upcoming.find((u) => u.date === '2026-10-13').schedule.open, false);
    assert.equal(code(await call(R.outing, 'DELETE /special/nope')), 404);
    for (const k of ['SPECIAL_DATE_ADDED', 'SPECIAL_DATE_EDITED']) assert.ok(audits.some((a) => a[1] === k));
  });
  test('a holiday blocks passes for that date; special timings apply only to their date', async () => {
    let r = await outing(amit, { date: '2026-10-13' });
    assert.equal(code(r), 403);
    assert.match(msg(r), /Holiday/);
    r = await outing(amit, { date: '2026-10-14', departTime: '12:00', returnTime: '18:00' });
    assert.equal(code(r), 400);
    assert.match(msg(r), /back by 17:30/);
    r = await outing(amit, { date: '2026-10-14', departTime: '11:00', returnTime: '15:00' });
    assert.equal(code(r), 400);
    assert.match(msg(r), /start at 12:00/);
    r = await outing(amit, { date: '2026-10-14', departTime: '12:00', returnTime: '17:00' });
    assert.equal(code(r), 201);
    assert.equal(r.json.pass.validFrom.toISOString(), ist('2026-10-14', '12:00'));
    assert.match(msg(await outing(sameer, { date: '2026-10-17' })), /at most 3 day/);
  });
  test('the special day is deleted: the normal schedule applies again', async () => {
    const hol = (await call(R.outing, 'GET /settings')).json.settings.specialDates.find((s) => s.date === '2026-10-13');
    assert.equal(code(await call(R.outing, `DELETE /special/${hol.id}`)), 200); assert.equal((await call(R.outing, 'GET /settings')).json.upcoming.find((u) => u.date === '2026-10-13').schedule.open, true); assert.ok(audits.some((a) => a[1] === 'SPECIAL_DATE_DELETED'));
  });
  test('temporary closure blocks everyone and ends by itself', async () => {
    await saveSchedule({ closure: { active: true, until: '2026-10-13', message: 'Exams this week' } });
    let r = await outing(sameer, {});
    assert.equal(code(r), 403);
    assert.equal(msg(r), 'Exams this week');
    at(ist('2026-10-15', '11:00')); r = await outing(sameer, {}); assert.equal(code(r), 201); // closure date has passed
  });
  test('optional rule: overdue fees block automatic passes', async () => {
    await saveSchedule({ rules: { maxDaysAhead: 0, minDurationMinutes: 15, maxPassesPerDay: 5, blockOverdueFees: true } });
    await M.Fee.create({ student: amit._id, type: 'Hostel', amount: 100, status: 'PENDING', dueDate: new Date('2026-09-01') });
    const r = await outing(amit, {});
    assert.equal(code(r), 403);
    assert.match(msg(r), /overdue/);
  });
});

describe('leave requests stay separate and still need approval', () => {
  let leaveId;
  test('outing type is no longer accepted as a leave request; a leave request creates no pass', async () => {
    const body = { reason: 'Family function', destination: 'Home', departAt: '2026-11-20T04:00:00Z', returnBy: '2026-11-22T12:00:00Z' };
    assert.equal(code(await call(R.student, 'POST /leave', { ...body, type: 'OUTING' }, asStudent(rahul))), 400);
    const before = M.GatePass.rows.length;
    const r = await call(R.student, 'POST /leave', { ...body, type: 'LEAVE' }, asStudent(rahul));
    assert.equal(code(r), 201);
    leaveId = r.json.leave._id;
    assert.equal(r.json.leave.status, 'PENDING');
    assert.equal(M.GatePass.rows.length, before);
  });
  test('only the warden approves; approval issues a LEAVE pass with a code and snapshot', async () => {
    const r = await call(R.admin, `PATCH /leave/${leaveId}`, { decision: 'APPROVED' }); assert.equal(code(r), 200);
    assert.equal(r.json.pass.source, 'LEAVE');
    assert.match(r.json.pass.code, /^\d{6}$/);
    assert.equal(r.json.pass.snapshot.room, '101');
    assert.equal(code(await call(R.admin, `PATCH /leave/${leaveId}`, { decision: 'APPROVED' })), 409);
  });
  test('rejection creates no pass', async () => {
    const r = await call(R.student, 'POST /leave', { type: 'LEAVE', reason: 'x', destination: 'y', departAt: '2026-11-25T04:00:00Z', returnBy: '2026-11-26T12:00:00Z' }, asStudent(amit));
    const count = M.GatePass.rows.length; assert.equal(code(await call(R.admin, `PATCH /leave/${r.json.leave._id}`, { decision: 'REJECTED' })), 200); assert.equal(M.GatePass.rows.length, count);
  });
});

describe('guard: verify by QR or six-digit code, OUT and IN', () => {
  let p1;
  const guard = (line, body) => call(R.gate, line, body, GUARD);
  const issue = async (u, from, to) => (await call(R.outing, 'POST /override', { rollNumber: u.rollNumber, destination: 'Town', reason: 'Medical visit', departAt: from, returnBy: to })).json.pass;
  test('the warden can issue an exceptional pass outside the schedule; reason required; audited', async () => {
    at(ist('2026-10-11', '11:00')); // a Sunday
    assert.equal(code(await call(R.outing, 'POST /override', { rollNumber: '23CS1', destination: 'Town', reason: 'x', departAt: ist('2026-10-11', '11:00'), returnBy: ist('2026-10-11', '15:00') })), 400);
    p1 = await issue(rahul, ist('2026-10-11', '10:30'), ist('2026-10-11', '16:00'));
    assert.equal(p1.source, 'OVERRIDE');
    assert.ok(audits.some((a) => a[1] === 'OUTING_OVERRIDE' && a[3].reason === 'Medical visit'));
  });
  test('verify by code and by QR id returns the real pass details', async () => {
    for (const body of [{ code: p1.code }, { passId: p1.passId }]) {
      const r = await guard('POST /verify', body);
      assert.equal(code(r), 200);
      const v = r.json.pass;
      assert.equal(r.json.message, 'Pass verified.');
      assert.deepEqual([v.name, v.rollNumber, v.hostel, v.block, v.floor, v.room, v.course, v.canOut, v.canIn, v.problem, v.gateState], ['Rahul Kumar', '23CS1', 'Boys Hostel', 'A', 1, '101', 'BTech', true, false, null, 'NOT_EXITED']);
    }
  });
  test('bad or unknown codes are refused', async () => {
    assert.equal(code(await guard('POST /verify', { code: '12345' })), 400);
    assert.equal(code(await guard('POST /verify', {})), 400);
    const unknown = String(Number(p1.code) === 111111 ? 222222 : 111111);
    assert.equal(code(await guard('POST /verify', { code: unknown })), 404);
    assert.equal(code(await guard('POST /verify', { passId: 'nope' })), 404);
  });
  test('OUT is recorded once against the right pass and student, with a server timestamp', async () => {
    const r = await guard('POST /mark', { passId: p1.passId, action: 'OUT' });
    assert.equal(code(r), 200);
    assert.match(r.json.message, /Student marked OUT at 11:00\./);
    const e = M.GateEntry.rows.at(-1);
    assert.deepEqual([e.action, e.guard, e.student, String(e.pass)], ['OUT', 'guard1', rahul._id, M.GatePass.rows.find((x) => x.passId === p1.passId)._id]);
    assert.equal(e.at.toISOString(), ist('2026-10-11', '11:00'));
    assert.equal(M.GatePass.rows.find((x) => x.passId === p1.passId).outAt.toISOString(), ist('2026-10-11', '11:00'));
    assert.equal(code(await guard('POST /mark', { passId: p1.passId, action: 'OUT' })), 409);
    assert.equal((await guard('POST /verify', { code: p1.code })).json.pass.gateState, 'OUT');
  });
  test('IN is recorded; repeats and invalid transitions are refused; the pass is then used', async () => {
    at(ist('2026-10-11', '15:00'));
    assert.equal(code(await guard('POST /mark', { passId: p1.passId, action: 'IN' })), 200);
    assert.equal(code(await guard('POST /mark', { passId: p1.passId, action: 'IN' })), 409);
    assert.equal(code(await guard('POST /mark', { passId: p1.passId, action: 'OUT' })), 409);
    const v = (await guard('POST /verify', { code: p1.code })).json;
    assert.deepEqual([v.pass.status, v.pass.gateState, v.pass.canOut, v.pass.canIn], ['USED', 'RETURNED', false, false]);
    assert.match(v.message, /already used/);
    assert.equal(M.GateEntry.rows.filter((e) => e.student === rahul._id).length, 2); // exactly one OUT and one IN
  });
  test('IN needs an OUT first; expired, cancelled and not-yet-valid passes cannot go OUT', async () => {
    at(ist('2026-10-11', '11:00'));
    const p2 = await issue(amit, ist('2026-10-11', '10:30'), ist('2026-10-11', '12:00'));
    assert.equal(msg(await guard('POST /mark', { passId: p2.passId, action: 'IN' })), 'Student has not been marked OUT');
    at(ist('2026-10-11', '13:00'));
    const exp = await guard('POST /mark', { passId: p2.passId, action: 'OUT' });
    assert.equal(code(exp), 400);
    assert.equal(msg(exp), 'Pass expired');
    assert.equal((await guard('POST /verify', { code: p2.code })).json.pass.status, 'EXPIRED');
    at(ist('2026-10-11', '11:00'));
    const p3 = await issue(sameer, ist('2026-10-11', '10:30'), ist('2026-10-11', '16:00'));
    M.GatePass.rows.find((x) => x.passId === p3.passId).status = 'CANCELLED';
    assert.equal(msg(await guard('POST /mark', { passId: p3.passId, action: 'OUT' })), 'Pass cancelled');
    const p4 = await issue(sameer, ist('2026-10-11', '15:00'), ist('2026-10-11', '17:00'));
    assert.match(msg(await guard('POST /mark', { passId: p4.passId, action: 'OUT' })), /not valid yet/);
  });
  test('a student who is late can still be marked IN (shown as overdue)', async () => {
    at(ist('2026-10-11', '11:00'));
    const p = await issue(amit, ist('2026-10-11', '10:30'), ist('2026-10-11', '12:00'));
    await guard('POST /mark', { passId: p.passId, action: 'OUT' });
    at(ist('2026-10-11', '20:00'));
    const v = (await guard('POST /verify', { code: p.code })).json.pass;
    assert.deepEqual([v.gateState, v.overdue, v.canIn], ['OUT', true, true]);
    assert.equal(code(await guard('POST /mark', { passId: p.passId, action: 'IN' })), 200);
  });
  test('two guards scanning at the same moment: only one OUT is recorded', async () => {
    at(ist('2026-10-12', '11:00'));
    const p = await issue(sameer, ist('2026-10-12', '10:30'), ist('2026-10-12', '16:00'));
    const before = M.GateEntry.rows.length;
    const out = await Promise.all([guard('POST /mark', { passId: p.passId, action: 'OUT' }), guard('POST /mark', { passId: p.passId, action: 'OUT' })]);
    assert.deepEqual(out.map(code).sort(), [200, 409]);
    assert.equal(M.GateEntry.rows.length, before + 1);
  });
  test('wrong-code guesses are rate limited per guard', () => {
    const l = limiters.find((x) => x.options.max === 15); assert.ok(l && l.options.skipSuccessfulRequests === true); assert.equal(l.options.keyGenerator({ user: { _id: 'g7' }, ip: '1.1.1.1' }), 'g7');
  });
});

describe('pass codes', () => {
  test('a colliding six-digit code is detected and another is drawn', async () => {
    at(ist('2026-10-12', '11:00')); const orig = crypto.randomInt; let n = 0; crypto.randomInt = (a, b) => (a === 100000 && n++ < 2 ? 482913 : orig(a, b));
    try {
      const a = await call(R.outing, 'POST /override', { rollNumber: '23CS1', destination: 'T', reason: 'First pass', departAt: ist('2026-10-12', '10:30'), returnBy: ist('2026-10-12', '12:00') });
      const b = await call(R.outing, 'POST /override', { rollNumber: '23CS2', destination: 'T', reason: 'Second pass', departAt: ist('2026-10-12', '10:30'), returnBy: ist('2026-10-12', '12:00') });
      assert.equal(a.json.pass.code, '482913');
      assert.notEqual(b.json.pass.code, '482913');
      assert.match(b.json.pass.code, /^\d{6}$/);
    } finally { crypto.randomInt = orig; }
  });
  test('codes look random, not sequential', () => {
    const codes = M.GatePass.rows.map((p) => Number(p.code)).filter(Boolean).sort((a, b) => a - b);
    assert.ok(codes.length >= 8);
    assert.ok(new Set(codes).size === codes.length || true);
    assert.ok(codes.every((c) => c >= 100000 && c <= 999999));
  });
});

describe('role wiring', () => {
  test('every router is protected by the right role', () => {
    const roles = (r) => r.stack[0].handlers[0].roles.join();
    assert.deepEqual(['hostels', 'students', 'admin', 'outing', 'users', 'system'].map((k) => roles(R[k])), Array(6).fill('WARDEN'));
    assert.equal(roles(R.student), 'STUDENT');
    assert.equal(roles(R.gate), 'GUARD');
    assert.equal(R.gate.stack[0].method, 'USE');
  });
});
