import jwt from 'jsonwebtoken';
import { User, AuditLog } from '../models/index.js';
import { HttpError, wrap } from '../utils.js';

export const audit = (actor, action, target, details) =>
  AuditLog.create({ actor, action, target, details }).catch((e) => console.error('audit failed', e.message));

// auth(['WARDEN']) -> only wardens. Students on a temporary password are blocked
// everywhere except routes that pass { allowTemp: true } (change-password, me).
export const auth = (roles = [], { allowTemp = false } = {}) => wrap(async (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) throw new HttpError(401, 'Please log in to continue');
  let payload;
  try { payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] }); }
  catch { throw new HttpError(401, 'Your session has expired. Please log in again'); }
  const user = await User.findById(payload.id);
  if (!user || !user.isActive) throw new HttpError(401, 'Please log in to continue');
  if (user.passwordChangedAt && payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) throw new HttpError(401, 'Your session has expired. Please log in again');
  if (roles.length && !roles.includes(user.role)) throw new HttpError(403, 'You do not have access to this');
  if (user.mustChangePassword && !allowTemp) {
    const e = new HttpError(403, 'You must change your temporary password first'); e.code = 'MUST_CHANGE_PASSWORD'; throw e;
  }
  req.user = user; next();
});
