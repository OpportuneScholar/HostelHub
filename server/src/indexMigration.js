// Replaces the old campus-wide unique indexes with per-block / per-room ones. Never deletes documents.
const oldOne = (idx, field) => idx.unique && Object.keys(idx.key).length === 1 && idx.key[field] === 1;
const jobs = ({ Room, Bed }) => [{ Model: Room, name: 'rooms', field: 'number', keyFields: ['block', 'number'] }, { Model: Bed, name: 'beds', field: 'label', keyFields: ['room', 'label'] }];

export async function inspectIndexes(models) {
  const out = [];
  for (const job of jobs(models)) {
    const indexes = await job.Model.collection.indexes().catch(() => []);
    const dupes = await job.Model.aggregate([{ $group: { _id: Object.fromEntries(job.keyFields.map((f) => [f, `$${f}`])), n: { $sum: 1 }, ids: { $push: '$_id' } } }, { $match: { n: { $gt: 1 } } }, { $limit: 20 }]);
    out.push({ name: job.name, job, indexes: indexes.map((i) => ({ name: i.name, key: i.key, unique: !!i.unique })),
      obsolete: indexes.filter((i) => oldOne(i, job.field)).map((i) => i.name), conflicts: dupes.map((d) => ({ collection: job.name, key: d._id, ids: d.ids })) });
  }
  return out;
}

export async function migrateIndexes(models, { apply = false } = {}) {
  const report = await inspectIndexes(models);
  const conflicts = report.flatMap((r) => r.conflicts);
  const dropped = [];
  if (apply && !conflicts.length) {
    for (const r of report) { for (const name of r.obsolete) { await r.job.Model.collection.dropIndex(name); dropped.push(`${r.name}.${name}`); } await r.job.Model.createIndexes(); }
  }
  return { applied: apply && !conflicts.length, conflicts, dropped, report: report.map(({ job, ...rest }) => rest) };
}
