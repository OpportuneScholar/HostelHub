import { useState } from 'react';
import { api } from '../../api';
import { Badge, Field, Load, Modal, Msg, Table, fmt, useLoad, useMsg } from '../../ui';

export default function Complaints() {
  const [status, setStatus] = useState('');
  const st = useLoad(`/admin/complaints?status=${status}`); const [msg, run] = useMsg(); const [edit, setEdit] = useState(null);
  const save = async (e) => { e.preventDefault(); if (await run(() => api(`/admin/complaints/${edit._id}`, { method: 'PATCH', body: { status: edit.status, response: edit.response } }))) { setEdit(null); st.reload(); } };
  return (
    <>
      <h1>Complaints</h1><Msg m={msg} />
      <div className="row"><select style={{ width: 160 }} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((s) => <option key={s}>{s}</option>)}</select></div>
      <Load st={st} what="complaints" empty={st.data?.items.length === 0 && 'No complaints found.'}>
        <Table head={['Date', 'Student', 'Category', 'Subject', 'Priority', 'Status', '']}>
          {st.data?.items.map((c) => <tr key={c._id}><td>{fmt(c.createdAt)}</td><td>{c.student?.name}</td><td>{c.category}</td><td>{c.subject}</td><td><Badge s={c.priority} /></td><td><Badge s={c.status} /></td><td><button className="btn sm" onClick={() => setEdit({ ...c, response: c.response || '' })}>Update</button></td></tr>)}
        </Table>
      </Load>
      {edit && <Modal title={edit.subject} onClose={() => setEdit(null)}><form onSubmit={save}><p>{edit.description}</p>
        <Field label="Status"><select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>{['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((s) => <option key={s}>{s}</option>)}</select></Field><br />
        <Field label="Response to student"><textarea value={edit.response} onChange={(e) => setEdit({ ...edit, response: e.target.value })} /></Field>
        <div className="row" style={{ marginTop: 12 }}><button type="button" className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary">Save</button></div></form></Modal>}
    </>
  );
}
