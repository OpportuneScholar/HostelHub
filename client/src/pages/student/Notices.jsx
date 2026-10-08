import { Badge, Load, fmt, useLoad } from '../../ui';

export default function Notices() {
  const st = useLoad('/student/notices');
  return (
    <>
      <h1>Notices</h1>
      <Load st={st} what="notices" empty={st.data?.items.length === 0 && 'No notices right now.'}>
        {st.data?.items.map((n) => <div className="card" key={n._id} style={n.priority === 'IMPORTANT' ? { borderColor: '#fca5a5', background: '#fffafa' } : null}>
          <div className="row" style={{ marginBottom: 4 }}><b>{n.title}</b>{n.priority === 'IMPORTANT' && <Badge s="HIGH" />}<span className="muted">{n.category}</span></div>
          <p style={{ margin: '4px 0' }}>{n.description}</p><span className="muted">Posted {fmt(n.publishAt)} · until {fmt(n.expiresAt)}</span></div>)}
      </Load>
    </>
  );
}
