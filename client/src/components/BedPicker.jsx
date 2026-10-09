import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Field } from '../ui';

// Hostel > Block > Floor > Room > Bed. Every list comes from the server; rooms and beds are only ones that are free.
const LEVELS = ['hostel', 'block', 'floor', 'room', 'bed'];
export const EMPTY_PICK = { hostel: '', block: '', floor: '', room: '', bed: '' };
const SPEC = {
  hostel: { label: 'Hostel', plural: 'hostels', path: () => '/hostels/available/hostels', none: 'No hostels yet. Add rooms on the Rooms & Beds page first.' },
  block: { label: 'Block', plural: 'blocks', parent: 'hostel', path: (v) => `/hostels/available/blocks?hostel=${v.hostel}`, none: 'No blocks available.', wait: 'Select a hostel first.' },
  floor: { label: 'Floor', plural: 'floors', parent: 'block', path: (v) => `/hostels/available/floors?block=${v.block}`, none: 'No floors available.', wait: 'Select a block first.' },
  room: { label: 'Room number', plural: 'rooms', parent: 'floor', path: (v) => `/hostels/available/rooms?block=${v.block}&floor=${v.floor}`, none: 'No available rooms on this floor.', wait: 'Select a floor first.' },
  bed: { label: 'Bed number', plural: 'beds', parent: 'room', path: (v) => `/hostels/available/beds?room=${v.room}`, none: 'No available beds in this room.', wait: 'Select a room first.' },
};
const ID = { hostel: (x) => x._id, block: (x) => x._id, floor: (x) => String(x), room: (x) => x._id, bed: (x) => x._id };
const TEXT = { hostel: (x) => x.name, block: (x) => x.name, floor: (x) => (x === 0 ? 'Ground floor (0)' : `Floor ${x}`), room: (x) => `${x.number} (${x.availableBeds} free)`, bed: (x) => `Bed ${x.number}` };

export default function BedPicker({ value, onChange, refreshKey = 0 }) {
  const [state, setState] = useState({}); // level -> { items, loading, error }
  const seq = useRef({}); const latest = useRef(value); latest.current = value;

  const put = (level, v) => setState((s) => ({ ...s, [level]: v }));
  const clear = (level) => { seq.current[level] = (seq.current[level] || 0) + 1; put(level, undefined); };
  const load = (level) => {
    const id = (seq.current[level] = (seq.current[level] || 0) + 1);
    put(level, { items: null, loading: true, error: '' });
    api(SPEC[level].path(latest.current)).then((d) => {
      if (seq.current[level] !== id) return; // a newer request replaced this one
      put(level, { items: d.items, loading: false, error: '' });
      const cur = latest.current[level]; // the chosen option may have been taken meanwhile
      if (cur !== '' && !d.items.some((it) => ID[level](it) === cur)) reset(level, '');
    }).catch((e) => { if (seq.current[level] === id) put(level, { items: null, loading: false, error: e.message }); });
  };
  const reset = (level, v) => { const next = { ...latest.current }; LEVELS.slice(LEVELS.indexOf(level)).forEach((k) => { next[k] = ''; }); next[level] = v; onChange(next); };

  useEffect(() => { load('hostel'); }, [refreshKey]);
  useEffect(() => { value.hostel ? load('block') : clear('block'); }, [value.hostel, refreshKey]);
  useEffect(() => { value.block ? load('floor') : clear('floor'); }, [value.block, refreshKey]);
  useEffect(() => { value.block && value.floor !== '' ? load('room') : clear('room'); }, [value.block, value.floor, refreshKey]);
  useEffect(() => { value.room ? load('bed') : clear('bed'); }, [value.room, refreshKey]);

  return (
    <div className="grid2">
      {LEVELS.map((level) => {
        const spec = SPEC[level]; const st = state[level]; const items = st?.items;
        const parentChosen = !spec.parent || value[spec.parent] !== '';
        const disabled = !parentChosen || !items || items.length === 0;
        const note = !parentChosen ? spec.wait : st?.loading ? `Loading ${spec.plural}...` : st?.error ? '' : items && items.length === 0 ? spec.none : '';
        return (
          <div key={level}>
            <Field label={spec.label}>
              <select value={value[level]} disabled={disabled} aria-busy={!!st?.loading} onChange={(e) => reset(level, e.target.value)}>
                <option value="">{!parentChosen ? spec.wait : st?.loading ? 'Loading...' : `Select ${spec.label.toLowerCase()}`}</option>
                {items?.map((it) => <option key={ID[level](it)} value={ID[level](it)}>{TEXT[level](it)}</option>)}
              </select>
            </Field>
            <small className="muted" role="status" aria-live="polite">{note}</small>
            {st?.error && <small role="alert" style={{ color: 'var(--bad)' }}>Unable to load {spec.plural}. {st.error} <button type="button" className="link" onClick={() => load(level)}>Retry</button></small>}
          </div>
        );
      })}
    </div>
  );
}
