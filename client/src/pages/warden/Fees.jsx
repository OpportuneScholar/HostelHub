import { useState } from 'react';
import { api } from '../../api';
import { Badge, Field, Load, Modal, Msg, Table, fmt, useLoad, useMsg } from '../../ui';

export default function Fees() {
  const st = useLoad('/admin/fees?limit=50'); const [msg, run] = useMsg(); const [paying, setPaying] = useState(null);
  const [f, setF] = useState({ rollNumber: '', type: '', amount: '', dueDate: '' }); const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const add = async (e) => { e.preventDefault(); if (await run(() => api('/admin/fees', { method: 'POST', body: { ...f, amount: +f.amount } }))) { setF({ ...f, type: '', amount: '' }); st.reload(); } };
  const pay = async (e) => { e.preventDefault(); if (await run(() => api(`/admin/fees/${paying.id}/paid`, { method: 'PATCH', body: { reference: paying.reference } }))) { setPaying(null); st.reload(); } };
  return (
    <>
      <h1>Fees</h1><Msg m={msg} />
      <form className="card" onSubmit={add}><div className="grid2">
        <Field label="Student roll number"><input value={f.rollNumber} onChange={set('rollNumber')} required /></Field><Field label="Fee type"><input value={f.type} onChange={set('type')} placeholder="Hostel fee, Mess fee..." required /></Field>
        <Field label="Amount"><input type="number" min="0" value={f.amount} onChange={set('amount')} required /></Field><Field label="Due date"><input type="date" value={f.dueDate} onChange={set('dueDate')} required /></Field></div>
        <div className="row" style={{ marginTop: 12 }}><button className="btn primary">Add fee</button></div></form>
      <Load st={st} what="fees" empty={st.data?.items.length === 0 && 'No fees added yet.'}>
        <Table head={['Student', 'Fee', 'Amount', 'Due', 'Status', 'Reference', '']}>
          {st.data?.items.map((x) => <tr key={x._id}><td>{x.student?.name} ({x.student?.rollNumber})</td><td>{x.type}</td><td>{x.amount}</td><td>{fmt(x.dueDate)}</td><td><Badge s={x.status} /></td><td>{x.reference || '-'}</td>
            <td>{x.status !== 'PAID' && <button className="btn sm" onClick={() => setPaying({ id: x._id, reference: '' })}>Mark paid</button>}</td></tr>)}
        </Table>
      </Load>
      {paying && <Modal title="Mark fee as paid" onClose={() => setPaying(null)}><form onSubmit={pay}><Field label="Payment reference (receipt / transaction no.)"><input value={paying.reference} onChange={(e) => setPaying({ ...paying, reference: e.target.value })} required /></Field>
        <div className="row" style={{ marginTop: 12 }}><button type="button" className="btn" onClick={() => setPaying(null)}>Cancel</button><button className="btn primary">Mark paid</button></div></form></Modal>}
    </>
  );
}
