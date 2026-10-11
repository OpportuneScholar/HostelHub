import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as o from '../src/outing.js';

const IST = 'Asia/Kolkata';
const t = (ymd, hm, tz = IST) => o.zonedToUtc(ymd, hm, tz);
const settings = (patch = {}) => ({ ...o.defaultSettings(), configured: true, weekly: o.defaultSettings().weekly.map((w) => ({ ...w, open: w.dow >= 1 && w.dow <= 5 })), ...patch });
// Monday 2026-10-12 is a weekday, Sunday 2026-10-11 is closed in this schedule.

describe('timezone handling', () => {
  test('wall-clock times convert to the right moment, including daylight saving', () => {
    assert.equal(t('2026-10-12', '10:00').toISOString(), '2026-10-12T04:30:00.000Z');
    assert.equal(t('2026-07-01', '12:00', 'America/New_York').toISOString(), '2026-07-01T16:00:00.000Z');
    assert.equal(t('2026-12-01', '12:00', 'America/New_York').toISOString(), '2026-12-01T17:00:00.000Z');
  });
  test('"today" follows the hostel timezone, not the server clock', () => {
    const sundayNightUtc = new Date('2026-10-11T22:00:00Z'); // already Monday 03:30 in India
    assert.equal(o.localParts(sundayNightUtc, IST).ymd, '2026-10-12');
    assert.equal(o.generationStatus(settings(), sundayNightUtc).reason, 'Pass generation opens at 10:00.');
  });
  test('timezone validation', () => {
    assert.ok(o.validTimezone('Asia/Kolkata'));
    assert.ok(!o.validTimezone('Mars/Base'));
  });
});

describe('effective schedule', () => {
  test('normal week', () => {
    assert.equal(o.effectiveSchedule(settings(), '2026-10-12').open, true);
    assert.match(o.effectiveSchedule(settings(), '2026-10-11').reason, /not allowed on Sundays/);
  });
  test('not configured means closed', () => assert.match(o.effectiveSchedule(o.defaultSettings(), '2026-10-12').reason, /not set up/));
  test('special date can close a day, or change timings only for that day', () => {
    const s = settings({ specialDates: [{ id: 'a', date: '2026-10-13', label: 'Festival', closed: true }, { id: 'b', date: '2026-10-14', closed: false, start: '12:00', lastIssue: '15:00', returnBy: '17:00' }] });
    assert.match(o.effectiveSchedule(s, '2026-10-13').reason, /closed on 2026-10-13 \(Festival\)/);
    assert.deepEqual([o.effectiveSchedule(s, '2026-10-14').start, o.effectiveSchedule(s, '2026-10-14').returnBy], ['12:00', '17:00']);
    assert.equal(o.effectiveSchedule(s, '2026-10-15').start, '10:00'); // normal schedule is back automatically
  });
  test('the narrowest special rule wins and weekends can differ', () => {
    const s = settings({ specialDates: [{ id: 'r', date: '2026-10-12', endDate: '2026-10-18', closed: true, label: 'Break' }, { id: 'd', date: '2026-10-14', closed: false, start: '11:00', lastIssue: '14:00', returnBy: '16:00' }] });
    assert.equal(o.effectiveSchedule(s, '2026-10-14').open, true);
    assert.equal(o.effectiveSchedule(s, '2026-10-15').open, false);
  });
  test('temporary closure ends by itself', () => {
    const s = settings({ closure: { active: true, until: '2026-10-13', message: 'Exams' } });
    assert.equal(o.effectiveSchedule(s, '2026-10-13').reason, 'Exams');
    assert.equal(o.effectiveSchedule(s, '2026-10-14').open, true);
  });
});

describe('outing request rules', () => {
  const s = settings();
  test('inside the window: pass runs from now to the return time', () => {
    const now = t('2026-10-12', '11:00');
    const r = o.evaluateOuting(s, now, { returnTime: '18:00' });
    assert.ok(r.ok);
    assert.equal(r.validFrom.getTime(), now.getTime());
    assert.equal(r.validTo.toISOString(), t('2026-10-12', '18:00').toISOString());
  });
  test('default return time is the configured deadline', () => assert.equal(o.evaluateOuting(s, t('2026-10-12', '11:00'), {}).validTo.toISOString(), t('2026-10-12', '19:00').toISOString()));
  test('too early, too late, closed day', () => {
    assert.match(o.evaluateOuting(s, t('2026-10-12', '09:59'), {}).reason, /opens at 10:00/);
    assert.match(o.evaluateOuting(s, t('2026-10-12', '17:01'), {}).reason, /closed at 17:00/);
    assert.ok(o.evaluateOuting(s, t('2026-10-12', '17:00'), {}).ok);
    assert.match(o.evaluateOuting(s, t('2026-10-11', '11:00'), {}).reason, /Sundays/);
  });
  test('return time rules', () => {
    const now = t('2026-10-12', '11:00');
    assert.match(o.evaluateOuting(s, now, { returnTime: '19:30' }).reason, /back by 19:00/);
    assert.match(o.evaluateOuting(s, now, { returnTime: '11:05' }).reason, /at least 15 minutes/);
    assert.equal(o.evaluateOuting(s, now, { returnTime: '25:00' }).code, 'INVALID');
  });
  test('advance booking is off by default and limited when on', () => {
    const now = t('2026-10-12', '11:00');
    assert.match(o.evaluateOuting(s, now, { date: '2026-10-13' }).reason, /only be generated for today/);
    const adv = settings({ rules: { ...s.rules, maxDaysAhead: 2 } });
    const ok = o.evaluateOuting(adv, now, { date: '2026-10-14', departTime: '12:00', returnTime: '17:00' });
    assert.ok(ok.ok);
    assert.equal(ok.validFrom.toISOString(), t('2026-10-14', '12:00').toISOString());
    assert.match(o.evaluateOuting(adv, now, { date: '2026-10-16' }).reason, /at most 2 day/);
    assert.match(o.evaluateOuting(adv, now, { date: '2026-10-11' }).reason, /already passed/);
  });
});

describe('pass status', () => {
  const base = { status: 'ACTIVE', state: 'NONE', validFrom: '2026-10-12T05:00:00Z', validTo: '2026-10-12T13:00:00Z' };
  test('derived statuses', () => {
    const at = (iso, p = {}) => o.derivePass({ ...base, ...p }, new Date(iso));
    assert.equal(at('2026-10-12T06:00:00Z').gateState, 'NOT_EXITED');
    assert.equal(at('2026-10-12T14:00:00Z').status, 'EXPIRED');
    assert.deepEqual([at('2026-10-12T14:00:00Z', { state: 'OUT' }).gateState, at('2026-10-12T14:00:00Z', { state: 'OUT' }).overdue], ['OUT', true]);
    assert.deepEqual([at('2026-10-12T14:00:00Z', { state: 'IN' }).status, at('2026-10-12T14:00:00Z', { state: 'IN' }).gateState], ['USED', 'RETURNED']);
    assert.equal(at('2026-10-12T06:00:00Z', { status: 'CANCELLED' }).status, 'CANCELLED');
  });
  test('gate check decides which button works', () => {
    const g = (iso, p = {}) => o.gateCheck({ ...base, ...p }, new Date(iso));
    assert.ok(g('2026-10-12T06:00:00Z').canOut);
    assert.match(g('2026-10-12T04:00:00Z').problem, /not valid yet/);
    assert.equal(g('2026-10-12T14:00:00Z').problem, 'Pass expired');
    assert.ok(g('2026-10-12T14:00:00Z', { state: 'OUT' }).canIn); assert.equal(g('2026-10-12T14:00:00Z', { state: 'OUT' }).problem, null); // late students can still come IN
  });
});

describe('what the warden can save', () => {
  const weekly = (over) => o.defaultSettings().weekly.map((w) => ({ ...w, open: true, ...over }));
  test('valid schedule is accepted', () => assert.equal(o.parseSettings({ timezone: IST, weekly: weekly(), rules: {} }).configured, true));
  test('bad input is refused', () => {
    assert.throws(() => o.parseSettings({ timezone: 'Nowhere/Land', weekly: weekly() }), /timezone/);
    assert.throws(() => o.parseSettings({ timezone: IST, weekly: weekly({ lastIssue: '09:00' }) }), /start must be before/);
    assert.throws(() => o.parseSettings({ timezone: IST, weekly: weekly({ lastIssue: '20:00' }) }), /before the return time/);
    assert.throws(() => o.parseSettings({ timezone: IST, weekly: weekly().slice(0, 6) }), /7 days/);
    assert.throws(() => o.parseSettings({ timezone: IST, weekly: weekly(), rules: { maxDaysAhead: 99 } }), /Days ahead/);
  });
  test('special dates: past dates and bad ranges are refused', () => {
    const now = t('2026-10-12', '11:00');
    assert.throws(() => o.parseSpecial({ date: '2026-10-01', closed: true }, IST, now), /past/);
    assert.throws(() => o.parseSpecial({ date: '2026-10-20', endDate: '2026-10-19', closed: true }, IST, now), /End date/);
    assert.throws(() => o.parseSpecial({ date: '2026-10-20', closed: false, start: '10:00', lastIssue: '09:00', returnBy: '12:00' }, IST, now), /Special timings/);
    assert.equal(o.parseSpecial({ date: '2026-10-12', closed: true, label: 'Today ok' }, IST, now).closed, true);
  });
});
