import { useState } from 'react';
import { Badge, Load, Pager, Table, fmt, useLoad } from '../../ui';

export default function Passes() {
  const [page, setPage] = useState(1); const st = useLoad(`/admin/passes?page=${page}`);
  return (
    <>
      <h1>Gate Passes</h1>
      <Load st={st} what="passes" empty={st.data?.items.length === 0 && 'No gate passes yet. A pass is created when a leave request is approved.'}>
        <Table head={['Student', 'Type', 'Valid from', 'Valid to', 'Pass', 'Gate status']}>
          {st.data?.items.map((p) => <tr key={p._id}><td>{p.student?.name} ({p.student?.rollNumber})</td><td>{p.type}</td><td>{fmt(p.validFrom)}</td><td>{fmt(p.validTo)}</td><td><Badge s={p.status} /></td><td>{p.state === 'NONE' ? 'Not out' : p.state}</td></tr>)}
        </Table>
        <div className="row"><button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><button className="btn sm" disabled={(st.data?.items.length || 0) < 20} onClick={() => setPage(page + 1)}>Next</button></div>
      </Load>
    </>
  );
}
