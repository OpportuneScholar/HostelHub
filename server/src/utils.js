export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// FirstName + numeric part of room number. "RAHUL" + "B-205" -> "Rahul205"
export function tempPassword(firstName, roomNumber) {
  const first = String(firstName).trim().split(/\s+/)[0];
  const digits = String(roomNumber).replace(/\D/g, '');
  if (!first || !digits) throw new HttpError(400, 'Cannot build temporary password: invalid name or room number');
  return first[0].toUpperCase() + first.slice(1).toLowerCase() + digits;
}
export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const todayUtc = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);

// Joining date arrives as YYYY-MM-DD and is stored as that calendar day at 00:00 UTC, so it shows the same day everywhere.
export function parseJoiningDate(v) {
  if (v === undefined || v === null || v === '') return undefined;
  const s = String(v).trim();
  const d = new Date(`${s}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(d) || d.toISOString().slice(0, 10) !== s) throw new HttpError(400, 'Joining date must be a valid date');
  if (d < new Date('2000-01-01T00:00:00.000Z') || d.getTime() > Date.now() + 366 * 864e5) throw new HttpError(400, 'Joining date must be between 1 Jan 2000 and one year from today');
  return d;
}
