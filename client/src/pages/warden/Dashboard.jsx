import { Load, useLoad } from '../../ui';

export default function Dashboard() {
  const st = useLoad('/admin/dashboard'); const d = st.data;
  const cards = d && [['🎓', 'Total students', d.students], ['🏢', 'Total rooms', d.totalRooms], ['🔴', 'Occupied beds', d.occupiedBeds], ['🟢', 'Available beds', d.availableBeds],
    ['📝', 'Pending leaves', d.pendingLeave], ['🛠️', 'Pending complaints', d.openComplaints], ['🚪', "Today's gate entries", d.todayOut + d.todayIn], ['💳', 'Pending fees', d.pendingFees]];
  return (
    <>
      <h1>Dashboard</h1>
      <Load st={st} what="dashboard">
        {d && <>
          <div className="stats">{cards.map(([i, l, v]) => <div className="stat" key={l}><i>{i}</i><div><b>{v}</b><span>{l}</span></div></div>)}</div>
          <p className="muted">Today: {d.todayOut} out, {d.todayIn} in. Active gate passes: {d.activePasses}.</p>
          {d.students === 0 && <p className="empty">No students registered yet. Add rooms first, then register students from the Students page.</p>}
        </>}
      </Load>
    </>
  );
}
