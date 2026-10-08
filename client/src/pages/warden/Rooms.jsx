import { useState } from 'react';
import { api } from '../../api';
import { Field, Load, Msg, Table, useLoad, useMsg } from '../../ui';

export default function Rooms() {
  const sum = useLoad('/hostels/summary'); const st = useLoad('/hostels/rooms'); const [msg, run] = useMsg();
  const [f, setF] = useState({ hostelName: '', blockName: '', floor: '0', number: '', capacity: '2' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    if (await run(() => api('/hostels/rooms', { method: 'POST', body: { ...f, floor: +f.floor, capacity: +f.capacity } }))) { setF({ ...f, number: '' }); st.reload(); sum.reload(); }
  };
  const s = sum.data;
  return (
    <>
      <h1>Rooms & Beds</h1><Msg m={msg} />
      {s && <div className="stats"><div className="stat"><b>{s.totalBeds}</b><span>Total beds</span></div><div className="stat"><b>{s.occupiedBeds}</b><span>Occupied</span></div><div className="stat"><b>{s.availableBeds}</b><span>Available</span></div></div>}
      <form className="card" onSubmit={submit}><div className="grid2">
        <Field label="Hostel"><input value={f.hostelName} onChange={set('hostelName')} required /></Field><Field label="Block"><input value={f.blockName} onChange={set('blockName')} required /></Field>
        <Field label="Floor"><input type="number" value={f.floor} onChange={set('floor')} required /></Field><Field label="Room number (e.g. B-205)"><input value={f.number} onChange={set('number')} required /></Field>
        <Field label="Number of beds"><input type="number" min="1" max="10" value={f.capacity} onChange={set('capacity')} required /></Field></div>
        <div className="row" style={{ marginTop: 12 }}><button className="btn primary">Add room</button></div></form>
      <Load st={st} what="rooms" empty={st.data?.items.length === 0 && 'No rooms added yet.'}>
        <Table head={['Room', 'Hostel', 'Block', 'Floor', 'Beds', 'Occupied']}>
          {st.data?.items.map((r) => <tr key={r._id}><td>{r.number}</td><td>{r.block.hostel.name}</td><td>{r.block.name}</td><td>{r.floor}</td><td>{r.capacity}</td><td>{r.occupied}</td></tr>)}
        </Table>
      </Load>
    </>
  );
}
