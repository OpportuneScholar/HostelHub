import { useState } from 'react';
import { Badge, Load, Table, fmt, useLoad } from '../../ui';

export default function GateActivity() {
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA')); const [action, setAction] = useState(''); const [q, setQ] = useState('');
  const st = useLoad(`/admin/gate-activity?date=${date}&action=${action}&q=${encodeURIComponent(q)}&limit=50`);
  return (
    <>
      <h1>Gate Activity</h1>
      <div className="row"><input style={{ width: 240 }} placeholder="Search student name or roll no." value={q} onChange={(e) => setQ(e.target.value)} />
        <input type="date" style={{ width: 170 }} value={date} onChange={(e) => setDate(e.target.value)} />
        <select style={{ width: 130 }} value={action} onChange={(e) => setAction(e.target.value)}><option value="">IN and OUT</option><option>IN</option><option>OUT</option></select></div>
      <Load st={st} what="gate activity" empty={st.data?.items.length === 0 && 'No gate activity matches these filters.'}>
        <Table head={['Student', 'Roll No', 'Pass', 'Action', 'Gate', 'Guard', 'Time']}>
          {st.data?.items.map((g) => <tr key={g._id}><td>{g.student?.name}</td><td>{g.student?.rollNumber}</td><td>{g.pass ? `${g.pass.type} · ${g.pass.passId.slice(0, 8)}` : '-'}</td>
            <td><Badge s={g.action} /></td><td>{g.gate}</td><td>{g.guard?.name}</td><td>{fmt(g.at)}</td></tr>)}
        </Table>
      </Load>
    </>
  );
}
