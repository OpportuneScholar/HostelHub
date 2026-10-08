import { useState } from 'react';
import { api } from '../../api';
import { Badge, Confirm, Load, Msg, Table, fmt, useLoad, useMsg } from '../../ui';

const TABS = [['PENDING', 'Pending'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected'], ['CANCELLED', 'Cancelled']];

export default function Leave() {
  const [status, setStatus] = useState('PENDING');
  const st = useLoad(`/admin/leave?status=${status}`); const [msg, run] = useMsg(); const [rej, setRej] = useState(null);
  const decide = async (id, decision) => { if (await run(() => api(`/admin/leave/${id}`, { method: 'PATCH', body: { decision } }))) st.reload(); };
  return (
    <>
      <h1>Leave Requests</h1><Msg m={msg} />
      <div className="tabs">{TABS.map(([k, l]) => <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{l}</button>)}</div>
      <Load st={st} what="requests" empty={st.data?.items.length === 0 && `No ${status.toLowerCase()} requests.`}>
        <Table head={['Student', 'Type', 'Dates', 'Reason', 'Requested', 'Status', '']}>
          {st.data?.items.map((l) => <tr key={l._id}><td>{l.student?.name} ({l.student?.rollNumber})</td><td>{l.type}</td><td>{fmt(l.departAt)} to {fmt(l.returnBy)}</td><td>{l.reason}</td><td>{fmt(l.createdAt)}</td><td><Badge s={l.status} /></td>
            <td>{l.status === 'PENDING' && <><button className="btn sm primary" onClick={() => decide(l._id, 'APPROVED')}>Approve</button> <button className="btn sm" onClick={() => setRej(l._id)}>Reject</button></>}</td></tr>)}
        </Table>
      </Load>
      {rej && <Confirm title="Reject this request?" label="Reject" danger onConfirm={() => { decide(rej, 'REJECTED'); setRej(null); }} onCancel={() => setRej(null)} />}
    </>
  );
}
