import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duplicateMessage } from '../src/errors.js';
import { migrateIndexes } from '../src/indexMigration.js';

test('duplicate messages from single inserts', () => {
  assert.equal(duplicateMessage({ code: 11000, keyPattern: { block: 1, number: 1 } }), 'A room with this number already exists in this block');
  assert.equal(duplicateMessage({ code: 11000, keyPattern: { email: 1 } }), 'A record with this email already exists');
});
test('bulk-write errors (Bed.insertMany) have no keyPattern: the index name in the message is used', () => {
  // This is the error behind "A record with this value already exists" when the old bed-label index is still in the database.
  const oldBedIndex = { code: 11000, writeErrors: [{ err: { errmsg: 'E11000 duplicate key error collection: hostelhub.beds index: label_1 dup key: { label: "101-1" }' } }] };
  assert.match(duplicateMessage(oldBedIndex), /old campus-wide room rule.*System.*Fix indexes/);
  assert.equal(duplicateMessage({ code: 11000, message: 'E11000 ... index: room_1_label_1 dup key' }), 'That bed already exists in this room');
  assert.equal(duplicateMessage({ code: 11000, message: 'E11000 ... index: student_open_auto_unique dup key' }), 'You already have an open outing pass. Use it or cancel it first.');
  assert.equal(duplicateMessage({ code: 11000 }), 'A record with this value already exists');
});

// A tiny fake of the parts of a Mongoose model the migration uses.
const fakeModel = (indexes, dupes = []) => {
  const m = { dropped: [], created: 0, collection: { indexes: async () => indexes, dropIndex: async (n) => {
    m.dropped.push(n);
    indexes = indexes.filter((i) => i.name !== n);
  } }, aggregate: async () => dupes, createIndexes: async () => { m.created++; } };
  return m;
};
const oldRoom = [{ name: '_id_', key: { _id: 1 } }, { name: 'number_1', key: { number: 1 }, unique: true }, { name: 'block_1_number_1', key: { block: 1, number: 1 }, unique: true }];
const oldBed = [{ name: '_id_', key: { _id: 1 } }, { name: 'label_1', key: { label: 1 }, unique: true }];

test('migration: report only changes nothing', async () => {
  const Room = fakeModel(oldRoom), Bed = fakeModel(oldBed);
  const r = await migrateIndexes({ Room, Bed }, { apply: false });
  assert.deepEqual([Room.dropped, Bed.dropped, r.applied], [[], [], false]);
  assert.deepEqual(r.report.map((x) => x.obsolete), [['number_1'], ['label_1']]);
});
test('migration: --apply drops only the old single-field unique indexes and keeps the compound one', async () => {
  const Room = fakeModel(oldRoom), Bed = fakeModel(oldBed);
  const r = await migrateIndexes({ Room, Bed }, { apply: true });
  assert.deepEqual(r.dropped, ['rooms.number_1', 'beds.label_1']);
  assert.deepEqual(Room.dropped, ['number_1']);
  assert.equal(Room.created + Bed.created, 2);
});
test('migration: conflicting data stops everything, nothing is dropped', async () => {
  const Room = fakeModel(oldRoom, [{ _id: { block: 'b1', number: '101' }, ids: ['r1', 'r2'] }]), Bed = fakeModel(oldBed);
  const r = await migrateIndexes({ Room, Bed }, { apply: true });
  assert.equal(r.applied, false);
  assert.equal(r.conflicts.length, 1);
  assert.deepEqual([Room.dropped, Bed.dropped], [[], []]);
});
test('migration: running twice is harmless', async () => {
  const Room = fakeModel(oldRoom), Bed = fakeModel(oldBed);
  await migrateIndexes({ Room, Bed }, { apply: true });
  const again = await migrateIndexes({ Room, Bed }, { apply: true });
  assert.deepEqual(again.dropped, []);
});
