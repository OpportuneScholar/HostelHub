// Replaces the old campus-wide unique indexes (rooms.number, beds.label) with per-block / per-room ones.
// Usage:  npm run migrate-indexes              (report only, changes nothing)
//         npm run migrate-indexes -- --apply   (drop the old indexes, create the new ones)
// No documents are ever deleted. If existing data would break a new index, nothing is changed.
import 'dotenv/config';
import mongoose from 'mongoose';
import { Room, Bed } from '../models/index.js';
import { connectDb } from '../db.js';

const apply = process.argv.includes('--apply');
const oldOne = (idx, field) => idx.unique && Object.keys(idx.key).length === 1 && idx.key[field] === 1;
const show = (list) => list.map((i) => `${i.name}${i.unique ? ' (unique)' : ''}`).join(', ') || 'none';
const dupes = (Model, fields) => Model.aggregate([{ $group: { _id: Object.fromEntries(fields.map((f) => [f, `$${f}`])), n: { $sum: 1 }, ids: { $push: '$_id' } } }, { $match: { n: { $gt: 1 } } }, { $limit: 20 }]);

try {
  await connectDb();
  const jobs = [[Room, 'rooms', 'number', ['block', 'number']], [Bed, 'beds', 'label', ['room', 'label']]];
  let blocked = false; const plan = [];
  for (const [Model, name, field, keyFields] of jobs) {
    const indexes = await Model.collection.indexes().catch(() => []);
    console.log(`${name}: indexes now -> ${show(indexes)}`);
    const conflicts = await dupes(Model, keyFields);
    if (conflicts.length) { blocked = true; console.log(`  CONFLICT: ${conflicts.length}+ groups share the same ${keyFields.join(' + ')}:`); conflicts.forEach((c) => console.log('   ', JSON.stringify(c._id), 'ids:', c.ids.join(','))); }
    indexes.filter((i) => oldOne(i, field)).forEach((i) => plan.push([Model, name, i.name]));
  }
  if (blocked) { console.log('\nNothing was changed. Fix the conflicting records above, then run again.'); process.exitCode = 2; }
  else if (!plan.length) { console.log('\nNo old campus-wide index found.'); if (apply) { for (const [M] of jobs) await M.createIndexes(); console.log('Required indexes ensured.'); } }
  else if (!apply) { console.log(`\nWould drop: ${plan.map(([, n, i]) => `${n}.${i}`).join(', ')} and create the per-block / per-room indexes. Run again with --apply to do it.`); }
  else {
    for (const [Model, name, idx] of plan) { await Model.collection.dropIndex(idx); console.log(`dropped ${name}.${idx}`); }
    for (const [M] of jobs) await M.createIndexes();
    for (const [Model, name] of jobs) console.log(`${name}: indexes now -> ${show(await Model.collection.indexes())}`);
    console.log('Done. No documents were changed.');
  }
} catch (e) { console.error('Migration failed:', e.message); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
