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
