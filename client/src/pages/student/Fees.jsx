import { Badge, Load, Table, fmt, useLoad } from '../../ui';

const sum = (list) => list.reduce((t, f) => t + f.amount, 0);

export default function Fees() {
  const st = useLoad('/student/fees'); const items = st.data?.items || [];
  const paid = items.filter((f) => f.status === 'PAID'), pending = items.filter((f) => f.status !== 'PAID');
  return (
    <>
      <h1>Fees</h1>
      <Load st={st} what="fees" empty={st.data?.items.length === 0 && 'No fees have been added for you.'}>
        <div className="stats"><div className="stat"><i>💳</i><div><b>{sum(items)}</b><span>Total fees</span></div></div><div className="stat"><i>✅</i><div><b>{sum(paid)}</b><span>Paid</span></div></div><div className="stat"><i>⏳</i><div><b>{sum(pending)}</b><span>Pending</span></div></div></div>
        <h2>Pending</h2>
        {pending.length ? <Table head={['Fee', 'Amount', 'Due date', 'Status']}>{pending.map((f) => <tr key={f._id}><td>{f.type}</td><td>{f.amount}</td><td>{fmt(f.dueDate)}</td><td><Badge s={f.status} /></td></tr>)}</Table> : <p className="empty">Nothing pending.</p>}
        <h2>Payment history</h2>
        {paid.length ? <Table head={['Fee', 'Amount', 'Paid on', 'Reference']}>{paid.map((f) => <tr key={f._id}><td>{f.type}</td><td>{f.amount}</td><td>{fmt(f.paidAt)}</td><td>{f.reference || '-'}</td></tr>)}</Table> : <p className="empty">No payments recorded yet.</p>}
        <p className="muted">Payments are recorded by the hostel office. Online payment is not available.</p>
      </Load>
    </>
  );
}
