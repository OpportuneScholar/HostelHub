// insertMany errors carry no keyPattern, so fall back to the index name in the message.
export function duplicateInfo(err) {
  const inner = err.writeErrors?.[0]?.err || err.writeErrors?.[0] || {};
  const msg = String(err.errmsg || inner.errmsg || err.message || '');
  const index = (msg.match(/index: (\S+)/) || [])[1];
  let keys = Object.keys(err.keyPattern || inner.keyPattern || {});
  if (!keys.length && index) keys = index.split('_').filter((p) => p !== '1' && p !== '-1');
  return { index, keys };
}
export function duplicateMessage(err) {
  const { index, keys } = duplicateInfo(err);
  const has = (...k) => k.every((x) => keys.includes(x));
  if (index === 'student_open_auto_unique') return 'You already have an open outing pass. Use it or cancel it first.';
  if (index === 'code_active_unique') return 'Could not generate a unique pass code. Please try again.';
  if (has('block', 'number')) return 'A room with this number already exists in this block';
  if (has('room', 'label')) return 'That bed already exists in this room';
  if (keys.length === 1 && (keys[0] === 'number' || keys[0] === 'label')) return 'The database still has the old campus-wide room rule. Open Warden > System > Database indexes and click "Fix indexes", or run: npm run migrate-indexes -- --apply';
  if (keys.length === 1 && keys[0] === 'student') return 'This student already has a bed';
  const names = { email: 'email', rollNumber: 'roll number', name: 'name' };
  return `A record with this ${names[keys[0]] || keys[0] || 'value'} already exists`;
}
