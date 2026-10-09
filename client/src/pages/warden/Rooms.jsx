import { useState } from 'react';
import { api } from '../../api';
import { Confirm, Field, Load, Modal, Msg, Table, useLoad, useMsg } from '../../ui';

const BLANK = { hostelName: '', blockName: '', floor: '0', number: '', capacity: '2' };
const body = (f) => ({ ...f, floor: Number(f.floor), capacity: Number(f.capacity) });

function RoomFields({ f, set }) {
  return (
    <div className="grid2">
      <Field label="Hostel"><input value={f.hostelName} onChange={set('hostelName')} maxLength={60} required /></Field><Field label="Block"><input value={f.blockName} onChange={set('blockName')} maxLength={40} required /></Field>
      <Field label="Floor"><input type="number" min="0" max="50" step="1" value={f.floor} onChange={set('floor')} required /></Field><Field label="Room number (e.g. B-205)"><input value={f.number} onChange={set('number')} maxLength={20} required /></Field>
      <Field label="Number of beds"><input type="number" min="1" max="10" step="1" value={f.capacity} onChange={set('capacity')} required /></Field>
    </div>
  );
}

export default function Rooms() {
  const sum = useLoad('/hostels/summary'); const st = useLoad('/hostels/rooms'); const [msg, run] = useMsg();
  const [f, setF] = useState(BLANK); const [edit, setEdit] = useState(null); const [del, setDel] = useState(null);
  const refresh = () => { st.reload(); sum.reload(); };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setE = (k) => (e) => setEdit({ ...edit, [k]: e.target.value });

  const add = async (e) => { e.preventDefault(); if (await run(() => api('/hostels/rooms', { method: 'POST', body: body(f) }))) { setF({ ...f, number: '' }); refresh(); } };
  const startEdit = (r) => setEdit({ id: r._id, occupied: r.occupied, hostelName: r.block.hostel.name, blockName: r.block.name, floor: String(r.floor), number: r.number, capacity: String(r.capacity) });
  const save = async (e) => {
    e.preventDefault(); const { id, occupied, ...rest } = edit;
    if (await run(() => api(`/hostels/rooms/${id}`, { method: 'PATCH', body: body(rest) }))) { setEdit(null); refresh(); }
  };
  const remove = async () => { const id = del.id; setDel(null); if (await run(() => api(`/hostels/rooms/${id}`, { method: 'DELETE' }))) refresh(); };
  const s = sum.data;
  return (
    <>
      <h1>Rooms & Beds</h1><Msg m={msg} />
      {s && <div className="stats"><div className="stat"><b>{s.totalBeds}</b><span>Total beds</span></div><div className="stat"><b>{s.occupiedBeds}</b><span>Occupied</span></div><div className="stat"><b>{s.availableBeds}</b><span>Available</span></div></div>}
      <form className="card" onSubmit={add}><RoomFields f={f} set={set} />
        <p className="muted" style={{ marginBottom: 0 }}>A room number only has to be unique inside its block. Room 101 can exist in every hostel.</p>
        <div className="row" style={{ marginTop: 12 }}><button className="btn primary">Add room</button></div></form>
      <Load st={st} what="rooms" empty={st.data?.items.length === 0 && 'No rooms added yet.'}>
        <Table head={['Room', 'Hostel', 'Block', 'Floor', 'Beds', 'Occupied', 'Actions']}>
          {st.data?.items.map((r) => <tr key={r._id}><td>{r.number}</td><td>{r.block.hostel.name}</td><td>{r.block.name}</td><td>{r.floor}</td><td>{r.capacity}</td><td>{r.occupied}</td>
            <td><button className="btn sm" onClick={() => startEdit(r)}>Edit</button> <button className="btn sm" onClick={() => setDel({ id: r._id, number: r.number, occupied: r.occupied, capacity: r.capacity })}>Delete</button></td></tr>)}
        </Table>
      </Load>
      {edit && <Modal title={`Edit room ${edit.number}`} onClose={() => setEdit(null)}><form onSubmit={save}>
        <p className="muted">Occupied beds: {edit.occupied}. The number of beds cannot go below the occupied beds, and a bed with a student is never removed. Changing the room number renames its beds.</p>
        <RoomFields f={edit} set={setE} />
        <div className="row" style={{ marginTop: 12 }}><button type="button" className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary">Save changes</button></div></form></Modal>}
      {del && del.occupied > 0 && <Modal title={`Room ${del.number} cannot be deleted`} onClose={() => setDel(null)}>
        <p>It has {del.occupied} occupied bed(s). Move the student(s) to another room first (Students page, Change room), then delete it.</p>
        <div className="row"><button className="btn" onClick={() => setDel(null)}>Close</button></div></Modal>}
      {del && del.occupied === 0 && <Confirm title={`Delete room ${del.number}?`} text={`This permanently removes the room and its ${del.capacity} bed(s). This cannot be undone.`} label="Delete room" danger onConfirm={remove} onCancel={() => setDel(null)} />}
    </>
  );
}
