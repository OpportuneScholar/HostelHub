export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

export function tempPassword(firstName, roomNumber) {
  const first = String(firstName).trim().split(/\s+/)[0];
  const digits = String(roomNumber).replace(/\D/g, '');
  if (!first || !digits) throw new HttpError(400, 'Cannot build temporary password: invalid name or room number');
  return first[0].toUpperCase() + first.slice(1).toLowerCase() + digits;
}
export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const todayUtc = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);

// Stored as that calendar day at 00:00 UTC so it displays the same everywhere.
export function parseJoiningDate(v) {
  if (v === undefined || v === null || v === '') return undefined;
  const s = String(v).trim();
  const d = new Date(`${s}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(d) || d.toISOString().slice(0, 10) !== s) throw new HttpError(400, 'Joining date must be a valid date');
  if (d < new Date('2000-01-01T00:00:00.000Z') || d.getTime() > Date.now() + 366 * 864e5) throw new HttpError(400, 'Joining date must be between 1 Jan 2000 and one year from today');
  return d;
}

import crypto from 'crypto';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; // no look-alike characters
export const securePassword = (len = 10) => Array.from({ length: len }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');

export function cleanRoomNumber(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const number = String(value).trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9 -]{0,19}$/.test(number) ? number : null;
}

export function cleanFloor(value) {
  if (value === undefined || value === '') return 0;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 50 ? number : null;
}

export function cleanCapacity(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 10 ? number : null;
}

export function bedLabel(roomNumber, bedNumber) {
  const room = cleanRoomNumber(roomNumber);
  if (!room || typeof bedNumber !== 'number' || !Number.isInteger(bedNumber) || bedNumber < 1) return null;
  return `${room}-${bedNumber}`;
}

export function bedSuffix(label) {
  if (typeof label !== 'string') return null;
  const match = /^([A-Z0-9][A-Z0-9 -]{0,19})-([1-9]\d*)$/.exec(label);
  if (!match || !cleanRoomNumber(match[1])) return null;
  return Number(match[2]);
}
