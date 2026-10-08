import { useState } from 'react';
import { api } from '../../api';
import { Field, Load, Msg, useLoad, useMsg } from '../../ui';

export default function Profile() {
  const st = useLoad('/student/profile'); const [msg, run] = useMsg(); const [edit, setEdit] = useState(null);
  const p = st.data?.profile, bed = st.data?.bed;
  const save = async (e) => { e.preventDefault(); if (await run(() => api('/student/profile', { method: 'PATCH', body: edit }))) { setEdit(null); st.reload(); } };
  const row = (k, v) => <><dt>{k}</dt><dd>{v || '-'}</dd></>;
  return (
    <>
      <h1>Profile</h1><Msg m={msg} />
      <Load st={st} what="your profile">{p && <>
        <div className="card"><h2 style={{ marginTop: 0 }}>Personal</h2><dl className="kv">{row('Name', `${p.firstName} ${p.lastName}`)}{row('Roll number', p.rollNumber)}{row('Email', p.email)}{row('Phone', p.phone)}{row('Address', p.address)}</dl>
          <h2>Academic</h2><dl className="kv">{row('Course', p.course)}{row('Branch', p.branch)}{row('Year', p.year)}{row('Semester', p.semester)}</dl>
          <h2>Hostel (set by warden)</h2><dl className="kv">{row('Room', bed?.room.number)}{row('Bed', bed?.label)}</dl>
          <h2>Guardian</h2><dl className="kv">{row('Name', p.guardianName)}{row('Phone', p.guardianPhone)}{row('Emergency contact', p.emergencyContact)}</dl>
          {!edit && <button className="btn" onClick={() => setEdit({ phone: p.phone, address: p.address, emergencyContact: p.emergencyContact })}>Edit contact details</button>}</div>
        {edit && <form className="card" onSubmit={save}><div className="grid2">
          {['phone', 'address', 'emergencyContact'].map((k) => <Field key={k} label={k === 'emergencyContact' ? 'Emergency contact' : k[0].toUpperCase() + k.slice(1)}><input value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} required /></Field>)}</div>
          <div className="row" style={{ marginTop: 12 }}><button className="btn primary">Save</button><button type="button" className="btn" onClick={() => setEdit(null)}>Cancel</button></div></form>}
      </>}</Load>
    </>
  );
}
