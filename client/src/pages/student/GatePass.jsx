import { Badge, Load, fmt, useLoad } from '../../ui';
import { PassQR } from './Requests';

export default function GatePass() {
  const st = useLoad('/student/passes'); const now = new Date();
  return (
    <>
      <h1>Gate Pass</h1>
      <Load st={st} what="gate passes" empty={st.data?.items.length === 0 && 'No gate passes yet. A pass is created when the warden approves a leave or outing request.'}>
        {st.data?.items.map((p) => { const live = p.status === 'ACTIVE' && p.state !== 'IN' && new Date(p.validTo) >= now;
          return <div key={p._id}><div className="row"><b>{p.type === 'OUTING' ? 'Outing' : 'Leave'} pass</b><Badge s={live ? 'ACTIVE' : p.status === 'CANCELLED' ? 'CANCELLED' : 'EXPIRED'} />{p.state !== 'NONE' && <Badge s={p.state} />}</div>
            {live ? <PassQR pass={p} /> : <p className="muted">Valid {fmt(p.validFrom)} to {fmt(p.validTo)}</p>}</div>; })}
      </Load>
    </>
  );
}
