import { OutingSettings } from './models/index.js';
import { defaultSettings } from './outing.js';

export async function loadSettings() {
  const d = defaultSettings();
  const doc = await OutingSettings.findOne({ key: 'outing' });
  if (!doc) return d;
  const o = doc.toObject ? doc.toObject() : doc;
  return { timezone: o.timezone || d.timezone, configured: true, closure: { ...d.closure, ...(o.closure || {}) },
    weekly: d.weekly.map((w) => ({ ...w, ...((o.weekly || []).find((x) => x.dow === w.dow) || {}) })),
    specialDates: o.specialDates || [], rules: { ...d.rules, ...(o.rules || {}) } };
}
