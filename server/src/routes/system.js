import { Router } from 'express';
import { Room, Bed } from '../models/index.js';
import { auth, audit } from '../middleware/auth.js';
import { HttpError, wrap } from '../utils.js';
import { inspectIndexes, migrateIndexes } from '../indexMigration.js';

const router = Router();
router.use(auth(['WARDEN']));

router.get('/indexes', wrap(async (req, res) => {
  const items = (await inspectIndexes({ Room, Bed })).map(({ job, ...rest }) => rest);
  res.json({ items, needsMigration: items.some((i) => i.obsolete.length > 0), hasConflicts: items.some((i) => i.conflicts.length > 0) });
}));

router.post('/indexes/migrate', wrap(async (req, res) => {
  const r = await migrateIndexes({ Room, Bed }, { apply: true });
  if (!r.applied) throw new HttpError(409, `Nothing was changed: ${r.conflicts.length} group(s) of records share the same room number in a block (or bed label in a room). Fix them first.`);
  audit(req.user._id, 'INDEX_MIGRATION', null, { dropped: r.dropped });
  res.json({ message: r.dropped.length ? `Dropped ${r.dropped.join(', ')}` : 'Indexes are already up to date', dropped: r.dropped });
}));

export default router;
