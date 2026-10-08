import { Link } from 'react-router-dom';
import { Badge, Load, fmt, useLoad } from '../../ui';

export default function Home() {
  const st = useLoad('/student/dashboard'); const fees = useLoad('/student/fees'); const passes = useLoad('/student/passes'); const leave = useLoad('/student/leave');
  const d = st.data; const now = new Date();
  const due = (fees.data?.items || []).filter((f) => f.status !== 'PAID'); const overdue = due.filter((f) => f.status === 'OVERDUE').length;
  const pass = passes.data?.items.find((p) => p.status === 'ACTIVE' && p.state !== 'IN' && new Date(p.validTo) >= now);
  const last = leave.data?.items[0];
  return (
    <>
      <h1>{d ? `Hello, ${d.profile.firstName}` : 'Dashboard'}</h1>
      <Load st={st} what="your dashboard">
        {d && <>
          <div className="stats">
            <div className="stat"><i>🎓</i><div><b style={{ fontSize: 17 }}>{d.profile.rollNumber}</b><span>{d.profile.course} {d.profile.branch}, year {d.profile.year}</span></div></div>
            <div className="stat"><i>🏢</i><div><b style={{ fontSize: 17 }}>{d.bed ? `${d.bed.room.number} / ${d.bed.label}` : 'Not allotted'}</b><span>{d.bed ? `${d.bed.room.block.hostel.name}, Block ${d.bed.room.block.name}` : 'Room / bed'}</span></div></div>
            <div className="stat"><i>💳</i><div><b style={{ fontSize: 17 }}>{fees.loading ? '...' : due.length ? `${due.length} due` : 'Clear'}</b><span>{overdue ? `${overdue} overdue` : 'Fee status'}</span></div></div>
            <div className="stat"><i>🚪</i><div><b style={{ fontSize: 17 }}>{d.currentStatus}</b><span>Current status</span></div></div>
          </div>
          <div className="row"><Link className="btn primary" to="/student/leave">Apply Leave / Outing</Link><Link className="btn" to="/student/complaints">Submit Complaint</Link><Link className="btn" to="/student/room">View Room</Link><Link className="btn" to="/student/fees">View Fees</Link></div>
          <div className="card"><b>Active gate pass</b><p className="muted" style={{ margin: '4px 0 0' }}>{pass ? <>{pass.type} · valid until {fmt(pass.validTo)} · <Link to="/student/pass">Show QR</Link></> : 'No active pass.'}</p></div>
          <div className="card"><b>Leave status</b><p style={{ margin: '4px 0 0' }}>{last ? <><Badge s={last.status} /> <span className="muted">{last.destination}, {fmt(last.departAt)}</span></> : <span className="muted">No leave requests yet.</span>}</p></div>
          <h2>Recent activity</h2>
          {d.recentGateActivity.length ? <div className="card">{d.recentGateActivity.map((g) => <div key={g._id}><Badge s={g.action} /> <span className="muted">{fmt(g.at)}</span></div>)}</div> : <p className="empty">No gate activity yet.</p>}
          <h2>Notices</h2>
          {d.notices.length ? d.notices.map((n) => <div className="card" key={n._id} style={n.priority === 'IMPORTANT' ? { borderColor: '#fca5a5' } : null}><b>{n.title}</b> {n.priority === 'IMPORTANT' && <Badge s="HIGH" />}<p>{n.description}</p><span className="muted">Until {fmt(n.expiresAt)}</span></div>) : <p className="empty">No notices right now.</p>}
        </>}
      </Load>
    </>
  );
}
