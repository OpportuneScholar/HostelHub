import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bedLabel, bedSuffix, cleanCapacity, cleanFloor, cleanRoomNumber } from '../src/utils.js';

test('bedLabel joins the room number and bed number', () => {
  assert.equal(bedLabel('B-205', 3), 'B-205-3');
  assert.equal(bedLabel(' b-205 ', 1), 'B-205-1');
  assert.equal(bedLabel('101', 12), '101-12');
});

test('bedLabel refuses a bad room number or bed number', () => {
  assert.equal(bedLabel('', 1), null);
  assert.equal(bedLabel('B/205', 1), null);
  assert.equal(bedLabel('B-205', 0), null);
  assert.equal(bedLabel('B-205', 1.5), null);
  assert.equal(bedLabel('B-205', '3'), null);
});

test('bedSuffix reads the bed number from a label', () => {
  assert.equal(bedSuffix('B-205-3'), 3);
  assert.equal(bedSuffix('101-12'), 12);
  assert.equal(bedSuffix(bedLabel('A-1', 7)), 7);
});

test('bedSuffix returns null for labels that are not valid', () => {
  for (const bad of ['', 'abc', '101-', '101-x', '101-0', '101-01', '-5', null, undefined, 12]) assert.equal(bedSuffix(bad), null, String(bad));
});

test('cleanRoomNumber trims, upper-cases and rejects odd characters', () => {
  assert.equal(cleanRoomNumber(' b-205 '), 'B-205');
  assert.equal(cleanRoomNumber(101), '101');
  for (const bad of ['', '   ', 'B/205', '-205', 'A'.repeat(21), null]) assert.equal(cleanRoomNumber(bad), null, String(bad));
});

test('cleanFloor accepts whole numbers from 0 to 50 and defaults to 0', () => {
  assert.equal(cleanFloor(undefined), 0);
  assert.equal(cleanFloor(''), 0);
  assert.equal(cleanFloor('2'), 2);
  assert.equal(cleanFloor(50), 50);
  for (const bad of [-1, 51, 1.5, 'x', true]) assert.equal(cleanFloor(bad), null, String(bad));
});

test('cleanCapacity accepts whole numbers from 1 to 10', () => {
  assert.equal(cleanCapacity(4), 4);
  assert.equal(cleanCapacity(' 10 '), 10);
  for (const bad of [0, 11, 2.5, '', 'two', null, undefined, true]) assert.equal(cleanCapacity(bad), null, String(bad));
});
