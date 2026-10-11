import PassCard from '../../components/PassCard';
import { Load, useLoad } from '../../ui';

export default function GatePass() {
  const st = useLoad('/student/passes');
  return (
    <>
      <h1>Gate pass</h1>
      <Load st={st} what="gate passes" empty={st.data?.items.length === 0 && 'No passes yet. Generate one on the Outing Pass page, or apply for leave.'}>
        <div className="cardgrid">{st.data?.items.map((p) => <PassCard key={p._id} pass={p} />)}</div>
      </Load>
    </>
  );
}
