import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { routers as R, call, M, msg, code, room, enroll } from '../testlib/world.mjs';

const find = (host, blockName, number) => { const h = M.Hostel.rows.find((x) => x.name === host); const b = M.Block.rows.find((x) => x.hostel === h?._id && x.name === blockName); return M.Room.rows.find((r) => r.block === b?._id && r.number === number); };

describe('room numbers are unique per block (bug fix)', () => {
  test('Room 101 is allowed in different hostels and different blocks', async () => {
    assert.equal(code(await room('Boys Hostel', 'A', '101')), 201);
    assert.equal(code(await room('Girls Hostel', 'A', '101')), 201);
    assert.equal(code(await room('Boys Hostel', 'B', '101', 3)), 201);
    assert.equal(M.Room.rows.length, 3);
    assert.equal(M.Bed.rows.length, 7);
  });
  test('the same number twice in one block is refused, naming the block', async () => {
    const r = await room('Boys Hostel', 'A', ' 101 ');
    assert.equal(code(r), 409);
    assert.match(msg(r), /already exists in Boys Hostel, block A/);
  });
  test('hostel names match without caring about capitals (no duplicate hostel)', async () => {
    assert.equal(code(await room('boys hostel', 'A', '102')), 201);
    assert.equal(M.Hostel.rows.length, 2);
  });
  test('beds are 101-1.. in every room; the same label repeats across rooms', () => {
    const labels = (r) => M.Bed.rows.filter((b) => b.room === r._id).map((b) => b.label).sort().join();
    assert.equal(labels(find('Boys Hostel', 'A', '101')), '101-1,101-2');
    assert.equal(labels(find('Girls Hostel', 'A', '101')), '101-1,101-2');
  });
  test('editing without changes is not a false duplicate', async () => {
    const r = find('Boys Hostel', 'A', '101'); assert.equal(code(await call(R.hostels, `PATCH /rooms/${r._id}`, { hostelName: 'Boys Hostel', blockName: 'A', floor: 1, number: '101', capacity: 2 })), 200);
  });
  test('moving a room checks the destination block', async () => {
    const r = find('Boys Hostel', 'B', '101');
    assert.equal(code(await call(R.hostels, `PATCH /rooms/${r._id}`, { hostelName: 'Boys Hostel', blockName: 'A', floor: 1, number: '101', capacity: 3 })), 409);
    assert.equal(code(await call(R.hostels, `PATCH /rooms/${r._id}`, { hostelName: 'Girls Hostel', blockName: 'B', floor: 1, number: '101', capacity: 3 })), 200); // 101 is free in Girls/B
    assert.ok(!M.Block.rows.some((b) => b.name === 'B' && M.Hostel.rows.find((h) => h._id === b.hostel).name === 'Boys Hostel')); // emptied block removed
    assert.equal(M.Bed.rows.filter((b) => b.room === r._id).length, 3);
  });
  test('invalid input is refused before touching the database', async () => {
    for (const bad of [{ number: 'B/9' }, { capacity: 0 }, { capacity: 11 }, { capacity: 2.5 }, { floor: -1 }, { hostelName: '' }]) assert.equal(code(await call(R.hostels, 'POST /rooms', { hostelName: 'X', blockName: 'A', floor: 1, number: '9', capacity: 2, ...bad })), 400);
    assert.ok(!M.Hostel.rows.some((h) => h.name === 'X'));
  });
});

describe('room delete and capacity are safe', () => {
  test('a student in the room: capacity cannot drop below the occupied beds, delete is refused', async () => {
    const r = find('Boys Hostel', 'A', '101');
    await enroll('Rahul', '23CS1', r);
    assert.equal(code(await call(R.hostels, `PATCH /rooms/${r._id}`, { hostelName: 'Boys Hostel', blockName: 'A', floor: 1, number: '101', capacity: 1 })), 200); // bed 2 is free, bed 1 has Rahul: allowed
    assert.equal(code(await call(R.hostels, `PATCH /rooms/${r._id}`, { hostelName: 'Boys Hostel', blockName: 'A', floor: 1, number: '101', capacity: 4 })), 200);
    const del = await call(R.hostels, `DELETE /rooms/${r._id}`); assert.equal(code(del), 409); assert.match(msg(del), /1 occupied bed/);
    assert.equal(M.Bed.rows.filter((b) => b.room === r._id).length, 4);
  });
  test('an occupied bed is never removed when reducing capacity', async () => {
    const r = find('Boys Hostel', 'A', '101'); const bed3 = M.Bed.rows.find((b) => b.room === r._id && b.label === '101-3'); bed3.student = 'someone';
    const res = await call(R.hostels, `PATCH /rooms/${r._id}`, { hostelName: 'Boys Hostel', blockName: 'A', floor: 1, number: '101', capacity: 2 });
    assert.equal(code(res), 409);
    assert.match(msg(res), /101-3 is occupied/);
    bed3.student = null;
  });
  test('renaming a room renames its beds and keeps the student on the same bed', async () => {
    const r = find('Boys Hostel', 'A', '101'); const holder = M.Bed.rows.find((b) => b.room === r._id && b.student).student;
    assert.equal(code(await call(R.hostels, `PATCH /rooms/${r._id}`, { hostelName: 'Boys Hostel', blockName: 'A', floor: 1, number: '110', capacity: 4 })), 200);
    assert.deepEqual(M.Bed.rows.filter((b) => b.room === r._id).map((b) => b.label).sort(), ['110-1', '110-2', '110-3', '110-4']); assert.equal(M.Bed.rows.find((b) => b.room === r._id && b.label === '110-1').student, holder);
  });
  test('an empty room can be deleted, and its empty block goes with it', async () => {
    const x = (await room('Boys Hostel', 'Z', '900')).json.room; assert.equal(code(await call(R.hostels, `DELETE /rooms/${x._id}`)), 200);
    assert.ok(!M.Room.rows.some((r) => r._id === x._id) && !M.Bed.rows.some((b) => b.room === x._id)); assert.equal(code(await call(R.hostels, `DELETE /rooms/${x._id}`)), 404);
  });
});

describe('registration with the cascading selection', () => {
  test('options come from the database and only free rooms and beds are offered', async () => {
    const boys = (await call(R.hostels, 'GET /available/hostels')).json.items.find((h) => h.name === 'Boys Hostel');
    const blockA = (await call(R.hostels, `GET /available/blocks?hostel=${boys._id}`)).json.items.find((b) => b.name === 'A');
    assert.ok((await call(R.hostels, `GET /available/floors?block=${blockA._id}`)).json.items.includes(1));
    const rooms = (await call(R.hostels, `GET /available/rooms?block=${blockA._id}&floor=1`)).json.items; assert.ok(rooms.length >= 1 && rooms.every((r) => r.availableBeds > 0));
    const beds = (await call(R.hostels, `GET /available/beds?room=${rooms[0]._id}`)).json.items; assert.ok(beds.every((b) => !M.Bed.rows.find((x) => x._id === b._id).student));
  });
  test('the server rejects a bed that does not match the selected hostel/block/floor/room, or is taken', async () => {
    const girls = find('Girls Hostel', 'A', '101');
    const blk = M.Block.rows.find((b) => b._id === girls.block);
    const bed = M.Bed.rows.find((b) => b.room === girls._id);
    const body = { firstName: 'Gita', lastName: 'S', rollNumber: '23CS9', email: 'g@c.edu', phone: '9', course: 'BTech', branch: 'CSE', year: 1, semester: 1, guardianName: 'G', guardianPhone: '8', emergencyContact: '7', address: 'A', hostelId: blk.hostel, blockId: blk._id, floor: 1, roomId: girls._id, bedId: bed._id };
    assert.equal(code(await call(R.students, 'POST /', { ...body, floor: 5 })), 400);
    assert.equal(code(await call(R.students, 'POST /', { ...body, hostelId: 'other' })), 400);
    assert.equal(code(await call(R.students, 'POST /', { ...body, bedId: undefined })), 400);
    assert.equal(code(await call(R.students, 'POST /', { ...body, joiningDate: '2026-13-45' })), 400);
    assert.equal(code(await call(R.students, 'POST /', { ...body, joiningDate: '2026-08-15' })), 201);
    assert.equal(M.StudentProfile.rows.find((p) => p.rollNumber === '23CS9').joiningDate.toISOString(), '2026-08-15T00:00:00.000Z');
    assert.equal(M.User.rows.find((u) => u.rollNumber === '23CS9').passwordHash, 'hash(Gita101)'); // first name + room digits, as before
    const again = await call(R.students, 'POST /', { ...body, rollNumber: '23CS10', email: 'g2@c.edu' });
    assert.equal(code(again), 409);
    assert.ok(!M.User.rows.some((u) => u.rollNumber === '23CS10'));
  });
  test('two simultaneous registrations for one bed: exactly one wins, no leftovers', async () => {
    const r = (await room('Girls Hostel', 'Q', '300', 1)).json.room;
    const blk = M.Block.rows.find((b) => b._id === r.block);
    const bed = M.Bed.rows.find((b) => b.room === r._id);
    const mk = (n) => ({ firstName: n, lastName: 'S', rollNumber: `R-${n}`, email: `${n}@c.edu`, phone: '9', course: 'B', branch: 'C', year: 1, semester: 1, guardianName: 'G', guardianPhone: '8', emergencyContact: '7', address: 'A', hostelId: blk.hostel, blockId: blk._id, floor: 1, roomId: r._id, bedId: bed._id });
    const out = await Promise.all([call(R.students, 'POST /', mk('Pooja')), call(R.students, 'POST /', mk('Priya'))]);
    assert.deepEqual(out.map(code).sort(), [201, 409]);
    assert.equal(M.User.rows.filter((u) => /^R-/.test(u.rollNumber)).length, 1);
  });
});
