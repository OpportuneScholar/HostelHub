import { Badge, Load, Table, fmt, useLoad } from '../../ui';

export default function Activity() {
  const st = useLoad('/student/activity');
  return (
    <>
      <h1>Activity</h1>
      <Load st={st} what="activity" empty={st.data?.items.length === 0 && 'No gate activity yet.'}>
        <Table head={['Time', 'Action', 'Gate', 'Pass']}>
          {st.data?.items.map((g) => <tr key={g._id}><td>{fmt(g.at)}</td><td><Badge s={g.action} /></td><td>{g.gate}</td><td>{g.pass?.type || '-'}</td></tr>)}
        </Table>
      </Load>
    </>
  );
}
