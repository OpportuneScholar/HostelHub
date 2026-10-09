import { HttpError } from './utils.js';

const toNumber = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '') ? Number(v) : NaN);

// Validates and cleans the room form (used by both "add room" and "edit room").
export function parseRoom(body = {}) {
  const hostelName = String(body.hostelName ?? '').trim();
  const blockName = String(body.blockName ?? '').trim();
  const number = String(body.number ?? '').trim().toUpperCase();
  const floor = body.floor === undefined || body.floor === '' ? 0 : toNumber(body.floor);
  const capacity = toNumber(body.capacity);
  if (!hostelName || !blockName || !number) throw new HttpError(400, 'Hostel, block and room number are required');
  if (hostelName.length > 60 || blockName.length > 40) throw new HttpError(400, 'Hostel name (max 60 characters) or block name (max 40) is too long');
  if (!/^[A-Z0-9][A-Z0-9 -]{0,19}$/.test(number)) throw new HttpError(400, 'Room number may use letters, digits, spaces and hyphens only (max 20 characters)');
  if (!Number.isInteger(floor) || floor < 0 || floor > 50) throw new HttpError(400, 'Floor must be a whole number from 0 to 50');
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10) throw new HttpError(400, 'Number of beds must be a whole number from 1 to 10');
  return { hostelName, blockName, number, floor, capacity };
}

// Beds are labelled "<room>-<n>". Works out which beds to keep, remove (highest numbers first) and add.
export function planBeds(beds, capacity) {
  const items = beds.map((b) => ({ _id: b._id, label: b.label, student: b.student || null, idx: Number(b.label.slice(b.label.lastIndexOf('-') + 1)) })).sort((a, b) => a.idx - b.idx);
  const have = new Set(items.map((b) => b.idx));
  const add = []; for (let i = 1; i <= capacity; i++) if (!have.has(i)) add.push(i);
  const remove = items.filter((b) => b.idx > capacity);
  return { keep: items.filter((b) => b.idx <= capacity), remove, blocked: remove.filter((b) => b.student), add, occupied: items.filter((b) => b.student).length };
}
