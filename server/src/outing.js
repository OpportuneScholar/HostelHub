export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isTime = (s) => typeof s === 'string' && TIME.test(s);
export const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
export const minutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
export const dowOf = (ymd) => new Date(`${ymd}T00:00:00Z`).getUTCDay();
export const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
export const validTimezone = (tz) => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return typeof tz === 'string' && tz.length > 0; } catch { return false; } };

export function localParts(date, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map((x) => [x.type, x.value]));
  const ymd = `${p.year}-${p.month}-${p.day}`;
  return { ymd, minutes: Number(p.hour) * 60 + Number(p.minute), dow: dowOf(ymd) };
}
export function zonedToUtc(ymd, hhmm, tz) {
  const want = Date.parse(`${ymd}T${hhmm}:00Z`); let utc = want;
  for (let i = 0; i < 3; i++) { const l = localParts(new Date(utc), tz); utc += want - Date.parse(`${l.ymd}T${String(Math.floor(l.minutes / 60)).padStart(2, '0')}:${String(l.minutes % 60).padStart(2, '0')}:00Z`); }
  return new Date(utc);
}
export const fmtClock = (date, tz) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);

export const defaultSettings = () => ({
  timezone: 'Asia/Kolkata', configured: false, closure: { active: false, until: '', message: '' },
  weekly: DAYS.map((_, dow) => ({ dow, open: false, start: '10:00', lastIssue: '17:00', returnBy: '19:00' })),
  specialDates: [], rules: { maxDaysAhead: 0, minDurationMinutes: 15, maxPassesPerDay: 2, blockOverdueFees: false },
});

// Narrowest range wins; on a tie, the rule added last.
export function pickSpecial(list = [], ymd) {
  let best = null, bestSpan = Infinity;
  for (const r of list) { const end = r.endDate || r.date; if (ymd < r.date || ymd > end) continue; const span = daysBetween(r.date, end); if (span <= bestSpan) { best = r; bestSpan = span; } }
  return best;
}

export function effectiveSchedule(s, ymd) {
  const c = s.closure || {};
  if (c.active && (!c.until || ymd <= c.until)) return { open: false, source: 'CLOSURE', reason: c.message || `Outing passes are temporarily closed${c.until ? ` until ${c.until}` : ''}.` };
  const rule = pickSpecial(s.specialDates, ymd);
  if (rule) {
    if (rule.closed) return { open: false, source: 'SPECIAL', label: rule.label, ruleId: rule.id, reason: `Outing passes are closed on ${ymd}${rule.label ? ` (${rule.label})` : ''}.` };
    return { open: true, source: 'SPECIAL', label: rule.label, ruleId: rule.id, start: rule.start, lastIssue: rule.lastIssue, returnBy: rule.returnBy };
  }
  if (!s.configured) return { open: false, source: 'WEEKLY', reason: 'The warden has not set up the outing schedule yet.' };
  const w = (s.weekly || []).find((x) => x.dow === dowOf(ymd));
  if (!w || !w.open) return { open: false, source: 'WEEKLY', reason: `Outing passes are not allowed on ${DAYS[dowOf(ymd)]}s.` };
  return { open: true, source: 'WEEKLY', start: w.start, lastIssue: w.lastIssue, returnBy: w.returnBy };
}

export function generationStatus(s, now) {
  const l = localParts(now, s.timezone);
  const schedule = effectiveSchedule(s, l.ymd);
  let reason = schedule.open ? '' : schedule.reason;
  if (schedule.open && l.minutes < minutes(schedule.start)) reason = `Pass generation opens at ${schedule.start}.`;
  if (schedule.open && l.minutes > minutes(schedule.lastIssue)) reason = `Pass generation for today closed at ${schedule.lastIssue}.`;
  return { today: l.ymd, time: `${String(Math.floor(l.minutes / 60)).padStart(2, '0')}:${String(l.minutes % 60).padStart(2, '0')}`, open: !reason, reason, schedule };
}
export const upcoming = (s, now, days = 14) => {
  const t = localParts(now, s.timezone).ymd;
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(t, i);
    return { date, dow: dowOf(date), schedule: effectiveSchedule(s, date) };
  });
};

export function evaluateOuting(s, now, { date, departTime, returnTime } = {}) {
  const fail = (reason, code = 'CLOSED') => ({ ok: false, reason, code });
  const tz = s.timezone;
  const l = localParts(now, tz);
  const today = l.ymd;
  const D = date || today;
  if (!isYmd(D)) return fail('Choose a valid date.', 'INVALID');
  const ahead = daysBetween(today, D);
  if (ahead < 0) return fail('That date has already passed.', 'INVALID');
  if (ahead > s.rules.maxDaysAhead) return fail(s.rules.maxDaysAhead === 0 ? 'Outing passes can only be generated for today.' : `Outing passes can be booked at most ${s.rules.maxDaysAhead} day(s) ahead.`, 'ADVANCE');
  const sch = effectiveSchedule(s, D);
  if (!sch.open) return fail(sch.reason);
  if (ahead === 0 && l.minutes < minutes(sch.start)) return fail(`Pass generation opens at ${sch.start}.`);
  if (ahead === 0 && l.minutes > minutes(sch.lastIssue)) return fail(`Pass generation for today closed at ${sch.lastIssue}.`);
  const ret = returnTime || sch.returnBy;
  if (!isTime(ret) || (departTime && !isTime(departTime))) return fail('Enter valid times (HH:mm).', 'INVALID');
  const startUtc = zonedToUtc(D, sch.start, tz);
  const deadline = zonedToUtc(D, sch.returnBy, tz);
  let validFrom = departTime ? zonedToUtc(D, departTime, tz) : (ahead === 0 ? now : startUtc);
  if (ahead === 0 && validFrom < now) validFrom = now;
  if (validFrom < startUtc) return fail(`Outings start at ${sch.start}.`, 'TIME');
  const validTo = zonedToUtc(D, ret, tz);
  if (validTo > deadline) return fail(`You must be back by ${sch.returnBy}.`, 'TIME');
  if (validTo <= now) return fail('That return time has already passed.', 'TIME');
  if (validTo - validFrom < s.rules.minDurationMinutes * 60000) return fail(`The outing must be at least ${s.rules.minDurationMinutes} minutes long.`, 'TIME');
  return { ok: true, date: D, validFrom, validTo, schedule: sch, ahead };
}

export function derivePass(p, now = new Date()) {
  const from = new Date(p.validFrom), to = new Date(p.validTo);
  if (p.status === 'CANCELLED') return { status: 'CANCELLED', gateState: 'CANCELLED', overdue: false };
  if (p.state === 'IN') return { status: 'USED', gateState: 'RETURNED', overdue: false };
  if (p.state === 'OUT') return { status: 'ACTIVE', gateState: 'OUT', overdue: now > to };
  if (now > to) return { status: 'EXPIRED', gateState: 'EXPIRED', overdue: false };
  return { status: 'ACTIVE', gateState: 'NOT_EXITED', overdue: false, notYetValid: now < from };
}
export function gateCheck(p, now = new Date()) {
  const d = derivePass(p, now);
  const problem = d.status === 'CANCELLED' ? 'Pass cancelled' : d.status === 'USED' ? 'Pass already used: the student has returned' : d.status === 'EXPIRED' ? 'Pass expired' : d.notYetValid ? 'Pass is not valid yet' : null;
  return { ...d, problem: d.gateState === 'OUT' ? null : problem, canOut: p.state === 'NONE' && !problem, canIn: p.state === 'OUT' };
}

const bad = (m) => Object.assign(new Error(m), { status: 400 });
const checkTimes = (o, where) => {
  if (!isTime(o.start) || !isTime(o.lastIssue) || !isTime(o.returnBy)) throw bad(`${where}: enter start, last pass time and return time as HH:mm`);
  if (!(minutes(o.start) < minutes(o.lastIssue) && minutes(o.lastIssue) < minutes(o.returnBy))) throw bad(`${where}: start must be before the last pass time, and that before the return time`);
};
export function parseSettings(b = {}, cur = defaultSettings()) {
  const timezone = b.timezone ?? cur.timezone;
  if (!validTimezone(timezone)) throw bad('Unknown timezone (use a name like Asia/Kolkata)');
  const c = b.closure || {};
  const closure = { active: !!c.active, until: c.until || '', message: String(c.message || '').trim().slice(0, 200) };
  if (closure.until && !isYmd(closure.until)) throw bad('Closure end date is not a valid date');
  if (!Array.isArray(b.weekly) || b.weekly.length !== 7) throw bad('Weekly schedule must have 7 days');
  const weekly = b.weekly.map((w) => { const dow = Number(w.dow); if (!Number.isInteger(dow) || dow < 0 || dow > 6) throw bad('Invalid day of week');
    const day = { dow, open: !!w.open, start: w.start, lastIssue: w.lastIssue, returnBy: w.returnBy };
    if (day.open) checkTimes(day, DAYS[dow]);
    return day;
    });
  if (new Set(weekly.map((w) => w.dow)).size !== 7) throw bad('Each day of the week must appear once');
  const r = b.rules || {}; const int = (v, lo, hi, name) => { const n = Number(v); if (!Number.isInteger(n) || n < lo || n > hi) throw bad(`${name} must be a whole number from ${lo} to ${hi}`); return n; };
  const rules = { maxDaysAhead: int(r.maxDaysAhead ?? 0, 0, 30, 'Days ahead'), minDurationMinutes: int(r.minDurationMinutes ?? 15, 0, 720, 'Minimum outing length'), maxPassesPerDay: int(r.maxPassesPerDay ?? 2, 1, 10, 'Passes per day'), blockOverdueFees: !!r.blockOverdueFees };
  return { timezone, configured: true, closure, weekly: weekly.sort((a, b2) => a.dow - b2.dow), rules, specialDates: cur.specialDates || [] };
}
export function parseSpecial(b = {}, tz, now = new Date()) {
  const date = b.date, endDate = b.endDate || '';
  if (!isYmd(date)) throw bad('Choose a valid date');
  if (endDate && (!isYmd(endDate) || endDate < date || daysBetween(date, endDate) > 60)) throw bad('End date must be on or after the start date (at most 60 days)');
  if ((endDate || date) < localParts(now, tz).ymd) throw bad('That date is already in the past');
  const rule = { date, endDate, label: String(b.label || '').trim().slice(0, 60), closed: !!b.closed };
  if (!rule.closed) {
    Object.assign(rule, { start: b.start, lastIssue: b.lastIssue, returnBy: b.returnBy });
    checkTimes(rule, 'Special timings');
  }
  return rule;
}
