import { useState } from 'react';
import { api } from '../../api';
import { Badge, Field, Load, Msg, Table, fmt, useLoad, useMsg } from '../../ui';

const CATS = ['Room', 'Electricity', 'Water', 'Cleaning', 'Food', 'Internet', 'Maintenance', 'Security', 'Other'];

export default function Complaints() {
  const st = useLoad('/student/complaints'); const [msg, run] = useMsg();
  const [f, setF] = useState({ category: 'Room', subject: '', description: '', priority: 'MEDIUM' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => { e.preventDefault(); if (await run(() => api('/student/complaints', { method: 'POST', body: f }))) { setF({ ...f, subject: '', description: '' }); st.reload(); } };
  return (
    <>
      <h1>Complaints</h1><Msg m={msg} />
      <form className="card" onSubmit={submit}><div className="grid2">
        <Field label="Category"><select value={f.category} onChange={set('category')}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Priority"><select value={f.priority} onChange={set('priority')}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></Field>
        <Field label="Subject"><input value={f.subject} onChange={set('subject')} required /></Field>
        <Field label="Description"><textarea value={f.description} onChange={set('description')} required /></Field></div>
        <div className="row" style={{ marginTop: 12 }}><button className="btn primary">Submit complaint</button></div></form>
      <Load st={st} what="complaints" empty={st.data?.items.length === 0 && 'No complaints submitted.'}>
        <Table head={['Date', 'Category', 'Subject', 'Status', 'Warden response']}>
          {st.data?.items.map((c) => <tr key={c._id}><td>{fmt(c.createdAt)}</td><td>{c.category}</td><td>{c.subject}</td><td><Badge s={c.status} /></td><td>{c.response || '-'}</td></tr>)}
        </Table>
      </Load>
    </>
  );
}
