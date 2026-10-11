// npm run migrate-indexes              report only
// npm run migrate-indexes -- --apply   drop the old campus-wide unique indexes, create the per-block / per-room ones
import 'dotenv/config';
import mongoose from 'mongoose';
import { Room, Bed } from '../models/index.js';
import { connectDb } from '../db.js';
import { migrateIndexes } from '../indexMigration.js';

const apply = process.argv.includes('--apply');
try {
  await connectDb();
  const r = await migrateIndexes({ Room, Bed }, { apply });
  for (const x of r.report) console.log(`${x.name}: indexes -> ${x.indexes.map((i) => i.name + (i.unique ? ' (unique)' : '')).join(', ') || 'none'}${x.obsolete.length ? `   OLD: ${x.obsolete.join(', ')}` : ''}`);
  if (r.conflicts.length) {
    console.log('\nCONFLICTS (nothing changed):');
    r.conflicts.forEach((c) => console.log(' ', c.collection, JSON.stringify(c.key), 'ids:', c.ids.join(',')));
    process.exitCode = 2;
  }
  else if (!apply) console.log(r.report.some((x) => x.obsolete.length) ? '\nWould drop the OLD indexes above. Run again with --apply.' : '\nNothing to migrate.');
  else console.log(`\nDone. Dropped: ${r.dropped.join(', ') || 'nothing'}. No documents were changed.`);
} catch (e) { console.error('Migration failed:', e.message);
process.exitCode = 1;
}
finally { await mongoose.disconnect(); }
